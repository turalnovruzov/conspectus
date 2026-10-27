import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import OpenAI from 'openai'
import { mapLimit } from './concurrency'
import { LlmOutputError, LlmTransportError, createOpenRouterLlm, isTransportError } from './llm'
import { type CallRecord, SpendCeilingError, SpendLedger } from './spend'

const KEY = 'sk-or-v1-test-secret-0123456789'
const pricing = { 'm/chat': { prompt: 1e-6, completion: 4e-6 }, 'm/embed': { prompt: 1e-8, completion: 0 } }
const schema = z.object({ ok: z.boolean() })

function chatResponse(content: string, cost = 0.0001) {
  return Response.json({
    id: 'gen-1', object: 'chat.completion', created: 1, model: 'm/chat',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost },
  })
}

function setup(ceilingUsd: number, respond: (url: string, body: Record<string, unknown>) => Response) {
  const rows: CallRecord[] = []
  const ledger = new SpendLedger({ ceilingUsd, pricing, sink: async (c) => void rows.push(c) })
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => respond(String(url), JSON.parse(String(init?.body ?? '{}'))))
  const llm = createOpenRouterLlm({ apiKey: KEY, chatModel: 'm/chat', embeddingModel: 'm/embed', ledger, fetchFn, referer: 'https://github.com/turalnovruzov/conspectus', transportRetryDelayMs: 0 })
  return { ledger, fetchFn, llm, rows }
}

/** A 200 whose body stream errors mid-read, as undici reports a dropped connection. */
function brokenBody(message = 'terminated') {
  const body = new ReadableStream({ start: (c) => c.error(new TypeError(message)) })
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
}

const req = { purpose: 'read' as const, schema, system: 'sys', user: 'user', maxTokens: 100 }

describe('createOpenRouterLlm', () => {
  it('returns validated JSON, asks for usage and records the reported cost', async () => {
    const { llm, fetchFn, rows } = setup(1, () => chatResponse('{"ok": true}', 0.000123))
    expect(await llm.chatJson(req)).toEqual({ ok: true })
    const [url, init] = fetchFn.mock.calls[0]
    expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions')
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({ model: 'm/chat', temperature: 0, usage: { include: true }, response_format: { type: 'json_schema' } })
    expect(rows).toEqual([expect.objectContaining({ costUsd: 0.000123, costSource: 'reported', ok: true, purpose: 'read', promptTokens: 10 })])
  })

  it('stops before the call when the ceiling would be passed', async () => {
    const { llm, fetchFn, ledger } = setup(0.75, () => chatResponse('{"ok": true}'))
    await ledger.record(ledger.reserve(0.7), { purpose: 'read', model: 'm/chat', ok: true, reportedCostUsd: 0.7 })
    await expect(llm.chatJson({ ...req, user: 'x'.repeat(300_000) })).rejects.toThrow(SpendCeilingError)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('stops an embed batch before the call when the ceiling would be passed', async () => {
    const { llm, fetchFn, ledger } = setup(0.01, () => Response.json({}))
    await ledger.record(ledger.reserve(0.01), { purpose: 'read', model: 'm/chat', ok: true, reportedCostUsd: 0.01 })
    await expect(llm.embed(['some text'])).rejects.toThrow(SpendCeilingError)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refuses the second of two calls started together whose estimates pass the ceiling', async () => {
    const { llm, fetchFn } = setup(0.001, () => chatResponse('{"ok": true}', 0.0001))
    const big = { ...req, user: 'x'.repeat(600) }
    const results = await Promise.allSettled([llm.chatJson(big), llm.chatJson(big)])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected'])
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(SpendCeilingError)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('four calls run through mapLimit at once: only those whose reservations fit are sent, and the spend stays under the ceiling', async () => {
    const { llm, fetchFn, ledger, rows } = setup(0.0013, () => chatResponse('{"ok": true}', 0.0006))
    fetchFn.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20))
      return chatResponse('{"ok": true}', 0.0006)
    })
    const big = { ...req, user: 'x'.repeat(594) }
    await expect(mapLimit([1, 2, 3, 4, 5, 6], 4, () => llm.chatJson(big))).rejects.toBeInstanceOf(SpendCeilingError)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(rows).toHaveLength(2)
    expect(ledger.spentUsd).toBeLessThanOrEqual(0.0013)
  })

  it('throws before any request for a model without pricing', () => {
    const ledger = new SpendLedger({ ceilingUsd: 1, pricing })
    const fetchFn = vi.fn()
    expect(() =>
      createOpenRouterLlm({ apiKey: KEY, chatModel: 'unknown/model', embeddingModel: 'm/embed', ledger, fetchFn, referer: 'r' }),
    ).toThrow('no OpenRouter pricing')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('throws LlmOutputError after invalid JSON twice', async () => {
    const { llm, fetchFn, rows } = setup(1, () => chatResponse('not json'))
    await expect(llm.chatJson(req)).rejects.toThrow(LlmOutputError)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(rows).toHaveLength(2)
  })

  it('retries once on JSON that misses the schema, then succeeds', async () => {
    let n = 0
    const { llm } = setup(1, () => chatResponse(n++ === 0 ? '{"ok": "yes"}' : '{"ok": false}'))
    expect(await llm.chatJson(req)).toEqual({ ok: false })
  })

  it('falls back to json_object when the model rejects json_schema', async () => {
    const formats: string[] = []
    const { llm } = setup(1, (_url, body) => {
      const type = (body.response_format as { type: string }).type
      formats.push(type)
      return type === 'json_schema'
        ? Response.json({ error: { message: 'response_format json_schema is not supported' } }, { status: 400 })
        : chatResponse('{"ok": true}')
    })
    expect(await llm.chatJson(req)).toEqual({ ok: true })
    expect(formats).toEqual(['json_schema', 'json_object'])
  })

  it('embeds in batches of 64, in input order', async () => {
    const { llm, fetchFn, rows } = setup(1, (_url, body) => {
      const input = body.input as string[]
      return Response.json({
        object: 'list', model: 'm/embed', id: 'gen-emb',
        data: input.map((t, index) => ({ object: 'embedding', index, embedding: [t.length, index] })).reverse(),
        usage: { prompt_tokens: input.length, total_tokens: input.length, cost: 1e-7 },
      })
    })
    const texts = Array.from({ length: 70 }, (_, i) => 'x'.repeat(i + 1))
    const vectors = await llm.embed(texts)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(vectors.map((v) => v[0])).toEqual(texts.map((t) => t.length))
    expect(rows.map((r) => r.purpose)).toEqual(['embed', 'embed'])
  })

  it('keeps the API key out of thrown messages and call rows', async () => {
    const { llm, rows } = setup(1, () => Response.json({ error: { message: `bad key ${KEY}` } }, { status: 401 }))
    const err = await llm.chatJson(req).catch((e: Error) => e)
    expect(String((err as Error).message)).not.toContain(KEY)
    expect(JSON.stringify(rows)).not.toContain(KEY)
  })

  it('retries once when the response body breaks off mid-read ("terminated"), then succeeds', async () => {
    let n = 0
    const { llm, fetchFn } = setup(1, () => (n++ === 0 ? brokenBody() : chatResponse('{"ok": true}')))
    expect(await llm.chatJson(req)).toEqual({ ok: true })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('throws LlmTransportError, without the key, when the retry breaks off too', async () => {
    const { llm, fetchFn, rows } = setup(1, () => brokenBody(`terminated ${KEY}`))
    const err = await llm.chatJson(req).catch((e: Error) => e)
    expect(err).toBeInstanceOf(LlmTransportError)
    expect((err as Error).message).toContain('terminated')
    expect((err as Error).message).not.toContain(KEY)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(rows.map((r) => r.ok)).toEqual([false, false])
    expect(JSON.stringify(rows)).not.toContain(KEY)
  })

  it('does not retry an error with a 4xx status', async () => {
    const { llm, fetchFn } = setup(1, () => Response.json({ error: { message: 'bad request' } }, { status: 400 }))
    const err = await llm.chatJson(req).catch((e: Error) => e)
    expect(err).not.toBeInstanceOf(LlmTransportError)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('retries an embed batch whose body breaks off once, then throws LlmTransportError', async () => {
    const embedOk = (input: string[]) =>
      Response.json({ object: 'list', model: 'm/embed', data: input.map((_, index) => ({ object: 'embedding', index, embedding: [index] })), usage: { prompt_tokens: 1, cost: 1e-7 } })
    let n = 0
    const once = setup(1, (_url, body) => (n++ === 0 ? brokenBody() : embedOk(body.input as string[])))
    expect(await once.llm.embed(['a', 'b'])).toEqual([[0], [1]])
    expect(once.fetchFn).toHaveBeenCalledTimes(2)
    const twice = setup(1, () => brokenBody())
    await expect(twice.llm.embed(['a'])).rejects.toBeInstanceOf(LlmTransportError)
    expect(twice.fetchFn).toHaveBeenCalledTimes(2)
  })
})

describe('isTransportError', () => {
  it('is true for dropped connections and 5xx, false for 4xx, output errors and plain errors', () => {
    expect(isTransportError(new TypeError('terminated'))).toBe(true)
    expect(isTransportError(new Error('read ECONNRESET'))).toBe(true)
    expect(isTransportError(new OpenAI.APIConnectionError({ message: 'Connection error.' }))).toBe(true)
    expect(isTransportError(Object.assign(new Error('bad gateway'), { status: 502 }))).toBe(true)
    expect(isTransportError(Object.assign(new Error('terminated'), { status: 401 }))).toBe(false)
    expect(isTransportError(new LlmOutputError('read: invalid JSON after 2 attempts'))).toBe(false)
    expect(isTransportError(new LlmTransportError('read: terminated (after one retry)'))).toBe(false)
    expect(isTransportError(new Error('something else'))).toBe(false)
  })
})

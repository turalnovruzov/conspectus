import OpenAI from 'openai'
import { z, type ZodType } from 'zod'
import type { FetchFn } from './http.ts'
import { OPENROUTER_BASE, redact } from './openrouter-key.ts'
import type { Purpose, SpendLedger } from './spend.ts'

export type ChatPurpose = Exclude<Purpose, 'embed'>

export interface ChatRequest<T> {
  purpose: ChatPurpose
  schema: ZodType<T>
  system: string
  user: string
  maxTokens: number
}

export interface Llm {
  readonly chatModel: string
  readonly embeddingModel: string
  chatJson<T>(request: ChatRequest<T>): Promise<T>
  embed(texts: string[]): Promise<number[][]>
}

export class LlmOutputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmOutputError'
  }
}

/** The connection to OpenRouter failed twice (dropped, reset, timed out, or a 5xx); the batch is lost for this run only. */
export class LlmTransportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmTransportError'
  }
}

/** A failure that costs one batch, never the run: the stage notes it and leaves the batch's rows for the next run. */
export function isBatchFailure(err: unknown): err is LlmOutputError | LlmTransportError {
  return err instanceof LlmOutputError || err instanceof LlmTransportError
}

export function isTransportError(err: unknown): boolean {
  if (err instanceof LlmOutputError || err instanceof LlmTransportError) return false
  if (err instanceof OpenAI.APIConnectionError) return true
  const status = (err as { status?: unknown } | null)?.status
  if (typeof status === 'number') return status >= 500
  return /terminated|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|fetch failed|socket hang up|other side closed|UND_ERR/i.test(messageOf(err))
}

export const EMBED_BATCH = 64
const ATTEMPTS = 2
const TRANSPORT_RETRY_DELAY_MS = 3000

interface OpenRouterUsage {
  prompt_tokens?: number
  completion_tokens?: number
  cost?: number
}

export function jsonSchemaOf(schema: ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>
  return rest
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function rejectsJsonSchema(err: unknown): boolean {
  const status = (err as { status?: number }).status
  return (status === 400 || status === 422) && /response_format|json_schema|structured/i.test(messageOf(err))
}

export function createOpenRouterLlm(options: {
  apiKey: string
  chatModel: string
  embeddingModel: string
  ledger: SpendLedger
  fetchFn?: FetchFn
  referer: string
  /** Wait before the one retry of a transport failure. */
  transportRetryDelayMs?: number
}): Llm {
  const { apiKey, chatModel, embeddingModel, ledger } = options
  // Throws before any request when a model has no known price.
  ledger.price(chatModel)
  ledger.price(embeddingModel)
  const client = new OpenAI({
    baseURL: OPENROUTER_BASE,
    apiKey,
    fetch: options.fetchFn as typeof fetch | undefined,
    maxRetries: 2,
    defaultHeaders: { 'HTTP-Referer': options.referer, 'X-Title': 'Conspectus' },
  })
  let structured = true
  const retryDelayMs = options.transportRetryDelayMs ?? TRANSPORT_RETRY_DELAY_MS

  // The SDK's own retries cover a failed connect, but not a body that breaks off mid-read ("terminated").
  async function withTransportRetry<T>(what: string, call: () => Promise<T>): Promise<T> {
    try {
      return await call()
    } catch (err) {
      if (!isTransportError(err)) throw err
      await new Promise((r) => setTimeout(r, retryDelayMs))
      try {
        return await call()
      } catch (again) {
        if (isTransportError(again)) throw new LlmTransportError(`${what}: ${redact(messageOf(again), apiKey)} (after one retry)`)
        throw again
      }
    }
  }

  async function chatOnce(req: ChatRequest<unknown>): Promise<string | null> {
    const reservation = ledger.reserve(ledger.estimateChat(chatModel, req.system.length + req.user.length, req.maxTokens))
    const responseFormat = structured
      ? { type: 'json_schema' as const, json_schema: { name: req.purpose, strict: true, schema: jsonSchemaOf(req.schema) } }
      : { type: 'json_object' as const }
    try {
      const res = await client.chat.completions.create({
        model: chatModel,
        temperature: 0,
        max_tokens: req.maxTokens,
        response_format: responseFormat,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        // @ts-expect-error OpenRouter extension: put the call's cost in `usage`
        usage: { include: true },
      })
      const usage = res.usage as OpenRouterUsage | undefined
      const content = res.choices[0]?.message?.content ?? null
      await ledger.record(reservation, {
        purpose: req.purpose, model: chatModel, ok: content !== null,
        promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens,
        reportedCostUsd: usage?.cost, generationId: res.id,
        error: content === null ? 'empty response' : null,
      })
      return content
    } catch (err) {
      await ledger.record(reservation, { purpose: req.purpose, model: chatModel, ok: false, error: redact(messageOf(err), apiKey) })
      if (structured && rejectsJsonSchema(err)) {
        structured = false
        return chatOnce(req)
      }
      if (isTransportError(err)) throw err
      throw new Error(redact(messageOf(err), apiKey))
    }
  }

  async function embedOnce(batch: string[]): Promise<number[][]> {
    const reservation = ledger.reserve(ledger.estimateEmbed(embeddingModel, batch.reduce((n, t) => n + t.length, 0)))
    try {
      const res = await client.embeddings.create({ model: embeddingModel, input: batch })
      const usage = res.usage as OpenRouterUsage | undefined
      await ledger.record(reservation, {
        purpose: 'embed', model: embeddingModel, ok: true,
        promptTokens: usage?.prompt_tokens, reportedCostUsd: usage?.cost,
        generationId: (res as { id?: string }).id ?? null,
      })
      const vectors = [...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding)
      if (vectors.length !== batch.length) throw new LlmOutputError(`embed: ${vectors.length} vectors for ${batch.length} texts`)
      return vectors
    } catch (err) {
      if (!reservation.settled) {
        await ledger.record(reservation, { purpose: 'embed', model: embeddingModel, ok: false, error: redact(messageOf(err), apiKey) })
      }
      if (err instanceof LlmOutputError || isTransportError(err)) throw err
      throw new Error(redact(messageOf(err), apiKey))
    }
  }

  return {
    chatModel,
    embeddingModel,
    async chatJson<T>(req: ChatRequest<T>): Promise<T> {
      let lastProblem = ''
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const content = await withTransportRetry(req.purpose, () => chatOnce(req as ChatRequest<unknown>))
        if (content === null) {
          lastProblem = 'empty response'
          continue
        }
        let parsed: unknown
        try {
          parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ''))
        } catch {
          lastProblem = 'invalid JSON'
          continue
        }
        const result = req.schema.safeParse(parsed)
        if (result.success) return result.data
        lastProblem = `JSON does not match the schema: ${result.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
      }
      throw new LlmOutputError(`${req.purpose}: ${lastProblem} after ${ATTEMPTS} attempts`)
    },
    async embed(texts: string[]): Promise<number[][]> {
      const out: number[][] = []
      for (let i = 0; i < texts.length; i += EMBED_BATCH) {
        const batch = texts.slice(i, i + EMBED_BATCH)
        out.push(...(await withTransportRetry('embed', () => embedOnce(batch))))
      }
      return out
    },
  }
}

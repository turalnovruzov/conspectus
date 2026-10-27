import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createDb } from '../db/client'
import { llmCalls, runs } from '../db/schema'
import { assertThrowawayUrl, testDatabaseUrl } from '../db/throwaway'
import { dbSink } from './ledger-sink'
import { createOpenRouterLlm } from './llm'
import { SpendLedger } from './spend'

assertThrowawayUrl(testDatabaseUrl())
const { db, pool } = createDb(testDatabaseUrl())
afterAll(() => pool.end())
beforeEach(async () => {
  await db.execute(sql`truncate runs, llm_calls cascade`)
})

describe('llm calls in the database', () => {
  it('writes one llm_calls row per call and keeps runs.spent_usd equal to their sum', async () => {
    const [run] = await db.insert(runs).values({ kind: 'live', ceilingUsd: '1' }).returning()
    const pricing = { 'm/chat': { prompt: 1e-6, completion: 4e-6 }, 'm/embed': { prompt: 1e-8, completion: 0 } }
    const ledger = new SpendLedger({ ceilingUsd: 1, pricing, sink: dbSink(db, run.id) })
    const fetchFn = vi.fn(async (url: string) =>
      String(url).endsWith('/embeddings')
        ? Response.json({ object: 'list', data: [{ index: 0, embedding: [1, 0] }], usage: { prompt_tokens: 3, cost: 0.00000003 } })
        : Response.json({
            id: 'gen-x', choices: [{ index: 0, message: { role: 'assistant', content: '{"ok":true}' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0000123 },
          }),
    )
    const llm = createOpenRouterLlm({ apiKey: 'sk-x', chatModel: 'm/chat', embeddingModel: 'm/embed', ledger, fetchFn, referer: 'r' })
    await llm.chatJson({ purpose: 'judge', schema: z.object({ ok: z.boolean() }), system: 's', user: 'u', maxTokens: 10 })
    await llm.embed(['a'])
    const rows = await db.select().from(llmCalls).where(eq(llmCalls.runId, run.id))
    expect(rows.map((r) => [r.purpose, r.costSource, Number(r.costUsd)])).toEqual([
      ['judge', 'reported', 0.0000123],
      ['embed', 'reported', 0.00000003],
    ])
    const [after] = await db.select().from(runs).where(eq(runs.id, run.id))
    expect(Number(after.spentUsd)).toBeCloseTo(0.00001233, 8)
  })
})

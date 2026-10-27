import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fetchLog, llmCalls, runs, sourceItems } from '../db/schema'
import { dayOf, outcomes, scriptedLlm } from './fixture-run'
import { runOnce } from './run'
import { staticSources } from './sources'
import { SpendLedger } from './spend'
import { resetTables, throwawayDb } from './test-helpers'

const { db, pool } = throwawayDb()
afterAll(() => pool.end())
beforeEach(() => resetTables(db))

const day = dayOf('2026-10-26')
const now = new Date('2026-10-26T18:00:00Z')

async function count(table: string): Promise<number> {
  const res = await db.execute<{ n: number }>(sql.raw(`select count(*)::int as n from ${table}`))
  return res.rows[0].n
}

describe('runOnce', () => {
  it('fills items, events, situations, involvements, versions, llm_calls and one ok run with its report', async () => {
    const ledger = new SpendLedger({ ceilingUsd: 1, pricing: {} })
    const llm = scriptedLlm({ ledger, costPerCall: 0.001 })
    const sources = staticSources(outcomes(day, { bbc: ['Floods in Kenya', 'Talks in Doha'], dawn: ['Quake in Peru'] }))
    const result = await runOnce({ db, llm, ledger, now, kind: 'live', sources })
    expect(result.status).toBe('ok')
    for (const table of ['source_items', 'events', 'situations', 'involvements', 'situation_versions', 'event_versions', 'llm_calls']) {
      expect(await count(table), table).toBeGreaterThan(0)
    }
    const [run] = await db.select().from(runs)
    expect(run).toMatchObject({ status: 'ok', kind: 'live', chatModel: 'fake/chat' })
    expect(run.finishedAt).not.toBeNull()
    expect(run.report).toMatchObject({ situationsOpened: 3, itemsPerOutlet: { bbc: { seen: 2, new: 2, failed: 0 } } })
    const [sum] = await db.select({ s: sql<string>`sum(${llmCalls.costUsd})` }).from(llmCalls).where(eq(llmCalls.runId, run.id))
    expect(Number(sum.s)).toBeCloseTo(Number(run.spentUsd), 10)
  })

  it('stops cleanly at the ceiling mid-cluster, keeps earlier batches, and the next run processes the rest', async () => {
    const headlines = Array.from({ length: 12 }, (_, i) => `Story number ${i}`)
    const sources = staticSources(outcomes(day, { bbc: headlines }))
    const ledger = new SpendLedger({ ceilingUsd: 0.035, pricing: {} })
    const first = await runOnce({ db, llm: scriptedLlm({ ledger, costPerCall: 0.01 }), ledger, now, kind: 'live', sources })
    expect(first.status).toBe('stopped_ceiling')
    const states = await db.select({ state: sourceItems.state, n: sql<number>`count(*)::int` }).from(sourceItems).groupBy(sourceItems.state)
    expect(Object.fromEntries(states.map((s) => [s.state, s.n]))).toEqual({ attached: 8, new: 4 })
    const roomy = new SpendLedger({ ceilingUsd: 1, pricing: {} })
    const second = await runOnce({ db, llm: scriptedLlm({ ledger: roomy, costPerCall: 0.001 }), ledger: roomy, now, kind: 'live', sources })
    expect(second.status).toBe('ok')
    expect(await db.$count(sourceItems, eq(sourceItems.state, 'attached'))).toBe(12)
  })

  it('logs a failing outlet with ok = false and still finishes ok', async () => {
    const ledger = new SpendLedger({ ceilingUsd: 1, pricing: {} })
    const sources = staticSources(outcomes(day, { bbc: ['Floods in Kenya'] }, ['reliefweb']))
    const result = await runOnce({ db, llm: scriptedLlm({ ledger }), ledger, now, kind: 'live', sources })
    expect(result.status).toBe('ok')
    const [log] = await db.select().from(fetchLog).where(eq(fetchLog.outletId, 'reliefweb'))
    expect(log).toMatchObject({ ok: false, httpStatus: 503 })
    expect(result.report.fetchFailures).toEqual([{ outletId: 'reliefweb', error: 'http 503' }])
  })

  it('stores items older than the live window as skipped', async () => {
    const ledger = new SpendLedger({ ceilingUsd: 1, pricing: {} })
    const sources = staticSources(outcomes(dayOf('2026-10-20'), { bbc: ['Old story'] }))
    await runOnce({ db, llm: scriptedLlm({ ledger }), ledger, now, kind: 'live', sources })
    const [item] = await db.select().from(sourceItems)
    expect({ state: item.state, reason: item.skipReason }).toEqual({ state: 'skipped', reason: 'older than window' })
  })
})

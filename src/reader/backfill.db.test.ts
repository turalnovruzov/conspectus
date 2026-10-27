import { asc, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runs, situations } from '../db/schema'
import { BackfillRefusedError, backfill, backfillDays, endOfDay } from './backfill'
import type { FakeLlm } from './fake-llm'
import { dayOf, outcomes, plusDays, scriptedLlm } from './fixture-run'
import { SpendLedger } from './spend'
import { resetTables, throwawayDb } from './test-helpers'

const { db, pool } = throwawayDb()
afterAll(() => pool.end())
beforeEach(() => resetTables(db))

const today = new Date('2026-10-27T05:00:00Z')
const [d1, d2, d3] = backfillDays(today, 3)

function feeds(perDay: Record<string, string[]>) {
  return Object.entries(perDay).flatMap(([iso, headlines]) => outcomes(dayOf(iso), { bbc: headlines }))
}

describe('backfill', () => {
  it('runs days oldest first with now at each day\'s end', async () => {
    expect([d1, d2, d3].map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-10-24', '2026-10-25', '2026-10-26'])
    const totalLedger = new SpendLedger({ ceilingUsd: 1, pricing: {} })
    const results = await backfill({
      db, today, days: 3, totalLedger, wikipedia: [],
      feeds: feeds({ '2026-10-24': ['Floods begin'], '2026-10-25': ['Quake strikes'], '2026-10-26': ['Talks open'] }),
      makeLlm: (ledger) => scriptedLlm({ ledger, costPerCall: 0.001 }),
    })
    expect(results.map((r) => r.status)).toEqual(['ok', 'ok', 'ok'])
    const rows = await db.select().from(runs).orderBy(asc(runs.startedAt))
    expect(rows.map((r) => [r.kind, r.simDay])).toEqual([['backfill', '2026-10-24'], ['backfill', '2026-10-25'], ['backfill', '2026-10-26']])
    const opened = await db.select().from(situations).orderBy(asc(situations.startedOn))
    expect(opened.map((s) => [s.startedOn, s.phaseSince])).toEqual([
      ['2026-10-24', endOfDay(d1)], ['2026-10-25', endOfDay(d2)], ['2026-10-26', endOfDay(d3)],
    ])
  })

  it('refuses after a live run unless forced', async () => {
    await db.insert(runs).values({ kind: 'live', ceilingUsd: '1' })
    const options = { db, today, days: 1, totalLedger: new SpendLedger({ ceilingUsd: 1, pricing: {} }), wikipedia: [], feeds: [], makeLlm: () => scriptedLlm() }
    await expect(backfill(options)).rejects.toThrow(BackfillRefusedError)
    await expect(backfill({ ...options, force: true })).resolves.toHaveLength(1)
  })

  it('stops at the total ceiling: once day 2 spends it, day 3 makes no LLM call and stops', async () => {
    const totalLedger = new SpendLedger({ ceilingUsd: 0.06, pricing: {} })
    const llms: FakeLlm[] = []
    const results = await backfill({
      db, today, days: 3, totalLedger, wikipedia: [],
      feeds: feeds({ '2026-10-25': ['Floods begin', 'Floods spread'], '2026-10-26': ['Quake strikes'] }),
      // Each call costs far more than it reserved, as a real call can.
      makeLlm: (ledger) => {
        const llm = scriptedLlm({ ledger, reservePerCall: 0.001, costPerCall: 0.07 })
        llms.push(llm)
        return llm
      },
    })
    expect(totalLedger.roomUsd).toBeLessThanOrEqual(0)
    expect(llms[2].calls).toHaveLength(0)
    expect(llms[2].embedCalls).toHaveLength(0)
    expect(results[2].status).toBe('stopped_ceiling')
    const [day3] = await db.select().from(runs).where(eq(runs.simDay, '2026-10-26'))
    expect(day3.status).toBe('stopped_ceiling')
    expect(plusDays(d1, 2)).toEqual(d3)
  })
})

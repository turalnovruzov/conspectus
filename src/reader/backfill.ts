import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { runs } from '../db/schema.ts'
import { DAY_MS, isoDay } from './context.ts'
import type { Llm } from './llm.ts'
import type { KeyInfo } from './openrouter-key.ts'
import { type RunResult, runOnce } from './run.ts'
import { staticSources } from './sources.ts'
import { SpendLedger } from './spend.ts'
import type { FetchOutcome } from './stages/ingest.ts'

export class BackfillRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackfillRefusedError'
  }
}

/** The `days` whole UTC days before `today`, oldest first; today itself is left to the live run. */
export function backfillDays(today: Date, days: number): Date[] {
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Array.from({ length: days }, (_, i) => new Date(midnight - (days - i) * DAY_MS))
}

export const endOfDay = (day: Date) => new Date(day.getTime() + DAY_MS - 1000)

/**
 * Splits one fetch of the feeds into per-day outcomes by publication date; undated items cannot be placed
 * in a past day. A failed fetch shows, with its error, on every day, since every day lost it.
 */
export function sliceByDay(feeds: FetchOutcome[], wikipedia: WikipediaDay[], days: Date[]): Map<string, FetchOutcome[]> {
  const out = new Map<string, FetchOutcome[]>(days.map((d) => [isoDay(d), []]))
  for (const outcome of feeds) {
    for (const day of days) {
      const items = outcome.items.filter((i) => i.publishedAt && isoDay(i.publishedAt) === isoDay(day))
      out.get(isoDay(day))!.push({ ...outcome, items })
    }
  }
  for (const { day, outcome } of wikipedia) out.get(isoDay(day))?.push(outcome)
  return out
}

export interface WikipediaDay {
  day: Date
  outcome: FetchOutcome
}

export interface BackfillPlan {
  days: { day: string; perOutlet: Record<string, number>; total: number }[]
  oldestPerOutlet: Record<string, string | null>
  estimatedUsdPerDay: number | null
}

export function planBackfill(sliced: Map<string, FetchOutcome[]>, feeds: FetchOutcome[], costPerItemUsd: number | null): BackfillPlan {
  const days = [...sliced].map(([day, outcomes]) => {
    const perOutlet: Record<string, number> = {}
    for (const o of outcomes) if (o.items.length) perOutlet[o.outletId] = (perOutlet[o.outletId] ?? 0) + o.items.length
    return { day, perOutlet, total: Object.values(perOutlet).reduce((a, b) => a + b, 0) }
  })
  const oldestPerOutlet: Record<string, string | null> = {}
  for (const o of feeds) {
    const dates = o.items.map((i) => i.publishedAt?.getTime()).filter((t): t is number => t !== undefined)
    oldestPerOutlet[o.outletId] = dates.length ? new Date(Math.min(...dates)).toISOString() : null
  }
  const mean = days.length ? days.reduce((a, d) => a + d.total, 0) / days.length : 0
  return { days, oldestPerOutlet, estimatedUsdPerDay: costPerItemUsd === null ? null : mean * costPerItemUsd }
}

export interface BackfillOptions {
  db: Db
  today: Date
  days: number
  totalLedger: SpendLedger
  makeLlm: (ledger: SpendLedger) => Llm
  feeds: FetchOutcome[]
  wikipedia: WikipediaDay[]
  force?: boolean
  /** Read once before the first day; every day's run carries it, as the key is not read between days. */
  keyBefore?: KeyInfo | null
}

/** Replays the last days as if the reader had been running: one run per day, oldest first, each day's ledger a child of the total. */
export async function backfill(o: BackfillOptions): Promise<RunResult[]> {
  if (!o.force) {
    const [live] = await o.db.select({ id: runs.id }).from(runs).where(eq(runs.kind, 'live')).limit(1)
    if (live) throw new BackfillRefusedError('a live run already exists; a backfill would replay days after it (use --force to run anyway)')
  }
  const days = backfillDays(o.today, o.days)
  const sliced = sliceByDay(o.feeds, o.wikipedia, days)
  const results: RunResult[] = []
  for (const [i, day] of days.entries()) {
    const remainingDays = days.length - i
    const ceilingUsd = Math.max(0, Math.min(o.totalLedger.roomUsd / remainingDays, o.totalLedger.roomUsd))
    const ledger = new SpendLedger({ ceilingUsd, pricing: o.totalLedger.pricing, parent: o.totalLedger })
    results.push(
      await runOnce({
        db: o.db, llm: o.makeLlm(ledger), ledger, now: endOfDay(day), kind: 'backfill', simDay: day,
        sources: staticSources(sliced.get(isoDay(day))!), windowHours: null, keyBefore: o.keyBefore,
      }),
    )
  }
  return results
}

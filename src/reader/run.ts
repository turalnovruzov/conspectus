import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { runs } from '../db/schema.ts'
import { LIVE_WINDOW_HOURS } from './config.ts'
import { type StageContext, isoDay, newNotes } from './context.ts'
import type { FetchFn } from './http.ts'
import { dbSink } from './ledger-sink.ts'
import type { Llm } from './llm.ts'
import type { KeyInfo } from './openrouter-key.ts'
import { type RunReport, buildReport, saveReport } from './report.ts'
import type { Sources } from './sources.ts'
import { SpendCeilingError, type SpendLedger } from './spend.ts'
import { categoryMerge } from './stages/category-merge.ts'
import { cluster } from './stages/cluster.ts'
import { consolidate } from './stages/consolidate.ts'
import { embed } from './stages/embed.ts'
import { ingest } from './stages/ingest.ts'
import { lifecycle } from './stages/lifecycle.ts'
import { read } from './stages/read.ts'
import { summarize } from './stages/summarize.ts'
import { syncOutlets } from './sync-outlets.ts'

export type RunKind = 'live' | 'backfill' | 'trial'
export type RunStatus = 'ok' | 'stopped_ceiling' | 'failed'

export interface RunOptions {
  db: Db
  llm: Llm
  ledger: SpendLedger
  now: Date
  kind: RunKind
  sources: Sources
  maxItems?: number
  simDay?: Date
  keyBefore?: KeyInfo | null
  /** Items older than this many hours before `now` are stored as skipped; null keeps them all (backfill). */
  windowHours?: number | null
  fetchFn?: FetchFn
}

export interface RunResult {
  runId: string
  status: RunStatus
  report: RunReport
  error: string | null
}

/** One pass: fetch → ingest → read → embed → cluster → summarize → lifecycle → consolidate → category merge → report. */
export async function runOnce(o: RunOptions): Promise<RunResult> {
  const [run] = await o.db
    .insert(runs)
    .values({
      kind: o.kind,
      simDay: o.simDay ? isoDay(o.simDay) : null,
      ceilingUsd: o.ledger.ceilingUsd.toFixed(4),
      keyBefore: o.keyBefore ?? null,
      chatModel: o.llm.chatModel,
      embeddingModel: o.llm.embeddingModel,
    })
    .returning({ id: runs.id })
  o.ledger.setSink(dbSink(o.db, run.id))
  const ctx: StageContext = { db: o.db, llm: o.llm, now: o.now, runId: run.id, notes: newNotes() }
  let status: RunStatus = 'ok'
  let error: string | null = null
  try {
    await syncOutlets(o.db)
    const outcomes = await o.sources.collect(o.now)
    await ingest(ctx, outcomes, { windowHours: o.windowHours === undefined ? LIVE_WINDOW_HOURS : o.windowHours })
    try {
      await read(ctx, { fetchFn: o.fetchFn, maxItems: o.maxItems })
      await embed(ctx)
      await cluster(ctx)
      await summarize(ctx)
    } catch (err) {
      if (!(err instanceof SpendCeilingError)) throw err
      status = 'stopped_ceiling'
      error = err.message
    }
    await lifecycle(ctx)
    if (status === 'ok') {
      try {
        await consolidate(ctx)
        await categoryMerge(ctx)
      } catch (err) {
        if (!(err instanceof SpendCeilingError)) throw err
        status = 'stopped_ceiling'
        error = err.message
      }
    }
  } catch (err) {
    status = 'failed'
    error = err instanceof Error ? err.message : String(err)
  }
  const report = await buildReport(o.db, run.id, ctx.notes)
  await saveReport(o.db, run.id, report)
  await o.db.update(runs).set({ status, error, finishedAt: new Date() }).where(eq(runs.id, run.id))
  o.ledger.setSink(null)
  return { runId: run.id, status, report, error }
}

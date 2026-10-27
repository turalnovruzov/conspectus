import type { Db } from '../db/client.ts'
import type { Llm } from './llm.ts'

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbOrTx = Db | Tx

export interface RunNotes {
  touched: Set<string>
  opened: Set<string>
  ended: Set<string>
  merged: Set<string>
  unmatchedCountries: Record<string, number>
  /** Items dropped at ingest because their URL is not absolute http(s). */
  rejectedUrls: number
  llmFailures: { stage: string; message: string }[]
  articleFetches: number
  stagesSkipped: string[]
}

export function newNotes(): RunNotes {
  return {
    touched: new Set(), opened: new Set(), ended: new Set(), merged: new Set(),
    unmatchedCountries: {}, rejectedUrls: 0, llmFailures: [], articleFetches: 0, stagesSkipped: [],
  }
}

export interface StageContext {
  db: Db
  llm: Llm
  /** The run's clock; the backfill sets it to the end of each simulated day. */
  now: Date
  runId: string
  notes: RunNotes
}

export const DAY_MS = 86_400_000

export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS)
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function vectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}

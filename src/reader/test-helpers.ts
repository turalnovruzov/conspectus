import { sql } from 'drizzle-orm'
import { createDb } from '../db/client.ts'
import { runs, sourceItems } from '../db/schema.ts'
import { assertThrowawayUrl, testDatabaseUrl } from '../db/throwaway.ts'
import { type StageContext, newNotes } from './context.ts'
import { FakeLlm, hashVector } from './fake-llm.ts'
import type { Extraction } from './prompts/read.ts'
import { syncOutlets } from './sync-outlets.ts'

export function throwawayDb() {
  const url = testDatabaseUrl()
  assertThrowawayUrl(url)
  return createDb(url)
}

export type TestDb = ReturnType<typeof throwawayDb>['db']

export async function resetTables(db: TestDb): Promise<void> {
  await db.execute(sql`truncate runs, llm_calls, fetch_log, outlets, source_items, situations, events, categories, themes cascade`)
  await syncOutlets(db)
}

export async function newContext(db: TestDb, now: Date, llm = new FakeLlm()): Promise<StageContext & { llm: FakeLlm }> {
  const [run] = await db.insert(runs).values({ kind: 'live', ceilingUsd: '1', startedAt: now }).returning()
  return { db, llm, now, runId: run.id, notes: newNotes() }
}

let counter = 0

/** Inserts an item that the read stage has already read and embedded. */
export async function readItem(
  db: TestDb,
  values: { outletId?: string; headline: string; event?: string; publishedAt?: Date; countries?: Extraction['countries']; state?: string; unsureCount?: number },
) {
  const event = values.event ?? values.headline
  const extraction: Extraction = { i: 1, relevant: true, skipReason: null, event, countries: values.countries ?? [], needsArticle: false }
  const [row] = await db
    .insert(sourceItems)
    .values({
      outletId: values.outletId ?? 'bbc',
      url: `https://www.bbc.com/news/${++counter}`,
      headline: values.headline,
      blurb: '',
      publishedAt: values.publishedAt ?? new Date('2026-10-26T08:00:00Z'),
      state: values.state ?? 'new',
      unsureCount: values.unsureCount ?? 0,
      extraction,
      embedding: hashVector(`${values.headline}\n${event}`),
      embeddingModel: 'fake/embed',
    })
    .returning()
  return row
}

export function decision(item: string, fields: Record<string, unknown>) {
  return {
    item, action: 'unsure', event: null, sameAs: null, situation: null, eventTitle: null, newSituation: null,
    involvement: [], phaseSignal: 'none', reason: 'test', ...fields,
  }
}

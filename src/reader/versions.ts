import { and, eq, isNull, sql } from 'drizzle-orm'
import { eventVersions, events, involvements, situationVersions, situations } from '../db/schema.ts'
import type { DbOrTx } from './context.ts'

export type ChangedBy = 'judge' | 'summarize' | 'lifecycle' | 'consolidate' | 'category_merge'

interface Cause {
  causeItemId: string | null
  causeNote?: string | null
  changedBy: ChangedBy
}

// The embedding is left out: it is a derived lookup aid, thousands of numbers, and is rebuilt from the text fields.
function withoutEmbedding<T extends { embedding?: unknown }>(row: T): Omit<T, 'embedding'> {
  const { embedding: _e, ...rest } = row
  return rest
}

/** Writes the situation's full row after a change, with its open involvements, as the next version. */
export async function versionSituation(db: DbOrTx, situationId: string, cause: Cause): Promise<number> {
  const [row] = await db.select().from(situations).where(eq(situations.id, situationId))
  const open = await db
    .select({ countryKey: involvements.countryKey, role: involvements.role, entry: involvements.entry, joinedOn: involvements.joinedOn })
    .from(involvements)
    .where(and(eq(involvements.situationId, situationId), isNull(involvements.leftOn)))
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${situationVersions.version}), 0) + 1`.mapWith(Number) })
    .from(situationVersions)
    .where(eq(situationVersions.situationId, situationId))
  await db.insert(situationVersions).values({
    situationId,
    version: next,
    snapshot: { ...withoutEmbedding(row), involved: open },
    causeItemId: cause.causeItemId,
    causeNote: cause.causeNote ?? null,
    changedBy: cause.changedBy,
  })
  return next
}

export async function versionEvent(db: DbOrTx, eventId: string, cause: Cause): Promise<number> {
  const [row] = await db.select().from(events).where(eq(events.id, eventId))
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${eventVersions.version}), 0) + 1`.mapWith(Number) })
    .from(eventVersions)
    .where(eq(eventVersions.eventId, eventId))
  await db.insert(eventVersions).values({
    eventId,
    version: next,
    snapshot: withoutEmbedding(row),
    causeItemId: cause.causeItemId,
    causeNote: cause.causeNote ?? null,
    changedBy: cause.changedBy,
  })
  return next
}

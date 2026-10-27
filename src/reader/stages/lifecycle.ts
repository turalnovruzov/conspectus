import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { eventItems, situationEvents, situations, sourceItems } from '../../db/schema.ts'
import { LIFECYCLE } from '../config.ts'
import { type StageContext, daysBefore, isoDay } from '../context.ts'
import { versionSituation } from '../versions.ts'

export type LifecycleMove = 'ended' | 'quiet' | null

/** Code-only phase moves. Ending is tested first, so a long-silent active situation goes straight to ended. */
export function lifecycleMove(
  s: { phase: string; lastEventAt: Date | null; resolutionSignalAt: Date | null },
  now: Date,
  rules = LIFECYCLE,
): LifecycleMove {
  if (s.phase === 'ended' || !s.lastEventAt) return null
  const resolvedAndCalm = s.resolutionSignalAt !== null && s.lastEventAt < daysBefore(now, rules.endAfterResolutionDays)
  if (resolvedAndCalm || s.lastEventAt < daysBefore(now, rules.endSilenceDays)) return 'ended'
  if ((s.phase === 'active' || s.phase === 'easing') && s.lastEventAt < daysBefore(now, rules.quietDays)) return 'quiet'
  return null
}

export async function lifecycle(ctx: StageContext): Promise<{ quiet: number; ended: number }> {
  const rows = await ctx.db
    .select()
    .from(situations)
    .where(and(isNull(situations.mergedIntoId), inArray(situations.phase, ['active', 'easing', 'quiet'])))
  let quiet = 0
  let ended = 0
  for (const s of rows) {
    const move = lifecycleMove(s, ctx.now)
    if (!move) continue
    const [latest] = await ctx.db
      .select({ id: sourceItems.id })
      .from(situationEvents)
      .innerJoin(eventItems, eq(eventItems.eventId, situationEvents.eventId))
      .innerJoin(sourceItems, eq(sourceItems.id, eventItems.sourceItemId))
      .where(eq(situationEvents.situationId, s.id))
      .orderBy(sql`${sourceItems.publishedAt} desc nulls last`, desc(eventItems.attachedAt))
      .limit(1)
    await ctx.db
      .update(situations)
      .set(move === 'ended' ? { phase: 'ended', endedOn: isoDay(ctx.now), phaseSince: ctx.now, updatedAt: ctx.now } : { phase: 'quiet', phaseSince: ctx.now, updatedAt: ctx.now })
      .where(eq(situations.id, s.id))
    await versionSituation(ctx.db, s.id, {
      causeItemId: latest?.id ?? null,
      causeNote: `no events since ${isoDay(s.lastEventAt!)}${move === 'ended' && s.resolutionSignalAt ? ' after a resolution signal' : ''}`,
      changedBy: 'lifecycle',
    })
    if (move === 'ended') {
      ended++
      ctx.notes.ended.add(s.id)
    } else quiet++
  }
  return { quiet, ended }
}

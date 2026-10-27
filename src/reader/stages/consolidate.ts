import { and, eq, isNull, sql } from 'drizzle-orm'
import { eventItems, involvements, situationEvents, situations, sourceItems } from '../../db/schema.ts'
import { CONSOLIDATE_EVERY_HOURS, CONSOLIDATE_RECENT_HOURS, DUP_COSINE } from '../config.ts'
import type { StageContext } from '../context.ts'
import { countryNameOf } from '../countries.ts'
import { LlmOutputError } from '../llm.ts'
import { CONSOLIDATE_SYSTEM, type PairSide, consolidateSchema, consolidateUser } from '../prompts/consolidate.ts'
import { versionSituation } from '../versions.ts'
import { markPass, passRanSince } from './markers.ts'
import { openCountries } from './situation-ops.ts'

const MAX_PAIRS = 20

async function side(ctx: StageContext, id: string): Promise<PairSide> {
  const [s] = await ctx.db.select().from(situations).where(eq(situations.id, id))
  return {
    title: s.title, oneLine: s.oneLine, summary: s.summary, phase: s.phase, since: s.startedOn,
    countries: await openCountries(ctx.db, id, countryNameOf),
  }
}

/** Daily: merges near-identical situations the model confirms are one story. */
export async function consolidate(ctx: StageContext): Promise<{ ran: boolean; merged: number }> {
  if (await passRanSince(ctx, 'consolidatedAt', new Date(ctx.now.getTime() - CONSOLIDATE_EVERY_HOURS * 3_600_000))) {
    return { ran: false, merged: 0 }
  }
  await markPass(ctx, 'consolidatedAt')
  const recent = new Date(ctx.now.getTime() - CONSOLIDATE_RECENT_HOURS * 3_600_000)
  const res = await ctx.db.execute<{ a: string; b: string }>(sql`
    select a.id as a, b.id as b
    from situations a join situations b on a.id < b.id
    where a.merged_into_id is null and b.merged_into_id is null
      and a.phase <> 'ended' and b.phase <> 'ended'
      and a.embedding is not null and b.embedding is not null
      and a.embedding_model = ${ctx.llm.embeddingModel} and b.embedding_model = ${ctx.llm.embeddingModel}
      and (a.last_event_at >= ${recent} or b.last_event_at >= ${recent})
      and 1 - (a.embedding <=> b.embedding) >= ${DUP_COSINE}
    order by a.embedding <=> b.embedding
    limit ${MAX_PAIRS}`)
  const pairs = res.rows
  if (pairs.length === 0) return { ran: true, merged: 0 }
  const described = []
  for (const [i, p] of pairs.entries()) described.push({ handle: `P${i + 1}`, a: await side(ctx, p.a), b: await side(ctx, p.b) })
  let output
  try {
    output = await ctx.llm.chatJson({
      purpose: 'consolidate', schema: consolidateSchema, system: CONSOLIDATE_SYSTEM,
      user: consolidateUser(described), maxTokens: 60 * pairs.length + 100,
    })
  } catch (err) {
    if (err instanceof LlmOutputError) {
      ctx.notes.llmFailures.push({ stage: 'consolidate', message: err.message })
      return { ran: true, merged: 0 }
    }
    throw err
  }
  let merged = 0
  const gone = new Set<string>()
  for (const verdict of output.pairs) {
    const pair = pairs[Number(verdict.pair.trim().replace(/^P/, '')) - 1]
    if (!pair || !verdict.same || gone.has(pair.a) || gone.has(pair.b)) continue
    const [keep, lose] = verdict.keep === 'A' ? [pair.a, pair.b] : [pair.b, pair.a]
    await mergeSituations(ctx, keep, lose, verdict.title)
    gone.add(lose)
    merged++
  }
  return { ran: true, merged }
}

export async function mergeSituations(ctx: StageContext, keep: string, lose: string, title: string | null): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const [loser] = await tx.select().from(situations).where(eq(situations.id, lose))
    const links = await tx.select().from(situationEvents).where(eq(situationEvents.situationId, lose))
    if (links.length > 0) {
      await tx
        .insert(situationEvents)
        .values(links.map((l) => ({ situationId: keep, eventId: l.eventId, attachedAt: ctx.now })))
        .onConflictDoNothing()
    }
    const keeperOpen = await tx
      .select({ countryKey: involvements.countryKey })
      .from(involvements)
      .where(and(eq(involvements.situationId, keep), isNull(involvements.leftOn)))
    const have = new Set(keeperOpen.map((r) => r.countryKey))
    const loserOpen = await tx
      .select()
      .from(involvements)
      .where(and(eq(involvements.situationId, lose), isNull(involvements.leftOn)))
    for (const r of loserOpen) {
      if (have.has(r.countryKey)) continue
      await tx.insert(involvements).values({
        situationId: keep, countryKey: r.countryKey, role: r.role, entry: r.entry, joinedOn: r.joinedOn, joinedCauseItemId: r.joinedCauseItemId,
      })
    }
    await tx
      .update(situations)
      .set({
        ...(title?.trim() ? { title: title.trim() } : {}),
        lastEventAt: sql`greatest(${situations.lastEventAt}, ${loser.lastEventAt})`,
        startedOn: sql`least(${situations.startedOn}, ${loser.startedOn}::date)`,
        updatedAt: ctx.now,
      })
      .where(eq(situations.id, keep))
    await tx.update(situations).set({ mergedIntoId: keep, updatedAt: ctx.now }).where(eq(situations.id, lose))
    const [latest] = await tx
      .select({ id: sourceItems.id })
      .from(situationEvents)
      .innerJoin(eventItems, eq(eventItems.eventId, situationEvents.eventId))
      .innerJoin(sourceItems, eq(sourceItems.id, eventItems.sourceItemId))
      .where(eq(situationEvents.situationId, keep))
      .orderBy(sql`${sourceItems.publishedAt} desc nulls last`)
      .limit(1)
    const note = `merged ${lose} into ${keep}`
    await versionSituation(tx, keep, { causeItemId: latest?.id ?? null, causeNote: note, changedBy: 'consolidate' })
    await versionSituation(tx, lose, { causeItemId: latest?.id ?? null, causeNote: note, changedBy: 'consolidate' })
  })
  ctx.notes.merged.add(lose)
  ctx.notes.touched.add(keep)
}

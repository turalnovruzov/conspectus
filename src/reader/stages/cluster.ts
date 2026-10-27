import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { eventItems, events, outlets, situationEvents, situations, sourceItems } from '../../db/schema.ts'
import { CANDIDATE_EVENT_DAYS, CANDIDATE_EVENTS, CANDIDATE_SITUATIONS, JUDGE_BATCH, REVIVE_ENDED_DAYS } from '../config.ts'
import { type DbOrTx, type StageContext, daysBefore, isoDay, noteUnknownRole, vectorLiteral, noteLlmFailure } from '../context.ts'
import { countryNameOf } from '../countries.ts'
import { isBatchFailure } from '../llm.ts'
import { type Decision, type EventCandidate, JUDGE_SYSTEM, type JudgeItem, type SituationCandidate, judgeSchemaFor, judgeUser } from '../prompts/judge.ts'
import type { Extraction } from '../prompts/read.ts'
import { versionEvent, versionSituation } from '../versions.ts'
import { type InvolvementChange, type Phase, applyInvolvement, greatest, liveSituationId, nextPhase, openCountries } from './situation-ops.ts'

interface ItemRow {
  id: string
  outletName: string
  headline: string
  blurb: string | null
  publishedAt: Date | null
  state: string
  unsureCount: number
  extraction: unknown
  embedding: number[] | null
}

interface Candidates {
  situationIds: string[]
  eventIds: string[]
}

export async function findCandidates(ctx: StageContext, vector: number[]): Promise<Candidates> {
  const v = sql`${vectorLiteral(vector)}::vector`
  const reviveFrom = isoDay(daysBefore(ctx.now, REVIVE_ENDED_DAYS))
  const s = await ctx.db
    .select({ id: situations.id })
    .from(situations)
    .where(
      and(
        isNull(situations.mergedIntoId),
        isNotNull(situations.embedding),
        eq(situations.embeddingModel, ctx.llm.embeddingModel),
        sql`(${situations.phase} <> 'ended' or ${situations.endedOn} >= ${reviveFrom})`,
      ),
    )
    .orderBy(sql`${situations.embedding} <=> ${v}`)
    .limit(CANDIDATE_SITUATIONS)
  const e = await ctx.db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        isNull(events.mergedIntoId),
        isNotNull(events.embedding),
        eq(events.embeddingModel, ctx.llm.embeddingModel),
        sql`${events.lastItemAt} >= ${daysBefore(ctx.now, CANDIDATE_EVENT_DAYS)}`,
      ),
    )
    .orderBy(sql`${events.embedding} <=> ${v}`)
    .limit(CANDIDATE_EVENTS)
  return { situationIds: s.map((r) => r.id), eventIds: e.map((r) => r.id) }
}

function extractionOf(item: ItemRow): Extraction {
  return (item.extraction ?? { event: null, countries: [] }) as Extraction
}

function itemAt(ctx: StageContext, item: ItemRow): Date {
  return item.publishedAt ?? ctx.now
}

function fallbackTitle(item: ItemRow): string {
  const text = extractionOf(item).event || item.headline
  return text.length > 120 ? `${text.slice(0, 119)}…` : text
}

async function createEvent(tx: DbOrTx, ctx: StageContext, item: ItemRow, title: string, situationId: string): Promise<string> {
  const at = itemAt(ctx, item)
  const [event] = await tx
    .insert(events)
    .values({
      title, occurredOn: isoDay(at), lastItemAt: at,
      embedding: item.embedding, embeddingModel: ctx.llm.embeddingModel, updatedAt: ctx.now,
    })
    .returning({ id: events.id })
  await tx.insert(situationEvents).values({ situationId, eventId: event.id, attachedAt: ctx.now })
  await tx.insert(eventItems).values({ eventId: event.id, sourceItemId: item.id, attachedAt: ctx.now })
  return event.id
}

async function createSituation(
  tx: DbOrTx,
  ctx: StageContext,
  item: ItemRow,
  spec: { title: string; oneLine: string; scope: 'ongoing' | 'one_off' },
): Promise<string> {
  const at = itemAt(ctx, item)
  const [s] = await tx
    .insert(situations)
    .values({
      title: spec.title, oneLine: spec.oneLine, scope: spec.scope, phase: 'active', phaseSince: ctx.now,
      startedOn: isoDay(at), lastEventAt: at,
      embedding: item.embedding, embeddingModel: ctx.llm.embeddingModel, updatedAt: ctx.now,
    })
    .returning({ id: situations.id })
  ctx.notes.opened.add(s.id)
  return s.id
}

async function attachToEvent(tx: DbOrTx, ctx: StageContext, item: ItemRow, eventId: string): Promise<string[]> {
  const at = itemAt(ctx, item)
  await tx.insert(eventItems).values({ eventId, sourceItemId: item.id, attachedAt: ctx.now }).onConflictDoNothing()
  await tx.update(events).set({ lastItemAt: greatest(events.lastItemAt, at), updatedAt: ctx.now }).where(eq(events.id, eventId))
  const links = await tx.select({ situationId: situationEvents.situationId }).from(situationEvents).where(eq(situationEvents.eventId, eventId))
  const ids = new Set<string>()
  for (const l of links) ids.add(await liveSituationId(tx, l.situationId))
  return [...ids]
}

/** Updates a situation for a new item: dates, involvement, phase. Returns whether anything changed besides dates. */
async function touchSituation(
  tx: DbOrTx,
  ctx: StageContext,
  situationId: string,
  item: ItemRow,
  decision: Pick<Decision, 'phaseSignal'> & { involvement: InvolvementChange[] },
): Promise<void> {
  const at = itemAt(ctx, item)
  const [row] = await tx.select().from(situations).where(eq(situations.id, situationId))
  const phase = nextPhase(
    { phase: row.phase as Phase, resolutionSignalAt: row.resolutionSignalAt, endedOn: row.endedOn },
    decision.phaseSignal,
    at,
  )
  await tx
    .update(situations)
    .set({
      lastEventAt: greatest(situations.lastEventAt, at),
      startedOn: sql`least(coalesce(${situations.startedOn}, ${isoDay(at)}::date), ${isoDay(at)}::date)`,
      phase: phase.phase,
      resolutionSignalAt: phase.resolutionSignalAt,
      endedOn: phase.endedOn,
      ...(phase.phase !== row.phase ? { phaseSince: ctx.now } : {}),
      updatedAt: ctx.now,
    })
    .where(eq(situations.id, situationId))
  await applyInvolvement(tx, ctx.notes, situationId, decision.involvement, item.id, isoDay(at), `${item.headline}\n${item.blurb ?? ''}`)
  await versionSituation(tx, situationId, { causeItemId: item.id, changedBy: 'judge' })
  ctx.notes.touched.add(situationId)
}

async function markUnsure(tx: DbOrTx, item: ItemRow): Promise<void> {
  await tx
    .update(sourceItems)
    .set({ state: 'unsure', unsureCount: sql`${sourceItems.unsureCount} + 1` })
    .where(eq(sourceItems.id, item.id))
}

async function markAttached(tx: DbOrTx, item: ItemRow): Promise<void> {
  await tx.update(sourceItems).set({ state: 'attached' }).where(eq(sourceItems.id, item.id))
}

type Placed = { situationIds: string[]; eventId: string } | null

async function apply(
  tx: DbOrTx,
  ctx: StageContext,
  item: ItemRow,
  decision: Decision | undefined,
  resolve: { situation(h: string | null): string | null; event(h: string | null): string | null },
): Promise<Placed> {
  const fallbackInvolvement = (): InvolvementChange[] =>
    extractionOf(item).countries.map((c) => ({ country: c.name, role: c.role, change: 'pulled_in' as const }))
  const openOwn = async (spec: { title: string; oneLine: string; scope: 'ongoing' | 'one_off' }, eventTitle: string, d?: Decision) => {
    const situationId = await createSituation(tx, ctx, item, spec)
    const eventId = await createEvent(tx, ctx, item, eventTitle, situationId)
    const involvement = d && d.involvement.length > 0 ? d.involvement : fallbackInvolvement()
    await touchSituation(tx, ctx, situationId, item, { phaseSignal: d?.phaseSignal ?? 'none', involvement })
    await versionEvent(tx, eventId, { causeItemId: item.id, changedBy: 'judge' })
    return { situationIds: [situationId], eventId }
  }
  const unsure = async (): Promise<Placed> => {
    // The second time an item cannot be placed it opens its own situation, so nothing waits forever.
    if (item.unsureCount >= 1) {
      const title = fallbackTitle(item)
      return openOwn({ title, oneLine: extractionOf(item).event ?? '', scope: 'ongoing' }, title)
    }
    await markUnsure(tx, item)
    return null
  }

  if (!decision || decision.action === 'unsure') return unsure()
  const eventTitle = decision.eventTitle?.trim() || fallbackTitle(item)

  if (decision.action === 'attach_event' || decision.action === 'same_as') {
    const eventId = resolve.event(decision.action === 'same_as' ? decision.sameAs : decision.event)
    if (!eventId) return unsure()
    const situationIds = await attachToEvent(tx, ctx, item, eventId)
    for (const id of situationIds) await touchSituation(tx, ctx, id, item, decision)
    await versionEvent(tx, eventId, { causeItemId: item.id, changedBy: 'judge' })
    return { situationIds, eventId }
  }
  if (decision.action === 'new_event') {
    const target = resolve.situation(decision.situation)
    if (!target) return unsure()
    const situationId = await liveSituationId(tx, target)
    const eventId = await createEvent(tx, ctx, item, eventTitle, situationId)
    await touchSituation(tx, ctx, situationId, item, decision)
    await versionEvent(tx, eventId, { causeItemId: item.id, changedBy: 'judge' })
    return { situationIds: [situationId], eventId }
  }
  const spec = decision.newSituation ?? { title: fallbackTitle(item), oneLine: extractionOf(item).event ?? '', scope: 'ongoing' as const }
  return openOwn({ ...spec, title: spec.title.trim() || fallbackTitle(item) }, eventTitle, decision)
}

async function describeSituations(ctx: StageContext, ids: string[], handles: Map<string, string>): Promise<SituationCandidate[]> {
  if (ids.length === 0) return []
  const rows = await ctx.db.select().from(situations).where(inArray(situations.id, ids))
  const byId = new Map(rows.map((r) => [r.id, r]))
  const out: SituationCandidate[] = []
  for (const id of ids) {
    const r = byId.get(id)
    if (!r) continue
    out.push({
      handle: handles.get(id)!,
      title: r.title,
      oneLine: r.oneLine,
      summary: r.summary,
      phase: r.phase,
      since: r.startedOn,
      countries: await openCountries(ctx.db, id, countryNameOf),
    })
  }
  return out
}

async function describeEvents(ctx: StageContext, ids: string[], eventHandles: Map<string, string>, situationHandles: Map<string, string>): Promise<EventCandidate[]> {
  if (ids.length === 0) return []
  const rows = await ctx.db
    .select({ id: events.id, title: events.title, occurredOn: events.occurredOn, situationId: situationEvents.situationId, situationTitle: situations.title })
    .from(events)
    .leftJoin(situationEvents, eq(situationEvents.eventId, events.id))
    .leftJoin(situations, eq(situations.id, situationEvents.situationId))
    .where(inArray(events.id, ids))
  return ids.flatMap((id) => {
    const forEvent = rows.filter((r) => r.id === id)
    if (forEvent.length === 0) return []
    const inList = forEvent.find((r) => r.situationId && situationHandles.has(r.situationId))
    const r = inList ?? forEvent[0]
    return [{
      handle: eventHandles.get(id)!,
      situationHandle: inList ? situationHandles.get(inList.situationId!)! : r.situationTitle ? `“${r.situationTitle}”` : null,
      date: r.occurredOn,
      title: r.title,
    }]
  })
}

/** Places read items into situations: retrieve candidates by embedding, let the model judge each item narrowly. */
export async function cluster(ctx: StageContext, options: { maxItems?: number } = {}): Promise<{ placed: number; unsure: number }> {
  const items: ItemRow[] = await ctx.db
    .select({
      id: sourceItems.id, outletName: outlets.name, headline: sourceItems.headline, blurb: sourceItems.blurb,
      publishedAt: sourceItems.publishedAt, state: sourceItems.state, unsureCount: sourceItems.unsureCount,
      extraction: sourceItems.extraction, embedding: sourceItems.embedding,
    })
    .from(sourceItems)
    .innerJoin(outlets, eq(outlets.id, sourceItems.outletId))
    .where(
      and(
        inArray(sourceItems.state, ['new', 'unsure']),
        isNotNull(sourceItems.extraction),
        isNotNull(sourceItems.embedding),
        eq(sourceItems.embeddingModel, ctx.llm.embeddingModel),
        sql`(${sourceItems.extraction}->>'relevant')::boolean`,
      ),
    )
    .orderBy(sql`case when ${sourceItems.state} = 'unsure' then 0 else 1 end`, sql`${sourceItems.publishedAt} asc nulls last`, asc(sourceItems.id))
    .limit(options.maxItems ?? 1_000_000)

  let placed = 0
  let unsure = 0
  // One batch at a time, never concurrently: a batch's candidates must include the situations and events the batches before it opened.
  for (let start = 0; start < items.length; start += JUDGE_BATCH) {
    const batch = items.slice(start, start + JUDGE_BATCH)
    const situationHandles = new Map<string, string>()
    const eventHandles = new Map<string, string>()
    const perItem: string[][] = []
    for (const item of batch) {
      const c = await findCandidates(ctx, item.embedding!)
      for (const id of c.situationIds) if (!situationHandles.has(id)) situationHandles.set(id, `S${situationHandles.size + 1}`)
      for (const id of c.eventIds) if (!eventHandles.has(id)) eventHandles.set(id, `E${eventHandles.size + 1}`)
      perItem.push([...c.situationIds.map((id) => situationHandles.get(id)!), ...c.eventIds.map((id) => eventHandles.get(id)!)])
    }
    const judgeItems: JudgeItem[] = batch.map((item, i) => {
      const e = extractionOf(item)
      return {
        handle: `I${i + 1}`,
        outlet: item.outletName,
        date: isoDay(itemAt(ctx, item)),
        headline: item.headline,
        blurb: item.blurb ?? '',
        readAs: e.event ?? '',
        countries: e.countries.map((c) => `${c.name} (${c.role})`).join(', '),
        candidates: perItem[i],
      }
    })
    const user = judgeUser(
      await describeSituations(ctx, [...situationHandles.keys()], situationHandles),
      await describeEvents(ctx, [...eventHandles.keys()], eventHandles, situationHandles),
      judgeItems,
    )
    let decisions: Decision[]
    try {
      const out = await ctx.llm.chatJson({ purpose: 'judge', schema: judgeSchemaFor(noteUnknownRole(ctx.notes)), system: JUDGE_SYSTEM, user, maxTokens: 260 * batch.length + 200 })
      decisions = out.decisions
    } catch (err) {
      if (isBatchFailure(err)) {
        noteLlmFailure(ctx.notes, 'judge', err)
        continue
      }
      throw err
    }
    const situationByHandle = new Map([...situationHandles].map(([id, h]) => [h, id]))
    const eventByHandle = new Map([...eventHandles].map(([id, h]) => [h, id]))
    await ctx.db.transaction(async (tx) => {
      // placedInBatch only ever holds earlier items, so an I handle can point back but never forward.
      const placedInBatch = new Map<string, Placed>()
      for (const [i, item] of batch.entries()) {
        const handle = `I${i + 1}`
        // A handle shown only to another item in the batch is not this item's candidate: it resolves to nothing, so unsure.
        const own = new Set(perItem[i])
        const pick = (h: string | null) => h?.trim() ?? ''
        const resolve = {
          situation: (h: string | null) =>
            own.has(pick(h)) ? (situationByHandle.get(pick(h)) ?? null) : (placedInBatch.get(pick(h))?.situationIds[0] ?? null),
          event: (h: string | null) => (own.has(pick(h)) ? (eventByHandle.get(pick(h)) ?? null) : (placedInBatch.get(pick(h))?.eventId ?? null)),
        }
        const decision = decisions.find((d) => d.item.trim() === handle)
        const result = await apply(tx, ctx, item, decision, resolve)
        placedInBatch.set(handle, result)
        if (result) {
          await markAttached(tx, item)
          placed++
        } else {
          unsure++
        }
      }
    })
  }
  return { placed, unsure }
}

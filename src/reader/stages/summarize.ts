import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { categories, eventItems, events, outlets, situationEvents, situations, sourceItems } from '../../db/schema.ts'
import { CATEGORY_CANDIDATES, SUMMARIZE_BATCH } from '../config.ts'
import { type StageContext, isoDay } from '../context.ts'
import { countryNameOf } from '../countries.ts'
import { LlmOutputError } from '../llm.ts'
import type { Extraction } from '../prompts/read.ts'
import { SUMMARIZE_SYSTEM, type SummarizeOutput, type SummarizeSituation, summarizeSchema, summarizeUser } from '../prompts/summarize.ts'
import { versionEvent, versionSituation } from '../versions.ts'
import { type CategoryRow, allCategories, nearestCategories, pathOf, resolveMerged } from './categories.ts'
import { openCountries } from './situation-ops.ts'

const ITEMS_PER_SITUATION = 12

async function latestItemId(ctx: StageContext, situationId: string): Promise<string | null> {
  const [row] = await ctx.db
    .select({ id: sourceItems.id })
    .from(situationEvents)
    .innerJoin(eventItems, eq(eventItems.eventId, situationEvents.eventId))
    .innerJoin(sourceItems, eq(sourceItems.id, eventItems.sourceItemId))
    .where(eq(situationEvents.situationId, situationId))
    .orderBy(desc(eventItems.attachedAt), sql`${sourceItems.publishedAt} desc nulls last`)
    .limit(1)
  return row?.id ?? null
}

/** Rewrites the rolling summary, one line, scope, category and event titles of every situation touched this run. */
export async function summarize(ctx: StageContext): Promise<number> {
  const ids = [...ctx.notes.touched]
  let done = 0
  for (let start = 0; start < ids.length; start += SUMMARIZE_BATCH) {
    const batchIds = ids.slice(start, start + SUMMARIZE_BATCH)
    const rows = await ctx.db.select().from(situations).where(and(inArray(situations.id, batchIds), isNull(situations.mergedIntoId)))
    if (rows.length === 0) continue
    const byCategory = await allCategories(ctx.db)
    const shown = new Set<string>()
    for (const r of rows) {
      for (const id of await nearestCategories(ctx.db, r.embedding, ctx.llm.embeddingModel, CATEGORY_CANDIDATES)) {
        for (let c: string | null = id; c && !shown.has(c); c = byCategory.get(c)?.parentId ?? null) shown.add(c)
      }
      const current = resolveMerged(r.categoryId, byCategory)
      if (current) shown.add(current)
    }
    const categoryHandles = new Map([...shown].map((id, i) => [id, `C${i + 1}`]))
    const byCategoryHandle = new Map([...categoryHandles].map(([id, h]) => [h, id]))
    const eventHandles = new Map<string, string>()
    const situationInputs: SummarizeSituation[] = []
    for (const [i, r] of rows.entries()) {
      // Items attached in this run are what is new since the last summary.
      const items = await ctx.db
        .select({
          eventId: events.id, eventTitle: events.title, occurredOn: events.occurredOn, outlet: outlets.name,
          headline: sourceItems.headline, publishedAt: sourceItems.publishedAt, extraction: sourceItems.extraction,
        })
        .from(situationEvents)
        .innerJoin(events, eq(events.id, situationEvents.eventId))
        .innerJoin(eventItems, eq(eventItems.eventId, events.id))
        .innerJoin(sourceItems, eq(sourceItems.id, eventItems.sourceItemId))
        .innerJoin(outlets, eq(outlets.id, sourceItems.outletId))
        .where(and(eq(situationEvents.situationId, r.id), eq(sourceItems.state, 'attached'), sql`${eventItems.attachedAt} >= ${ctx.now}`))
        .orderBy(sql`${sourceItems.publishedAt} desc nulls last`)
        .limit(ITEMS_PER_SITUATION)
      const grouped = new Map<string, SummarizeSituation['events'][number]>()
      for (const it of items) {
        if (!eventHandles.has(it.eventId)) eventHandles.set(it.eventId, `E${eventHandles.size + 1}`)
        const handle = eventHandles.get(it.eventId)!
        const group = grouped.get(it.eventId) ?? { handle, date: it.occurredOn, title: it.eventTitle, items: [] }
        group.items.push({
          outlet: it.outlet,
          date: it.publishedAt ? isoDay(it.publishedAt) : '',
          headline: it.headline,
          readAs: (it.extraction as Extraction | null)?.event ?? '',
        })
        grouped.set(it.eventId, group)
      }
      const category = resolveMerged(r.categoryId, byCategory)
      situationInputs.push({
        handle: `S${i + 1}`,
        title: r.title,
        oneLine: r.oneLine,
        summary: r.summary,
        scope: r.scope,
        phase: r.phase,
        category: category ? pathOf(category, byCategory) : null,
        countries: await openCountries(ctx.db, r.id, countryNameOf),
        events: [...grouped.values()],
      })
    }
    const categoryList = [...categoryHandles].map(([id, handle]) => ({
      handle, path: pathOf(id, byCategory), definition: byCategory.get(id)?.definition ?? '',
    }))
    let output
    try {
      output = await ctx.llm.chatJson({
        purpose: 'summarize', schema: summarizeSchema, system: SUMMARIZE_SYSTEM,
        user: summarizeUser(categoryList, situationInputs), maxTokens: 450 * rows.length + 200,
      })
    } catch (err) {
      if (err instanceof LlmOutputError) {
        ctx.notes.llmFailures.push({ stage: 'summarize', message: err.message })
        continue
      }
      throw err
    }
    const eventByHandle = new Map([...eventHandles].map(([id, h]) => [h, id]))
    const embedTexts: { situationId: string; text: string }[] = []
    for (const out of output.situations) {
      const index = Number(out.situation.trim().replace(/^S/, '')) - 1
      const row = rows[index]
      if (!row || !Number.isInteger(index)) continue
      const categoryId = await chooseCategory(ctx, out.category, byCategoryHandle, byCategory)
      const cause = await latestItemId(ctx, row.id)
      await ctx.db
        .update(situations)
        .set({
          title: out.title.trim() || row.title,
          oneLine: out.oneLine.trim(),
          summary: out.summary.trim(),
          scope: out.scope,
          major: out.major,
          categoryId: categoryId ?? row.categoryId,
          updatedAt: ctx.now,
        })
        .where(eq(situations.id, row.id))
      for (const e of out.events) {
        const eventId = eventByHandle.get(e.handle.trim())
        const title = e.title.trim()
        if (!eventId || !title) continue
        const [current] = await ctx.db.select({ title: events.title }).from(events).where(eq(events.id, eventId))
        if (current?.title === title) continue
        await ctx.db.update(events).set({ title, updatedAt: ctx.now }).where(eq(events.id, eventId))
        await versionEvent(ctx.db, eventId, { causeItemId: cause, changedBy: 'summarize' })
      }
      await versionSituation(ctx.db, row.id, { causeItemId: cause, changedBy: 'summarize' })
      embedTexts.push({ situationId: row.id, text: [out.title, out.oneLine, out.summary].join('\n') })
      done++
    }
    if (embedTexts.length > 0) {
      const vectors = await ctx.llm.embed(embedTexts.map((e) => e.text))
      for (const [i, e] of embedTexts.entries()) {
        await ctx.db
          .update(situations)
          .set({ embedding: vectors[i], embeddingModel: ctx.llm.embeddingModel })
          .where(eq(situations.id, e.situationId))
      }
    }
  }
  return done
}

async function chooseCategory(
  ctx: StageContext,
  choice: SummarizeOutput['situations'][number]['category'],
  byHandle: Map<string, string>,
  byId: Map<string, CategoryRow>,
): Promise<string | null> {
  const picked = choice.handle ? byHandle.get(choice.handle.trim()) : undefined
  if (picked) return resolveMerged(picked, byId)
  const name = choice.name?.trim().slice(0, 80) ?? ''
  const definition = choice.definition?.trim() ?? ''
  if (!name || !definition) return null
  const [existing] = await ctx.db
    .select({ id: categories.id })
    .from(categories)
    .where(sql`lower(${categories.name}) = lower(${name})`)
  if (existing) return resolveMerged(existing.id, byId)
  const parentId = choice.parent ? (byHandle.get(choice.parent.trim()) ?? null) : null
  const [vector] = await ctx.llm.embed([`${name}: ${definition}`])
  const [created] = await ctx.db
    .insert(categories)
    .values({ name, definition, parentId: resolveMerged(parentId, byId), embedding: vector, embeddingModel: ctx.llm.embeddingModel })
    .returning()
  byId.set(created.id, { id: created.id, name: created.name, definition: created.definition, parentId: created.parentId, mergedIntoId: null })
  return created.id
}

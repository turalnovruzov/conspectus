import { and, desc, eq, inArray, isNotNull, isNull, ne, notInArray, sql } from 'drizzle-orm'
import { categories, eventItems, events, outlets, partOfLinks, situationEvents, situations, sourceItems, themes } from '../../db/schema.ts'
import { mapLimit, serial } from '../concurrency.ts'
import { CATEGORY_CANDIDATES, MODEL_CONCURRENCY, PART_OF_CANDIDATES, SUMMARIZE_BATCH, THEME_CANDIDATES } from '../config.ts'
import { type StageContext, isoDay, noteLlmFailure, vectorLiteral } from '../context.ts'
import { countryNameOf } from '../countries.ts'
import { isBatchFailure } from '../llm.ts'
import type { Extraction } from '../prompts/read.ts'
import { type PartOfTargets, SUMMARIZE_SYSTEM, type SummarizeOutput, type SummarizeSituation, summarizeSchema, summarizeUser } from '../prompts/summarize.ts'
import { versionEvent, versionSituation } from '../versions.ts'
import { type CategoryRow, allCategories, nearestCategories, pathOf, resolveMerged } from './categories.ts'
import { liveSituationId, openCountries } from './situation-ops.ts'

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

interface Prepared {
  rows: (typeof situations.$inferSelect)[]
  byCategory: Map<string, CategoryRow>
  byCategoryHandle: Map<string, string>
  eventByHandle: Map<string, string>
  nearbyByHandle: Map<string, string>
  themeByHandle: Map<string, string>
  user: string
}

/** Situations with items attached since their last summary, e.g. left by a run that stopped at its ceiling. */
async function pendingSummaries(ctx: StageContext): Promise<string[]> {
  const res = await ctx.db.execute<{ id: string }>(sql`
    select s.id from situations s
    where s.merged_into_id is null and exists (
      select 1 from situation_events se join event_items ei on ei.event_id = se.event_id
      where se.situation_id = s.id and ei.attached_at > coalesce(s.summarized_at, '-infinity'::timestamptz))
    order by s.last_event_at asc nulls first, s.id`)
  return res.rows.map((r) => r.id)
}

async function nearestSituations(ctx: StageContext, vector: number[], exclude: string[], limit: number): Promise<string[]> {
  const rows = await ctx.db
    .select({ id: situations.id })
    .from(situations)
    .where(
      and(
        isNull(situations.mergedIntoId),
        ne(situations.phase, 'ended'),
        isNotNull(situations.embedding),
        eq(situations.embeddingModel, ctx.llm.embeddingModel),
        notInArray(situations.id, exclude),
      ),
    )
    .orderBy(sql`${situations.embedding} <=> ${vectorLiteral(vector)}::vector`)
    .limit(limit)
  return rows.map((r) => r.id)
}

async function nearestThemes(ctx: StageContext, vector: number[] | null, limit: number): Promise<string[]> {
  if (!vector) return (await ctx.db.select({ id: themes.id }).from(themes).limit(limit)).map((r) => r.id)
  const rows = await ctx.db.execute<{ id: string }>(sql`
    select id from themes
    where embedding is not null and embedding_model = ${ctx.llm.embeddingModel}
    order by embedding <=> ${vectorLiteral(vector)}::vector
    limit ${limit}`)
  return rows.rows.map((r) => r.id)
}

async function prepare(ctx: StageContext, batchIds: string[]): Promise<Prepared | null> {
  const rows = await ctx.db.select().from(situations).where(and(inArray(situations.id, batchIds), isNull(situations.mergedIntoId)))
  if (rows.length === 0) return null
  const byCategory = await allCategories(ctx.db)
  const shown = new Set<string>()
  const nearby = new Set<string>()
  const themeIds = new Set<string>()
  for (const r of rows) {
    for (const id of await nearestCategories(ctx.db, r.embedding, ctx.llm.embeddingModel, CATEGORY_CANDIDATES)) {
      for (let c: string | null = id; c && !shown.has(c); c = byCategory.get(c)?.parentId ?? null) shown.add(c)
    }
    const current = resolveMerged(r.categoryId, byCategory)
    if (current) shown.add(current)
    const vector = r.embeddingModel === ctx.llm.embeddingModel ? r.embedding : null
    if (vector) for (const id of await nearestSituations(ctx, vector, batchIds, PART_OF_CANDIDATES)) nearby.add(id)
    for (const id of await nearestThemes(ctx, vector, THEME_CANDIDATES)) themeIds.add(id)
  }
  const categoryHandles = new Map([...shown].map((id, i) => [id, `C${i + 1}`]))
  const nearbyHandles = new Map([...nearby].map((id, i) => [id, `P${i + 1}`]))
  const themeHandles = new Map([...themeIds].map((id, i) => [id, `T${i + 1}`]))
  const eventHandles = new Map<string, string>()
  const situationInputs: SummarizeSituation[] = []
  for (const [i, r] of rows.entries()) {
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
      .where(
        and(
          eq(situationEvents.situationId, r.id),
          eq(sourceItems.state, 'attached'),
          // New since the last summary; this run's own attachments always count, whatever the clocks say.
          sql`(${eventItems.attachedAt} > coalesce(${r.summarizedAt}::timestamptz, '-infinity'::timestamptz) or ${eventItems.attachedAt} >= ${ctx.now})`,
        ),
      )
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
  const nearbyRows = nearby.size ? await ctx.db.select().from(situations).where(inArray(situations.id, [...nearby])) : []
  const themeRows = themeIds.size ? await ctx.db.select().from(themes).where(inArray(themes.id, [...themeIds])) : []
  const targets: PartOfTargets = {
    nearby: nearbyRows.map((n) => ({ handle: nearbyHandles.get(n.id)!, title: n.title, oneLine: n.oneLine })).sort(byHandle),
    themes: themeRows.map((t) => ({ handle: themeHandles.get(t.id)!, name: t.name, definition: t.definition })).sort(byHandle),
  }
  const invert = (m: Map<string, string>) => new Map([...m].map(([id, h]) => [h, id]))
  return {
    rows, byCategory,
    byCategoryHandle: invert(categoryHandles),
    eventByHandle: invert(eventHandles),
    nearbyByHandle: invert(nearbyHandles),
    themeByHandle: invert(themeHandles),
    user: summarizeUser(categoryList, situationInputs, targets),
  }
}

const byHandle = (a: { handle: string }, b: { handle: string }) => Number(a.handle.slice(1)) - Number(b.handle.slice(1))

/**
 * Rewrites the rolling summary, one line, scope, category and event titles of every situation touched
 * this run, and of any left unsummarized by an earlier run (those first); saves the part-of links the
 * model proposes. Model calls run MODEL_CONCURRENCY at a time; their results are applied one batch at a
 * time, so two batches proposing the same new category or theme cannot race.
 */
export async function summarize(ctx: StageContext): Promise<number> {
  const touched = ctx.notes.touched
  const ids = [...(await pendingSummaries(ctx)).filter((id) => !touched.has(id)), ...touched]
  const batches: string[][] = []
  for (let start = 0; start < ids.length; start += SUMMARIZE_BATCH) batches.push(ids.slice(start, start + SUMMARIZE_BATCH))
  const inTurn = serial()
  const done = await mapLimit(batches, MODEL_CONCURRENCY, async (batchIds) => {
    const prepared = await prepare(ctx, batchIds)
    if (!prepared) return 0
    let output: SummarizeOutput
    try {
      output = await ctx.llm.chatJson({
        purpose: 'summarize', schema: summarizeSchema, system: SUMMARIZE_SYSTEM,
        user: prepared.user, maxTokens: 450 * prepared.rows.length + 200,
      })
    } catch (err) {
      if (isBatchFailure(err)) {
        noteLlmFailure(ctx.notes, 'summarize', err)
        return 0
      }
      throw err
    }
    const applied = await inTurn(() => applyBatch(ctx, prepared, output))
    await embedSituations(ctx, applied)
    return applied.length
  })
  return done.reduce((a, b) => a + b, 0)
}

async function applyBatch(ctx: StageContext, p: Prepared, output: SummarizeOutput): Promise<{ situationId: string; text: string }[]> {
  const embedTexts: { situationId: string; text: string }[] = []
  for (const out of output.situations) {
    const index = Number(out.situation.trim().replace(/^S/, '')) - 1
    const row = p.rows[index]
    if (!row || !Number.isInteger(index)) continue
    const categoryId = await chooseCategory(ctx, out.category, p.byCategoryHandle, p.byCategory)
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
        summarizedAt: ctx.now,
        updatedAt: ctx.now,
      })
      .where(eq(situations.id, row.id))
    for (const e of out.events) {
      const eventId = p.eventByHandle.get(e.handle.trim())
      const title = e.title.trim()
      if (!eventId || !title) continue
      const [current] = await ctx.db.select({ title: events.title }).from(events).where(eq(events.id, eventId))
      if (current?.title === title) continue
      await ctx.db.update(events).set({ title, updatedAt: ctx.now }).where(eq(events.id, eventId))
      await versionEvent(ctx.db, eventId, { causeItemId: cause, changedBy: 'summarize' })
    }
    await versionSituation(ctx.db, row.id, { causeItemId: cause, changedBy: 'summarize' })
    for (const link of out.partOf) await savePartOf(ctx, p, row.id, link, cause)
    embedTexts.push({ situationId: row.id, text: [out.title, out.oneLine, out.summary].join('\n') })
  }
  return embedTexts
}

async function embedSituations(ctx: StageContext, texts: { situationId: string; text: string }[]): Promise<void> {
  if (texts.length === 0) return
  let vectors: number[][]
  try {
    vectors = await ctx.llm.embed(texts.map((e) => e.text))
  } catch (err) {
    if (!isBatchFailure(err)) throw err
    // The situations keep their previous embedding until their next summary.
    noteLlmFailure(ctx.notes, 'summarize_embed', err)
    return
  }
  for (const [i, e] of texts.entries()) {
    await ctx.db
      .update(situations)
      .set({ embedding: vectors[i], embeddingModel: ctx.llm.embeddingModel })
      .where(eq(situations.id, e.situationId))
  }
}

/** Saves one part-of link, never replacing one: the same link proposed again, a self-link or a reverse of an existing link is dropped. */
async function savePartOf(
  ctx: StageContext,
  p: Prepared,
  situationId: string,
  link: SummarizeOutput['situations'][number]['partOf'][number],
  causeItemId: string | null,
): Promise<void> {
  const handle = link.handle?.trim() ?? ''
  let target: { parentSituationId: string } | { themeId: string } | null = null
  if (link.action === 'situation') {
    const fromBatch = /^S\d+$/.test(handle) ? p.rows[Number(handle.slice(1)) - 1]?.id : undefined
    const picked = p.nearbyByHandle.get(handle) ?? fromBatch
    if (!picked) return
    const parentSituationId = await liveSituationId(ctx.db, picked)
    if (parentSituationId === situationId) return
    const reverse = await ctx.db.$count(
      partOfLinks,
      and(eq(partOfLinks.situationId, parentSituationId), eq(partOfLinks.parentSituationId, situationId)),
    )
    if (reverse > 0) return
    target = { parentSituationId }
  } else if (link.action === 'theme') {
    const themeId = p.themeByHandle.get(handle)
    if (themeId) target = { themeId }
  } else {
    const themeId = await newTheme(ctx, link.name, link.definition)
    if (themeId) target = { themeId }
  }
  if (!target) return
  await ctx.db.insert(partOfLinks).values({ situationId, ...target, causeItemId, runId: ctx.runId }).onConflictDoNothing()
}

async function newTheme(ctx: StageContext, rawName: string | null, rawDefinition: string | null): Promise<string | null> {
  const name = rawName?.trim().slice(0, 80) ?? ''
  const definition = rawDefinition?.trim() ?? ''
  if (!name || !definition) return null
  const existing = async () =>
    (await ctx.db.select({ id: themes.id }).from(themes).where(sql`lower(${themes.name}) = lower(${name})`))[0]?.id ?? null
  const found = await existing()
  if (found) return found
  let vectors: number[][]
  try {
    vectors = await ctx.llm.embed([`${name}: ${definition}`])
  } catch (err) {
    if (!isBatchFailure(err)) throw err
    noteLlmFailure(ctx.notes, 'theme_embed', err)
    return null
  }
  await ctx.db
    .insert(themes)
    .values({ name, definition, embedding: vectors[0], embeddingModel: ctx.llm.embeddingModel })
    .onConflictDoNothing()
  return existing()
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
  let vectors: number[][]
  try {
    vectors = await ctx.llm.embed([`${name}: ${definition}`])
  } catch (err) {
    if (!isBatchFailure(err)) throw err
    noteLlmFailure(ctx.notes, 'category_embed', err)
    return null
  }
  const [created] = await ctx.db
    .insert(categories)
    .values({ name, definition, parentId: resolveMerged(parentId, byId), embedding: vectors[0], embeddingModel: ctx.llm.embeddingModel })
    .returning()
  byId.set(created.id, { id: created.id, name: created.name, definition: created.definition, parentId: created.parentId, mergedIntoId: null })
  return created.id
}

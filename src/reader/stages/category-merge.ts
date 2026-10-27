import { eq, isNull, sql } from 'drizzle-orm'
import { categories, situations } from '../../db/schema.ts'
import { CATEGORY_DUP_COSINE, CATEGORY_MERGE_EVERY_DAYS, CATEGORY_MERGE_MIN } from '../config.ts'
import { type StageContext, daysBefore, noteLlmFailure } from '../context.ts'
import { isBatchFailure } from '../llm.ts'
import { CATEGORY_MERGE_SYSTEM, categoryMergeSchema, categoryMergeUser } from '../prompts/category-merge.ts'
import { versionSituation } from '../versions.ts'
import { allCategories, pathOf } from './categories.ts'
import { markPass, passRanSince } from './markers.ts'

const MAX_PAIRS = 20

/** Weekly: merges look-alike categories; the keeper's name and definition stay as they are. */
export async function categoryMerge(ctx: StageContext): Promise<{ ran: boolean; merged: number }> {
  if (await passRanSince(ctx, 'categoryMergedAt', daysBefore(ctx.now, CATEGORY_MERGE_EVERY_DAYS))) return { ran: false, merged: 0 }
  if ((await ctx.db.$count(categories, isNull(categories.mergedIntoId))) < CATEGORY_MERGE_MIN) return { ran: false, merged: 0 }
  await markPass(ctx, 'categoryMergedAt')
  const res = await ctx.db.execute<{ a: string; b: string }>(sql`
    select a.id as a, b.id as b
    from categories a join categories b on a.id < b.id
    where a.merged_into_id is null and b.merged_into_id is null
      and a.embedding is not null and b.embedding is not null
      and a.embedding_model = ${ctx.llm.embeddingModel} and b.embedding_model = ${ctx.llm.embeddingModel}
      and 1 - (a.embedding <=> b.embedding) >= ${CATEGORY_DUP_COSINE}
    order by a.embedding <=> b.embedding
    limit ${MAX_PAIRS}`)
  if (res.rows.length === 0) return { ran: true, merged: 0 }
  const byId = await allCategories(ctx.db)
  const pairs = res.rows.map((p, i) => ({
    handle: `P${i + 1}`,
    a: { path: pathOf(p.a, byId), definition: byId.get(p.a)?.definition ?? '' },
    b: { path: pathOf(p.b, byId), definition: byId.get(p.b)?.definition ?? '' },
  }))
  let output
  try {
    output = await ctx.llm.chatJson({
      purpose: 'category_merge', schema: categoryMergeSchema, system: CATEGORY_MERGE_SYSTEM,
      user: categoryMergeUser(pairs), maxTokens: 40 * pairs.length + 100,
    })
  } catch (err) {
    if (isBatchFailure(err)) {
      noteLlmFailure(ctx.notes, 'category_merge', err)
      return { ran: true, merged: 0 }
    }
    throw err
  }
  let merged = 0
  const gone = new Set<string>()
  for (const verdict of output.pairs) {
    const pair = res.rows[Number(verdict.pair.trim().replace(/^P/, '')) - 1]
    if (!pair || !verdict.same || gone.has(pair.a) || gone.has(pair.b)) continue
    const [keep, lose] = verdict.keep === 'A' ? [pair.a, pair.b] : [pair.b, pair.a]
    await ctx.db.update(categories).set({ mergedIntoId: keep }).where(eq(categories.id, lose))
    const moved = await ctx.db
      .update(situations)
      .set({ categoryId: keep, updatedAt: ctx.now })
      .where(eq(situations.categoryId, lose))
      .returning({ id: situations.id })
    for (const s of moved) {
      await versionSituation(ctx.db, s.id, { causeItemId: null, causeNote: `category ${lose} merged into ${keep}`, changedBy: 'category_merge' })
    }
    gone.add(lose)
    merged++
  }
  return { ran: true, merged }
}

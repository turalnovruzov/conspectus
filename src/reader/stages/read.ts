import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { outlets, sourceItems } from '../../db/schema.ts'
import { MAX_ARTICLE_FETCHES_PER_RUN, READ_BATCH } from '../config.ts'
import type { StageContext } from '../context.ts'
import { fetchArticle } from '../fetch/article.ts'
import type { FetchFn } from '../http.ts'
import { LlmOutputError } from '../llm.ts'
import { OUTLETS } from '../outlets.ts'
import { type Extraction, READ_SYSTEM, type ReadInput, readSchema, readUser } from '../prompts/read.ts'

type Row = {
  id: string
  outletId: string
  outletName: string
  url: string
  headline: string
  blurb: string | null
  language: string | null
  publishedAt: Date | null
  fetchedAt: Date | null
}

const inputOf = (row: Row, i: number, article?: string | null): ReadInput => ({
  i,
  outlet: row.outletName,
  language: row.language ?? 'en',
  date: (row.publishedAt ?? row.fetchedAt)?.toISOString().slice(0, 10) ?? '',
  headline: row.headline,
  blurb: row.blurb ?? '',
  article,
})

async function readBatch(ctx: StageContext, inputs: ReadInput[]): Promise<Map<number, Extraction> | null> {
  try {
    const out = await ctx.llm.chatJson({
      purpose: 'read', schema: readSchema, system: READ_SYSTEM, user: readUser(inputs), maxTokens: 220 * inputs.length + 200,
    })
    return new Map(out.items.map((e) => [e.i, e]))
  } catch (err) {
    if (err instanceof LlmOutputError) {
      ctx.notes.llmFailures.push({ stage: 'read', message: err.message })
      return null
    }
    throw err
  }
}

/** Reads `new` items not yet read: relevance, a one-line event, countries; fetches the article when the blurb is not enough. */
export async function read(ctx: StageContext, options: { fetchFn?: FetchFn; maxItems?: number } = {}): Promise<number> {
  const rows: Row[] = await ctx.db
    .select({
      id: sourceItems.id, outletId: sourceItems.outletId, outletName: outlets.name, url: sourceItems.url,
      headline: sourceItems.headline, blurb: sourceItems.blurb, language: sourceItems.language,
      publishedAt: sourceItems.publishedAt, fetchedAt: sourceItems.fetchedAt,
    })
    .from(sourceItems)
    .innerJoin(outlets, eq(outlets.id, sourceItems.outletId))
    .where(and(eq(sourceItems.state, 'new'), isNull(sourceItems.extraction)))
    .orderBy(sql`${sourceItems.publishedAt} asc nulls last`, asc(sourceItems.id))
    .limit(options.maxItems ?? 1_000_000)
  let done = 0
  for (let start = 0; start < rows.length; start += READ_BATCH) {
    const batch = rows.slice(start, start + READ_BATCH)
    const results = await readBatch(ctx, batch.map((r, i) => inputOf(r, i + 1)))
    if (!results) continue
    const reread: { row: Row; article: string }[] = []
    for (const [index, row] of batch.entries()) {
      const e = results.get(index + 1)
      if (!e) continue
      if (!e.relevant) {
        await ctx.db
          .update(sourceItems)
          .set({ state: 'skipped', skipReason: e.skipReason || 'not a world situation', extraction: e })
          .where(eq(sourceItems.id, row.id))
        done++
        continue
      }
      const outlet = OUTLETS.find((o) => o.id === row.outletId)
      if (e.needsArticle && outlet && outlet.format !== 'mediawiki' && ctx.notes.articleFetches < MAX_ARTICLE_FETCHES_PER_RUN) {
        ctx.notes.articleFetches++
        const article = await fetchArticle(row.url, outlet, { fetchFn: options.fetchFn })
        if ('text' in article) {
          await ctx.db.update(sourceItems).set({ articleText: article.text }).where(eq(sourceItems.id, row.id))
          reread.push({ row, article: article.text })
        }
      }
      await ctx.db.update(sourceItems).set({ extraction: e }).where(eq(sourceItems.id, row.id))
      done++
    }
    if (reread.length > 0) {
      const second = await readBatch(ctx, reread.map(({ row, article }, i) => inputOf(row, i + 1, article)))
      for (const [index, { row }] of reread.entries()) {
        const e = second?.get(index + 1)
        if (!e) continue
        await ctx.db
          .update(sourceItems)
          .set(e.relevant ? { extraction: e } : { extraction: e, state: 'skipped', skipReason: e.skipReason || 'not a world situation' })
          .where(eq(sourceItems.id, row.id))
      }
    }
  }
  return done
}


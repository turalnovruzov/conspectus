import { eq, sql } from 'drizzle-orm'
import { fetchLog, outlets, sourceItems } from '../../db/schema.ts'
import type { StageContext } from '../context.ts'
import type { RawItem } from '../types.ts'
import { httpUrl } from '../fetch/url.ts'

export interface FetchOutcome {
  outletId: string
  url: string
  ok: boolean
  httpStatus: number | null
  error: string | null
  ms: number
  startedAt: Date
  items: RawItem[]
}

/** Stores fetched items (an item already stored is left as it was) and logs each fetch. */
export async function ingest(
  ctx: StageContext,
  outcomes: FetchOutcome[],
  options: { windowHours: number | null },
): Promise<{ seen: number; inserted: number }> {
  const cutoff = options.windowHours === null ? null : new Date(ctx.now.getTime() - options.windowHours * 3_600_000)
  let seen = 0
  let inserted = 0
  for (const outcome of outcomes) {
    let itemsNew = 0
    const storable = outcome.items.flatMap((item) => {
      if (!httpUrl(item.url)) {
        ctx.notes.rejectedUrls++
        return []
      }
      return [{ ...item, citedUrl: httpUrl(item.citedUrl) ? item.citedUrl! : null }]
    })
    if (storable.length > 0) {
      const rows = await ctx.db
        .insert(sourceItems)
        .values(
          storable.map((item) => {
            const old = cutoff !== null && item.publishedAt !== null && item.publishedAt < cutoff
            return {
              outletId: item.outletId,
              url: item.url,
              headline: item.headline,
              blurb: item.blurb || null,
              publishedAt: item.publishedAt,
              fetchedText: [item.headline, item.blurb].filter(Boolean).join('\n\n'),
              language: item.language,
              citedUrl: item.citedUrl,
              firstRunId: ctx.runId,
              state: old ? 'skipped' : 'new',
              skipReason: old ? 'older than window' : null,
            }
          }),
        )
        .onConflictDoNothing()
        .returning({ id: sourceItems.id })
      itemsNew = rows.length
      const dated = storable.map((i) => i.publishedAt).filter((d): d is Date => d !== null)
      if (dated.length > 0) {
        const oldest = new Date(Math.min(...dated.map((d) => d.getTime())))
        await ctx.db
          .update(outlets)
          .set({ oldestItemSeen: sql`least(coalesce(${outlets.oldestItemSeen}, ${oldest}), ${oldest})` })
          .where(eq(outlets.id, outcome.outletId))
      }
    }
    await ctx.db.insert(fetchLog).values({
      runId: ctx.runId,
      outletId: outcome.outletId,
      url: outcome.url,
      ok: outcome.ok,
      httpStatus: outcome.httpStatus,
      itemsSeen: outcome.items.length,
      itemsNew,
      ms: outcome.ms,
      error: outcome.error,
      startedAt: outcome.startedAt,
    })
    seen += outcome.items.length
    inserted += itemsNew
  }
  return { seen, inserted }
}

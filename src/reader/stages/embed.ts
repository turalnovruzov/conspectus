import { and, eq, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm'
import { sourceItems } from '../../db/schema.ts'
import { mapLimit } from '../concurrency.ts'
import { MODEL_CONCURRENCY } from '../config.ts'
import { type StageContext, noteLlmFailure } from '../context.ts'
import { EMBED_BATCH, isBatchFailure } from '../llm.ts'
import type { Extraction } from '../prompts/read.ts'

export function itemEmbeddingText(item: { headline: string; blurb: string | null; extraction: unknown }): string {
  const event = (item.extraction as Extraction | null)?.event ?? ''
  return [item.headline, event, item.blurb ?? ''].filter(Boolean).join('\n').slice(0, 2000)
}

/** Embeds read, relevant items that have no embedding from the current model. */
export async function embed(ctx: StageContext): Promise<number> {
  const rows = await ctx.db
    .select({ id: sourceItems.id, headline: sourceItems.headline, blurb: sourceItems.blurb, extraction: sourceItems.extraction })
    .from(sourceItems)
    .where(
      and(
        inArray(sourceItems.state, ['new', 'unsure']),
        isNotNull(sourceItems.extraction),
        or(isNull(sourceItems.embedding), ne(sourceItems.embeddingModel, ctx.llm.embeddingModel)),
      ),
    )
  const chunks: (typeof rows)[] = []
  for (let start = 0; start < rows.length; start += EMBED_BATCH) chunks.push(rows.slice(start, start + EMBED_BATCH))
  // Saved chunk by chunk, so a spend stop keeps what was already paid for.
  await mapLimit(chunks, MODEL_CONCURRENCY, async (chunk) => {
    let vectors: number[][]
    try {
      vectors = await ctx.llm.embed(chunk.map(itemEmbeddingText))
    } catch (err) {
      if (!isBatchFailure(err)) throw err
      noteLlmFailure(ctx.notes, 'embed', err)
      return
    }
    for (const [i, row] of chunk.entries()) {
      await ctx.db
        .update(sourceItems)
        .set({ embedding: vectors[i], embeddingModel: ctx.llm.embeddingModel })
        .where(eq(sourceItems.id, row.id))
    }
  })
  return rows.length
}

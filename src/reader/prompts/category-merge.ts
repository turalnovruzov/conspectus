import { z } from 'zod'
import { DATA_RULE, clean, dataBlock } from './common.ts'

export const categoryMergeSchema = z.object({
  pairs: z.array(z.object({ pair: z.string(), same: z.boolean(), keep: z.enum(['A', 'B']) })),
})

export type CategoryMergeOutput = z.infer<typeof categoryMergeSchema>

export const CATEGORY_MERGE_SYSTEM = `You keep the category list of Conspectus's world map tidy. Categories are kinds of situation, nestable, each with a definition. Each pair below was flagged because the two read alike. For each pair decide:
- same: true only when A and B mean the same kind of situation, so one name should cover both. A broader category and a narrower one inside it are not the same.
- keep: A or B, the one whose name and definition cover both better.

${DATA_RULE}

Answer with JSON only: one entry per pair, pair set to its P handle.`

export function categoryMergeUser(pairs: { handle: string; a: { path: string; definition: string }; b: { path: string; definition: string } }[]): string {
  return dataBlock(
    pairs.flatMap((p) => [
      p.handle,
      `  A · ${clean(p.a.path, 160)} — ${clean(p.a.definition, 240)}`,
      `  B · ${clean(p.b.path, 160)} — ${clean(p.b.definition, 240)}`,
      '',
    ]),
  )
}

import { z } from 'zod'
import { DATA_RULE, clean, dataBlock } from './common.ts'

export const consolidateSchema = z.object({
  pairs: z.array(z.object({ pair: z.string(), same: z.boolean(), keep: z.enum(['A', 'B']), title: z.string().nullable() })),
})

export type ConsolidateOutput = z.infer<typeof consolidateSchema>

export const CONSOLIDATE_SYSTEM = `You check Conspectus's world map for duplicate situations. Each pair below was flagged because the two summaries read alike. For each pair decide:
- same: true only when A and B are the same story and one should absorb the other (for example the same war opened twice under two names). Two distinct stories in the same country or of the same kind are not the same.
- keep: A or B, the one whose title and scope fit the merged story better.
- title: a better title for the merged situation, or null to keep the kept one's title.

${DATA_RULE}

Answer with JSON only: one entry per pair, pair set to its P handle.`

export interface PairSide {
  title: string
  oneLine: string
  summary: string
  phase: string
  since: string | null
  countries: string
}

export function consolidateUser(pairs: { handle: string; a: PairSide; b: PairSide }[]): string {
  const side = (label: string, s: PairSide) => [
    `  ${label} · ${clean(s.title, 160)} · ${s.phase}${s.since ? ` since ${s.since}` : ''}${s.countries ? ` · countries: ${clean(s.countries, 200)}` : ''}`,
    `    now: ${clean(s.oneLine, 240)}`,
    `    summary: ${clean(s.summary, 700)}`,
  ]
  return dataBlock(pairs.flatMap((p) => [p.handle, ...side('A', p.a), ...side('B', p.b), '']))
}

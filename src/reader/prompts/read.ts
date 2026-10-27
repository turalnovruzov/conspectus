import { z } from 'zod'
import { MAP_COUNTRY_NAMES } from '../countries.ts'
import { COUNTRY_RULE, DATA_RULE, clean, dataBlock } from './common.ts'

export const readSchema = z.object({
  items: z.array(
    z.object({
      i: z.number().int(),
      relevant: z.boolean(),
      skipReason: z.string().nullable(),
      event: z.string().nullable(),
      countries: z.array(z.object({ name: z.string(), role: z.string() })),
      needsArticle: z.boolean(),
    }),
  ),
})

export type ReadOutput = z.infer<typeof readSchema>
export type Extraction = ReadOutput['items'][number]

export const READ_SYSTEM = `You read news items for Conspectus, a world map of what is happening in the world: wars, unrest, crises, elections, disasters, diplomacy, and any other happening that changes a country's situation.

For every item, in order, answer:
- relevant: true when the item reports a real happening (or a clear new development) that involves one or more countries and that a reader of world news would want to see on such a map: conflict, politics, diplomacy, elections, protest, disaster, humanitarian crises, health emergencies, climate and environment, the economy at national scale, crime or court cases with weight beyond one town. False for sport results, celebrities, entertainment, lifestyle, travel, product or company trivia, markets, horoscopes, quizzes, and opinion, analysis or explainers that report no new happening. When in doubt, true.
- skipReason: when not relevant, two to five words saying why; else null.
- event: when relevant, one plain English sentence (at most 30 words) saying what happened, who did it and where, written for someone who has not seen the item. Translate items in other languages. Else null.
- countries: the countries the item shows taking part in or affected by the happening, each with role: one lower-case word or two for its part (party, attacker, target, host, mediator, supporting, affected, sanctioning, voting...). Only what the item itself supports; none is fine. ${COUNTRY_RULE}
- needsArticle: true only when the headline and blurb are too thin to tell what happened or which countries take part; false otherwise. Never true for a not-relevant item.

${DATA_RULE}

Answer with JSON only, one entry per item, using the item's number as i.

Map country names: ${MAP_COUNTRY_NAMES}`

export interface ReadInput {
  i: number
  outlet: string
  language: string
  date: string
  headline: string
  blurb: string
  article?: string | null
}

export function readUser(items: ReadInput[]): string {
  const lines = items.flatMap((it) => [
    `[${it.i}] ${clean(it.outlet, 80)} · ${it.language} · ${it.date}`,
    `headline: ${clean(it.headline, 300)}`,
    ...(it.blurb ? [`blurb: ${clean(it.blurb, 700)}`] : []),
    ...(it.article ? [`article: ${clean(it.article, 4000)}`] : []),
    '',
  ])
  return `${items.length} items:\n${dataBlock(lines)}`
}

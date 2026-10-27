import { z } from 'zod'
import { DATA_RULE, clean, dataBlock } from './common.ts'

export const summarizeSchema = z.object({
  situations: z.array(
    z.object({
      situation: z.string(),
      title: z.string(),
      oneLine: z.string(),
      summary: z.string(),
      scope: z.enum(['ongoing', 'one_off']),
      major: z.boolean(),
      category: z.object({
        pick: z.string().nullable(),
        new: z.object({ name: z.string(), definition: z.string(), parent: z.string().nullable() }).nullable(),
      }),
      events: z.array(z.object({ handle: z.string(), title: z.string() })),
    }),
  ),
})

export type SummarizeOutput = z.infer<typeof summarizeSchema>

export const SUMMARIZE_SYSTEM = `You keep the rolling summaries of the situations on Conspectus, a world map of what is happening in the world. Each situation comes with its current title, one line, summary and category, and the events and source items added since its last update. For each situation write:

- title: short and neutral, naming the place and the kind of story ("Sudan civil war", "Floods in Kenya"). Keep the current title unless it no longer fits the story.
- oneLine: one sentence of at most 25 words saying where the situation stands now.
- summary: at most 120 words: the story so far with the new events folded in, the latest state last. Facts from the items only, no speculation. Name the actors, places and what is at stake: later items are matched against this summary.
- scope: ongoing for a story expected to continue (conflict, crisis, campaign, negotiation, a disaster's aftermath); one_off for a single incident that is not part of a larger story.
- major: true only when the situation matters to the world on its own, whatever its scope: for example a war between states, a coup, a mass-casualty disaster or attack, the death of a head of state, a crisis that moves world markets or draws in great powers. Otherwise false.
- category: categories are a growing, nestable list of kinds of situation, each with a definition. Set pick to the C handle of the most specific listed category whose definition fits, and new to null. Only when none fits, set pick to null and propose new: a short general name (never about one country or one story), a one-sentence definition of what belongs in it, and parent (the C handle of a broader listed category, or null). Never propose a category that means the same as a listed one.
- events: for a listed event whose title the new items show to be wrong or too vague, its handle and a better title of at most 20 words; otherwise leave the list empty.

${DATA_RULE}

Answer with JSON only: one entry per situation, situation set to its S handle.`

export interface SummarizeSituation {
  handle: string
  title: string
  oneLine: string
  summary: string
  scope: string
  phase: string
  category: string | null
  countries: string
  events: { handle: string; date: string | null; title: string; items: { outlet: string; date: string; headline: string; readAs: string }[] }[]
}

export function summarizeUser(categories: { handle: string; path: string; definition: string }[], situations: SummarizeSituation[]): string {
  const cats = categories.length ? categories.map((c) => `${c.handle} · ${clean(c.path, 160)} — ${clean(c.definition, 240)}`) : ['(none yet)']
  const lines = situations.flatMap((s) => [
    `${s.handle} · title: ${clean(s.title, 160)} · ${s.phase} · scope: ${s.scope}${s.category ? ` · category: ${clean(s.category, 160)}` : ''}`,
    ...(s.countries ? [`countries: ${clean(s.countries, 300)}`] : []),
    `one line: ${clean(s.oneLine, 240) || '(none yet)'}`,
    `summary: ${clean(s.summary, 1000) || '(none yet)'}`,
    'new events:',
    ...s.events.flatMap((e) => [
      `  ${e.handle} · ${e.date ?? ''} · ${clean(e.title, 200)}`,
      ...e.items.map((it) => `    - ${clean(it.outlet, 60)} · ${it.date} · ${clean(it.headline, 240)} — ${clean(it.readAs, 240)}`),
    ]),
    '',
  ])
  return ['CATEGORIES', ...cats, '', `SITUATIONS (${situations.length})`, dataBlock(lines)].join('\n')
}

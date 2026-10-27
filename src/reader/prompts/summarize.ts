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
        action: z.enum(['pick', 'new']),
        handle: z.string().nullable(),
        name: z.string().nullable(),
        definition: z.string().nullable(),
        parent: z.string().nullable(),
      }),
      events: z.array(z.object({ handle: z.string(), title: z.string() })),
      partOf: z.array(
        z.object({
          action: z.enum(['situation', 'theme', 'new_theme']),
          handle: z.string().nullable(),
          name: z.string().nullable(),
          definition: z.string().nullable(),
        }),
      ),
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
- category: every situation gets one. Categories are a growing, nestable list of kinds of situation, each with a definition, listed under CATEGORIES with C handles. When a listed category's definition fits, set action to pick and handle to the C handle of the most specific one that fits (name, definition and parent null). When the list is empty or none fits, set action to new, handle null, and propose: name, a short general name for the kind of situation (never about one country or one story, e.g. "Armed conflict", "Election", "Natural disaster", "Public health emergency"); definition, one sentence saying what belongs in it; parent, the C handle of a broader listed category or null. handle only ever holds a C handle from the list. Never propose a category that means the same as a listed one; when two situations in this batch need the same new category, give it the same name for both.
- events: for a listed event whose title the new items show to be wrong or too vague, its handle and a better title of at most 20 words; otherwise leave the list empty.
- partOf: links saying this situation is part of something larger. Usually empty: add a link only when the situation's own items show it. To a larger situation: action situation, handle the P handle (under NEARBY SITUATIONS) or the S handle of another situation in this batch whose story this one is one strand of (a strike in one city that belongs to a nationwide protest movement; a skirmish that belongs to a wider war). The listed situations are only the nearest by wording, not likely parents: two situations of the same kind in different places or between different parties (two elections, two wars) are never part of each other. To a theme: themes are a growing list of long-running topics that span many situations and countries, such as climate change or migration, each with a definition, listed under THEMES with T handles; when one fits, action theme and handle its T handle. When none listed fits but one clearly applies, action new_theme, handle null, and propose: name, a short general name (never one country or one story); definition, one sentence saying what belongs in it. Never propose a theme that means the same as a listed one. name and definition are null unless action is new_theme.

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

export interface PartOfTargets {
  nearby: { handle: string; title: string; oneLine: string }[]
  themes: { handle: string; name: string; definition: string }[]
}

export function summarizeUser(
  categories: { handle: string; path: string; definition: string }[],
  situations: SummarizeSituation[],
  targets: PartOfTargets = { nearby: [], themes: [] },
): string {
  const cats = categories.length ? categories.map((c) => `${c.handle} · ${clean(c.path, 160)} — ${clean(c.definition, 240)}`) : ['(none yet)']
  const themes = targets.themes.length ? targets.themes.map((t) => `${t.handle} · ${clean(t.name, 160)} — ${clean(t.definition, 240)}`) : ['(none yet)']
  const nearby = targets.nearby.map((n) => `${n.handle} · ${clean(n.title, 160)} — ${clean(n.oneLine, 240)}`)
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
  return [
    'CATEGORIES', ...cats, '', 'THEMES', ...themes, '',
    `NEARBY SITUATIONS (${nearby.length})`, dataBlock(nearby.length ? nearby : ['(none)']), '',
    `SITUATIONS (${situations.length})`, dataBlock(lines),
  ].join('\n')
}

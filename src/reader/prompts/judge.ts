import { z } from 'zod'
import { MAP_COUNTRY_NAMES } from '../countries.ts'
import { ROLES, type UnknownRoleSink, withRoles } from '../roles.ts'
import { COUNTRY_RULE, DATA_RULE, clean, dataBlock } from './common.ts'

export const ACTIONS = ['attach_event', 'same_as', 'new_event', 'new_situation', 'unsure'] as const
export const CHANGES = ['pulled_in', 'joined', 'stepped_out', 'role_changed'] as const
export const PHASE_SIGNALS = ['none', 'escalation', 'easing', 'resolution'] as const

export function judgeSchemaFor(onUnknownRole?: UnknownRoleSink) {
  return z.object({
    decisions: z.array(
      z.object({
        item: z.string(),
        action: z.enum(ACTIONS),
        event: z.string().nullable(),
        sameAs: z.string().nullable(),
        situation: z.string().nullable(),
        eventTitle: z.string().nullable(),
        newSituation: z
          .object({ title: z.string(), oneLine: z.string(), scope: z.enum(['ongoing', 'one_off']) })
          .nullable(),
        involvement: withRoles({ country: z.string(), change: z.enum(CHANGES) }, onUnknownRole),
        phaseSignal: z.enum(PHASE_SIGNALS),
        reason: z.string(),
      }),
    ),
  })
}

export const judgeSchema = judgeSchemaFor()

export type JudgeOutput = z.infer<typeof judgeSchema>
export type Decision = JudgeOutput['decisions'][number]

export const JUDGE_SYSTEM = `You keep the situation map of Conspectus, a world map of what is happening in the world.

A SITUATION is a story that can run for days or years: a war, a political crisis, an election, a protest movement, a disaster and its aftermath, a negotiation. An EVENT is one happening inside a situation: one strike, one vote, one summit, one quake, reported by one or more items.

New items arrive in a batch, in order of publication; items next to each other are usually unrelated. Each item lists its own candidates: the situations (S…) and recent events (E…) that a similarity search found for it. Candidates are only suggestions and most will be unrelated. For each item, in order, choose ONE action:
- attach_event: the item reports the very same happening as an event: the same incident with the same actors in the same place, or a later report or update of that incident. Set event to an E handle from the item's own candidates, or to the I handle of an EARLIER item in this batch whose happening it reports.
- same_as: the item reports the very same happening as an EARLIER item in this batch. Set sameAs to that I handle.
- new_event: a different happening that belongs to a situation already listed for this item. Set situation to an S handle from the item's own candidates, or to the I handle of an EARLIER item in this batch whose situation it continues, and set eventTitle.
- new_situation: none of the item's candidates is this story. Set newSituation (title, oneLine, scope) and eventTitle.
- unsure: you cannot tell whether the item belongs to one of its candidates. The item is looked at again in a later run. Prefer unsure to a guess.

How to judge:
- Same story, not just the same country, topic or words. Two elections in two countries are two situations; two separate protests in one country are two situations; an attack inside an ongoing war belongs to that war; a ceasefire in a war belongs to the war. Shared words such as "election", "turnout", "war" or "protest" are not enough: the place and the actors must match the candidate's summary.
- attach_event is for one happening only. A different happening in the same story is new_event, never attach_event.
- Opinion, analysis or background about a story belongs to it only when it reports something new about that story; otherwise treat it like any other item and compare carefully.
- A broad ongoing situation absorbs its incidents: do not open a new situation for something a listed situation already covers.
- A candidate marked ended can take the item when the story has restarted; it will be revived.
- Titles are short and neutral and name the place and the kind of story, e.g. "Sudan civil war", "Peru presidential election 2026", "Floods in Kenya". No sensational words. eventTitle is one sentence of at most 20 words saying what happened.
- scope: ongoing for a story expected to continue (conflict, crisis, campaign, negotiation, a disaster's aftermath); one_off for a single incident that is not part of a larger story.
- involvement: only countries whose part in the situation this item establishes or changes, each with role (exactly one of ${ROLES.join(', ')}) and change: pulled_in (newly drawn in by others' action: attacked, hit, affected, accused), joined (newly taking part by its own action: sent troops, mediates, imposes sanctions, hosts talks), stepped_out (withdrew, left, ended its part), role_changed (a country already listed on the situation whose part this item shows has itself changed, e.g. a mediator that now sends troops). pulled_in and joined are for countries not yet listed on the situation. Use role_changed only when this item reports the change; a different word for the same part is not a change. Leave out countries whose part is unchanged. ${COUNTRY_RULE}
- phaseSignal, for the item's situation: escalation (new fighting or a sharp worsening), easing (ceasefire, truce, talks, de-escalation), resolution (a peace deal or final settlement, a result confirmed, the crisis declared over), none otherwise. A ceasefire is easing, not resolution.
- reason: a few words naming what matched (place, actors) or why nothing did.

${DATA_RULE}

Answer with JSON only: one decision per item, item set to its I handle, unused fields null.

Map country names: ${MAP_COUNTRY_NAMES}`

export interface SituationCandidate {
  handle: string
  title: string
  oneLine: string
  summary: string
  phase: string
  since: string | null
  countries: string
}

export interface EventCandidate {
  handle: string
  situationHandle: string | null
  date: string | null
  title: string
}

export interface JudgeItem {
  handle: string
  outlet: string
  date: string
  headline: string
  blurb: string
  readAs: string
  countries: string
  candidates: string[]
}

export function judgeUser(situations: SituationCandidate[], events: EventCandidate[], items: JudgeItem[]): string {
  const s = situations.length
    ? situations.flatMap((c) => [
        `${c.handle} · ${clean(c.title, 120)} · ${c.phase}${c.since ? ` since ${c.since}` : ''}${c.countries ? ` · countries: ${clean(c.countries, 300)}` : ''}`,
        ...(c.oneLine ? [`   now: ${clean(c.oneLine, 200)}`] : []),
        ...(c.summary ? [`   summary: ${clean(c.summary, 700)}`] : []),
      ])
    : ['(none)']
  const e = events.length
    ? events.map((c) => `${c.handle} · ${c.situationHandle ? `in ${c.situationHandle} · ` : ''}${c.date ?? ''} · ${clean(c.title, 200)}`)
    : ['(none)']
  const lines = items.flatMap((it) => [
    `${it.handle} · ${clean(it.outlet, 80)} · ${it.date} · candidates: ${it.candidates.join(' ') || '(none)'}`,
    `headline: ${clean(it.headline, 300)}`,
    ...(it.blurb ? [`blurb: ${clean(it.blurb, 600)}`] : []),
    `read as: ${clean(it.readAs, 300)}${it.countries ? ` · countries: ${clean(it.countries, 200)}` : ''}`,
    '',
  ])
  return ['CANDIDATE SITUATIONS', ...s, '', 'CANDIDATE EVENTS', ...e, '', `NEW ITEMS (${items.length})`, dataBlock(lines)].join('\n')
}

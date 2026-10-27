import type { LiveSituation, LiveView } from './db/live-view'

export type InvolvementState = 'pulled-in' | 'joined'
export type FillInvolvement = InvolvementState | 'stepped-out'

export interface PageInvolvement {
  country: string
  role: string
  involvement: InvolvementState
  steppedOut: boolean
}

export interface SourceRow {
  text: string
  href: string | null
}

export interface PageSituation {
  id: string
  number: string
  title: string
  oneLine: string
  phase: LiveSituation['phase']
  phaseTag: string
  categoryTag: string | null
  kicker: string
  involved: PageInvolvement[]
  sourcesLabel: string
  rows: SourceRow[]
  moreLabel: string | null
  hasWikipedia: boolean
}

export type PageModel =
  | { status: 'ok'; header: string; situations: PageSituation[] }
  | { status: 'unavailable' }

export interface Fill {
  role: string
  involvement: FillInvolvement
  quiet: boolean
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** Fixed arrays and UTC, never toLocale*, so the server and the browser print the same text. */
export function formatDay(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function formatTime(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** Item URLs come from outside feeds, so only http(s) becomes a link. */
export function safeHref(url: string): string | null {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

const SHOWN_ROWS = 3

const count = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`

function sourceRows(s: LiveSituation): SourceRow[] {
  const newestPerOutlet = new Map<string, LiveSituation['sources'][number]>()
  for (const src of s.sources) {
    const kept = newestPerOutlet.get(src.outletId)
    if (!kept || (src.publishedAt?.getTime() ?? 0) > (kept.publishedAt?.getTime() ?? 0)) newestPerOutlet.set(src.outletId, src)
  }
  return [...newestPerOutlet.values()]
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .map((src) => {
      const date = src.publishedAt ? ` · ${formatDay(src.publishedAt)}` : ''
      return {
        text: `${src.outletName} · ${src.ownerType.toUpperCase()}${date} — ${src.headline}`,
        href: safeHref(src.url),
      }
    })
}

function toPageSituation(s: LiveSituation, index: number): PageSituation {
  const number = String(index + 1).padStart(2, '0')
  const rows = sourceRows(s)
  const latest = s.latestEventAt ? ` · latest event ${formatDay(s.latestEventAt)}` : ''
  return {
    id: s.id,
    number,
    title: s.title,
    oneLine: s.oneLine,
    phase: s.phase,
    phaseTag: s.phase.toUpperCase(),
    categoryTag: s.categoryPath.length > 0 ? s.categoryPath.join(' › ').toUpperCase() : null,
    kicker: s.since ? `SITUATION ${number} · SINCE ${formatDay(new Date(`${s.since}T00:00:00Z`))}` : `SITUATION ${number}`,
    involved: s.involved.map((i) => ({
      country: i.countryKey,
      role: i.role,
      involvement: i.entry === 'joined' ? 'joined' : 'pulled-in',
      steppedOut: i.leftOn !== null,
    })),
    sourcesLabel: `SOURCES · ${count(s.outletCount, 'OUTLET', 'OUTLETS')} · ${count(s.regionCount, 'REGION', 'REGIONS')} · ${s.independentCount} INDEPENDENT · ${s.stateRunCount} STATE-RUN`,
    rows,
    moreLabel: rows.length > SHOWN_ROWS ? `+ ${rows.length - SHOWN_ROWS} more${latest}` : null,
    hasWikipedia: s.sources.some((src) => src.format === 'mediawiki'),
  }
}

export function toPageModel(view: LiveView): PageModel {
  const listed = view.situations
    .filter((s) => s.onMap)
    .sort((a, b) => (b.latestEventAt?.getTime() ?? 0) - (a.latestEventAt?.getTime() ?? 0) || a.title.localeCompare(b.title))
  const updated = view.updatedAt ? `UPDATED ${formatDay(view.updatedAt)} ${formatTime(view.updatedAt)} UTC` : 'NOT UPDATED YET'
  return {
    status: 'ok',
    header: `LIVE · ${view.outletCount} OUTLETS · ${updated}`,
    situations: listed.map(toPageSituation),
  }
}

export async function loadPageModel(load: () => Promise<LiveView>): Promise<PageModel> {
  try {
    return toPageModel(await load())
  } catch (error) {
    console.error('The news database could not be read', error)
    return { status: 'unavailable' }
  }
}

export function situationsForCountry(list: PageSituation[], countryKey: string): PageSituation[] {
  return list.filter((s) => s.involved.some((inv) => inv.country === countryKey))
}

/** An open involvement in a living situation beats one in a quiet situation, which beats a stepped-out one. */
export function countryFills(list: PageSituation[], selectedId: string | null): Map<string, Fill> {
  const fills = new Map<string, Fill>()
  const tiers = new Map<string, number>()
  for (const s of list) {
    if (selectedId !== null && s.id !== selectedId) continue
    const quiet = s.phase === 'quiet'
    for (const inv of s.involved) {
      const tier = inv.steppedOut ? 2 : quiet ? 1 : 0
      if (tier >= (tiers.get(inv.country) ?? 3)) continue
      tiers.set(inv.country, tier)
      fills.set(inv.country, { role: inv.role, involvement: inv.steppedOut ? 'stepped-out' : inv.involvement, quiet })
    }
  }
  return fills
}

export interface CountryName {
  name: string
  steppedOut: boolean
}

export interface CountryLine {
  prefix: string | null
  names: CountryName[]
}

const PRINCIPAL_ROLE = 'party'

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function countryLines(s: PageSituation, nameOf: (key: string) => string): CountryLine[] {
  const byRole = new Map<string, CountryName[]>()
  for (const inv of s.involved) {
    const names = byRole.get(inv.role) ?? []
    names.push({ name: nameOf(inv.country), steppedOut: inv.steppedOut })
    byRole.set(inv.role, names)
  }
  const lines: CountryLine[] = []
  const principal = byRole.get(PRINCIPAL_ROLE)
  if (principal) lines.push({ prefix: null, names: principal })
  for (const [role, names] of byRole) {
    if (role !== PRINCIPAL_ROLE) lines.push({ prefix: capitalise(role), names })
  }
  return lines
}

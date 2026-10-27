import { readFileSync } from 'node:fs'
import { DAY_MS } from './context.ts'
import { parseIndex } from './fetch/html-index.ts'
import { parseFeed } from './fetch/rss.ts'
import { currentEventsUrl, parseDay } from './fetch/wikipedia.ts'
import { type FetchFn, fetchText } from './http.ts'
import { OUTLETS, type Outlet } from './outlets.ts'
import type { FetchOutcome } from './stages/ingest.ts'
import type { RawItem } from './types.ts'

export interface Sources {
  collect(now: Date): Promise<FetchOutcome[]>
}

const CONCURRENCY = 4

export async function fetchOutlet(outlet: Outlet, fetchFn?: FetchFn): Promise<FetchOutcome> {
  const startedAt = new Date()
  const res = await fetchText(outlet.url, { allowedHosts: outlet.hosts, fetchFn })
  const base = { outletId: outlet.id, url: outlet.url, startedAt, ms: res.ms }
  if (!res.ok) return { ...base, ok: false, httpStatus: res.status, error: res.error, items: [] }
  try {
    const items = outlet.format === 'html' ? parseIndex(res.text, outlet, res.url) : parseFeed(res.text, outlet)
    return { ...base, ok: true, httpStatus: res.status, error: items.length === 0 ? 'no items parsed' : null, items }
  } catch (err) {
    return { ...base, ok: false, httpStatus: res.status, error: `parse: ${err instanceof Error ? err.message : String(err)}`, items: [] }
  }
}

export async function fetchWikipediaDay(day: Date, fetchFn?: FetchFn): Promise<FetchOutcome> {
  const wikipedia = OUTLETS.find((o) => o.format === 'mediawiki')!
  const url = currentEventsUrl(day)
  const startedAt = new Date()
  const res = await fetchText(url, { allowedHosts: wikipedia.hosts, fetchFn })
  const base = { outletId: wikipedia.id, url, startedAt, ms: res.ms }
  if (!res.ok) return { ...base, ok: false, httpStatus: res.status, error: res.error, items: [] }
  try {
    const json = JSON.parse(res.text) as { error?: { info?: string } }
    if (json.error) return { ...base, ok: false, httpStatus: res.status, error: `mediawiki: ${json.error.info ?? 'error'}`, items: [] }
    return { ...base, ok: true, httpStatus: res.status, error: null, items: parseDay(json, day) }
  } catch (err) {
    return { ...base, ok: false, httpStatus: res.status, error: `parse: ${err instanceof Error ? err.message : String(err)}`, items: [] }
  }
}

/** Wikipedia days one request at a time, as its API asks. */
export async function fetchWikipediaDays(days: Date[], fetchFn?: FetchFn): Promise<FetchOutcome[]> {
  const out: FetchOutcome[] = []
  for (const day of days) out.push(await fetchWikipediaDay(day, fetchFn))
  return out
}

export async function fetchFeeds(fetchFn?: FetchFn): Promise<FetchOutcome[]> {
  const queue = OUTLETS.filter((o) => o.format !== 'mediawiki')
  const out: FetchOutcome[] = []
  const worker = async () => {
    for (let o = queue.shift(); o; o = queue.shift()) out.push(await fetchOutlet(o, fetchFn))
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return out
}

/** Every listed outlet; Wikipedia for the run's day and the day before. */
export function liveSources(fetchFn?: FetchFn): Sources {
  return {
    async collect(now) {
      const [feeds, wiki] = await Promise.all([fetchFeeds(fetchFn), fetchWikipediaDays([new Date(now.getTime() - DAY_MS), now], fetchFn)])
      return [...feeds, ...wiki]
    },
  }
}

export function staticSources(outcomes: FetchOutcome[]): Sources {
  return { collect: async () => outcomes }
}

function revive(o: FetchOutcome): FetchOutcome {
  return {
    ...o,
    startedAt: new Date(o.startedAt),
    items: o.items.map((i: RawItem) => ({ ...i, publishedAt: i.publishedAt ? new Date(i.publishedAt) : null })),
  }
}

/** Outcomes saved by `reader fetch-only`. */
export function fileSources(path: string): Sources {
  return staticSources(readOutcomes(path))
}

export function readOutcomes(path: string): FetchOutcome[] {
  return (JSON.parse(readFileSync(path, 'utf8')) as FetchOutcome[]).map(revive)
}

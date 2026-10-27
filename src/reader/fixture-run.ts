import { DAY_MS } from './context.ts'
import { FakeLlm } from './fake-llm.ts'
import type { FetchOutcome } from './stages/ingest.ts'
import type { RawItem } from './types.ts'

/** Made-up fetch outcomes for run tests: `perOutlet` items for each outlet id, published on `day`. */
export function outcomes(day: Date, perOutlet: Record<string, string[]>, failing: string[] = []): FetchOutcome[] {
  const ok = Object.entries(perOutlet).map(([outletId, headlines]) => ({
    outletId, url: `https://feed.test/${outletId}`, ok: true, httpStatus: 200, error: null, ms: 10, startedAt: day,
    items: headlines.map((headline, i): RawItem => ({
      outletId, url: `https://${outletId}.test/${day.toISOString().slice(0, 10)}/${i}`, headline, blurb: `${headline}.`,
      publishedAt: new Date(day.getTime() + (i + 1) * 60_000), language: 'en',
    })),
  }))
  const bad = failing.map((outletId) => ({
    outletId, url: `https://feed.test/${outletId}`, ok: false, httpStatus: 503, error: 'http 503', ms: 10, startedAt: day, items: [],
  }))
  return [...ok, ...bad]
}

export const dayOf = (iso: string) => new Date(`${iso}T00:00:00Z`)
export const plusDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS)

/** A FakeLlm that reads every item as relevant, opens one situation per distinct story word, and summarises plainly. */
export function scriptedLlm(options: ConstructorParameters<typeof FakeLlm>[0] = {}): FakeLlm {
  const llm = new FakeLlm(options)
  llm.fallback('read', (req: { user: string }) => ({
    items: [...req.user.matchAll(/^\[(\d+)\]/gm)].map(([, i]) => ({
      i: Number(i), relevant: true, skipReason: null, event: 'Something happened.', countries: [{ name: 'Kenya', role: 'affected' }], needsArticle: false,
    })),
  }))
  llm.fallback('judge', (req: { user: string }) => ({
    decisions: [...req.user.matchAll(/^(I\d+) · /gm)].map(([, h]) => ({
      item: h, action: 'new_situation', event: null, sameAs: null, situation: null, eventTitle: 'e',
      newSituation: { title: `Story ${h}`, oneLine: 'x', scope: 'ongoing' },
      involvement: [{ country: 'Kenya', role: 'affected', change: 'pulled_in', evidence: null }], phaseSignal: 'none', reason: 'r',
    })),
  }))
  llm.fallback('summarize', (req: { user: string }) => ({
    situations: [...req.user.matchAll(/^(S\d+) · title: (.*?) ·/gm)].map(([, h, title]) => ({
      situation: h, title, oneLine: 'Now.', summary: 'So far.', scope: 'ongoing', major: false, category: { action: 'pick', handle: null, name: null, definition: null, parent: null }, events: [], partOf: [],
    })),
  }))
  llm.fallback('consolidate', { pairs: [] })
  llm.fallback('category_merge', { pairs: [] })
  return llm
}

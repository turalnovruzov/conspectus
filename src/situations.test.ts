import { describe, expect, it } from 'vitest'
import type { LiveSituation, LiveSource, LiveView } from './db/live-view'
import { countryName } from './world'
import { countryFills, countryLines, formatDay, loadPageModel, safeHref, situationsForCountry, toPageModel, type PageSituation } from './situations'

const day = (d: string) => new Date(`${d}T12:00:00Z`)

function source(outletId: string, date: string | null, extra: Partial<LiveSource> = {}): LiveSource {
  return {
    outletId,
    format: 'rss',
    outletName: outletId.toUpperCase(),
    ownerType: 'private',
    region: 'R',
    publishedAt: date ? day(date) : null,
    headline: `h-${outletId}`,
    url: `https://${outletId}.example/a`,
    ...extra,
  }
}

function live(id: string, extra: Partial<LiveSituation> = {}): LiveSituation {
  return {
    id,
    title: id,
    oneLine: `${id} line`,
    since: '2026-10-01',
    phase: 'active',
    categoryPath: [],
    scope: 'ongoing',
    major: false,
    onMap: true,
    involved: [],
    sources: [],
    outletCount: 0,
    regionCount: 0,
    independentCount: 0,
    stateRunCount: 0,
    latestEventAt: day('2026-10-20'),
    ...extra,
  }
}

const inv = (countryKey: string, role: string, leftOn: string | null = null, entry = 'pulled_in') => ({
  countryKey, role, entry, joinedOn: '2026-10-01', leftOn,
})

const view = (situations: LiveSituation[], extra: Partial<LiveView> = {}): LiveView => ({
  updatedAt: new Date('2026-10-27T06:05:00Z'),
  outletCount: 6,
  situations,
  ...extra,
})

const page = (situations: LiveSituation[]) => {
  const model = toPageModel(view(situations))
  if (model.status !== 'ok') throw new Error('expected ok')
  return model
}

describe('toPageModel', () => {
  it('keeps onMap situations, newest latest event first, numbered in that order', () => {
    const model = page([
      live('old', { latestEventAt: day('2026-10-01') }),
      live('hidden', { onMap: false }),
      live('new', { latestEventAt: day('2026-10-25') }),
    ])
    expect(model.situations.map((s) => [s.number, s.id])).toEqual([['01', 'new'], ['02', 'old']])
  })

  it('writes the header from the outlet count and the last run, or says not updated yet', () => {
    expect(page([]).header).toBe('LIVE · 6 OUTLETS · UPDATED 27 OCT 2026 06:05 UTC')
    const none = toPageModel(view([], { updatedAt: null }))
    expect(none).toMatchObject({ header: 'LIVE · 6 OUTLETS · NOT UPDATED YET' })
  })

  it('writes the kicker with the start day, or without when unknown', () => {
    expect(page([live('a')]).situations[0].kicker).toBe('SITUATION 01 · SINCE 1 OCT 2026')
    expect(page([live('a', { since: null })]).situations[0].kicker).toBe('SITUATION 01')
  })

  it('writes the sources label from the counts', () => {
    const s = page([live('a', { outletCount: 9, regionCount: 6, independentCount: 7, stateRunCount: 2 })]).situations[0]
    expect(s.sourcesLabel).toBe('SOURCES · 9 OUTLETS · 6 REGIONS · 7 INDEPENDENT · 2 STATE-RUN')
  })

  it('gives one row per outlet, its newer item', () => {
    const rows = page([
      live('a', { sources: [source('x', '2026-10-24', { headline: 'newer' }), source('x', '2026-10-20', { headline: 'older' })] }),
    ]).situations[0].rows
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toContain('newer')
  })

  it('shows "+ N more" and the latest event day above three outlets, nothing at three', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((o, i) => source(o, `2026-10-2${i}`))
    const withFive = page([live('a', { sources: five, outletCount: 5, latestEventAt: day('2026-10-26') })]).situations[0]
    expect(withFive.moreLabel).toBe('+ 2 more · latest event 26 OCT 2026')
    const withThree = page([live('a', { sources: five.slice(0, 3), outletCount: 3 })]).situations[0]
    expect(withThree.moreLabel).toBeNull()
  })

  it('upper-cases the owner type and drops a missing date', () => {
    const rows = page([
      live('a', {
        sources: [
          source('s', '2026-10-24', { ownerType: 'state-run', outletName: 'Sname' }),
          source('p', null, { outletName: 'Pname' }),
        ],
      }),
    ]).situations[0].rows
    expect(rows[0].text).toBe('Sname · STATE-RUN · 24 OCT 2026 — h-s')
    expect(rows[1].text).toBe('Pname · PRIVATE — h-p')
  })

  it('writes the category tag with the arrow, null when empty', () => {
    const [a, b] = page([live('a', { categoryPath: ['Armed conflict', 'Border clash'] }), live('b', { latestEventAt: day('2026-10-01') })]).situations
    expect(a.categoryTag).toBe('ARMED CONFLICT › BORDER CLASH')
    expect(b.categoryTag).toBeNull()
  })

  it('marks Wikipedia by the outlet format', () => {
    const [a, b] = page([
      live('a', { sources: [source('w', '2026-10-24', { format: 'mediawiki' })] }),
      live('b', { latestEventAt: day('2026-10-01'), sources: [source('w', '2026-10-24', { outletName: 'Wikipedia' })] }),
    ]).situations
    expect([a.hasWikipedia, b.hasWikipedia]).toEqual([true, false])
  })

  it('maps entry to involvement and leftOn to steppedOut', () => {
    const s = page([live('a', { involved: [inv('398', 'party'), inv('792', 'supporting', '2026-10-20', 'joined')] })]).situations[0]
    expect(s.involved).toEqual([
      { country: '398', role: 'party', involvement: 'pulled-in', steppedOut: false },
      { country: '792', role: 'supporting', involvement: 'joined', steppedOut: true },
    ])
  })
})

describe('formatDay', () => {
  it('prints UTC days with fixed month names', () => {
    expect(formatDay(new Date('2026-10-01T00:00:00Z'))).toBe('1 OCT 2026')
    expect(formatDay(new Date('2026-12-31T23:59:59Z'))).toBe('31 DEC 2026')
  })
})

describe('safeHref', () => {
  it('keeps http and https and drops everything else', () => {
    expect(safeHref('https://a.example/x')).toBe('https://a.example/x')
    expect(safeHref('http://a.example/x')).toBe('http://a.example/x')
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '/relative']) expect(safeHref(bad), bad).toBeNull()
  })
})

describe('loadPageModel', () => {
  it('turns a failing load into unavailable', async () => {
    const quiet = console.error
    console.error = () => {}
    try {
      expect(await loadPageModel(() => Promise.reject(new Error('down')))).toEqual({ status: 'unavailable' })
    } finally {
      console.error = quiet
    }
  })

  it('turns a view into the model', async () => {
    expect(await loadPageModel(async () => view([]))).toMatchObject({ status: 'ok' })
  })
})

function ps(id: string, phase: LiveSituation['phase'], involved: ReturnType<typeof inv>[]): PageSituation {
  return page([live(id, { phase, involved })]).situations[0]
}

describe('countryFills', () => {
  it('prefers an open involvement over a stepped-out one, and a living situation over a quiet one', () => {
    const list = [
      ps('a', 'active', [inv('398', 'party', '2026-10-20'), inv('860', 'party', '2026-10-20')]),
      ps('b', 'quiet', [inv('398', 'party'), inv('124', 'party')]),
      ps('c', 'easing', [inv('860', 'supporting', null, 'joined')]),
    ]
    const fills = countryFills(list, null)
    expect(fills.get('398')).toEqual({ role: 'party', involvement: 'pulled-in', quiet: true })
    expect(fills.get('860')).toEqual({ role: 'supporting', involvement: 'joined', quiet: false })
    expect(fills.get('124')?.quiet).toBe(true)
  })

  it('marks a country that only stepped out', () => {
    const fills = countryFills([ps('a', 'active', [inv('762', 'supporting', '2026-10-20')])], null)
    expect(fills.get('762')?.involvement).toBe('stepped-out')
  })

  it('with a selection holds only that situation', () => {
    const list = [ps('a', 'active', [inv('398', 'party')]), ps('b', 'active', [inv('076', 'party')])]
    expect([...countryFills(list, 'b').keys()]).toEqual(['076'])
  })
})

describe('countryLines', () => {
  it('lists the principal role first, then other roles with a prefix, flagging stepped-out names', () => {
    const s = ps('a', 'active', [
      inv('398', 'party'), inv('860', 'party'), inv('792', 'supporting', null, 'joined'), inv('762', 'supporting', '2026-10-20', 'joined'),
    ])
    const lines = countryLines(s, countryName)
    expect(lines.map((l) => [l.prefix, l.names.map((n) => n.name).join(' · ')])).toEqual([
      [null, 'Kazakhstan · Uzbekistan'],
      ['Supporting', 'Turkey · Tajikistan'],
    ])
    expect(lines[1].names.map((n) => n.steppedOut)).toEqual([false, true])
  })
})

describe('situationsForCountry', () => {
  it('finds a situation by a stepped-out country', () => {
    const list = [ps('a', 'active', [inv('762', 'supporting', '2026-10-20')]), ps('b', 'active', [inv('076', 'party')])]
    expect(situationsForCountry(list, '762').map((s) => s.id)).toEqual(['a'])
    expect(situationsForCountry(list, '276')).toEqual([])
  })
})

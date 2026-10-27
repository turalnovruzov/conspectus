import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'
import Sources from './Sources'
import type { PageModel, PageSituation } from './situations'

const html = (model: PageModel) => renderToStaticMarkup(createElement(App, { model }))

const situation: PageSituation = {
  id: 's1',
  number: '01',
  title: 'Made-up clash',
  oneLine: 'line',
  phase: 'active',
  phaseTag: 'ACTIVE',
  categoryTag: null,
  kicker: 'SITUATION 01',
  involved: [],
  sourcesLabel: 'SOURCES · 2 OUTLETS · 2 REGIONS · 2 INDEPENDENT · 0 STATE-RUN',
  rows: [
    { text: 'Linked row', href: 'https://a.example/x' },
    { text: 'Plain row', href: null },
  ],
  moreLabel: null,
  hasWikipedia: false,
}

describe('App render', () => {
  it('shows the unavailable shell with the disclaimer and no situations', () => {
    const out = html({ status: 'unavailable' })
    expect(out).toContain('NEWS UNAVAILABLE')
    expect(out).toContain('The news database cannot be reached right now.')
    expect(out).toContain('Compiled automatically from the news by an AI. It may not be fully accurate: every situation links to its sources.')
    expect(out).not.toContain('data-situation=')
  })

  it('says so when there are no situations', () => {
    const out = html({ status: 'ok', header: 'LIVE · 0 OUTLETS · NOT UPDATED YET', situations: [] })
    expect(out).toContain('SITUATIONS · 0 FROM THE NEWS')
    expect(out).toContain('No situations from the news yet.')
  })

  it('renders no country line for a situation with no current countries', () => {
    const out = html({ status: 'ok', header: 'h', situations: [{ ...situation, involved: [] }] })
    expect(out).not.toContain('card-line')
  })

  it('never mentions sample data', () => {
    const out = html({ status: 'ok', header: 'h', situations: [situation] })
    expect(out.toLowerCase()).not.toContain('sample data')
  })

  it('renders a row with no href as text, not a link', () => {
    const out = renderToStaticMarkup(createElement(Sources, { situation: { ...situation, rows: [situation.rows[1]] } }))
    expect(out).toContain('Plain row')
    expect(out).not.toContain('<a')
  })

  it('renders a row with an href as a safe new-tab link', () => {
    const out = renderToStaticMarkup(createElement(Sources, { situation: { ...situation, rows: [situation.rows[0]] } }))
    expect(out).toContain('href="https://a.example/x"')
    expect(out).toContain('rel="noopener noreferrer"')
  })
})

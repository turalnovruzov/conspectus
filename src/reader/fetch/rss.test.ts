import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseFeed } from './rss'

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')
const outlet = (url: string, hosts: string[]) => ({ id: 'ex', url, hosts, language: 'en', format: 'rss' })

describe('parseFeed', () => {
  it('reads RSS 2.0: tags stripped, relative links absolutised, dates parsed or null', () => {
    const items = parseFeed(fixture('rss2.xml'), outlet('https://feeds.example-news.test/world.xml', ['example-news.test']))
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({
      headline: 'Floods hit the river delta',
      blurb: 'Heavy rain floods the delta & nearby towns.',
      url: 'https://www.example-news.test/world/floods-1?src=rss',
      outletId: 'ex',
      language: 'en',
    })
    expect(items[0].publishedAt?.toISOString()).toBe('2026-10-26T10:13:25.000Z')
    expect(items[1].url).toBe('https://feeds.example-news.test/world/talks-2')
    expect(items[1].publishedAt?.toISOString()).toBe('2026-10-26T06:00:00.000Z')
    expect(items[2]).toMatchObject({ url: 'https://www.example-news.test/world/undated-3', publishedAt: null, blurb: '' })
  })

  it('reads RSS 0.91 and unwraps a click-counter link', () => {
    const items = parseFeed(fixture('rss091.xml'), outlet('https://feeds.exemplo.test/mundo/rss091.xml', ['exemplo.test']))
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      headline: 'Eleição no país vizinho',
      url: 'https://www1.exemplo.test/mundo/2026/10/eleicao.shtml',
      blurb: 'Os cidadãos votam hoje.',
    })
    expect(items[0].publishedAt?.toISOString()).toBe('2026-10-26T12:00:00.000Z')
    expect(items[1].publishedAt).toBeNull()
  })

  it('reads RDF with dc:date', () => {
    const items = parseFeed(fixture('rdf.xml'), outlet('https://rss.example-wave.test/rdf', ['example-wave.test']))
    expect(items.map((i) => i.headline)).toEqual(['A new port opens', 'Drought declared'])
    expect(items[0].blurb).toBe('The port opens to ships & trade.')
    expect(items[1].publishedAt?.toISOString()).toBe('2026-10-25T18:00:00.000Z')
  })

  it('reads Atom: the alternate link, html title and summary as text', () => {
    const items = parseFeed(fixture('atom.xml'), outlet('https://atom.example-news.test/feed', ['example-news.test']))
    expect(items).toEqual([
      {
        outletId: 'ex',
        url: 'https://atom.example-news.test/2026/strike-ends',
        headline: 'Strike ends after a week',
        blurb: 'Workers return.',
        publishedAt: new Date('2026-10-26T07:00:00Z'),
        language: 'en',
      },
    ])
  })

  it('returns no items for a document that is not a feed', () => {
    expect(parseFeed('<html><body>blocked</body></html>', outlet('https://x.test/', ['x.test']))).toEqual([])
  })
})

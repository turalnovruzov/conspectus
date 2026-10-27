import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { currentEventsUrl, parseDay } from './wikipedia'

const day = JSON.parse(readFileSync(new URL('../fixtures/wikipedia-day.json', import.meta.url), 'utf8'))
const date = new Date('2026-10-25T00:00:00Z')

describe('wikipedia', () => {
  it('builds the action=parse URL for a day', () => {
    expect(currentEventsUrl(date)).toBe(
      'https://en.wikipedia.org/w/api.php?action=parse&page=Portal:Current_events/2026_October_25&prop=text&format=json&formatversion=2',
    )
  })

  it('makes one item per leaf line, citation stripped, citedUrl set, topic path in the blurb', () => {
    const items = parseDay(day, date)
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({
      outletId: 'wikipedia',
      headline: 'Shelling hits the northern town of Exampleville, killing four.',
      citedUrl: 'https://www.example-news.test/world/shelling-4',
      url: 'https://www.example-news.test/world/shelling-4',
      blurb: 'Armed conflicts and attacks › Example war — Shelling hits the northern town of Exampleville, killing four.',
      publishedAt: date,
    })
    expect(items[1].headline).toBe('Both sides agree to a prisoner exchange.')
    expect(items.some((i) => i.headline.includes('edit'))).toBe(false)
  })

  it('gives a line without a link the portal #hash url, the same for the same text', () => {
    const [, , ferry] = parseDay(day, date)
    expect(ferry.citedUrl).toBeNull()
    expect(ferry.url).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\/Portal:Current_events\/2026_October_25#[0-9a-f]{10}$/)
    expect(parseDay(day, date)[2].url).toBe(ferry.url)
  })

  it('returns no items for a malformed payload', () => {
    expect(parseDay({ error: { info: 'missing' } }, date)).toEqual([])
  })
})

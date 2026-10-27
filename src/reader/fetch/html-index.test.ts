import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OUTLETS } from '../outlets'
import { parseIndex } from './html-index'

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')
const outlet = (id: string) => OUTLETS.find((o) => o.id === id)!

describe('parseIndex', () => {
  it('keeps only same-host article links on Kyodo, one item per article, undated', () => {
    const items = parseIndex(fixture('kyodo-index.html'), outlet('kyodo'))
    expect(items.map((i) => [i.url, i.headline])).toEqual([
      ['https://english.kyodonews.net/articles/-/1001', 'Digest: Oct. 27'],
      ['https://english.kyodonews.net/articles/-/1002', 'Envoy meets detained reporter'],
    ])
    expect(items.every((i) => i.publishedAt === null && i.outletId === 'kyodo')).toBe(true)
  })

  it('keeps only same-host article links on Global Times', () => {
    const items = parseIndex(fixture('global-times-index.html'), outlet('global-times'))
    expect(items.map((i) => i.headline)).toEqual(['Airstrikes reported near the border', 'Families affected by operation'])
  })

  it('returns nothing for an outlet without an article pattern', () => {
    expect(parseIndex(fixture('kyodo-index.html'), outlet('bbc'))).toEqual([])
  })
  it('ignores javascript: and data: anchors', () => {
    const html = `<a href="javascript:void('/articles/-/1')">Bad one</a><a href="data:text/html,x">Bad two</a><a href="/articles/-/1003">Good</a>`
    expect(parseIndex(html, outlet('kyodo'), 'https://english.kyodonews.net/').map((i) => i.url)).toEqual([
      'https://english.kyodonews.net/articles/-/1003',
    ])
  })
})

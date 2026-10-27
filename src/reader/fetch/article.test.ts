import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { OUTLETS } from '../outlets'
import { fetchArticle } from './article'

const html = readFileSync(new URL('../fixtures/article.html', import.meta.url), 'utf8')
const outlet = (id: string) => OUTLETS.find((o) => o.id === id)!

describe('fetchArticle', () => {
  it('refuses a Reuters URL for a Wikipedia item without calling fetchFn', async () => {
    const fetchFn = vi.fn()
    expect(await fetchArticle('https://www.reuters.com/world/x', outlet('wikipedia'), { fetchFn })).toHaveProperty('refused')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refuses an off-host URL for BBC without calling fetchFn', async () => {
    const fetchFn = vi.fn()
    expect(await fetchArticle('https://www.example-news.test/a', outlet('bbc'), { fetchFn })).toEqual({ refused: 'off-list host' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('extracts the body text of the fixture', async () => {
    const fetchFn = vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }))
    const res = await fetchArticle('https://www.bbc.com/news/articles/abc', outlet('bbc'), { fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect('text' in res && res.text).toContain('prisoner exchange and on opening humanitarian corridors')
    expect('text' in res && res.text).not.toContain('Subscribe to our newsletter')
  })
})

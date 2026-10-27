import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { sourceItems } from '../../db/schema'
import { newContext, resetTables, throwawayDb } from '../test-helpers'
import { read } from './read'

const { db, pool } = throwawayDb()
afterAll(() => pool.end())
beforeEach(() => resetTables(db))

const now = new Date('2026-10-26T12:00:00Z')
const article = readFileSync(new URL('../fixtures/article.html', import.meta.url), 'utf8')
const entry = (i: number, fields: Record<string, unknown>) => ({
  i, relevant: true, skipReason: null, event: 'Something happened.', countries: [], needsArticle: false, ...fields,
})

async function rawItem(outletId: string, url: string, headline: string) {
  const [row] = await db.insert(sourceItems).values({ outletId, url, headline, blurb: 'b', publishedAt: now }).returning()
  return row
}

describe('read', () => {
  it('skips an irrelevant item with its reason and never fetches when needsArticle is false', async () => {
    const ctx = await newContext(db, now)
    const sport = await rawItem('bbc', 'https://www.bbc.com/sport/1', 'Team wins cup')
    const war = await rawItem('bbc', 'https://www.bbc.com/news/2', 'Shelling in the north')
    ctx.llm.script('read', (req: { user: string }) => ({
      items: [...req.user.matchAll(/^\[(\d+)\][^\n]*\nheadline: (.*)$/gm)].map(([, i, headline]) =>
        headline === 'Team wins cup' ? entry(Number(i), { relevant: false, skipReason: 'sport', event: null }) : entry(Number(i), {}),
      ),
    }))
    const fetchFn = vi.fn()
    await read(ctx, { fetchFn })
    const [s] = await db.select().from(sourceItems).where(eq(sourceItems.id, sport.id))
    const [w] = await db.select().from(sourceItems).where(eq(sourceItems.id, war.id))
    expect({ state: s.state, reason: s.skipReason }).toEqual({ state: 'skipped', reason: 'sport' })
    expect(w.state).toBe('new')
    expect(w.extraction).toMatchObject({ relevant: true, event: 'Something happened.' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('fetches a BBC article once when needsArticle is true, re-reads it and stores article_text', async () => {
    const ctx = await newContext(db, now)
    const item = await rawItem('bbc', 'https://www.bbc.com/news/articles/x1', 'Talks')
    ctx.llm.script('read', { items: [entry(1, { needsArticle: true, event: 'thin' })] }, { items: [entry(1, { event: 'Ceasefire talks resume.' })] })
    const fetchFn = vi.fn(async () => new Response(article, { headers: { 'content-type': 'text/html' } }))
    await read(ctx, { fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [row] = await db.select().from(sourceItems).where(eq(sourceItems.id, item.id))
    expect(row.articleText).toContain('humanitarian corridors')
    expect(row.extraction).toMatchObject({ event: 'Ceasefire talks resume.' })
    expect(ctx.llm.callsFor('read')[1].user).toContain('article: ')
  })

  it('never fetches a Wikipedia line\'s cited link', async () => {
    const ctx = await newContext(db, now)
    await rawItem('wikipedia', 'https://www.reuters.com/world/x', 'A line')
    ctx.llm.script('read', { items: [entry(1, { needsArticle: true })] })
    const fetchFn = vi.fn()
    await read(ctx, { fetchFn })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('leaves a batch as new when the model output stays invalid', async () => {
    const ctx = await newContext(db, now)
    const item = await rawItem('bbc', 'https://www.bbc.com/news/3', 'x')
    ctx.llm.script('read', { wrong: true })
    await read(ctx, {})
    const [row] = await db.select().from(sourceItems).where(eq(sourceItems.id, item.id))
    expect({ state: row.state, extraction: row.extraction }).toEqual({ state: 'new', extraction: null })
    expect(ctx.notes.llmFailures).toHaveLength(1)
  })
})

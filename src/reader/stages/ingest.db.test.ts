import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { sourceItems } from '../../db/schema'
import { newContext, resetTables, throwawayDb } from '../test-helpers'
import { ingest } from './ingest'

const { db, pool } = throwawayDb()
afterAll(() => pool.end())
beforeEach(() => resetTables(db))

const now = new Date('2026-10-26T12:00:00Z')
const raw = (url: string, citedUrl: string | null = null) => ({
  outletId: 'wikipedia', url, headline: `Line ${url}`, blurb: '', publishedAt: now, language: 'en', citedUrl,
})

describe('ingest', () => {
  it('stores no item whose url is not http(s) and drops a non-http(s) cited url', async () => {
    const ctx = await newContext(db, now)
    const result = await ingest(
      ctx,
      [{
        outletId: 'wikipedia', url: 'https://en.wikipedia.org/w/api.php', ok: true, httpStatus: 200, error: null, ms: 1, startedAt: now,
        items: [
          raw('javascript:alert(1)'),
          raw('data:text/html,hi'),
          raw('https://en.wikipedia.org/wiki/Portal:Current_events/2026_October_26#abc', 'javascript:alert(2)'),
          raw('https://www.example-news.test/a', 'https://www.example-news.test/a'),
        ],
      }],
      { windowHours: null },
    )
    const rows = await db.select({ url: sourceItems.url, citedUrl: sourceItems.citedUrl }).from(sourceItems)
    expect(rows.map((r) => r.url).sort()).toEqual([
      'https://en.wikipedia.org/wiki/Portal:Current_events/2026_October_26#abc',
      'https://www.example-news.test/a',
    ])
    expect(rows.find((r) => r.url.includes('Portal'))?.citedUrl).toBeNull()
    expect(rows.find((r) => r.url.includes('example-news'))?.citedUrl).toBe('https://www.example-news.test/a')
    expect(ctx.notes.rejectedUrls).toBe(2)
    expect(result.inserted).toBe(2)
  })
})

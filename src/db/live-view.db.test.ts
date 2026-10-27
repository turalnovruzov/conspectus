import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { syncOutlets } from '../reader/sync-outlets'
import { createDb } from './client'
import { loadLiveView } from './live-view'
import { categories, eventItems, events, involvements, runs, situationEvents, situations, sourceItems } from './schema'
import { assertThrowawayUrl, testDatabaseUrl } from './throwaway'

assertThrowawayUrl(testDatabaseUrl())
const { db, pool } = createDb(testDatabaseUrl())
afterAll(() => pool.end())
beforeEach(async () => {
  await db.execute(sql`truncate runs, outlets, situations, events, categories, source_items cascade`)
  await syncOutlets(db)
})

let n = 0
async function situationWith(outletIds: string[], values: Partial<typeof situations.$inferInsert> = {}) {
  const [s] = await db.insert(situations).values({ title: `S${++n}`, ...values }).returning()
  const [e] = await db.insert(events).values({ title: 'e' }).returning()
  await db.insert(situationEvents).values({ situationId: s.id, eventId: e.id })
  for (const [i, outletId] of outletIds.entries()) {
    const [item] = await db
      .insert(sourceItems)
      .values({ outletId, url: `https://x.test/${n}/${i}`, headline: `h${i}`, publishedAt: new Date(Date.UTC(2026, 9, 20 + i)) })
      .returning()
    await db.insert(eventItems).values({ eventId: e.id, sourceItemId: item.id })
  }
  return s
}

async function view(id: string) {
  return (await loadLiveView(db)).situations.find((s) => s.id === id)!
}

describe('loadLiveView', () => {
  it('builds the category path root to leaf, resolving a merged category', async () => {
    const [root] = await db.insert(categories).values({ name: 'Armed conflict', definition: 'd' }).returning()
    const [leaf] = await db.insert(categories).values({ name: 'Civil war', definition: 'd', parentId: root.id }).returning()
    const [dup] = await db.insert(categories).values({ name: 'Civil wars', definition: 'd', mergedIntoId: leaf.id }).returning()
    const a = await situationWith(['bbc'], { categoryId: leaf.id })
    const b = await situationWith(['bbc'], { categoryId: dup.id })
    expect((await view(a.id)).categoryPath).toEqual(['Armed conflict', 'Civil war'])
    expect((await view(b.id)).categoryPath).toEqual(['Armed conflict', 'Civil war'])
  })

  it('keeps a stepped-out country in involved with its leftOn', async () => {
    const s = await situationWith(['bbc'])
    await db.insert(involvements).values([
      { situationId: s.id, countryKey: '804', role: 'party', entry: 'pulled_in', joinedOn: '2026-10-01' },
      { situationId: s.id, countryKey: '112', role: 'supporting', entry: 'joined', joinedOn: '2026-10-02', leftOn: '2026-10-20' },
    ])
    expect((await view(s.id)).involved).toEqual([
      { countryKey: '804', role: 'party', entry: 'pulled_in', joinedOn: '2026-10-01', leftOn: null },
      { countryKey: '112', role: 'supporting', entry: 'joined', joinedOn: '2026-10-02', leftOn: '2026-10-20' },
    ])
  })

  it('gives sources outlet name, owner type, region, date, headline and url, newest first', async () => {
    const s = await situationWith(['bbc', 'rt'])
    expect((await view(s.id)).sources).toEqual([
      { outletName: 'RT', ownerType: 'state-run', region: 'Russia', publishedAt: new Date('2026-10-21T00:00:00Z'), headline: 'h1', url: `https://x.test/${n}/1` },
      { outletName: 'BBC World', ownerType: 'public', region: 'Global', publishedAt: new Date('2026-10-20T00:00:00Z'), headline: 'h0', url: `https://x.test/${n}/0` },
    ])
  })

  it('keeps two state-run outlets alone off the map', async () => {
    const s = await situationWith(['rt', 'global-times'])
    expect(await view(s.id)).toMatchObject({ onMap: false, stateRunCount: 2, independentCount: 0, outletCount: 2 })
  })

  it('needs two independent outlets: one plus a state-run is off, two is on', async () => {
    const off = await situationWith(['bbc', 'rt'])
    const on = await situationWith(['bbc', 'dawn'])
    expect((await view(off.id)).onMap).toBe(false)
    expect(await view(on.id)).toMatchObject({ onMap: true, regionCount: 2 })
  })

  it('counts distinct outlets: two articles from one independent outlet stay off', async () => {
    const s = await situationWith(['bbc', 'bbc'])
    expect(await view(s.id)).toMatchObject({ onMap: false, outletCount: 1, independentCount: 1 })
  })

  it('keeps a one-off off the map unless it is major', async () => {
    const minor = await situationWith(['bbc', 'dawn'], { scope: 'one_off' })
    const major = await situationWith(['bbc', 'dawn'], { scope: 'one_off', major: true })
    expect((await view(minor.id)).onMap).toBe(false)
    expect((await view(major.id)).onMap).toBe(true)
  })

  it('includes quiet situations and excludes ended and merged ones', async () => {
    const quiet = await situationWith(['bbc', 'dawn'], { phase: 'quiet' })
    const ended = await situationWith(['bbc', 'dawn'], { phase: 'ended' })
    const merged = await situationWith(['bbc', 'dawn'], { mergedIntoId: quiet.id })
    const ids = (await loadLiveView(db)).situations.map((s) => s.id)
    expect(ids).toContain(quiet.id)
    expect(ids).not.toContain(ended.id)
    expect(ids).not.toContain(merged.id)
    expect((await view(quiet.id)).onMap).toBe(true)
  })

  it('takes updatedAt from the last finished run and counts 33 outlets', async () => {
    await db.insert(runs).values([
      { kind: 'live', ceilingUsd: '1', status: 'ok', finishedAt: new Date('2026-10-26T10:00:00Z') },
      { kind: 'live', ceilingUsd: '1', status: 'stopped_ceiling', finishedAt: new Date('2026-10-26T12:00:00Z') },
      { kind: 'live', ceilingUsd: '1', status: 'failed', finishedAt: new Date('2026-10-26T13:00:00Z') },
    ])
    const v = await loadLiveView(db)
    expect(v.updatedAt).toEqual(new Date('2026-10-26T12:00:00Z'))
    expect(v.outletCount).toBe(33)
  })
})

import { afterAll, describe, expect, it } from 'vitest'
import { createDb } from './client'
import { categories, involvements, outlets, partOfLinks, situationVersions, situations, sourceItems } from './schema'
import { testDatabaseUrl } from './throwaway'

const { db, pool } = createDb(testDatabaseUrl())
afterAll(() => pool.end())

const TABLES = [
  'categories', 'event_items', 'event_versions', 'events', 'fetch_log', 'involvements', 'llm_calls',
  'outlets', 'part_of_links', 'runs', 'situation_events', 'situation_versions', 'situations',
  'source_items', 'themes',
]

describe('schema', () => {
  it('has the vector extension', async () => {
    const res = await pool.query("select 1 from pg_extension where extname = 'vector'")
    expect(res.rowCount).toBe(1)
  })

  it('holds exactly the fifteen tables', async () => {
    const res = await pool.query(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    )
    expect(res.rows.map((r) => r.table_name)).toEqual(TABLES)
  })

  it('round-trips an embedding and compares it by distance', async () => {
    await db.insert(outlets).values({
      id: 'o1', name: 'O', url: 'https://example.test', region: 'r', ownerType: 'x', language: 'en', format: 'rss',
    })
    const [item] = await db
      .insert(sourceItems)
      .values({ outletId: 'o1', url: 'https://example.test/1', headline: 'h', embedding: [0.1, 0.2, 0.3] })
      .returning()
    expect(item.embedding).toEqual([0.1, 0.2, 0.3])
    const res = await pool.query("select embedding <=> '[0.1,0.2,0.3]' as d from source_items where id = $1", [item.id])
    expect(Number(res.rows[0].d)).toBe(0)
  })

  it('rejects a part_of_links row with both targets null', async () => {
    const [s] = await db.insert(situations).values({ title: 's' }).returning()
    await expect(db.insert(partOfLinks).values({ situationId: s.id })).rejects.toThrow()
  })

  it('rejects a situation_versions row with an unknown cause item', async () => {
    const [s] = await db.insert(situations).values({ title: 's2' }).returning()
    await expect(
      db.insert(situationVersions).values({
        situationId: s.id, version: 1, snapshot: {}, changedBy: 't',
        causeItemId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow()
  })

  it('accepts a category with another category as parent', async () => {
    const [parent] = await db.insert(categories).values({ name: 'p', definition: 'd' }).returning()
    const [child] = await db
      .insert(categories)
      .values({ name: 'c', definition: 'd', parentId: parent.id })
      .returning()
    expect(child.parentId).toBe(parent.id)
  })

  it('defaults an involvement entry to pulled_in', async () => {
    const [s] = await db.insert(situations).values({ title: 's3' }).returning()
    const [row] = await db.insert(involvements).values({ situationId: s.id, countryKey: '398', role: 'party' }).returning()
    expect(row.entry).toBe('pulled_in')
  })

  it('defaults a situation to ongoing, not major, empty one line', async () => {
    const [s] = await db.insert(situations).values({ title: 's4' }).returning()
    expect({ scope: s.scope, major: s.major, oneLine: s.oneLine }).toEqual({ scope: 'ongoing', major: false, oneLine: '' })
  })
})

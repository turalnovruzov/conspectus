import { readFileSync } from 'node:fs'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { parseSituations } from '../situations'
import { createDb } from './client'
import { loadSituations } from './load-situations'
import { seedSample } from './seed-sample'
import { involvements, situations } from './schema'
import { testDatabaseUrl } from './throwaway'

const { db, pool } = createDb(testDatabaseUrl())
const sample = JSON.parse(readFileSync(new URL('../data/sample-situations.json', import.meta.url), 'utf8'))

beforeEach(async () => {
  await db.execute(sql`truncate situations cascade`)
})
afterAll(() => pool.end())

describe('loadSituations', () => {
  it('excludes ended and merged situations', async () => {
    const [keep] = await db.insert(situations).values({ title: 'keep' }).returning()
    await db.insert(situations).values({ title: 'ended', phase: 'ended' })
    await db.insert(situations).values({ title: 'merged', mergedIntoId: keep.id })
    expect((await loadSituations(db)).map((s) => s.kind)).toEqual(['keep'])
  })

  it('leaves out a country that has left', async () => {
    const [s] = await db.insert(situations).values({ title: 't' }).returning()
    await db.insert(involvements).values([
      { situationId: s.id, countryKey: '398', role: 'party' },
      { situationId: s.id, countryKey: '860', role: 'party', leftOn: '2026-01-01' },
    ])
    expect((await loadSituations(db))[0].involved).toEqual([{ country: '398', role: 'party' }])
  })

  it('orders by created_at', async () => {
    await db.insert(situations).values({ title: 'second', createdAt: new Date('2026-02-01') })
    await db.insert(situations).values({ title: 'first', createdAt: new Date('2026-01-01') })
    expect((await loadSituations(db)).map((s) => s.kind)).toEqual(['first', 'second'])
  })

  it('seeds the sample once and loads it back equal except for ids', async () => {
    expect(await seedSample(db, sample)).toEqual({ inserted: 3 })
    const expected = parseSituations(sample).map(({ kind, involved }) => ({ kind, involved }))
    const loaded = (await loadSituations(db)).map(({ kind, involved }) => ({ kind, involved }))
    expect(loaded).toEqual(expected)
    expect(await seedSample(db, sample)).toEqual({ inserted: 0 })
    expect(await loadSituations(db)).toHaveLength(3)
    expect(await db.select().from(situations).where(eq(situations.title, 'Armed conflict'))).toHaveLength(1)
  })
})

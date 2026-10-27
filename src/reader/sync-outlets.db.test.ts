import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client'
import { outlets } from '../db/schema'
import { assertThrowawayUrl, testDatabaseUrl } from '../db/throwaway'
import { syncOutlets } from './sync-outlets'

assertThrowawayUrl(testDatabaseUrl())
const { db, pool } = createDb(testDatabaseUrl())
afterAll(() => pool.end())
beforeEach(async () => {
  await db.execute(sql`truncate outlets cascade`)
})

describe('syncOutlets', () => {
  it('inserts 33 rows, and a second sync keeps 33', async () => {
    await syncOutlets(db)
    expect(await db.$count(outlets)).toBe(33)
    await syncOutlets(db)
    expect(await db.$count(outlets)).toBe(33)
    const [bbc] = await db.select().from(outlets).where(eq(outlets.id, 'bbc'))
    expect(bbc.hosts).toEqual(['bbc.co.uk', 'bbc.com', 'bbci.co.uk'])
  })

  it('marks a stray row inactive and never deletes it', async () => {
    await db.insert(outlets).values({
      id: 'stray', name: 'S', url: 'https://stray.test', region: 'r', ownerType: 'private', language: 'en', format: 'rss',
    })
    await syncOutlets(db)
    const [stray] = await db.select().from(outlets).where(eq(outlets.id, 'stray'))
    expect(stray.active).toBe(false)
    expect(await db.$count(outlets)).toBe(34)
  })
})

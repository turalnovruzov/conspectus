import { eq, isNull } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { situationEvents, situationVersions, situations } from '../../db/schema'
import { decision, newContext, readItem, resetTables, throwawayDb } from '../test-helpers'
import { cluster } from './cluster'
import { consolidate } from './consolidate'

const { db, pool } = throwawayDb()
afterAll(() => pool.end())
beforeEach(() => resetTables(db))

const now = new Date('2026-10-26T12:00:00Z')

async function twoAlike() {
  const ctx = await newContext(db, now)
  await readItem(db, { headline: 'Floods in the Example delta displace thousands' })
  await readItem(db, { headline: 'Floods in the Example delta displace thousands more' })
  ctx.llm.script('judge', { decisions: [
    decision('I1', { action: 'new_situation', eventTitle: 'a', newSituation: { title: 'Delta floods', oneLine: 'x', scope: 'ongoing' } }),
    decision('I2', { action: 'new_situation', eventTitle: 'b', newSituation: { title: 'Example floods', oneLine: 'x', scope: 'ongoing' } }),
  ] })
  await cluster(ctx)
  return db.select().from(situations).orderBy(situations.title)
}

describe('consolidate', () => {
  it('merges two near-identical situations: loser has merged_into_id, keeper has both events, both versioned', async () => {
    const [delta, example] = await twoAlike()
    const ctx = await newContext(db, now)
    ctx.llm.script('consolidate', (req: { user: string }) => ({
      pairs: [{ pair: 'P1', same: true, keep: req.user.indexOf('Delta floods') < req.user.indexOf('Example floods') ? 'A' : 'B', title: null }],
    }))
    expect(await consolidate(ctx)).toEqual({ ran: true, merged: 1 })
    const [loser] = await db.select().from(situations).where(eq(situations.id, example.id))
    expect(loser.mergedIntoId).toBe(delta.id)
    expect(await db.select().from(situationEvents).where(eq(situationEvents.situationId, delta.id))).toHaveLength(2)
    for (const id of [delta.id, example.id]) {
      const versions = await db.select().from(situationVersions).where(eq(situationVersions.situationId, id)).orderBy(situationVersions.version)
      expect(versions.at(-1)!.changedBy).toBe('consolidate')
    }
    expect(await db.select().from(situations).where(isNull(situations.mergedIntoId))).toHaveLength(1)
  })

  it('does not run twice within 20 hours', async () => {
    await twoAlike()
    const first = await newContext(db, now)
    first.llm.script('consolidate', { pairs: [{ pair: 'P1', same: false, keep: 'A', title: null }] })
    expect((await consolidate(first)).ran).toBe(true)
    const second = await newContext(db, new Date(now.getTime() + 19 * 3_600_000))
    expect((await consolidate(second)).ran).toBe(false)
    expect(second.llm.callsFor('consolidate')).toHaveLength(0)
    const third = await newContext(db, new Date(now.getTime() + 21 * 3_600_000))
    third.llm.script('consolidate', { pairs: [] })
    expect((await consolidate(third)).ran).toBe(true)
  })
})

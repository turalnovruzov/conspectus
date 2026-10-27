import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { decision, newContext, readItem, resetTables, throwawayDb } from '../test-helpers'
import { cluster } from './cluster'
import { lifecycle } from './lifecycle'
import { summarize } from './summarize'

const { db, pool } = throwawayDb()
afterAll(() => pool.end())
beforeEach(() => resetTables(db))

async function versionCounts(): Promise<{ situation: number; event: number }> {
  const res = await db.execute<{ s: number; e: number }>(
    sql`select (select count(*)::int from situation_versions) as s, (select count(*)::int from event_versions) as e`,
  )
  return { situation: res.rows[0].s, event: res.rows[0].e }
}

describe('versions', () => {
  it('only grow across two runs', async () => {
    const summary = { situations: [{ situation: 'S1', title: 'War', oneLine: 'o', summary: 's', scope: 'ongoing', major: false, category: { pick: null, new: null }, events: [] }] }
    const first = await newContext(db, new Date('2026-10-25T12:00:00Z'))
    await readItem(db, { headline: 'Shelling in Exampleville', publishedAt: new Date('2026-10-25T08:00:00Z') })
    first.llm.script('judge', { decisions: [decision('I1', { action: 'new_situation', eventTitle: 'e', newSituation: { title: 'War', oneLine: 'x', scope: 'ongoing' } })] })
    first.llm.script('summarize', summary)
    await cluster(first)
    await summarize(first)
    await lifecycle(first)
    const afterFirst = await versionCounts()
    const second = await newContext(db, new Date('2026-11-12T12:00:00Z'))
    await readItem(db, { headline: 'More shelling in Exampleville', publishedAt: new Date('2026-11-12T08:00:00Z') })
    second.llm.script('judge', { decisions: [decision('I1', { action: 'attach_event', event: 'E1' })] })
    second.llm.script('summarize', summary)
    await cluster(second)
    await summarize(second)
    await lifecycle(second)
    const afterSecond = await versionCounts()
    expect(afterFirst.situation).toBeGreaterThan(0)
    expect(afterSecond.situation).toBeGreaterThan(afterFirst.situation)
    expect(afterSecond.event).toBeGreaterThanOrEqual(afterFirst.event)
  })
})

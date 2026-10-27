import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { situationVersions, situations } from '../../db/schema'
import { decision, newContext, readItem, resetTables, throwawayDb } from '../test-helpers'
import { cluster } from './cluster'
import { lifecycle } from './lifecycle'

const { db, pool } = throwawayDb()
afterAll(() => pool.end())
beforeEach(() => resetTables(db))

const start = new Date('2026-08-01T12:00:00Z')
const day = (n: number) => new Date(start.getTime() + n * 86_400_000)

async function situationAt(fields: Partial<typeof situations.$inferInsert> = {}) {
  const ctx = await newContext(db, start)
  const item = await readItem(db, { headline: 'Shelling', publishedAt: start })
  ctx.llm.script('judge', { decisions: [decision('I1', { action: 'new_situation', eventTitle: 'e', newSituation: { title: 'War', oneLine: 'x', scope: 'ongoing' } })] })
  await cluster(ctx)
  const [s] = await db.select().from(situations)
  if (Object.keys(fields).length > 0) await db.update(situations).set(fields).where(eq(situations.id, s.id))
  return { s, item }
}

async function runAt(n: number) {
  const ctx = await newContext(db, day(n))
  await lifecycle(ctx)
  const [s] = await db.select().from(situations)
  const versions = await db.select().from(situationVersions).where(eq(situationVersions.situationId, s.id)).orderBy(situationVersions.version)
  return { s, versions }
}

describe('lifecycle', () => {
  it('moves 15 days of silence to quiet, citing the latest item, with phase_since set', async () => {
    const { item } = await situationAt()
    const { s, versions } = await runAt(15)
    expect(s).toMatchObject({ phase: 'quiet', phaseSince: day(15) })
    expect(versions.at(-1)).toMatchObject({ changedBy: 'lifecycle', causeItemId: item.id, causeNote: 'no events since 2026-08-01' })
  })

  it('leaves 13 days alone', async () => {
    await situationAt()
    const { s, versions } = await runAt(13)
    expect(s.phase).toBe('active')
    expect(versions).toHaveLength(1)
  })

  it('ends a situation after a resolution and 31 calm days', async () => {
    await situationAt({ phase: 'easing', resolutionSignalAt: start })
    const { s } = await runAt(31)
    expect(s).toMatchObject({ phase: 'ended', endedOn: '2026-09-01' })
  })

  it('keeps resolution + 29 calm days at quiet, not ended', async () => {
    await situationAt({ phase: 'easing', resolutionSignalAt: start })
    expect((await runAt(29)).s.phase).toBe('quiet')
  })

  it('takes 61 silent days from active straight to ended, one version not two', async () => {
    await situationAt()
    const { s, versions } = await runAt(61)
    expect(s.phase).toBe('ended')
    expect(versions).toHaveLength(2)
    expect(versions[1]).toMatchObject({ changedBy: 'lifecycle', causeItemId: expect.any(String), causeNote: expect.stringContaining('no events since') })
  })
})

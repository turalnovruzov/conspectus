import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { categories, eventVersions, events, situationVersions, situations } from '../../db/schema'
import { hashVector } from '../fake-llm'
import { decision, newContext, readItem, resetTables, throwawayDb } from '../test-helpers'
import { cluster } from './cluster'
import { summarize } from './summarize'

const { db, pool } = throwawayDb()
afterAll(() => pool.end())
beforeEach(() => resetTables(db))

const now = new Date('2026-10-26T12:00:00Z')
const summary = (fields: Record<string, unknown>) => ({
  situations: [{
    situation: 'S1', title: 'Example war', oneLine: 'Fighting goes on.', summary: 'A long story.', scope: 'ongoing', major: true,
    category: { pick: null, new: null }, events: [], ...fields,
  }],
})

async function touched() {
  const ctx = await newContext(db, now)
  await readItem(db, { headline: 'Shelling in Exampleville' })
  ctx.llm.script('judge', { decisions: [decision('I1', {
    action: 'new_situation', eventTitle: 'Shelling', newSituation: { title: 'War', oneLine: 'x', scope: 'ongoing' },
  })] })
  await cluster(ctx)
  return ctx
}

describe('summarize', () => {
  it('creates a new category only after the prompt listed the existing ones', async () => {
    await db.insert(categories).values({ name: 'Armed conflict', definition: 'Organised fighting.', embedding: hashVector('Armed conflict'), embeddingModel: 'fake/embed' })
    const ctx = await touched()
    ctx.llm.script('summarize', summary({ category: { pick: null, new: { name: 'Border war', definition: 'Fighting over a border.', parent: 'C1' } } }))
    await summarize(ctx)
    const prompt = ctx.llm.callsFor('summarize')[0].user
    expect(prompt).toMatch(/^C1 · Armed conflict — Organised fighting\.$/m)
    const rows = await db.select().from(categories)
    const created = rows.find((c) => c.name === 'Border war')!
    expect(created.parentId).toBe(rows.find((c) => c.name === 'Armed conflict')!.id)
    expect(created.embeddingModel).toBe('fake/embed')
    const [s] = await db.select().from(situations)
    expect(s.categoryId).toBe(created.id)
  })

  it('stores one_line, scope and major, re-embeds, and writes a version', async () => {
    const ctx = await touched()
    ctx.llm.script('summarize', summary({ scope: 'one_off' }))
    const [before] = await db.select().from(situations)
    await summarize(ctx)
    const [s] = await db.select().from(situations)
    expect(s).toMatchObject({ title: 'Example war', oneLine: 'Fighting goes on.', summary: 'A long story.', scope: 'one_off', major: true })
    expect(s.embedding).not.toEqual(before.embedding)
    const versions = await db.select().from(situationVersions).where(eq(situationVersions.situationId, s.id)).orderBy(situationVersions.version)
    expect(versions.at(-1)).toMatchObject({ changedBy: 'summarize', causeItemId: expect.any(String) })
  })

  it('a renamed event gets an event_versions row and its old title stays readable', async () => {
    const ctx = await touched()
    ctx.llm.script('summarize', summary({ events: [{ handle: 'E1', title: 'Shelling kills four in Exampleville' }] }))
    await summarize(ctx)
    const [e] = await db.select().from(events)
    expect(e.title).toBe('Shelling kills four in Exampleville')
    const versions = await db.select().from(eventVersions).where(eq(eventVersions.eventId, e.id)).orderBy(eventVersions.version)
    expect(versions.map((v) => (v.snapshot as { title: string }).title)).toEqual(['Shelling', 'Shelling kills four in Exampleville'])
  })
})

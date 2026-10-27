import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { categories, eventVersions, events, partOfLinks, situationVersions, situations, sourceItems, themes } from '../../db/schema'
import { hashVector } from '../fake-llm'
import { FakeLlm } from '../fake-llm'
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
    category: { action: 'pick', handle: null, name: null, definition: null, parent: null }, events: [], partOf: [], ...fields,
  }],
})

async function touched(at = now, headline = 'Shelling in Exampleville', title = 'War') {
  const ctx = await newContext(db, at)
  await readItem(db, { headline, publishedAt: new Date(at.getTime() - 3_600_000) })
  ctx.llm.script('judge', { decisions: [decision('I1', {
    action: 'new_situation', eventTitle: 'Shelling', newSituation: { title, oneLine: 'x', scope: 'ongoing' },
  })] })
  await cluster(ctx)
  return ctx
}

async function larger(title: string) {
  const [s] = await db
    .insert(situations)
    .values({ title, oneLine: 'A wide war across Exampleland.', embedding: hashVector('Shelling in Exampleville Exampleland war'), embeddingModel: 'fake/embed', summarizedAt: now })
    .returning()
  return s
}

describe('summarize', () => {
  it('creates a new category only after the prompt listed the existing ones', async () => {
    await db.insert(categories).values({ name: 'Armed conflict', definition: 'Organised fighting.', embedding: hashVector('Armed conflict'), embeddingModel: 'fake/embed' })
    const ctx = await touched()
    ctx.llm.script('summarize', summary({ category: { action: 'new', handle: null, name: 'Border war', definition: 'Fighting over a border.', parent: 'C1' } }))
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

  it('picks a listed category by its handle', async () => {
    await db.insert(categories).values({ name: 'Armed conflict', definition: 'Organised fighting.', embedding: hashVector('Armed conflict'), embeddingModel: 'fake/embed' })
    const ctx = await touched()
    ctx.llm.script('summarize', summary({ category: { action: 'pick', handle: 'C1', name: null, definition: null, parent: null } }))
    await summarize(ctx)
    const [s] = await db.select().from(situations)
    const [c] = await db.select().from(categories)
    expect(s.categoryId).toBe(c.id)
    expect(await db.$count(categories)).toBe(1)
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

  it('links a situation to a nearby larger situation, citing the item and the run', async () => {
    const parent = await larger('Exampleland war')
    const ctx = await touched()
    ctx.llm.script('summarize', summary({ partOf: [{ action: 'situation', handle: 'P1', name: null, definition: null }] }))
    await summarize(ctx)
    expect(ctx.llm.callsFor('summarize')[0].user).toMatch(/^P1 · Exampleland war — A wide war across Exampleland\.$/m)
    const [item] = await db.select().from(sourceItems)
    const links = await db.select().from(partOfLinks)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ parentSituationId: parent.id, themeId: null, causeItemId: item.id, runId: ctx.runId })
    expect(links[0].situationId).not.toBe(parent.id)
  })

  it('creates a new theme only after the prompt listed the nearest existing ones, embeds it and links it', async () => {
    await db.insert(themes).values({ name: 'Climate change', definition: 'Warming and its effects.', embedding: hashVector('Climate change'), embeddingModel: 'fake/embed' })
    const ctx = await touched()
    ctx.llm.script('summarize', summary({ partOf: [{ action: 'new_theme', handle: null, name: 'Migration', definition: 'People moving across borders.' }] }))
    await summarize(ctx)
    expect(ctx.llm.callsFor('summarize')[0].user).toMatch(/^T1 · Climate change — Warming and its effects\.$/m)
    const created = (await db.select().from(themes)).find((t) => t.name === 'Migration')!
    expect(created).toMatchObject({ definition: 'People moving across borders.', embeddingModel: 'fake/embed' })
    const [s] = await db.select().from(situations)
    const [link] = await db.select().from(partOfLinks)
    expect(link).toMatchObject({ situationId: s.id, themeId: created.id, parentSituationId: null, runId: ctx.runId, causeItemId: expect.any(String) })
  })

  it('keeps a link once: proposed again it adds no row and replaces nothing', async () => {
    await db.insert(themes).values({ name: 'Climate change', definition: 'Warming and its effects.', embedding: hashVector('Climate change'), embeddingModel: 'fake/embed' })
    const ctx = await touched()
    const pick = summary({ partOf: [{ action: 'theme', handle: 'T1', name: null, definition: null }] })
    ctx.llm.script('summarize', pick)
    await summarize(ctx)
    const [first] = await db.select().from(partOfLinks)
    const later = new Date('2026-10-27T12:00:00Z')
    const next = await newContext(db, later)
    await readItem(db, { headline: 'Shelling resumes in Exampleville', publishedAt: later })
    next.llm.script('judge', { decisions: [decision('I1', { action: 'attach_event', event: 'E1' })] })
    await cluster(next)
    next.llm.script('summarize', pick)
    await summarize(next)
    expect(next.llm.callsFor('summarize')[0].user).toContain('Shelling resumes in Exampleville')
    const [resummarized] = await db.select().from(situations).where(eq(situations.id, first.situationId))
    expect(resummarized.summarizedAt).toEqual(later)
    const links = await db.select().from(partOfLinks).where(eq(partOfLinks.situationId, first.situationId))
    expect(links).toEqual([first])
    expect(await db.$count(themes)).toBe(1)
  })

  it('drops a self-link, a reverse of an existing link and an unknown handle', async () => {
    const parent = await larger('Exampleland war')
    const ctx = await touched()
    const [own] = await db.select().from(situations).where(eq(situations.title, 'War'))
    await db.insert(partOfLinks).values({ situationId: parent.id, parentSituationId: own.id })
    ctx.llm.script('summarize', summary({ partOf: [
      { action: 'situation', handle: 'S1', name: null, definition: null },
      { action: 'situation', handle: 'P1', name: null, definition: null },
      { action: 'theme', handle: 'T9', name: null, definition: null },
      { action: 'situation', handle: 'S7', name: null, definition: null },
    ] }))
    await summarize(ctx)
    expect(await db.$count(partOfLinks)).toBe(1)
  })

  it('summarizes first, on the next run, a situation a stopped run left unsummarized, with the items it got then', async () => {
    const stopped = await touched(now, 'Shelling in Exampleville', 'Left over')
    const [left] = await db.select().from(situations).where(eq(situations.title, 'Left over'))
    expect(left.summarizedAt).toBeNull()
    const later = new Date('2026-10-27T12:00:00Z')
    const next = await touched(later, 'Floods in Otherland', 'Floods')
    expect(next.notes.touched.has(left.id)).toBe(false)
    next.llm.script('summarize', { situations: ['S1', 'S2'].map((h) => ({ ...summary({}).situations[0], situation: h })) })
    await summarize(next)
    const prompt = next.llm.callsFor('summarize')[0].user
    expect(prompt).toMatch(/^S1 · title: Left over · /m)
    expect(prompt).toMatch(/^S2 · title: Floods · /m)
    expect(prompt).toContain('Shelling in Exampleville')
    const [after] = await db.select().from(situations).where(eq(situations.id, left.id))
    expect(after.summarizedAt).toEqual(later)
    expect(stopped.llm.callsFor('summarize')).toHaveLength(0)
  })

  it('does not summarize again a situation with nothing new since its summary', async () => {
    const ctx = await touched()
    ctx.llm.script('summarize', summary({}))
    await summarize(ctx)
    const next = await newContext(db, new Date('2026-10-27T12:00:00Z'))
    expect(await summarize(next)).toBe(0)
    expect(next.llm.callsFor('summarize')).toHaveLength(0)
  })

  it('runs batches concurrently and applies them one at a time, so two proposing the same new category make one', async () => {
    for (let i = 0; i < 10; i++) {
      await db.insert(situations).values({ title: `Story ${i}`, embedding: hashVector(`story ${i}`), embeddingModel: 'fake/embed' })
    }
    const ctx = await newContext(db, now, new FakeLlm({ delayMs: 20 }))
    for (const s of await db.select().from(situations)) ctx.notes.touched.add(s.id)
    ctx.llm.fallback('summarize', (req: { user: string }) => ({
      situations: [...req.user.matchAll(/^(S\d+) · title: (.*?) ·/gm)].map(([, h, title]) => ({
        ...summary({}).situations[0], situation: h, title,
        category: { action: 'new', handle: null, name: 'Border war', definition: 'Fighting over a border.', parent: null },
      })),
    }))
    expect(await summarize(ctx)).toBe(10)
    expect(ctx.llm.maxInFlight).toBe(2)
    expect(await db.$count(categories)).toBe(1)
    const rows = await db.select().from(situations)
    expect(new Set(rows.map((r) => r.categoryId)).size).toBe(1)
  })
})

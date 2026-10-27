import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runs, sourceItems } from '../db/schema'
import { newNotes } from './context'
import { buildReport, registrableDomain } from './report'
import { resetTables, throwawayDb } from './test-helpers'

const { db, pool } = throwawayDb()
afterAll(() => pool.end())
beforeEach(() => resetTables(db))

describe('buildReport', () => {
  it('has every field, numeric where it should be, and a duplicate rate of 1/4 for one merge among four kept', async () => {
    const [run] = await db.insert(runs).values({ kind: 'live', ceilingUsd: '1', keyBefore: { usage: 1.5 }, keyAfter: { usage: 1.75 } }).returning()
    await db.insert(sourceItems).values([
      { outletId: 'wikipedia', url: 'https://example-wire.test/a', headline: 'a', citedUrl: 'https://www.example-wire.test/a', firstRunId: run.id },
      { outletId: 'wikipedia', url: 'https://www.bbc.com/b', headline: 'b', citedUrl: 'https://www.bbc.com/b', firstRunId: run.id },
      { outletId: 'bbc', url: 'https://www.bbc.com/c', headline: 'c', state: 'skipped', skipReason: 'sport', firstRunId: run.id },
    ])
    const notes = newNotes()
    for (const id of ['a', 'b', 'c', 'd', 'e']) notes.touched.add(id)
    notes.merged.add('e')
    const report = await buildReport(db, run.id, notes)
    expect(report.duplicateRate).toBe(0.25)
    for (const key of ['unsure', 'situationsOpened', 'situationsEnded', 'mergedThisRun', 'duplicateRate', 'oneOffShare', 'categoriesPer100', 'onMap', 'llmFailures'] as const) {
      expect(typeof report[key], key).toBe('number')
    }
    expect(report.skipped).toEqual({ sport: 1 })
    expect(report.spend).toEqual({ run: 0, keyBefore: 1.5, keyAfter: 1.75 })
    expect(report.suggestedOutlets).toEqual([{ domain: 'example-wire.test', count: 1 }])
  })

  it('reduces hosts to their registrable domain', () => {
    expect(registrableDomain('www.reuters.com')).toBe('reuters.com')
    expect(registrableDomain('news.example.co.uk')).toBe('example.co.uk')
  })
})

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { countryName } from '../world'
import { createDb } from './client'
import { seedLiveFixture } from './live-fixture'
import { loadLiveView } from './live-view'
import { assertThrowawayUrl, resetDatabase, testDatabaseUrl } from './throwaway'

const url = testDatabaseUrl()
assertThrowawayUrl(url)
const { db, pool } = createDb(url)
afterAll(() => pool.end())
beforeEach(async () => {
  await resetDatabase(url)
  await seedLiveFixture(db)
})

const alpha = async () => (await loadLiveView(db)).situations.find((s) => s.title === 'Fixture border clash alpha')!

describe('seedLiveFixture', () => {
  it('counts seven active outlets', async () => {
    expect((await loadLiveView(db)).outletCount).toBe(7)
  })

  it('dates the view by the last finished run', async () => {
    expect((await loadLiveView(db)).updatedAt).toEqual(new Date('2026-10-27T06:05:00Z'))
  })

  it('puts exactly Alpha, Beta and Gamma on the map', async () => {
    const onMap = (await loadLiveView(db)).situations.filter((s) => s.onMap).map((s) => s.title)
    expect(onMap.sort()).toEqual(['Fixture border clash alpha', 'Fixture protests beta', 'Fixture standoff gamma'])
  })

  it('gives Alpha its source counts', async () => {
    expect(await alpha()).toMatchObject({ outletCount: 5, regionCount: 5, independentCount: 4, stateRunCount: 1 })
  })

  it('keeps the stepped-out country on Alpha with its leaving day', async () => {
    const left = (await alpha()).involved.find((i) => i.countryKey === '762')
    expect(left?.leftOn).toBe('2026-10-20')
  })

  it('gives Alpha its category path', async () => {
    expect((await alpha()).categoryPath).toEqual(['Armed conflict', 'Border clash'])
  })

  it('keeps an HTML outlet item undated and last, never dated by its fetch time', async () => {
    const beta = (await loadLiveView(db)).situations.find((s) => s.title === 'Fixture protests beta')!
    const ledger = beta.sources.find((src) => src.outletId === 'fx-ledger')!
    expect(ledger.format).toBe('html')
    expect(ledger.publishedAt).toBeNull()
    expect(beta.sources.at(-1)).toBe(ledger)
    expect(beta.sources.slice(0, -1).every((src) => src.publishedAt !== null)).toBe(true)
  })

  it('refuses a second seed', async () => {
    await expect(seedLiveFixture(db)).rejects.toThrow(/already/)
  })

  it('uses only countries the map knows', async () => {
    for (const s of (await loadLiveView(db)).situations) {
      for (const i of s.involved) expect(countryName(i.countryKey), i.countryKey).not.toBe(i.countryKey)
    }
  })

  it('links only to example hosts or Wikipedia', async () => {
    for (const s of (await loadLiveView(db)).situations) {
      for (const src of s.sources) {
        const host = new URL(src.url).hostname
        expect(host.endsWith('.example') || host === 'en.wikipedia.org', src.url).toBe(true)
      }
    }
  })
})

import { describe, expect, it } from 'vitest'
import sample from './data/sample-situations.json'
import { countries, countryName } from './world'

describe('world', () => {
  const keys = new Set(countries.map((c) => c.key))

  it('has every sample country on the map', () => {
    for (const s of sample.situations) {
      for (const inv of s.involved) expect(keys.has(inv.country)).toBe(true)
    }
  })

  it('has 177 countries with distinct keys, including the three without ids', () => {
    expect(countries).toHaveLength(177)
    expect(keys.size).toBe(177)
    for (const k of ['N. Cyprus', 'Somaliland', 'Kosovo']) expect(keys.has(k)).toBe(true)
  })

  it('has a non-empty path for every country', () => {
    for (const c of countries) expect(c.d.length).toBeGreaterThan(0)
  })

  it('names countries by key', () => {
    expect(countryName('792')).toBe('Turkey')
    expect(countryName('076')).toBe('Brazil')
  })
})

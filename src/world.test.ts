import { describe, expect, it } from 'vitest'
import { countries, countryName } from './world'

describe('world', () => {
  const keys = new Set(countries.map((c) => c.key))

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

import { describe, expect, it } from 'vitest'
import { countries } from '../world'
import { MAP_COUNTRIES, MAP_COUNTRY_NAMES, matchCountry } from './countries'

describe('countries', () => {
  it('has the same key set as the map', () => {
    expect(new Set(MAP_COUNTRIES.map((c) => c.key))).toEqual(new Set(countries.map((c) => c.key)))
  })

  it.each([
    ['United States', '840'], ['USA', '840'], ['US', '840'],
    ['Democratic Republic of the Congo', '180'], ['DR Congo', '180'], ['Republic of the Congo', '178'],
    ['Bosnia and Herzegovina', '070'], ['North Macedonia', '807'], ['Czech Republic', '203'],
    ['Ivory Coast', '384'], ['South Sudan', '728'], ['Central African Republic', '140'],
    ['Gaza', '275'], ['West Bank', '275'], ['Palestinian territories', '275'],
    ['UK', '826'], ['Britain', '826'], ['Eswatini', '748'], ['Turkiye', '792'], ['Türkiye', '792'],
    ['Kosovo', 'Kosovo'], ['Côte d\'Ivoire', '384'], ['france', '250'], ['the Netherlands', '528'], ['The Gambia', '270'],
  ])('resolves %s to %s', (name, key) => {
    expect(matchCountry(name)).toEqual({ key })
  })

  it.each(['Hong Kong', 'European Union', 'Atlantis', ''])('leaves %s unmatched', (name) => {
    expect(matchCountry(name)).toBeNull()
  })

  it('offers the prompts the map names', () => {
    expect(MAP_COUNTRY_NAMES).toContain('Dem. Rep. Congo')
    expect(MAP_COUNTRY_NAMES).not.toContain('Antarctica')
  })
})

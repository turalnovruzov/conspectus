import { describe, expect, it } from 'vitest'
import sample from './data/sample-situations.json'
import { countryName } from './world'
import {
  PALETTE,
  countryFills,
  involvementLines,
  parseSituations,
  situationsForCountry,
} from './situations'

const list = parseSituations(sample)
const byId = (id: string) => list.find((s) => s.id === id)!

describe('parseSituations', () => {
  it('reads the sample: three situations in order with palette colours', () => {
    expect(list.map((s) => s.kind)).toEqual(['Armed conflict', 'Mass protests', 'Diplomatic crisis'])
    expect(list.map((s) => s.color)).toEqual(['#f97316', '#38bdf8', '#e879f9'])
  })

  it('accepts an arbitrary kind and an arbitrary role', () => {
    const [s] = parseSituations({
      situations: [
        { id: 'x', kind: 'Something nobody has seen', involved: [{ country: '398', role: 'mediator' }] },
      ],
    })
    expect(s.kind).toBe('Something nobody has seen')
    expect(s.involved[0].role).toBe('mediator')
  })

  it('throws on a missing kind', () => {
    expect(() => parseSituations({ situations: [{ id: 'x', involved: [] }] })).toThrow(/kind/)
  })

  it('throws on an empty country', () => {
    expect(() =>
      parseSituations({ situations: [{ id: 'x', kind: 'k', involved: [{ country: '', role: 'party' }] }] }),
    ).toThrow(/country/)
  })

  it('throws on a duplicate id', () => {
    const one = { id: 'x', kind: 'k', involved: [] }
    expect(() => parseSituations({ situations: [one, one] })).toThrow(/duplicate/)
  })

  it('cycles the palette: the 7th situation gets the first colour again', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, kind: 'k', involved: [] }))
    expect(parseSituations({ situations: many })[6].color).toBe(PALETTE[0])
  })
})

describe('involvementLines', () => {
  it('lists parties first, then other roles', () => {
    expect(involvementLines(byId('armed-conflict-1'), countryName)).toEqual([
      'Kazakhstan, Uzbekistan',
      'Supporting: Turkey',
    ])
    expect(involvementLines(byId('mass-protests-1'), countryName)).toEqual(['Brazil'])
    expect(involvementLines(byId('diplomatic-crisis-1'), countryName)).toEqual(['Canada, Australia'])
  })
})

describe('situationsForCountry', () => {
  it('finds the situations a country is in', () => {
    expect(situationsForCountry(list, '398').map((s) => s.id)).toEqual(['armed-conflict-1'])
    expect(situationsForCountry(list, '276')).toEqual([])
  })
})

describe('countryFills', () => {
  it('with no selection colours every situation country', () => {
    const fills = countryFills(list, null)
    expect(fills.size).toBe(6)
    expect(fills.get('076')?.color).toBe('#38bdf8')
  })

  it('with a selection colours only that situation', () => {
    expect([...countryFills(list, 'mass-protests-1').keys()]).toEqual(['076'])
  })
})

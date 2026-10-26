import { describe, expect, it } from 'vitest'
import sample from './data/sample-situations.json'
import { countryName } from './world'
import {
  countryFills,
  involvementLines,
  involvementState,
  parseSituations,
  situationsForCountry,
} from './situations'

const list = parseSituations(sample)
const byId = (id: string) => list.find((s) => s.id === id)!

describe('parseSituations', () => {
  it('reads the sample: three situations in order', () => {
    expect(list.map((s) => s.kind)).toEqual(['Armed conflict', 'Mass protests', 'Diplomatic crisis'])
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

describe('involvementState', () => {
  it('maps party to pulled-in and every other role to joined', () => {
    expect(involvementState('party')).toBe('pulled-in')
    expect(involvementState('supporting')).toBe('joined')
    expect(involvementState('mediator')).toBe('joined')
  })
})

describe('countryFills', () => {
  it('with no selection fills every situation country with its involvement', () => {
    const fills = countryFills(list, null)
    expect(fills.size).toBe(6)
    expect(fills.get('076')).toEqual({ role: 'party', involvement: 'pulled-in' })
    expect(fills.get('792')).toEqual({ role: 'supporting', involvement: 'joined' })
  })

  it('with a selection fills only that situation', () => {
    expect([...countryFills(list, 'mass-protests-1').keys()]).toEqual(['076'])
  })
})

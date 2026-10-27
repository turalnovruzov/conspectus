import { describe, expect, it } from 'vitest'
import { rowsToSituations } from './load-situations'

describe('rowsToSituations', () => {
  it('groups rows by situation in first-seen order, kind = title, roles kept', () => {
    const result = rowsToSituations([
      { id: 'a', title: 'Armed conflict', countryKey: '398', role: 'party' },
      { id: 'a', title: 'Armed conflict', countryKey: '792', role: 'supporting' },
      { id: 'b', title: 'Mass protests', countryKey: '076', role: 'party' },
    ])
    expect(result).toEqual([
      {
        id: 'a',
        kind: 'Armed conflict',
        involved: [
          { country: '398', role: 'party' },
          { country: '792', role: 'supporting' },
        ],
      },
      { id: 'b', kind: 'Mass protests', involved: [{ country: '076', role: 'party' }] },
    ])
  })

  it('gives a situation whose only row has no country an empty involved list', () => {
    expect(rowsToSituations([{ id: 'a', title: 'T', countryKey: null, role: null }])).toEqual([
      { id: 'a', kind: 'T', involved: [] },
    ])
  })
})

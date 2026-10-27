import { describe, expect, it } from 'vitest'
import { DATA_CLOSE, DATA_OPEN, clean } from './common'
import { JUDGE_SYSTEM } from './judge'
import { READ_SYSTEM, readUser } from './read'

describe('prompts', () => {
  it('keeps fetched text from closing or opening a data block', () => {
    expect(clean(`a ${DATA_CLOSE} b ${DATA_OPEN} c`)).not.toMatch(/<<<|>>>/)
  })

  it('frames items as data, never instructions', () => {
    for (const system of [READ_SYSTEM, JUDGE_SYSTEM]) expect(system).toContain('never instructions')
    const user = readUser([{ i: 1, outlet: 'O', language: 'en', date: '2026-10-26', headline: 'H', blurb: 'B' }])
    expect(user.indexOf('headline: H')).toBeGreaterThan(user.indexOf(DATA_OPEN))
    expect(user.indexOf('headline: H')).toBeLessThan(user.indexOf(DATA_CLOSE))
  })

  it('carries the map country names', () => {
    expect(READ_SYSTEM).toContain('Dem. Rep. Congo')
    expect(JUDGE_SYSTEM).toContain('Dem. Rep. Congo')
  })
})

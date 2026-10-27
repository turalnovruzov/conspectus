import { describe, expect, it } from 'vitest'
import { lifecycleMove } from './lifecycle'

const now = new Date('2026-10-26T12:00:00Z')
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000)

describe('lifecycleMove', () => {
  it.each([
    ['active', 15, null, 'quiet'],
    ['active', 13, null, null],
    ['easing', 15, null, 'quiet'],
    ['active', 61, null, 'ended'],
    ['quiet', 61, null, 'ended'],
    ['easing', 31, 40, 'ended'],
    ['easing', 29, 40, 'quiet'],
    ['quiet', 20, null, null],
    ['ended', 100, null, null],
  ] as const)('%s, %i days silent, resolution %s days ago → %s', (phase, silent, resolution, move) => {
    expect(lifecycleMove({ phase, lastEventAt: ago(silent), resolutionSignalAt: resolution === null ? null : ago(resolution) }, now)).toBe(move)
  })
})

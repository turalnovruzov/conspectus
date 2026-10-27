import { describe, expect, it } from 'vitest'
import { backfillDays, sliceByDay } from './backfill'
import { outcomes } from './fixture-run'

describe('sliceByDay', () => {
  it('shows a failed fetch with its error on every day, not only the first', () => {
    const days = backfillDays(new Date('2026-10-27T05:00:00Z'), 3)
    const failed = outcomes(days[0], {}, ['reliefweb']).map((o) => ({ ...o, httpStatus: 406, error: 'http 406' }))
    const sliced = sliceByDay(failed, [], days)
    expect([...sliced.values()].map((day) => day.map((o) => [o.outletId, o.ok, o.error]))).toEqual([
      [['reliefweb', false, 'http 406']], [['reliefweb', false, 'http 406']], [['reliefweb', false, 'http 406']],
    ])
  })
})

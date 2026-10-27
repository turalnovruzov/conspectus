import { describe, expect, it } from 'vitest'
import { mapLimit } from './concurrency'

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('mapLimit', () => {
  it('never runs more than the limit at once and keeps input order', async () => {
    let running = 0
    let most = 0
    const out = await mapLimit([5, 1, 4, 2, 3, 1, 2], 3, async (n) => {
      running++
      most = Math.max(most, running)
      await tick(n)
      running--
      return n * 10
    })
    expect(most).toBe(3)
    expect(out).toEqual([50, 10, 40, 20, 30, 10, 20])
  })

  it('after a throw starts nothing new and rethrows only once the started ones have finished', async () => {
    const started: number[] = []
    const finished: number[] = []
    const run = mapLimit([0, 1, 2, 3, 4, 5], 2, async (n) => {
      started.push(n)
      if (n === 1) throw new Error('stop')
      await tick(20)
      finished.push(n)
    })
    await expect(run).rejects.toThrow('stop')
    expect(started).toEqual([0, 1])
    expect(finished).toEqual([0])
  })

  it('handles an empty list', async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { SpendLedger } from './spend'
import { httpUrl } from './fetch/url'
import { crossStoryAttach, jaccard, maxPerGroup, median, pairAgreement, runCandidates, trialOutcomes } from './trial-score'

describe('trial scores', () => {
  // Labels: a,b,c one story; d,e another. Model: a,b together; c,d together; e alone.
  const items = ['a', 'b', 'c', 'd', 'e']
  const labels = new Map<string, string | null>([['a', 'x'], ['b', 'x'], ['c', 'x'], ['d', 'y'], ['e', 'y']])
  const model = new Map<string, string | null>([['a', 'S1'], ['b', 'S1'], ['c', 'S2'], ['d', 'S2'], ['e', 'S3']])

  it('pair precision, recall and F1 on a hand-made five-item case', () => {
    const s = pairAgreement(items, labels, model)
    // label pairs ab ac bc de (4); model pairs ab cd (2); shared ab (1)
    expect(s).toMatchObject({ labelPairs: 4, modelPairs: 2, sharedPairs: 1, precision: 0.5, recall: 0.25 })
    expect(s.f1).toBeCloseTo(1 / 3, 10)
  })

  it('an item the model left out (null) pairs with nothing', () => {
    const s = pairAgreement(items, labels, new Map([['a', 'S1'], ['b', null], ['c', 'S1'], ['d', null], ['e', null]]))
    expect(s).toMatchObject({ modelPairs: 1, sharedPairs: 1, precision: 1, recall: 0.25 })
  })

  it('jaccard of country sets', () => {
    expect(jaccard(['376', '275'], ['376'])).toBe(0.5)
    expect(jaccard([], [])).toBe(1)
    expect(jaccard(['76'], [])).toBe(0)
    expect(jaccard(['1', '2', '3'], ['2', '3', '4'])).toBe(0.5)
  })

  it('cross-story attach share counts attached items whose story differs from the opener, irrelevant ones included', () => {
    const withNoise = new Map(labels).set('f', null)
    const share = crossStoryAttach(
      [
        { item: 'a', situation: 'S1', opener: 'a' },
        { item: 'b', situation: 'S1', opener: 'a' },
        { item: 'd', situation: 'S1', opener: 'a' },
        { item: 'f', situation: 'S1', opener: 'a' },
        { item: 'e', situation: 'S2', opener: 'e' },
      ],
      withNoise,
    )
    expect(share).toEqual({ attached: 3, crossStory: 2, share: 2 / 3 })
  })

  it('median', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBeNull()
  })

  it('a sixth candidate is not started once the $1.50 parent has under $0.25 of room', async () => {
    const pricing = { m: { prompt: 0.000001, completion: 0.000001 } }
    const parent = new SpendLedger({ ceilingUsd: 1.5, pricing })
    // The embedding comparison runs first and spends $0.05 of the total.
    await parent.record(parent.reserve(0.05), { purpose: 'embed', model: 'm', ok: true, reportedCostUsd: 0.05 })
    const started: string[] = []
    const outcomes = await runCandidates(parent, ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], 0.25, async (model) => {
      started.push(model)
      const child = new SpendLedger({ ceilingUsd: 0.25, pricing, parent })
      await child.record(child.reserve(0.25), { purpose: 'read', model: 'm', ok: true, reportedCostUsd: 0.25 })
      return model
    })
    expect(started).toEqual(['c1', 'c2', 'c3', 'c4', 'c5'])
    expect(parent.roomUsd).toBeLessThan(0.25)
    expect(outcomes[5]).toMatchObject({ model: 'c6', status: 'not_started' })
    expect(outcomes.slice(0, 5).every((o) => o.status === 'done')).toBe(true)
  })

  it('a ceiling escaping a candidate stops the trial', async () => {
    const pricing = { m: { prompt: 0.000001, completion: 0.000001 } }
    const parent = new SpendLedger({ ceilingUsd: 0.5, pricing })
    const outcomes = await runCandidates(parent, ['c1', 'c2'], 0.25, async () => {
      parent.reserve(0.6)
      return 'never'
    })
    expect(outcomes.map((o) => o.status)).toEqual(['stopped', 'not_started'])
  })

  it('replays saved items as one outcome per outlet whose url is that outlet\'s feed url', () => {
    const at = new Date('2026-10-27T00:00:00Z')
    const item = (outletId: string, n: number) => ({ outletId, url: `https://${outletId}.test/${n}`, headline: 'h', blurb: '', publishedAt: at, language: 'en' })
    const out = trialOutcomes([item('bbc', 1), item('dw', 1), item('bbc', 2)], at)
    expect(out.map((o) => [o.outletId, o.items.length, o.httpStatus])).toEqual([['bbc', 2, null], ['dw', 1, null]])
    for (const o of out) expect(httpUrl(o.url), o.url).toBe(o.url)
    expect(() => trialOutcomes([item('nowhere', 1)], at)).toThrow('not on the list')
  })

  it('max per group counts the largest situation and ignores unplaced items', () => {
    expect(maxPerGroup(['S1', 'S2', 'S1', null, null, null])).toBe(2)
    expect(maxPerGroup([null])).toBe(0)
  })
})

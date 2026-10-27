import { describe, expect, it, vi } from 'vitest'
import { RunRefusedError, effectiveCeiling, fetchPricing, readKey } from './openrouter-key'

describe('readKey', () => {
  it('returns the data without its label', async () => {
    const fetchFn = vi.fn(async () => Response.json({ data: { label: 'sk-or-v1-abc...xyz', usage: 1.25, limit: 10, limit_remaining: 8.75 } }))
    expect(await readKey('sk-test', fetchFn)).toEqual({ usage: 1.25, limit: 10, limit_remaining: 8.75 })
  })

  it('refuses the run when the read fails', async () => {
    await expect(readKey('sk-test', vi.fn(async () => new Response('no', { status: 401 })))).rejects.toThrow(RunRefusedError)
    await expect(
      readKey('sk-test', vi.fn(async () => {
        throw new Error('offline sk-test')
      })),
    ).rejects.toThrow(/^(?!.*sk-test).*$/)
  })
})

describe('effectiveCeiling', () => {
  it('caps at limit_remaining − 0.50', () => {
    expect(effectiveCeiling(0.75, { limit_remaining: 1 })).toBe(0.5)
    expect(effectiveCeiling(0.75, { limit_remaining: 9 })).toBe(0.75)
  })

  it('refuses when the key has under $0.05 of room past the reserve', () => {
    expect(() => effectiveCeiling(0.75, { limit_remaining: 0.54 })).toThrow(RunRefusedError)
  })

  it('refuses a ceiling over $3 and passes a small one through', () => {
    expect(() => effectiveCeiling(3.01, { limit_remaining: 9 })).toThrow(RunRefusedError)
    expect(effectiveCeiling(0.001, { limit_remaining: 9 })).toBe(0.001)
  })
})

describe('fetchPricing', () => {
  it('merges chat and embedding prices per token', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      Response.json({
        data: url.endsWith('/embeddings/models')
          ? [{ id: 'e/1', pricing: { prompt: '0.00000001', completion: '0' } }]
          : [{ id: 'c/1', pricing: { prompt: '0.0000001', completion: '0.0000004' } }],
      }),
    )
    expect(await fetchPricing(fetchFn)).toEqual({
      'c/1': { prompt: 1e-7, completion: 4e-7 },
      'e/1': { prompt: 1e-8, completion: 0 },
    })
  })
})

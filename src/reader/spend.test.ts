import { describe, expect, it } from 'vitest'
import { SpendCeilingError, SpendLedger } from './spend'

const pricing = { 'm/chat': { prompt: 1e-6, completion: 4e-6 } }

describe('SpendLedger', () => {
  it('refuses a reservation that would pass the ceiling', async () => {
    const ledger = new SpendLedger({ ceilingUsd: 0.75, pricing })
    await ledger.record(ledger.reserve(0.7), { purpose: 'read', model: 'm/chat', ok: true, reportedCostUsd: 0.7 })
    expect(() => ledger.reserve(0.1)).toThrow(SpendCeilingError)
  })

  it('holds a reservation until it is recorded, so two calls together cannot pass the ceiling', async () => {
    const ledger = new SpendLedger({ ceilingUsd: 0.1, pricing })
    const first = ledger.reserve(0.06)
    expect(() => ledger.reserve(0.06)).toThrow(SpendCeilingError)
    await ledger.record(first, { purpose: 'read', model: 'm/chat', ok: true, reportedCostUsd: 0.01 })
    expect(() => ledger.reserve(0.06)).not.toThrow()
  })

  it('refuses a child reservation when its parent has no room', () => {
    const parent = new SpendLedger({ ceilingUsd: 0.05, pricing })
    const child = new SpendLedger({ ceilingUsd: 1, pricing, parent })
    expect(() => child.reserve(0.1)).toThrow(SpendCeilingError)
    expect(child.roomUsd).toBe(1)
  })

  it('counts a child\'s spend in its parent', async () => {
    const parent = new SpendLedger({ ceilingUsd: 1, pricing })
    const child = new SpendLedger({ ceilingUsd: 1, pricing, parent })
    await child.record(child.reserve(0.2), { purpose: 'read', model: 'm/chat', ok: true, reportedCostUsd: 0.05 })
    expect(parent.spentUsd).toBe(0.05)
    expect(parent.roomUsd).toBe(0.95)
  })

  it('refuses a ceiling above $3', () => {
    expect(() => new SpendLedger({ ceilingUsd: 3.01, pricing })).toThrow(SpendCeilingError)
  })

  it('uses the reported cost, else computes it from pricing and marks it so', async () => {
    const ledger = new SpendLedger({ ceilingUsd: 1, pricing })
    const reported = await ledger.record(ledger.reserve(0.01), {
      purpose: 'read', model: 'm/chat', ok: true, promptTokens: 1000, completionTokens: 100, reportedCostUsd: 0.5,
    })
    expect(reported).toMatchObject({ costUsd: 0.5, costSource: 'reported' })
    const computed = await ledger.record(ledger.reserve(0.01), {
      purpose: 'read', model: 'm/chat', ok: true, promptTokens: 1000, completionTokens: 100,
    })
    expect(computed.costSource).toBe('computed')
    expect(computed.costUsd).toBeCloseTo(1000 * 1e-6 + 100 * 4e-6, 12)
  })

  it('releases a failed call\'s reservation', async () => {
    const ledger = new SpendLedger({ ceilingUsd: 0.1, pricing })
    await ledger.record(ledger.reserve(0.09), { purpose: 'read', model: 'm/chat', ok: false, error: 'boom' })
    expect(ledger.roomUsd).toBe(0.1)
  })
})

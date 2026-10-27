import { describe, expect, it } from 'vitest'

describe('test setup', () => {
  it('makes the global fetch throw', () => {
    expect(() => fetch('https://example.test')).toThrow('network in tests')
  })
})

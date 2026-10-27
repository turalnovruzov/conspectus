import { describe, expect, it } from 'vitest'
import { TEST_DATABASE_URL_DEFAULT, assertThrowawayUrl, testDatabaseUrl } from './throwaway'

describe('assertThrowawayUrl', () => {
  it.each([
    'postgres://u:p@127.0.0.1:5517/conspectus',
    'postgres://u:p@127.0.0.1:5516/x_test',
    'postgres://u:p@127.0.0.1:5518/conspectus',
  ])('rejects %s', (url) => {
    expect(() => assertThrowawayUrl(url)).toThrow('not a throwaway')
  })

  it('accepts the default URL', () => {
    expect(() => assertThrowawayUrl(TEST_DATABASE_URL_DEFAULT)).not.toThrow()
  })
})

describe('testDatabaseUrl', () => {
  it('prefers TEST_DATABASE_URL and falls back to the default', () => {
    expect(testDatabaseUrl({ TEST_DATABASE_URL: 'postgres://x/y_test' })).toBe('postgres://x/y_test')
    expect(testDatabaseUrl({})).toBe(TEST_DATABASE_URL_DEFAULT)
  })
})

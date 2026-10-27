import { describe, expect, it } from 'vitest'
import { assertNotForeignDb } from './guard'
import { TEST_DATABASE_URL_DEFAULT } from './throwaway'

describe('assertNotForeignDb', () => {
  it.each(['postgres://u:p@127.0.0.1:5516/x', 'postgres://u:p@db.example.com:5432/x'])('rejects %s', (url) => {
    expect(() => assertNotForeignDb(url)).toThrow('Refusing')
  })

  it.each(['postgres://u:p@127.0.0.1:5517/conspectus', TEST_DATABASE_URL_DEFAULT])('accepts %s', (url) => {
    expect(() => assertNotForeignDb(url)).not.toThrow()
  })
})

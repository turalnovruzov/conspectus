import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { databaseUrl, loadEnv } from './env'

function envFile(content: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'env-test-')), '.env')
  writeFileSync(file, content)
  return file
}

describe('loadEnv', () => {
  it('applies file values when unset', () => {
    const env: NodeJS.Dict<string> = {}
    const file = envFile('DATABASE_URL=postgres://a/b\nOPENROUTER_API_KEY=k\n')
    expect(loadEnv({ file, env })).toEqual({ file, loaded: true })
    expect(env.DATABASE_URL).toBe('postgres://a/b')
    expect(env.OPENROUTER_API_KEY).toBe('k')
  })

  it('never overrides a set variable', () => {
    const env: NodeJS.Dict<string> = { DATABASE_URL: 'x' }
    loadEnv({ file: envFile('DATABASE_URL=postgres://a/b\n'), env })
    expect(env.DATABASE_URL).toBe('x')
  })

  it('treats a missing file as not an error', () => {
    const env: NodeJS.Dict<string> = { KEEP: '1' }
    const result = loadEnv({ file: '/nonexistent/conspectus.env', env })
    expect(result.loaded).toBe(false)
    expect(env).toEqual({ KEEP: '1' })
  })

  it('honours CONSPECTUS_ENV_FILE', () => {
    const file = envFile('FROM_FILE=yes\n')
    const env: NodeJS.Dict<string> = { CONSPECTUS_ENV_FILE: file }
    expect(loadEnv({ env })).toEqual({ file, loaded: true })
    expect(env.FROM_FILE).toBe('yes')
  })
})

describe('databaseUrl', () => {
  it('throws without the variable, and the message holds no value', () => {
    expect(() => databaseUrl({})).toThrow('DATABASE_URL is not set')
  })

  it('returns the variable when set', () => {
    expect(databaseUrl({ DATABASE_URL: 'postgres://a/b' })).toBe('postgres://a/b')
  })
})

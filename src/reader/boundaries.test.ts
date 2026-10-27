import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const list = (dir: string) =>
  readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(dir, f))
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const SELF = 'src/reader/boundaries.test.ts'

describe('reader boundaries', () => {
  it('no reader file imports env.ts or getDb', () => {
    for (const file of list('src/reader').filter((f) => f !== SELF)) {
      const text = read(file)
      expect(text, file).not.toMatch(/from ['"][./]*(\.\.\/)?env(\.ts)?['"]/)
      expect(text, file).not.toMatch(/\bgetDb\b/)
    }
  })

  it('every reader and live-view database test builds its DB on the throwaway URL', () => {
    const helper = read('src/reader/test-helpers.ts')
    expect(helper.indexOf('assertThrowawayUrl(url)')).toBeGreaterThan(-1)
    expect(helper.indexOf('assertThrowawayUrl(url)')).toBeLessThan(helper.indexOf('createDb(url)'))
    expect(helper).toContain('const url = testDatabaseUrl()')
    const files = [...list('src/reader'), ...list('src/db')].filter((f) => f.endsWith('.db.test.ts') && (f.startsWith('src/reader') || f.includes('live-view')))
    expect(files.length).toBeGreaterThan(5)
    for (const file of files) {
      const text = read(file)
      expect(text, file).not.toMatch(/\bgetDb\b/)
      const direct = /assertThrowawayUrl\(testDatabaseUrl\(\)\)[\s\S]*createDb\(testDatabaseUrl\(\)\)/.test(text)
      expect(direct || /throwawayDb\(\)/.test(text), file).toBe(true)
    }
  })

  it('no reader, script or ADR 0005 text says accuracy, except the ADR\'s one sentence', () => {
    for (const file of [...list('src/reader'), ...list('scripts')].filter((f) => f !== SELF)) expect(read(file), file).not.toMatch(/accuracy/i)
    const adrDir = join(root, 'docs/adr')
    for (const name of readdirSync(adrDir).filter((n) => n.startsWith('0005'))) {
      const hits = readFileSync(join(adrDir, name), 'utf8').match(/[^.\n]*accuracy[^.\n]*/gi) ?? []
      expect(hits.length, name).toBeLessThanOrEqual(1)
      for (const h of hits) expect(h).toMatch(/not/i)
    }
  })

  it('scripts/reader.ts guards the database URL before connecting', () => {
    const text = read('scripts/reader.ts')
    expect(text.indexOf('assertNotForeignDb(url)')).toBeGreaterThan(-1)
    expect(text.indexOf('assertNotForeignDb(url)')).toBeLessThan(text.indexOf('createDb(url)'))
    expect(existsSync(join(root, 'scripts/reader.ts'))).toBe(true)
  })
})

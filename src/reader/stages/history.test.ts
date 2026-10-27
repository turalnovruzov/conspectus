import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const readerDir = fileURLToPath(new URL('..', import.meta.url))
const stagesDir = fileURLToPath(new URL('.', import.meta.url))

function sources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.startsWith('fixtures') && !/(^|\/)test-[^/]*\.ts$/.test(f))
    .map((f) => join(dir, f))
}

describe('history is never overwritten', () => {
  it('no stage updates a source item\'s headline, blurb or url', () => {
    for (const file of sources(stagesDir)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/\.update\(sourceItems\)\s*\.set\(([^)]*)\)/g)) {
        expect(m[1], file).not.toMatch(/\b(headline|blurb|url)\b/)
      }
      expect(text, file).not.toMatch(/update\s+source_items\s+set[^;]*\b(headline|blurb|url)\s*=/i)
    }
  })

  it('no reader code deletes from any table', () => {
    for (const file of sources(readerDir)) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/\.delete\(/)
      expect(text, file).not.toMatch(/\bdelete\s+from\b/i)
      expect(text, file).not.toMatch(/\btruncate\b/i)
    }
  })
})

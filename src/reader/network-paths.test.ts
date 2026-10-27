import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('.', import.meta.url))

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'fixtures' ? [] : sources(path)
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
  })
}

describe('network paths', () => {
  it('has no fetch( outside http.ts, llm.ts and openrouter-key.ts', () => {
    const offenders = sources(root)
      .map((p) => relative(root, p))
      .filter((p) => !['http.ts', 'llm.ts', 'openrouter-key.ts'].includes(p))
      .filter((p) => /\bfetch\(/.test(readFileSync(join(root, p), 'utf8')))
    expect(offenders).toEqual([])
  })

  it('lets llm.ts and openrouter-key.ts reach only https://openrouter.ai/api/v1', () => {
    for (const name of ['llm.ts', 'openrouter-key.ts']) {
      const text = readFileSync(join(root, name), 'utf8')
      const urls = text.match(/https?:\/\/[^\s'"`)]+/g) ?? []
      for (const url of urls) expect(url.startsWith('https://openrouter.ai/api/v1') || url === 'https://github.com/turalnovruzov/conspectus', `${name}: ${url}`).toBe(true)
    }
  })
})

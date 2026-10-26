import { describe, expect, it } from 'vitest'
import fontsCss from './fonts.css?raw'
import sources from './fonts/SOURCES.md?raw'
import interOfl from './fonts/inter/OFL.txt?raw'
import jbOfl from './fonts/jetbrains-mono/OFL.txt?raw'

const files = import.meta.glob('./fonts/**/*.woff2', { eager: true, query: '?url', import: 'default' })
const keys = Object.keys(files)
const urls = [...fontsCss.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1])

describe('self-hosted fonts', () => {
  it('guards: something to check', () => {
    expect(keys.length).toBeGreaterThanOrEqual(2)
    expect(urls.length).toBeGreaterThanOrEqual(2)
  })

  it('each font file exists', () => {
    expect(keys).toContain('./fonts/inter/InterVariable.woff2')
    expect(keys).toContain('./fonts/jetbrains-mono/JetBrainsMono-Regular.woff2')
  })

  it('each family ships its OFL', () => {
    for (const text of [interOfl, jbOfl]) {
      expect(text).toMatch(/sil open font license/i)
      expect(text).toMatch(/version 1\.1/i)
    }
  })

  it('every shipped font has a recorded source', () => {
    const hashes = sources.match(/\b[0-9a-f]{64}\b/g) ?? []
    expect(hashes.length).toBeGreaterThanOrEqual(keys.length)
    for (const key of keys) expect(sources).toContain(key.replace('./fonts/', ''))
  })

  it('every font-face url points at a shipped file', () => {
    for (const url of urls) expect(keys).toContain(url)
  })

  it('no remote font source', () => {
    expect(fontsCss).not.toMatch(/https?:|\/\//)
  })

  it('families declared', () => {
    expect(fontsCss).toMatch(/font-family:\s*'Inter'/)
    expect(fontsCss).toMatch(/font-family:\s*'JetBrains Mono'/)
  })
})

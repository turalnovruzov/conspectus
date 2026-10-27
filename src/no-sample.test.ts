import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)

describe('sample data is gone', () => {
  it('has no sample JSON and no seeder', () => {
    for (const f of ['src/data/sample-situations.json', 'src/db/seed-sample.ts', 'scripts/seed-sample.ts']) {
      expect(existsSync(new URL(f, root)), f).toBe(false)
    }
  })

  it('has no db:seed-sample script', () => {
    const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
    expect(pkg.scripts['db:seed-sample']).toBeUndefined()
  })
})

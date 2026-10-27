import { readFileSync } from 'node:fs'
import { createDb } from '../src/db/client.ts'
import { seedSample } from '../src/db/seed-sample.ts'
import { databaseUrl, loadEnv } from '../src/env.ts'

loadEnv()
const raw = JSON.parse(readFileSync(new URL('../src/data/sample-situations.json', import.meta.url), 'utf8'))
const { db, pool } = createDb(databaseUrl())
try {
  console.log(`inserted: ${(await seedSample(db, raw)).inserted}`)
} finally {
  await pool.end()
}

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { createDb } from '../src/db/client.ts'
import { seedSample } from '../src/db/seed-sample.ts'
import { assertThrowawayUrl, resetDatabase, testDatabaseUrl } from '../src/db/throwaway.ts'

const CONTAINER = 'conspectus-pg-test'
const url = testDatabaseUrl()
assertThrowawayUrl(url)

async function reachable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 })
  try {
    await client.connect()
    await client.query('select 1')
    return true
  } catch {
    return false
  } finally {
    await client.end().catch(() => {})
  }
}

async function up(): Promise<void> {
  if (await reachable()) return
  const { hostname, port } = new URL(url)
  if (process.env.CI) throw new Error(`test database not reachable at ${hostname}:${port}`)
  execFileSync('docker', [
    'run', '-d', '--rm', '--name', CONTAINER,
    '-p', '127.0.0.1:5518:5432',
    '-e', 'POSTGRES_USER=conspectus',
    '-e', 'POSTGRES_PASSWORD=conspectus',
    '-e', 'POSTGRES_DB=conspectus_test',
    '--tmpfs', '/var/lib/postgresql',
    'pgvector/pgvector:pg18',
  ], { stdio: 'inherit' })
  for (let i = 0; i < 60; i++) {
    if (await reachable()) return
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('test database did not become reachable within 60 s')
}

const [command, ...flags] = process.argv.slice(2)
if (command === 'up') {
  await up()
} else if (command === 'down') {
  execFileSync('docker', ['rm', '-f', CONTAINER], { stdio: 'inherit' })
} else if (command === 'prepare') {
  await up()
  await resetDatabase(url)
  if (flags.includes('--seed')) {
    const raw = JSON.parse(readFileSync(new URL('../src/data/sample-situations.json', import.meta.url), 'utf8'))
    const { db, pool } = createDb(url)
    try {
      await seedSample(db, raw)
    } finally {
      await pool.end()
    }
  }
} else {
  throw new Error('usage: test-db.ts up | down | prepare [--seed]')
}

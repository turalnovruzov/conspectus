import pg from 'pg'
import { databaseUrl, loadEnv } from '../src/env.ts'
import { runMigrations } from '../src/db/migrate.ts'

loadEnv()
const url = databaseUrl()

async function appliedCount(): Promise<number> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    const res = await client.query(
      "select to_regclass('drizzle.__drizzle_migrations') as t",
    )
    if (!res.rows[0].t) return 0
    const rows = await client.query('select count(*)::int as n from drizzle.__drizzle_migrations')
    return rows.rows[0].n
  } finally {
    await client.end()
  }
}

const before = await appliedCount()
await runMigrations(url)
console.log(`migrations applied: ${(await appliedCount()) - before}`)

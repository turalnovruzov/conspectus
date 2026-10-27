import pg from 'pg'
import { runMigrations } from './migrate.ts'

export const TEST_DATABASE_URL_DEFAULT =
  'postgres://conspectus:conspectus@127.0.0.1:5518/conspectus_test'

const PROTECTED_PORTS = ['5516', '5517']

export function testDatabaseUrl(env: NodeJS.Dict<string> = process.env): string {
  return env.TEST_DATABASE_URL ?? TEST_DATABASE_URL_DEFAULT
}

export function assertThrowawayUrl(url: string): void {
  const parsed = new URL(url)
  const name = parsed.pathname.slice(1)
  if (!name.endsWith('_test') || PROTECTED_PORTS.includes(parsed.port)) {
    throw new Error(`Refusing to reset ${parsed.hostname}:${parsed.port}/${name}: not a throwaway test database`)
  }
}

export async function resetDatabase(url: string): Promise<void> {
  assertThrowawayUrl(url)
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE')
    await client.query('DROP SCHEMA public CASCADE')
    await client.query('CREATE SCHEMA public')
  } finally {
    await client.end()
  }
  await runMigrations(url)
}

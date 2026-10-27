import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import { createDb } from './client.ts'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

export async function runMigrations(url: string): Promise<void> {
  const { db, pool } = createDb(url)
  try {
    await migrate(db, { migrationsFolder })
  } finally {
    await pool.end()
  }
}

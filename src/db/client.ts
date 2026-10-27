import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { databaseUrl, loadEnv } from '../env.ts'
import * as schema from './schema.ts'

export type Db = NodePgDatabase<typeof schema>

export function createDb(url: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: url })
  return { db: drizzle(pool, { schema }), pool }
}

const cache = globalThis as unknown as { __conspectusDb?: { db: Db; pool: pg.Pool } }

// Cached on globalThis so dev-mode module reloads do not open a new pool each time.
export function getDb(): { db: Db; pool: pg.Pool } {
  if (!cache.__conspectusDb) {
    loadEnv()
    cache.__conspectusDb = createDb(databaseUrl())
  }
  return cache.__conspectusDb
}

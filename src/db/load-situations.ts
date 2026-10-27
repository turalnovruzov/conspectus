import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import type { Situation } from '../situations.ts'
import type { Db } from './client.ts'
import { involvements, situations } from './schema.ts'

interface Row {
  id: string
  title: string
  countryKey: string | null
  role: string | null
}

export function rowsToSituations(rows: Row[]): Situation[] {
  const byId = new Map<string, Situation>()
  for (const row of rows) {
    let situation = byId.get(row.id)
    if (!situation) {
      situation = { id: row.id, kind: row.title, involved: [] }
      byId.set(row.id, situation)
    }
    if (row.countryKey !== null && row.role !== null) {
      situation.involved.push({ country: row.countryKey, role: row.role })
    }
  }
  return [...byId.values()]
}

export async function loadSituations(db: Db): Promise<Situation[]> {
  const rows = await db
    .select({
      id: situations.id,
      title: situations.title,
      countryKey: involvements.countryKey,
      role: involvements.role,
    })
    .from(situations)
    .leftJoin(
      involvements,
      and(eq(involvements.situationId, situations.id), isNull(involvements.leftOn)),
    )
    .where(and(ne(situations.phase, 'ended'), isNull(situations.mergedIntoId)))
    .orderBy(asc(situations.createdAt), asc(situations.id), asc(involvements.id))
  return rowsToSituations(rows)
}

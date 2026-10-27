import { isNull, sql } from 'drizzle-orm'
import { categories } from '../../db/schema.ts'
import type { DbOrTx } from '../context.ts'

export interface CategoryRow {
  id: string
  name: string
  definition: string
  parentId: string | null
  mergedIntoId: string | null
}

export function pathOf(id: string, byId: Map<string, CategoryRow>): string {
  const names: string[] = []
  const seen = new Set<string>()
  let current: string | null = id
  while (current && !seen.has(current)) {
    seen.add(current)
    const row = byId.get(current)
    if (!row) break
    names.unshift(row.name)
    current = row.parentId
  }
  return names.join(' › ')
}

export async function allCategories(db: DbOrTx): Promise<Map<string, CategoryRow>> {
  const rows = await db
    .select({ id: categories.id, name: categories.name, definition: categories.definition, parentId: categories.parentId, mergedIntoId: categories.mergedIntoId })
    .from(categories)
  return new Map(rows.map((r) => [r.id, r]))
}

export function resolveMerged(id: string | null, byId: Map<string, CategoryRow>): string | null {
  let current = id
  for (let i = 0; i < 20 && current; i++) {
    const next = byId.get(current)?.mergedIntoId
    if (!next) return current
    current = next
  }
  return current
}

/** The nearest live categories to a vector, with their parents so the model sees where each sits. */
export async function nearestCategories(db: DbOrTx, vector: number[] | null, model: string, limit: number): Promise<string[]> {
  if (!vector) {
    const rows = await db.select({ id: categories.id }).from(categories).where(isNull(categories.mergedIntoId)).limit(limit)
    return rows.map((r) => r.id)
  }
  const rows = await db.execute<{ id: string }>(sql`
    select id from categories
    where merged_into_id is null and embedding is not null and embedding_model = ${model}
    order by embedding <=> ${`[${vector.join(',')}]`}::vector
    limit ${limit}`)
  return rows.rows.map((r) => r.id)
}

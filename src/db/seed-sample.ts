import { sql } from 'drizzle-orm'
import { parseSituations } from '../situations.ts'
import type { Db } from './client.ts'
import { involvements, situations, situationVersions } from './schema.ts'

export async function seedSample(db: Db, raw: unknown): Promise<{ inserted: number }> {
  const parsed = parseSituations(raw)
  const existing = await db.select({ id: situations.id }).from(situations).limit(1)
  if (existing.length > 0) return { inserted: 0 }
  await db.transaction(async (tx) => {
    for (const [i, s] of parsed.entries()) {
      // now() is fixed inside a transaction, so the offset is what keeps the list order.
      const [row] = await tx
        .insert(situations)
        .values({ title: s.kind, createdAt: sql`now() + ${i} * interval '1 millisecond'` })
        .returning({ id: situations.id })
      if (s.involved.length > 0) {
        await tx.insert(involvements).values(
          s.involved.map((inv) => ({
            situationId: row.id,
            countryKey: inv.country,
            role: inv.role,
          })),
        )
      }
      await tx.insert(situationVersions).values({
        situationId: row.id,
        version: 1,
        snapshot: { title: s.kind, involved: s.involved },
        changedBy: 'seed',
      })
    }
  })
  return { inserted: parsed.length }
}

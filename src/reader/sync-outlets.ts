import { notInArray, sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { outlets } from '../db/schema.ts'
import { OUTLETS } from './outlets.ts'

export async function syncOutlets(db: Db): Promise<void> {
  await db
    .insert(outlets)
    .values(OUTLETS.map((o) => ({ ...o, hosts: [...o.hosts], active: true })))
    .onConflictDoUpdate({
      target: outlets.id,
      set: {
        name: sql`excluded.name`,
        url: sql`excluded.url`,
        hosts: sql`excluded.hosts`,
        region: sql`excluded.region`,
        ownerType: sql`excluded.owner_type`,
        ownerDetail: sql`excluded.owner_detail`,
        ownerSource: sql`excluded.owner_source`,
        language: sql`excluded.language`,
        format: sql`excluded.format`,
        active: true,
      },
    })
  await db
    .update(outlets)
    .set({ active: false })
    .where(notInArray(outlets.id, OUTLETS.map((o) => o.id)))
}

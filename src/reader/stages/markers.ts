import { eq, sql } from 'drizzle-orm'
import { runs } from '../../db/schema.ts'
import type { StageContext } from '../context.ts'

export type Pass = 'consolidatedAt' | 'categoryMergedAt'

/** Whether any run recorded the pass at a clock time after `since` (clock times are the runs' own `now`). */
export async function passRanSince(ctx: StageContext, pass: Pass, since: Date): Promise<boolean> {
  const res = await ctx.db.execute<{ n: number }>(
    sql`select count(*)::int as n from runs where (report->'passes'->>${pass})::timestamptz > ${since}`,
  )
  return res.rows[0].n > 0
}

export async function markPass(ctx: StageContext, pass: Pass): Promise<void> {
  await ctx.db
    .update(runs)
    .set({
      report: sql`jsonb_set(coalesce(${runs.report}, '{}'::jsonb), '{passes}', coalesce(${runs.report}->'passes', '{}'::jsonb) || jsonb_build_object(${pass}::text, ${ctx.now.toISOString()}::text))`,
    })
    .where(eq(runs.id, ctx.runId))
}

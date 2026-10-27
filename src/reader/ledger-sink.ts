import { eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { llmCalls, runs } from '../db/schema.ts'
import type { CallSink } from './spend.ts'

/** Writes each call as an llm_calls row and keeps runs.spent_usd equal to their sum. */
export function dbSink(db: Db, runId: string | null): CallSink {
  return async (call) => {
    await db.insert(llmCalls).values({
      runId,
      purpose: call.purpose,
      model: call.model,
      promptTokens: call.promptTokens,
      completionTokens: call.completionTokens,
      costUsd: call.costUsd.toFixed(8),
      costSource: call.costSource,
      generationId: call.generationId,
      ok: call.ok,
      error: call.error,
    })
    if (runId) {
      await db
        .update(runs)
        .set({ spentUsd: sql`${runs.spentUsd} + ${call.costUsd.toFixed(8)}::numeric` })
        .where(eq(runs.id, runId))
    }
  }
}

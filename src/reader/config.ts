// Provisional until the model trial (plan step 9) writes its picks here.
export const CHAT_MODEL = 'google/gemini-2.5-flash-lite'
export const EMBEDDING_MODEL = 'qwen/qwen3-embedding-8b'

export function models(env: NodeJS.Dict<string> = process.env): { chatModel: string; embeddingModel: string } {
  return {
    chatModel: env.CONSPECTUS_CHAT_MODEL || CHAT_MODEL,
    embeddingModel: env.CONSPECTUS_EMBEDDING_MODEL || EMBEDDING_MODEL,
  }
}

export const CANDIDATE_SITUATIONS = 15
export const CANDIDATE_EVENTS = 8
export const CANDIDATE_EVENT_DAYS = 7
export const REVIVE_ENDED_DAYS = 30
export const READ_BATCH = 20
export const JUDGE_BATCH = 8
export const SUMMARIZE_BATCH = 5
export const CATEGORY_CANDIDATES = 8
export const LIFECYCLE = { quietDays: 14, endAfterResolutionDays: 30, endSilenceDays: 60 }
export const LIVE_WINDOW_HOURS = 48
export const DUP_COSINE = 0.85
export const CATEGORY_DUP_COSINE = 0.85
export const CONSOLIDATE_EVERY_HOURS = 20
export const CONSOLIDATE_RECENT_HOURS = 48
export const CATEGORY_MERGE_EVERY_DAYS = 7
export const CATEGORY_MERGE_MIN = 10
export const MAX_ARTICLE_FETCHES_PER_RUN = 60
/** Measured by the model trial; `backfill --plan` multiplies it by the items per day. */
export const TRIAL_COST_PER_ITEM_USD: number | null = null

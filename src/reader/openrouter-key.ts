import type { FetchFn } from './http.ts'
import { MAX_RUN_CEILING_USD, type Pricing } from './spend.ts'

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

/** What `/key` returns, minus `label` (which can echo part of the key). */
export type KeyInfo = Record<string, unknown> & { usage?: number; limit?: number | null; limit_remaining?: number | null }

export class RunRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RunRefusedError'
  }
}

/** Kept below the key's remaining weekly limit so a run never spends the last of it. */
export const KEY_RESERVE_USD = 0.5
export const MIN_RUN_ROOM_USD = 0.05

export function redact(text: string, apiKey: string): string {
  return apiKey ? text.split(apiKey).join('[redacted]') : text
}

export async function readKey(apiKey: string, fetchFn: FetchFn = fetch): Promise<KeyInfo> {
  let res: Response
  try {
    res = await fetchFn(`${OPENROUTER_BASE}/key`, { headers: { Authorization: `Bearer ${apiKey}` } })
  } catch (err) {
    throw new RunRefusedError(`could not read the OpenRouter key: ${redact(err instanceof Error ? err.message : String(err), apiKey)}`)
  }
  if (res.status !== 200) throw new RunRefusedError(`could not read the OpenRouter key: http ${res.status}`)
  const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null
  if (!body?.data || typeof body.data !== 'object') throw new RunRefusedError('could not read the OpenRouter key: no data')
  const { label: _label, ...rest } = body.data
  return rest as KeyInfo
}

/**
 * The ceiling a run actually gets: the requested one, never above MAX_RUN_CEILING_USD, and never
 * closer than KEY_RESERVE_USD to the key's remaining limit. A key with under MIN_RUN_ROOM_USD of
 * room left refuses the run.
 */
export function effectiveCeiling(requested: number, key: KeyInfo): number {
  if (!(requested >= 0) || requested > MAX_RUN_CEILING_USD) {
    throw new RunRefusedError(`ceiling $${requested} refused: the most one run may be given is $${MAX_RUN_CEILING_USD}`)
  }
  if (typeof key.limit_remaining !== 'number') return requested
  const room = key.limit_remaining - KEY_RESERVE_USD
  if (room < MIN_RUN_ROOM_USD) {
    throw new RunRefusedError(`the key has $${key.limit_remaining} left this week; a run needs $${KEY_RESERVE_USD + MIN_RUN_ROOM_USD}`)
  }
  return Math.min(requested, room)
}

interface ModelRow {
  id: string
  pricing?: { prompt?: string; completion?: string }
}

export async function fetchPricing(fetchFn: FetchFn = fetch): Promise<Pricing> {
  const pricing: Pricing = {}
  for (const path of ['/models', '/embeddings/models']) {
    const res = await fetchFn(`${OPENROUTER_BASE}${path}`)
    if (res.status !== 200) throw new RunRefusedError(`could not read OpenRouter pricing ${path}: http ${res.status}`)
    const body = (await res.json()) as { data?: ModelRow[] }
    for (const m of body.data ?? []) {
      const prompt = Number(m.pricing?.prompt)
      const completion = Number(m.pricing?.completion ?? 0)
      if (Number.isFinite(prompt) && prompt >= 0 && Number.isFinite(completion) && completion >= 0) {
        pricing[m.id] = { prompt, completion }
      }
    }
  }
  return pricing
}

import { SpendCeilingError, type SpendLedger } from './spend.ts'

/**
 * Measures for the model trial. Every one compares a model's output with labels the build wrote
 * itself, so they describe agreement with one reading of the items, never whether a model is right.
 */

export interface PairScores {
  precision: number
  recall: number
  f1: number
  labelPairs: number
  modelPairs: number
  sharedPairs: number
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function pairsOf(groups: Map<string, string | null>, items: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < items.length; i++) {
    const gi = groups.get(items[i])
    if (gi == null) continue
    for (let j = i + 1; j < items.length; j++) {
      if (groups.get(items[j]) === gi) out.add(pairKey(items[i], items[j]))
    }
  }
  return out
}

/**
 * Same-story agreement over item pairs, among `items`: a pair counts for the labels when both share a
 * story, and for the model when both landed in the same situation. A null group pairs with nothing.
 */
export function pairAgreement(
  items: readonly string[],
  labelStory: Map<string, string | null>,
  modelGroup: Map<string, string | null>,
): PairScores {
  const label = pairsOf(labelStory, items)
  const model = pairsOf(modelGroup, items)
  let shared = 0
  for (const p of model) if (label.has(p)) shared++
  const precision = model.size === 0 ? 0 : shared / model.size
  const recall = label.size === 0 ? 0 : shared / label.size
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return { precision, recall, f1, labelPairs: label.size, modelPairs: model.size, sharedPairs: shared }
}

/** |a ∩ b| ÷ |a ∪ b|; two empty sets agree fully. */
export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size === 0 && sb.size === 0) return 1
  let inter = 0
  for (const x of sa) if (sb.has(x)) inter++
  return inter / (sa.size + sb.size - inter)
}

export interface AttachShare {
  attached: number
  crossStory: number
  share: number
}

/**
 * Of the items placed into a situation another item opened, the share whose labelled story differs from
 * the opener's (an item labelled not relevant counts as different). It describes over-attachment: an
 * item pulled into a story it does not belong to, e.g. an Israeli party item under a Bulgarian election.
 */
export function crossStoryAttach(
  placements: { item: string; situation: string; opener: string }[],
  labelStory: Map<string, string | null>,
): AttachShare {
  let attached = 0
  let crossStory = 0
  for (const p of placements) {
    if (p.item === p.opener) continue
    attached++
    const story = labelStory.get(p.item) ?? null
    if (story === null || story !== (labelStory.get(p.opener) ?? null)) crossStory++
  }
  return { attached, crossStory, share: attached === 0 ? 0 : crossStory / attached }
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export type CandidateOutcome<T> =
  | { model: string; status: 'done'; result: T }
  | { model: string; status: 'stopped' | 'not_started'; reason: string }

/**
 * Runs candidates one after another under the trial's total ledger: a candidate starts only while the
 * total has `perCandidateUsd` of room, and a spend ceiling escaping a candidate ends the trial.
 */
export async function runCandidates<T>(
  parent: SpendLedger,
  models: readonly string[],
  perCandidateUsd: number,
  run: (model: string) => Promise<T>,
): Promise<CandidateOutcome<T>[]> {
  const out: CandidateOutcome<T>[] = []
  let stopped = false
  for (const model of models) {
    if (stopped || parent.roomUsd < perCandidateUsd) {
      out.push({ model, status: 'not_started', reason: `trial total has $${parent.roomUsd} of room, under $${perCandidateUsd}` })
      continue
    }
    try {
      out.push({ model, status: 'done', result: await run(model) })
    } catch (err) {
      if (!(err instanceof SpendCeilingError)) throw err
      stopped = true
      out.push({ model, status: 'stopped', reason: err.message })
    }
  }
  return out
}

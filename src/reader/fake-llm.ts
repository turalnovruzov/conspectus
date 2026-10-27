import { createHash } from 'node:crypto'
import { type ChatPurpose, type ChatRequest, type Llm, LlmOutputError } from './llm.ts'
import type { SpendLedger } from './spend.ts'

export type Responder = unknown | ((req: ChatRequest<unknown>) => unknown)

export const FAKE_DIM = 64

/** Bag-of-words vector: texts sharing words land close together, so retrieval behaves plausibly in tests. */
export function hashVector(text: string): number[] {
  const v = new Array<number>(FAKE_DIM).fill(0)
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const h = createHash('sha1').update(word).digest()
    v[h[0] % FAKE_DIM] += 1
  }
  const norm = Math.hypot(...v) || 1
  return v.map((x) => x / norm)
}

/** A scripted Llm for tests: queued responses per purpose, then the purpose's fallback; never touches the network. */
export class FakeLlm implements Llm {
  readonly chatModel: string
  readonly embeddingModel: string
  readonly calls: { purpose: ChatPurpose; system: string; user: string }[] = []
  readonly embedCalls: string[][] = []
  readonly vectors = new Map<string, number[]>()
  private readonly queues = new Map<ChatPurpose, Responder[]>()
  private readonly fallbacks = new Map<ChatPurpose, Responder>()
  private readonly ledger: SpendLedger | null
  private readonly costPerCall: number

  constructor(options: { ledger?: SpendLedger; costPerCall?: number; chatModel?: string; embeddingModel?: string } = {}) {
    this.ledger = options.ledger ?? null
    this.costPerCall = options.costPerCall ?? 0
    this.chatModel = options.chatModel ?? 'fake/chat'
    this.embeddingModel = options.embeddingModel ?? 'fake/embed'
  }

  script(purpose: ChatPurpose, ...responses: Responder[]): this {
    this.queues.set(purpose, [...(this.queues.get(purpose) ?? []), ...responses])
    return this
  }

  fallback(purpose: ChatPurpose, responder: Responder): this {
    this.fallbacks.set(purpose, responder)
    return this
  }

  callsFor(purpose: ChatPurpose): { system: string; user: string }[] {
    return this.calls.filter((c) => c.purpose === purpose)
  }

  private async charge(purpose: ChatPurpose | 'embed', model: string): Promise<void> {
    if (!this.ledger) return
    const reservation = this.ledger.reserve(this.costPerCall)
    await this.ledger.record(reservation, { purpose, model, ok: true, reportedCostUsd: this.costPerCall, promptTokens: 1, completionTokens: 1 })
  }

  async chatJson<T>(req: ChatRequest<T>): Promise<T> {
    await this.charge(req.purpose, this.chatModel)
    this.calls.push({ purpose: req.purpose, system: req.system, user: req.user })
    const queue = this.queues.get(req.purpose) ?? []
    const responder = queue.length > 0 ? queue.shift() : this.fallbacks.get(req.purpose)
    if (responder === undefined) throw new Error(`FakeLlm: nothing scripted for ${req.purpose}`)
    const value = typeof responder === 'function' ? (responder as (r: ChatRequest<unknown>) => unknown)(req as ChatRequest<unknown>) : responder
    if (value instanceof Error) throw value
    const parsed = req.schema.safeParse(value)
    if (!parsed.success) throw new LlmOutputError(`${req.purpose}: scripted response does not match the schema: ${parsed.error.message}`)
    return parsed.data
  }

  async embed(texts: string[]): Promise<number[][]> {
    await this.charge('embed', this.embeddingModel)
    this.embedCalls.push(texts)
    return texts.map((t) => this.vectors.get(t) ?? hashVector(t))
  }
}

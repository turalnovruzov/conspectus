/** No single run may be given more than this, so a typo in --ceiling cannot open the whole week's budget. */
export const MAX_RUN_CEILING_USD = 3

export type Purpose = 'read' | 'judge' | 'summarize' | 'consolidate' | 'category_merge' | 'embed' | 'probe'

export interface ModelPrice {
  /** USD per input token */
  prompt: number
  /** USD per output token */
  completion: number
}

export type Pricing = Record<string, ModelPrice>

export interface CallRecord {
  purpose: Purpose
  model: string
  promptTokens: number | null
  completionTokens: number | null
  costUsd: number
  costSource: 'reported' | 'computed'
  generationId: string | null
  ok: boolean
  error: string | null
}

export type CallSink = (call: CallRecord) => Promise<void>

export class SpendCeilingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpendCeilingError'
  }
}

export interface Reservation {
  readonly amount: number
  settled: boolean
}

export interface Usage {
  promptTokens?: number | null
  completionTokens?: number | null
  reportedCostUsd?: number | null
  generationId?: string | null
}

const round = (n: number) => Math.round(n * 1e10) / 1e10

/**
 * Every call to OpenRouter reserves its estimate here first and records its actual cost after,
 * so calls started together cannot pass the ceiling between them. A parent (a trial or backfill
 * total) is reserved against too, so a child can never take its parent past its own ceiling.
 */
export class SpendLedger {
  readonly ceilingUsd: number
  readonly pricing: Pricing
  readonly parent: SpendLedger | null
  private sink: CallSink | null
  private spent = 0
  private reserved = 0

  constructor(options: { ceilingUsd: number; pricing: Pricing; parent?: SpendLedger; sink?: CallSink }) {
    if (!(options.ceilingUsd >= 0) || options.ceilingUsd > MAX_RUN_CEILING_USD) {
      throw new SpendCeilingError(`ceiling $${options.ceilingUsd} refused: the most one run may be given is $${MAX_RUN_CEILING_USD}`)
    }
    this.ceilingUsd = options.ceilingUsd
    this.pricing = options.pricing
    this.parent = options.parent ?? null
    this.sink = options.sink ?? null
  }

  get spentUsd(): number {
    return round(this.spent)
  }

  get roomUsd(): number {
    return round(this.ceilingUsd - this.spent - this.reserved)
  }

  setSink(sink: CallSink | null): void {
    this.sink = sink
  }

  price(model: string): ModelPrice {
    const p = this.pricing[model]
    if (!p) throw new Error(`no OpenRouter pricing for model ${model}`)
    return p
  }

  estimateChat(model: string, promptChars: number, maxTokens: number): number {
    const p = this.price(model)
    return (promptChars / 3) * p.prompt + maxTokens * p.completion
  }

  estimateEmbed(model: string, chars: number): number {
    return (chars / 3) * this.price(model).prompt
  }

  reserve(estimateUsd: number): Reservation {
    this.hold(estimateUsd)
    if (this.parent) {
      try {
        this.parent.reserve(estimateUsd)
      } catch (err) {
        this.reserved -= estimateUsd
        throw err
      }
    }
    return { amount: estimateUsd, settled: false }
  }

  private hold(amount: number): void {
    if (this.spent + this.reserved + amount > this.ceilingUsd + 1e-12) {
      throw new SpendCeilingError(
        `spend ceiling $${this.ceilingUsd} reached: spent $${this.spentUsd}, held $${round(this.reserved)}, next call up to $${round(amount)}`,
      )
    }
    this.reserved += amount
  }

  private settle(reservedAmount: number, cost: number): void {
    this.reserved = Math.max(0, this.reserved - reservedAmount)
    this.spent += cost
    this.parent?.settle(reservedAmount, cost)
  }

  /** Replaces the reservation with the call's actual cost (reported, else computed from pricing) and writes one llm_calls row. */
  async record(
    reservation: Reservation,
    call: { purpose: Purpose; model: string; ok: boolean; error?: string | null } & Usage,
  ): Promise<CallRecord> {
    const promptTokens = call.promptTokens ?? null
    const completionTokens = call.completionTokens ?? null
    let costUsd: number
    let costSource: CallRecord['costSource']
    if (typeof call.reportedCostUsd === 'number') {
      costUsd = call.reportedCostUsd
      costSource = 'reported'
    } else {
      const p = this.pricing[call.model]
      costUsd = p ? (promptTokens ?? 0) * p.prompt + (completionTokens ?? 0) * p.completion : 0
      costSource = 'computed'
    }
    if (!reservation.settled) {
      reservation.settled = true
      this.settle(reservation.amount, costUsd)
    }
    const record: CallRecord = {
      purpose: call.purpose,
      model: call.model,
      promptTokens,
      completionTokens,
      costUsd,
      costSource,
      generationId: call.generationId ?? null,
      ok: call.ok,
      error: call.error ?? null,
    }
    if (this.sink) await this.sink(record)
    return record
  }
}

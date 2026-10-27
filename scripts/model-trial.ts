import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { eq, inArray } from 'drizzle-orm'
import { createDb } from '../src/db/client.ts'
import { eventItems, llmCalls, situationEvents, situationVersions, sourceItems } from '../src/db/schema.ts'
import { assertThrowawayUrl, resetDatabase, testDatabaseUrl } from '../src/db/throwaway.ts'
import { loadEnv } from '../src/env.ts'
import { matchCountry } from '../src/reader/countries.ts'
import { REPO_URL } from '../src/reader/http.ts'
import { type Llm, createOpenRouterLlm } from '../src/reader/llm.ts'
import { type KeyInfo, fetchPricing, readKey } from '../src/reader/openrouter-key.ts'
import type { Extraction } from '../src/reader/prompts/read.ts'
import { runOnce } from '../src/reader/run.ts'
import { staticSources } from '../src/reader/sources.ts'
import { SpendLedger } from '../src/reader/spend.ts'
import type { FetchOutcome } from '../src/reader/stages/ingest.ts'
import { liveSituationId } from '../src/reader/stages/situation-ops.ts'
import { crossStoryAttach, jaccard, median, pairAgreement, runCandidates } from '../src/reader/trial-score.ts'
import type { RawItem } from '../src/reader/types.ts'

const TRIAL_TOTAL_USD = 1.5
const PER_CANDIDATE_USD = 0.25
const EMBED_TRIAL_USD = 0.05

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    chat: { type: 'string' },
    embed: { type: 'string' },
  },
})
if (!values.dir || !values.chat || !values.embed) {
  console.log('usage: node scripts/model-trial.ts --dir <trial dir with sample.json, labels.json> --chat a,b,c --embed x,y,z')
  process.exit(1)
}
const dir = values.dir
const chatModels = values.chat.split(',')
const embedModels = values.embed.split(',')

interface Label { url: string; relevant: boolean; story: string | null; countries: string[] }

const sample = (JSON.parse(readFileSync(join(dir, 'sample.json'), 'utf8')) as RawItem[]).map((i) => ({
  ...i, publishedAt: i.publishedAt ? new Date(i.publishedAt) : null,
}))
const labels = (JSON.parse(readFileSync(join(dir, 'labels.json'), 'utf8')) as { items: Label[] }).items
const labelOf = new Map(labels.map((l) => [l.url, l]))
const storyOf = new Map(labels.map((l) => [l.url, l.relevant ? l.story : null]))
const urls = sample.map((i) => i.url)
if (urls.some((u) => !labelOf.has(u))) throw new Error('every sampled item needs a label')
const relevantUrls = urls.filter((u) => labelOf.get(u)!.relevant)
const keysOf = (names: string[]) => names.map((n) => matchCountry(n)?.key).filter((k): k is string => !!k)

loadEnv()
const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set')
const dbUrl = testDatabaseUrl()
assertThrowawayUrl(dbUrl)

const keyView = (k: KeyInfo) => ({ usage: k.usage ?? null, limit: k.limit ?? null, limit_remaining: k.limit_remaining ?? null })
const keyBefore = keyView(await readKey(apiKey))
const pricing = await fetchPricing()
const parent = new SpendLedger({ ceilingUsd: TRIAL_TOTAL_USD, pricing })

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / Math.sqrt(na * nb)
}

async function embeddingTrial(model: string) {
  const ledger = new SpendLedger({ ceilingUsd: EMBED_TRIAL_USD, pricing, parent })
  const llm = createOpenRouterLlm({ apiKey: apiKey!, chatModel: chatModels[0], embeddingModel: model, ledger, referer: REPO_URL })
  const texts = sample.map((i) => `${i.headline}\n${i.blurb}`.slice(0, 2000))
  const vectors = await llm.embed(texts)
  const hits = { 10: 0, 15: 0 }
  let pairs = 0
  for (let a = 0; a < sample.length; a++) {
    const story = storyOf.get(urls[a])
    if (!story) continue
    const ranked = sample
      .map((_, b) => ({ b, sim: b === a ? -Infinity : cosine(vectors[a], vectors[b]) }))
      .sort((x, y) => y.sim - x.sim)
      .map((r) => r.b)
    for (let b = 0; b < sample.length; b++) {
      if (b === a || storyOf.get(urls[b]) !== story) continue
      pairs++
      const rank = ranked.indexOf(b)
      if (rank < 10) hits[10]++
      if (rank < 15) hits[15]++
    }
  }
  return {
    model, dimension: vectors[0]?.length ?? 0, pairs,
    recallAt10: pairs ? hits[10] / pairs : 0, recallAt15: pairs ? hits[15] / pairs : 0,
    spentUsd: ledger.spentUsd, usdPer1000Items: (ledger.spentUsd / sample.length) * 1000,
  }
}

function timed(llm: Llm, stats: { calls: number; ok: number; ms: number[] }): Llm {
  return {
    chatModel: llm.chatModel,
    embeddingModel: llm.embeddingModel,
    embed: (texts) => llm.embed(texts),
    async chatJson(req) {
      const started = Date.now()
      stats.calls++
      try {
        const out = await llm.chatJson(req)
        stats.ok++
        return out
      } finally {
        stats.ms.push(Date.now() - started)
      }
    },
  }
}

function outcomesOf(items: typeof sample, at: Date): FetchOutcome[] {
  const byOutlet = new Map<string, RawItem[]>()
  for (const i of items) byOutlet.set(i.outletId, [...(byOutlet.get(i.outletId) ?? []), i])
  return [...byOutlet].map(([outletId, list]) => ({
    outletId, url: `trial:${outletId}`, ok: true, httpStatus: 200, error: null, ms: 0, startedAt: at, items: list,
  }))
}

async function chatTrial(model: string, embeddingModel: string) {
  await resetDatabase(dbUrl)
  const { db, pool } = createDb(dbUrl)
  try {
    const ledger = new SpendLedger({ ceilingUsd: PER_CANDIDATE_USD, pricing, parent })
    const stats = { calls: 0, ok: 0, ms: [] as number[] }
    const llm = timed(createOpenRouterLlm({ apiKey: apiKey!, chatModel: model, embeddingModel, ledger, referer: REPO_URL }), stats)
    const ordered = [...sample].sort((a, b) => (a.publishedAt?.getTime() ?? Infinity) - (b.publishedAt?.getTime() ?? Infinity))
    const half = Math.ceil(ordered.length / 2)
    const firstNow = new Date(Math.max(...ordered.slice(0, half).map((i) => i.publishedAt?.getTime() ?? 0)) + 3_600_000)
    const runIds: string[] = []
    const statuses: string[] = []
    for (const [items, now] of [[ordered.slice(0, half), firstNow], [ordered.slice(half), new Date()]] as const) {
      const r = await runOnce({ db, llm, ledger, now, kind: 'trial', sources: staticSources(outcomesOf(items, now)), windowHours: null })
      runIds.push(r.runId)
      statuses.push(r.status)
    }
    const rows = await db.select().from(sourceItems).where(inArray(sourceItems.url, urls))
    const byUrl = new Map(rows.map((r) => [r.url, r]))
    const group = new Map<string, string | null>()
    const placements: { item: string; situation: string; opener: string }[] = []
    const openerUrl = new Map<string, string>()
    for (const url of urls) {
      const row = byUrl.get(url)
      const link = row
        ? await db.select({ situationId: situationEvents.situationId }).from(eventItems)
          .innerJoin(situationEvents, eq(situationEvents.eventId, eventItems.eventId))
          .where(eq(eventItems.sourceItemId, row.id)).limit(1)
        : []
      if (!link[0]) {
        group.set(url, null)
        continue
      }
      const situation = await liveSituationId(db, link[0].situationId)
      group.set(url, situation)
      if (!openerUrl.has(situation)) {
        const [v1] = await db.select({ cause: situationVersions.causeItemId }).from(situationVersions)
          .where(eq(situationVersions.situationId, situation)).orderBy(situationVersions.version).limit(1)
        const opener = rows.find((r) => r.id === v1?.cause)
        openerUrl.set(situation, opener?.url ?? url)
      }
      placements.push({ item: url, situation, opener: openerUrl.get(situation)! })
    }
    let agree = 0
    let unread = 0
    const jaccards: number[] = []
    for (const url of urls) {
      const extraction = byUrl.get(url)?.extraction as Extraction | null | undefined
      if (!extraction) unread++
      if ((extraction?.relevant ?? false) === labelOf.get(url)!.relevant) agree++
      if (labelOf.get(url)!.relevant) jaccards.push(jaccard(keysOf(extraction?.countries.map((c) => c.name) ?? []), keysOf(labelOf.get(url)!.countries)))
    }
    const chatRows = (await db.select().from(llmCalls).where(inArray(llmCalls.runId, runIds))).filter((c) => c.purpose !== 'embed')
    const pairs = pairAgreement(relevantUrls, storyOf, group)
    const countryJaccard = jaccards.reduce((a, b) => a + b, 0) / jaccards.length
    return {
      model, statuses, spentUsd: ledger.spentUsd,
      usdPer100Items: (ledger.spentUsd / sample.length) * 100, usdPerItem: ledger.spentUsd / sample.length,
      relevanceAgreement: agree / urls.length, unread,
      pairs, countryJaccard, combined: (pairs.f1 + countryJaccard) / 2,
      crossStoryAttach: crossStoryAttach(placements, storyOf),
      situations: new Set([...group.values()].filter(Boolean)).size,
      jsonValidRate: chatRows.length ? stats.ok / chatRows.length : 0,
      chatCalls: stats.calls, chatAttempts: chatRows.length, p50LatencyMs: median(stats.ms),
    }
  } finally {
    await pool.end()
  }
}

const embeddings = []
for (const m of embedModels) embeddings.push(await embeddingTrial(m))
const bestEmbedding = [...embeddings].sort((a, b) => b.recallAt15 - a.recallAt15 || a.usdPer1000Items - b.usdPer1000Items)[0]
console.log('embeddings:', JSON.stringify(embeddings, null, 1))

const outcomes = await runCandidates(parent, chatModels, PER_CANDIDATE_USD, async (m) => {
  const r = await chatTrial(m, bestEmbedding.model)
  console.log(JSON.stringify(r))
  return r
})
const done = outcomes.flatMap((o) => (o.status === 'done' ? [o.result] : []))
const eligible = done.filter((r) => r.jsonValidRate >= 0.95)
const top = Math.max(...eligible.map((r) => r.combined))
const chosen = eligible.filter((r) => r.combined >= top - 0.03).sort((a, b) => a.usdPerItem - b.usdPerItem)[0] ?? null

await new Promise((r) => setTimeout(r, 60_000))
const keyAfter = keyView(await readKey(apiKey))
const labelsHash = readFileSync(join(dir, 'labels.sha256'), 'utf8').split(' ')[0]
const results = { keyBefore, keyAfter, trialSpentUsd: parent.spentUsd, labelsSha256: labelsHash, embeddings, bestEmbedding: bestEmbedding.model, outcomes, chosen: chosen?.model ?? null }
writeFileSync(join(dir, 'results.json'), JSON.stringify(results, null, 1))

const pct = (n: number) => `${(n * 100).toFixed(1)} %`
const lines = [
  '# Model trial',
  '',
  `Sample: ${sample.length} items fetched ${sample.length ? 'on 2026-10-27' : ''}, stratified across outlets; ${relevantUrls.length} labelled relevant.`,
  `Labels: written by the build before any candidate ran; sha256 \`${labelsHash}\`.`,
  'Every measure is agreement with the build\'s own labels: one reading of these items, not a judgement of which model is right.',
  '',
  '## Embedding models (no chat)',
  '',
  '| model | dim | same-story pairs | partner in top 10 | partner in top 15 | $ / 1000 items |',
  '|---|---|---|---|---|---|',
  ...embeddings.map((e) => `| ${e.model} | ${e.dimension} | ${e.pairs} | ${pct(e.recallAt10)} | ${pct(e.recallAt15)} | ${e.usdPer1000Items.toFixed(5)} |`),
  '',
  `Chosen: ${bestEmbedding.model} (highest top-15 share, ties to the cheaper).`,
  '',
  `## Chat models (two runs each, date order, embeddings ${bestEmbedding.model})`,
  '',
  '| model | relevance agreement | pair P / R / F1 | country Jaccard | cross-story attach | JSON valid | $ / 100 items | p50 latency | situations | runs |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...done.map((r) => `| ${r.model} | ${pct(r.relevanceAgreement)} | ${r.pairs.precision.toFixed(2)} / ${r.pairs.recall.toFixed(2)} / ${r.pairs.f1.toFixed(2)} | ${r.countryJaccard.toFixed(2)} | ${r.crossStoryAttach.crossStory} of ${r.crossStoryAttach.attached} (${pct(r.crossStoryAttach.share)}) | ${pct(r.jsonValidRate)} | ${r.usdPer100Items.toFixed(4)} | ${r.p50LatencyMs ?? '?'} ms | ${r.situations} | ${r.statuses.join(', ')} |`),
  ...outcomes.filter((o) => o.status !== 'done').map((o) => `| ${o.model} | ${o.status}: ${'reason' in o ? o.reason : ''} |||||||||`),
  '',
  `Chosen: ${chosen?.model ?? 'none'} (JSON valid ≥ 95 %, highest mean of pair F1 and country Jaccard, within 0.03 of the top the cheaper).`,
  '',
  `Trial spend (ledger): $${parent.spentUsd.toFixed(6)} of $${TRIAL_TOTAL_USD}. Key usage before ${keyBefore.usage}, after ${keyAfter.usage} (read a minute after the last call).`,
]
writeFileSync(join(dir, 'report.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))

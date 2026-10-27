import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { desc, eq } from 'drizzle-orm'
import { createDb } from '../src/db/client.ts'
import { assertNotForeignDb } from '../src/db/guard.ts'
import { runs } from '../src/db/schema.ts'
import { databaseUrl, loadEnv } from '../src/env.ts'
import { backfill, backfillDays, planBackfill, sliceByDay } from '../src/reader/backfill.ts'
import { TRIAL_COST_PER_ITEM_USD, models } from '../src/reader/config.ts'
import { REPO_URL } from '../src/reader/http.ts'
import { createOpenRouterLlm } from '../src/reader/llm.ts'
import { type KeyInfo, effectiveCeiling, fetchPricing, readKey } from '../src/reader/openrouter-key.ts'
import { type RunReport, formatReport } from '../src/reader/report.ts'
import { runOnce } from '../src/reader/run.ts'
import { fetchFeeds, fetchWikipediaDays, liveSources } from '../src/reader/sources.ts'
import { SpendLedger } from '../src/reader/spend.ts'

const USAGE = `usage: npm run reader -- <command>
  run [--ceiling 0.75] [--max-items N]
  backfill --days N [--ceiling 3] [--plan] [--force] [--cost-per-item USD]
  fetch-only --out <file>
  report [--run <id>]`

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    ceiling: { type: 'string' },
    'max-items': { type: 'string' },
    days: { type: 'string' },
    plan: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    'cost-per-item': { type: 'string' },
    out: { type: 'string' },
    run: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})
const command = positionals[0]
if (values.help || !command) {
  console.log(USAGE)
  process.exit(values.help ? 0 : 1)
}

const num = (raw: string | undefined, fallback: number, name: string): number => {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) throw new Error(`--${name} must be a non-negative number`)
  return n
}

async function fetchOnly(out: string): Promise<void> {
  const today = new Date()
  const [feeds, wiki] = await Promise.all([fetchFeeds(), fetchWikipediaDays([new Date(today.getTime() - 86_400_000), today])])
  const outcomes = [...feeds, ...wiki]
  writeFileSync(out, JSON.stringify(outcomes, null, 1))
  for (const o of outcomes.sort((a, b) => a.outletId.localeCompare(b.outletId))) {
    const end = new Date(o.startedAt.getTime() + o.ms).toISOString().slice(11, 23)
    console.log(`${o.outletId.padEnd(20)} ${o.ok ? 'ok    ' : 'FAILED'} ${String(o.items.length).padStart(4)} items ${String(o.ms).padStart(6)} ms  ${o.startedAt.toISOString().slice(11, 23)}–${end}${o.error ? `  ${o.error}` : ''}`)
  }
  console.log(`${outcomes.filter((o) => o.ok).length} of ${outcomes.length} fetches ok, ${outcomes.reduce((n, o) => n + o.items.length, 0)} items → ${out}`)
}

if (command === 'fetch-only') {
  if (!values.out) throw new Error('fetch-only needs --out <file>')
  await fetchOnly(values.out)
  process.exit(0)
}

loadEnv()
const url = databaseUrl()
assertNotForeignDb(url)
const { db, pool } = createDb(url)

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY is not set (expected in ~/.config/conspectus/.env)')
  return key
}

async function printRun(id: string): Promise<void> {
  const [run] = await db.select().from(runs).where(eq(runs.id, id))
  console.log(formatReport(run, run.report as RunReport))
}

// OpenRouter's key usage lags a few seconds behind the calls.
const settle = () => new Promise((r) => setTimeout(r, 5000))

async function finishKey(ids: string[], key: string): Promise<KeyInfo> {
  await settle()
  const after = await readKey(key)
  for (const id of ids) {
    const [run] = await db.select().from(runs).where(eq(runs.id, id))
    const report = { ...(run.report as RunReport), spend: { ...(run.report as RunReport).spend, keyAfter: after.usage ?? null } }
    await db.update(runs).set({ keyAfter: after, report }).where(eq(runs.id, id))
  }
  return after
}

try {
  if (command === 'run') {
    const key = apiKey()
    const keyBefore = await readKey(key)
    const ceilingUsd = effectiveCeiling(num(values.ceiling, 0.75, 'ceiling'), keyBefore)
    const ledger = new SpendLedger({ ceilingUsd, pricing: await fetchPricing() })
    const llm = createOpenRouterLlm({ apiKey: key, ...models(), ledger, referer: REPO_URL })
    const maxItems = values['max-items'] === undefined ? undefined : num(values['max-items'], 0, 'max-items')
    const result = await runOnce({ db, llm, ledger, now: new Date(), kind: 'live', sources: liveSources(), maxItems, keyBefore })
    await finishKey([result.runId], key)
    await printRun(result.runId)
    if (result.status === 'failed') process.exitCode = 1
  } else if (command === 'backfill') {
    const days = num(values.days, Number.NaN, 'days')
    if (!Number.isInteger(days) || days < 1 || days > 14) throw new Error('backfill needs --days between 1 and 14')
    const today = new Date()
    const dayList = backfillDays(today, days)
    console.log(`fetching feeds once and Wikipedia for ${days} days (${dayList[0].toISOString().slice(0, 10)} … ${dayList.at(-1)!.toISOString().slice(0, 10)})`)
    const feeds = await fetchFeeds()
    const wikiOutcomes = await fetchWikipediaDays(dayList)
    const wikipedia = dayList.map((day, i) => ({ day, outcome: wikiOutcomes[i] }))
    if (values.plan) {
      const costPerItem = values['cost-per-item'] === undefined ? TRIAL_COST_PER_ITEM_USD : num(values['cost-per-item'], 0, 'cost-per-item')
      const plan = planBackfill(sliceByDay(feeds, wikipedia, dayList), feeds, costPerItem)
      for (const d of plan.days) console.log(`${d.day}  ${String(d.total).padStart(5)} items  ${Object.entries(d.perOutlet).map(([k, v]) => `${k}:${v}`).join(' ')}`)
      console.log('\noldest item per outlet:')
      for (const [k, v] of Object.entries(plan.oldestPerOutlet)) console.log(`  ${k.padEnd(20)} ${v ?? '(none dated)'}`)
      console.log(`\nestimated USD per day: ${plan.estimatedUsdPerDay === null ? 'unknown (no measured cost per item; pass --cost-per-item)' : plan.estimatedUsdPerDay.toFixed(4)}`)
    } else {
      const key = apiKey()
      const keyBefore = await readKey(key)
      const totalLedger = new SpendLedger({ ceilingUsd: effectiveCeiling(num(values.ceiling, 3, 'ceiling'), keyBefore), pricing: await fetchPricing() })
      const results = await backfill({
        db, today, days, totalLedger, feeds, wikipedia, force: values.force, keyBefore,
        makeLlm: (ledger) => createOpenRouterLlm({ apiKey: key, ...models(), ledger, referer: REPO_URL }),
      })
      await finishKey([results.at(-1)!.runId], key)
      for (const r of results) {
        await printRun(r.runId)
        console.log('')
      }
      console.log(`backfill total spend (USD): ${totalLedger.spentUsd.toFixed(6)} of ${totalLedger.ceilingUsd}`)
      if (results.some((r) => r.status === 'failed')) process.exitCode = 1
    }
  } else if (command === 'report') {
    const [run] = values.run
      ? await db.select().from(runs).where(eq(runs.id, values.run))
      : await db.select().from(runs).orderBy(desc(runs.startedAt)).limit(1)
    if (!run) throw new Error('no run found')
    await printRun(run.id)
  } else {
    console.log(USAGE)
    process.exitCode = 1
  }
} finally {
  await pool.end()
}

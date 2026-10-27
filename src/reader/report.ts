import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { loadLiveView } from '../db/live-view.ts'
import { categories, fetchLog, llmCalls, runs, situations, sourceItems } from '../db/schema.ts'
import type { RunNotes } from './context.ts'
import { OUTLETS, hostAllowed } from './outlets.ts'
import type { KeyInfo } from './openrouter-key.ts'

export interface RunReport {
  itemsPerOutlet: Record<string, { seen: number; new: number; failed: number }>
  skipped: Record<string, number>
  unsure: number
  situationsOpened: number
  situationsEnded: number
  mergedThisRun: number
  duplicateRate: number
  oneOffShare: number
  categoriesPer100: number
  onMap: number
  unmatchedCountries: Record<string, number>
  rejectedUrls: number
  unknownRoles: Record<string, number>
  roleChangesUnsupported: number
  llmFailures: number
  /** Batches lost to a connection that failed twice; their items wait for the next run. */
  transportFailures: number
  llmFailureNotes: RunNotes['llmFailures']
  fetchFailures: { outletId: string; error: string | null }[]
  spend: { run: number; keyBefore: number | null; keyAfter: number | null }
  suggestedOutlets: { domain: string; count: number }[]
}

const ratio = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 10_000) / 10_000)
const usage = (k: unknown) => (typeof (k as KeyInfo | null)?.usage === 'number' ? (k as KeyInfo).usage! : null)

const LISTED_HOSTS = OUTLETS.flatMap((o) => o.hosts)

export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\d?\./, '').split('.')
  const twoLevel = parts.length > 2 && /^(co|com|org|net|gov|ac|edu)$/.test(parts[parts.length - 2])
  return parts.slice(twoLevel ? -3 : -2).join('.')
}

/** Descriptive, label-free measures of one run. */
export async function buildReport(db: Db, runId: string, notes: RunNotes): Promise<RunReport> {
  const logs = await db.select().from(fetchLog).where(eq(fetchLog.runId, runId))
  const itemsPerOutlet: RunReport['itemsPerOutlet'] = {}
  for (const l of logs) {
    const row = (itemsPerOutlet[l.outletId] ??= { seen: 0, new: 0, failed: 0 })
    row.seen += l.itemsSeen
    row.new += l.itemsNew
    if (!l.ok) row.failed++
  }
  const skippedRows = await db
    .select({ reason: sourceItems.skipReason, n: sql<number>`count(*)::int` })
    .from(sourceItems)
    .where(and(eq(sourceItems.firstRunId, runId), eq(sourceItems.state, 'skipped')))
    .groupBy(sourceItems.skipReason)
  const unsure = await db.$count(sourceItems, eq(sourceItems.state, 'unsure'))
  const live = await db.$count(situations, and(isNull(situations.mergedIntoId), ne(situations.phase, 'ended')))
  const oneOff = await db.$count(situations, and(isNull(situations.mergedIntoId), ne(situations.phase, 'ended'), eq(situations.scope, 'one_off')))
  const allLive = await db.$count(situations, isNull(situations.mergedIntoId))
  const liveCategories = await db.$count(categories, isNull(categories.mergedIntoId))
  const touchedLive = [...notes.touched].filter((id) => !notes.merged.has(id)).length
  const [run] = await db.select().from(runs).where(eq(runs.id, runId))
  const failedCalls = await db.$count(llmCalls, and(eq(llmCalls.runId, runId), eq(llmCalls.ok, false)))
  const cited = await db
    .select({ citedUrl: sourceItems.citedUrl })
    .from(sourceItems)
    .where(and(eq(sourceItems.firstRunId, runId), sql`${sourceItems.citedUrl} is not null`))
  const suggestions = new Map<string, number>()
  for (const { citedUrl } of cited) {
    let host: string
    try {
      host = new URL(citedUrl!).hostname
    } catch {
      continue
    }
    if (hostAllowed(host, LISTED_HOSTS)) continue
    const domain = registrableDomain(host)
    suggestions.set(domain, (suggestions.get(domain) ?? 0) + 1)
  }
  return {
    itemsPerOutlet,
    skipped: Object.fromEntries(skippedRows.map((r) => [r.reason ?? '(none)', r.n])),
    unsure,
    situationsOpened: notes.opened.size,
    situationsEnded: notes.ended.size,
    mergedThisRun: notes.merged.size,
    duplicateRate: ratio(notes.merged.size, touchedLive),
    oneOffShare: ratio(oneOff, live),
    categoriesPer100: Math.round(ratio(liveCategories, allLive) * 100 * 100) / 100,
    onMap: (await loadLiveView(db)).situations.filter((s) => s.onMap).length,
    unmatchedCountries: notes.unmatchedCountries,
    rejectedUrls: notes.rejectedUrls,
    unknownRoles: notes.unknownRoles,
    roleChangesUnsupported: notes.roleChangesUnsupported,
    llmFailures: failedCalls + notes.llmFailures.length,
    transportFailures: notes.llmFailures.filter((f) => f.kind === 'transport').length,
    llmFailureNotes: notes.llmFailures,
    fetchFailures: logs.filter((l) => !l.ok || l.error).map((l) => ({ outletId: l.outletId, error: l.error })),
    spend: { run: Number(run.spentUsd), keyBefore: usage(run.keyBefore), keyAfter: usage(run.keyAfter) },
    suggestedOutlets: [...suggestions].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count).slice(0, 15),
  }
}

/** Saves the report into runs.report, keeping the pass markers already there. */
export async function saveReport(db: Db, runId: string, report: RunReport): Promise<void> {
  await db
    .update(runs)
    .set({ report: sql`coalesce(${runs.report}, '{}'::jsonb) || ${JSON.stringify(report)}::jsonb` })
    .where(eq(runs.id, runId))
}

export function formatReport(run: { id: string; kind: string; simDay: string | null; status: string; ceilingUsd: string; spentUsd: string }, r: RunReport): string {
  const lines: string[] = []
  const row = (label: string, value: string | number) => lines.push(`${label.padEnd(26)} ${value}`)
  lines.push(`run ${run.id} · ${run.kind}${run.simDay ? ` · day ${run.simDay}` : ''} · ${run.status}`)
  row('spend this run (USD)', `${Number(run.spentUsd).toFixed(6)} of ceiling ${Number(run.ceilingUsd).toFixed(4)}`)
  row(run.kind === 'backfill' ? 'key usage, whole backfill' : 'key usage before / after', `${r.spend.keyBefore ?? '?'} / ${r.spend.keyAfter ?? '?'}`)
  row('situations opened', r.situationsOpened)
  row('situations ended', r.situationsEnded)
  row('merged this run', r.mergedThisRun)
  row('duplicate rate', r.duplicateRate)
  row('one-off share', r.oneOffShare)
  row('categories per 100', r.categoriesPer100)
  row('on the map', r.onMap)
  row('items unsure', r.unsure)
  row('llm failures', r.llmFailures)
  row('batches lost to transport', r.transportFailures ?? 0)
  row('skipped', Object.entries(r.skipped).map(([k, v]) => `${k}: ${v}`).join(', ') || '0')
  row('unmatched countries', Object.entries(r.unmatchedCountries).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none')
  row('items with a non-http url', r.rejectedUrls)
  row('unknown role words', Object.entries(r.unknownRoles).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none')
  row('role changes without a quote', r.roleChangesUnsupported)
  row('suggested outlets', r.suggestedOutlets.map((s) => `${s.domain} ×${s.count}`).join(', ') || 'none')
  lines.push('', `${'outlet'.padEnd(22)} ${'seen'.padStart(5)} ${'new'.padStart(5)} failed`)
  for (const [id, v] of Object.entries(r.itemsPerOutlet).sort()) {
    lines.push(`${id.padEnd(22)} ${String(v.seen).padStart(5)} ${String(v.new).padStart(5)} ${v.failed ? 'yes' : ''}`)
  }
  if ((r.llmFailureNotes ?? []).length > 0) {
    lines.push('', 'batches lost this run (their items wait for the next run):')
    for (const f of r.llmFailureNotes) lines.push(`  ${f.stage} · ${f.kind ?? 'output'}: ${f.message}`)
  }
  if (r.fetchFailures.length > 0) {
    lines.push('', 'fetch problems:')
    for (const f of r.fetchFailures) lines.push(`  ${f.outletId}: ${f.error}`)
  }
  return lines.join('\n')
}

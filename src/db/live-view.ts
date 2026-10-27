import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { Db } from './client.ts'
import { categories, eventItems, involvements, outlets, runs, situationEvents, situations, sourceItems } from './schema.ts'

export interface LiveInvolvement {
  countryKey: string
  role: string
  entry: string
  joinedOn: string
  leftOn: string | null
}

export interface LiveSource {
  outletName: string
  ownerType: string
  region: string
  publishedAt: Date | null
  headline: string
  url: string
}

export interface LiveSituation {
  id: string
  title: string
  oneLine: string
  since: string | null
  phase: 'active' | 'easing' | 'quiet' | 'ended'
  categoryPath: string[]
  scope: string
  major: boolean
  onMap: boolean
  involved: LiveInvolvement[]
  sources: LiveSource[]
  outletCount: number
  regionCount: number
  independentCount: number
  stateRunCount: number
  latestEventAt: Date | null
}

export interface LiveView {
  updatedAt: Date | null
  outletCount: number
  situations: LiveSituation[]
}

interface CategoryRow {
  id: string
  name: string
  parentId: string | null
  mergedIntoId: string | null
}

export function categoryPath(id: string | null, byId: Map<string, CategoryRow>): string[] {
  const path: string[] = []
  const seen = new Set<string>()
  let current = id
  while (current && !seen.has(current)) {
    seen.add(current)
    const row = byId.get(current)
    if (!row) break
    if (row.mergedIntoId) {
      current = row.mergedIntoId
      continue
    }
    path.unshift(row.name)
    current = row.parentId
  }
  return path
}

/** Decided #5 and #12: two or more distinct non-state outlets, ongoing or a major one-off, not ended or merged. */
export function isOnMap(s: { phase: string; mergedIntoId: string | null; scope: string; major: boolean }, independentCount: number): boolean {
  return s.phase !== 'ended' && s.mergedIntoId === null && independentCount >= 2 && (s.scope === 'ongoing' || s.major)
}

export async function loadLiveView(db: Db): Promise<LiveView> {
  const [lastRun] = await db
    .select({ finishedAt: runs.finishedAt })
    .from(runs)
    .where(and(inArray(runs.status, ['ok', 'stopped_ceiling']), sql`${runs.finishedAt} is not null`))
    .orderBy(desc(runs.finishedAt))
    .limit(1)
  const outletCount = await db.$count(outlets, eq(outlets.active, true))
  const rows = await db
    .select()
    .from(situations)
    .where(and(ne(situations.phase, 'ended'), isNull(situations.mergedIntoId)))
    .orderBy(desc(situations.lastEventAt), asc(situations.id))
  if (rows.length === 0) return { updatedAt: lastRun?.finishedAt ?? null, outletCount, situations: [] }

  const ids = rows.map((r) => r.id)
  const categoryRows = await db
    .select({ id: categories.id, name: categories.name, parentId: categories.parentId, mergedIntoId: categories.mergedIntoId })
    .from(categories)
  const byCategory = new Map(categoryRows.map((c) => [c.id, c]))
  const involvementRows = await db
    .select()
    .from(involvements)
    .where(inArray(involvements.situationId, ids))
    .orderBy(asc(involvements.joinedOn), asc(involvements.id))
  const sourceRows = await db
    .selectDistinctOn([situationEvents.situationId, sourceItems.id], {
      situationId: situationEvents.situationId,
      itemId: sourceItems.id,
      outletId: outlets.id,
      outletName: outlets.name,
      ownerType: outlets.ownerType,
      region: outlets.region,
      publishedAt: sql<Date | null>`coalesce(${sourceItems.publishedAt}, ${sourceItems.fetchedAt})`.mapWith((v) => (v ? new Date(v) : null)),
      headline: sourceItems.headline,
      url: sourceItems.url,
    })
    .from(situationEvents)
    .innerJoin(eventItems, eq(eventItems.eventId, situationEvents.eventId))
    .innerJoin(sourceItems, eq(sourceItems.id, eventItems.sourceItemId))
    .innerJoin(outlets, eq(outlets.id, sourceItems.outletId))
    .where(inArray(situationEvents.situationId, ids))

  return {
    updatedAt: lastRun?.finishedAt ?? null,
    outletCount,
    situations: rows.map((s) => {
      const sources = sourceRows
        .filter((r) => r.situationId === s.id)
        .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
      const distinct = new Map(sources.map((r) => [r.outletId, r]))
      const independentCount = [...distinct.values()].filter((r) => r.ownerType !== 'state-run').length
      return {
        id: s.id,
        title: s.title,
        oneLine: s.oneLine,
        since: s.startedOn,
        phase: s.phase,
        categoryPath: categoryPath(s.categoryId, byCategory),
        scope: s.scope,
        major: s.major,
        onMap: isOnMap(s, independentCount),
        involved: involvementRows
          .filter((i) => i.situationId === s.id)
          .map((i) => ({ countryKey: i.countryKey, role: i.role, entry: i.entry, joinedOn: i.joinedOn, leftOn: i.leftOn })),
        sources: sources.map(({ outletName, ownerType, region, publishedAt, headline, url }) => ({
          outletName, ownerType, region, publishedAt, headline, url,
        })),
        outletCount: distinct.size,
        regionCount: new Set([...distinct.values()].map((r) => r.region)).size,
        independentCount,
        stateRunCount: distinct.size - independentCount,
        latestEventAt: s.lastEventAt,
      }
    }),
  }
}

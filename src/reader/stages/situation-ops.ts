import { and, eq, isNull, sql } from 'drizzle-orm'
import { involvements, situations } from '../../db/schema.ts'
import type { DbOrTx, RunNotes } from '../context.ts'
import { matchCountry } from '../countries.ts'

export type Phase = 'active' | 'easing' | 'quiet' | 'ended'
export type PhaseSignal = 'none' | 'escalation' | 'easing' | 'resolution'

export interface PhaseState {
  phase: Phase
  resolutionSignalAt: Date | null
  endedOn: string | null
}

/**
 * What a new item does to its situation's phase. The model's signal can revive or change the
 * phase; only lifecycle code moves a situation to quiet or ended.
 */
export function nextPhase(current: PhaseState, signal: PhaseSignal, itemAt: Date): PhaseState {
  const next: PhaseState = { ...current }
  if (next.phase === 'ended') {
    next.phase = signal === 'easing' || signal === 'resolution' ? 'easing' : 'active'
    next.endedOn = null
    next.resolutionSignalAt = null
  }
  if (signal === 'escalation') {
    next.phase = 'active'
    // A flare-up cancels an earlier resolution: ending falls back to the long silence rule.
    next.resolutionSignalAt = null
  } else if (signal === 'easing') {
    if (next.phase === 'active' || next.phase === 'quiet') next.phase = 'easing'
  } else if (signal === 'resolution') {
    next.resolutionSignalAt = itemAt
    if (next.phase === 'quiet') next.phase = 'easing'
  } else if (next.phase === 'quiet') {
    next.phase = 'active'
  }
  return next
}

export interface InvolvementChange {
  country: string
  role: string
  change: 'pulled_in' | 'joined' | 'stepped_out'
}

/** Applies involvement changes through the map's country list; returns whether any row changed. */
export async function applyInvolvement(
  db: DbOrTx,
  notes: RunNotes,
  situationId: string,
  changes: InvolvementChange[],
  itemId: string,
  day: string,
): Promise<boolean> {
  let changed = false
  for (const c of changes) {
    const match = matchCountry(c.country)
    if (!match) {
      const name = c.country.trim() || '(empty)'
      notes.unmatchedCountries[name] = (notes.unmatchedCountries[name] ?? 0) + 1
      continue
    }
    const role = c.role.trim().toLowerCase() || 'involved'
    const [open] = await db
      .select()
      .from(involvements)
      .where(and(eq(involvements.situationId, situationId), eq(involvements.countryKey, match.key), isNull(involvements.leftOn)))
    if (c.change === 'stepped_out') {
      if (open) {
        await db.update(involvements).set({ leftOn: day, leftCauseItemId: itemId }).where(eq(involvements.id, open.id))
        changed = true
      }
      continue
    }
    if (open && open.role === role) continue
    if (open) {
      await db.update(involvements).set({ leftOn: day, leftCauseItemId: itemId }).where(eq(involvements.id, open.id))
    }
    await db.insert(involvements).values({
      situationId, countryKey: match.key, role, entry: c.change, joinedOn: day, joinedCauseItemId: itemId,
    })
    changed = true
  }
  return changed
}

export async function openCountries(db: DbOrTx, situationId: string, nameOf: (key: string) => string): Promise<string> {
  const rows = await db
    .select({ countryKey: involvements.countryKey, role: involvements.role })
    .from(involvements)
    .where(and(eq(involvements.situationId, situationId), isNull(involvements.leftOn)))
  return rows.map((r) => `${nameOf(r.countryKey)} (${r.role})`).join(', ')
}

/** Follows merged_into links to the situation that holds the story now. */
export async function liveSituationId(db: DbOrTx, id: string): Promise<string> {
  let current = id
  for (let i = 0; i < 20; i++) {
    const [row] = await db.select({ mergedIntoId: situations.mergedIntoId }).from(situations).where(eq(situations.id, current))
    if (!row?.mergedIntoId) return current
    current = row.mergedIntoId
  }
  return current
}

export const greatest = (column: unknown, value: Date) => sql`greatest(coalesce(${column}, ${value}), ${value})`

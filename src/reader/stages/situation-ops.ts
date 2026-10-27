import { and, eq, isNull, sql } from 'drizzle-orm'
import { involvements, situations } from '../../db/schema.ts'
import type { DbOrTx, RunNotes } from '../context.ts'
import { matchCountry } from '../countries.ts'
import { normalizeRole } from '../roles.ts'

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
  change: 'pulled_in' | 'joined' | 'stepped_out' | 'role_changed' | 'unchanged'
  evidence?: string | null
}

/** Shortest quote accepted as evidence for a role change. */
export const MIN_EVIDENCE_CHARS = 15

const normalised = (text: string) => text.toLowerCase().replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()

/** Whether `evidence` is a quote of at least MIN_EVIDENCE_CHARS that appears in the item's own text. */
export function evidenceInItem(evidence: string | null | undefined, itemText: string): boolean {
  const quote = normalised(evidence ?? '').replace(/^["'“”‘’]+|["'“”‘’.…]+$/g, '').trim()
  return quote.length >= MIN_EVIDENCE_CHARS && normalised(itemText).includes(quote)
}

/**
 * Applies involvement changes through the map's country list and the fixed role set; returns whether
 * any row changed. A country already involved keeps its open row unless the change is stepped_out, or
 * role_changed with a quote from the item's own text (`itemText`) as evidence, so a model naming the
 * same part with another word does not close and reopen rows.
 */
export async function applyInvolvement(
  db: DbOrTx,
  notes: RunNotes,
  situationId: string,
  changes: InvolvementChange[],
  itemId: string,
  day: string,
  itemText: string,
): Promise<boolean> {
  let changed = false
  for (const c of changes) {
    if (c.change === 'unchanged') continue
    const match = matchCountry(c.country)
    if (!match) {
      const name = c.country.trim() || '(empty)'
      notes.unmatchedCountries[name] = (notes.unmatchedCountries[name] ?? 0) + 1
      continue
    }
    const role = normalizeRole(c.role)
    if (!role) {
      const word = c.role.trim() || '(empty)'
      notes.unknownRoles[word] = (notes.unknownRoles[word] ?? 0) + 1
      continue
    }
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
    if (open && (c.change !== 'role_changed' || open.role === role)) continue
    if (open && !evidenceInItem(c.evidence, itemText)) {
      notes.roleChangesUnsupported++
      continue
    }
    if (open) {
      await db.update(involvements).set({ leftOn: day, leftCauseItemId: itemId }).where(eq(involvements.id, open.id))
    }
    const entry = c.change === 'joined' ? 'joined' : c.change === 'role_changed' && open ? open.entry : 'pulled_in'
    await db.insert(involvements).values({
      situationId, countryKey: match.key, role, entry, joinedOn: day, joinedCauseItemId: itemId,
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

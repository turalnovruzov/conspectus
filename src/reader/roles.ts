import { z } from 'zod'

/** The only role words stored on an involvement. The read and judge prompts list them verbatim. */
export const ROLES = ['party', 'attacker', 'target', 'host', 'mediator', 'supporting', 'affected', 'sanctioning', 'voting'] as const
export type Role = (typeof ROLES)[number]

const SYNONYMS: Record<string, Role> = {
  parties: 'party', belligerent: 'party', combatant: 'party', participant: 'party', side: 'party', 'main party': 'party',
  attacking: 'attacker', aggressor: 'attacker', invader: 'attacker', occupier: 'attacker', striking: 'attacker',
  attacked: 'target', targeted: 'target', victim: 'target', defender: 'target', defending: 'target',
  hosting: 'host', 'host country': 'host',
  mediating: 'mediator', mediation: 'mediator', broker: 'mediator', facilitator: 'mediator', negotiator: 'mediator',
  support: 'supporting', supporter: 'supporting', backer: 'supporting', backing: 'supporting', ally: 'supporting', allied: 'supporting',
  impacted: 'affected', 'affected party': 'affected',
  sanctioner: 'sanctioning', 'imposing sanctions': 'sanctioning',
  voter: 'voting', 'holding election': 'voting', 'holding elections': 'voting',
}

/** The allowed role a model's word stands for, or null when it names none of them. */
export function normalizeRole(word: unknown): Role | null {
  if (typeof word !== 'string') return null
  const w = word.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if ((ROLES as readonly string[]).includes(w)) return w as Role
  return SYNONYMS[w] ?? null
}

export type UnknownRoleSink = (word: string) => void

/**
 * A list of `{ …, role }` entries whose roles are mapped onto ROLES before validation; an entry whose
 * word maps to none is dropped and handed to `onUnknown`, so one stray word never fails a whole batch.
 */
export function withRoles<T extends z.ZodRawShape>(shape: T, onUnknown: UnknownRoleSink = () => {}) {
  return z.preprocess(
    (value) => {
      if (!Array.isArray(value)) return value
      return value.flatMap((entry) => {
        if (typeof entry !== 'object' || entry === null) return [entry]
        const role = normalizeRole((entry as { role?: unknown }).role)
        if (role) return [{ ...entry, role }]
        onUnknown(String((entry as { role?: unknown }).role ?? ''))
        return []
      })
    },
    z.array(z.object({ ...shape, role: z.enum(ROLES) })),
  )
}

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { jsonSchemaOf } from './llm'
import { judgeSchema } from './prompts/judge'
import { READ_SYSTEM, readSchemaFor } from './prompts/read'
import { JUDGE_SYSTEM } from './prompts/judge'
import { ROLES, normalizeRole, withRoles } from './roles'

describe('roles', () => {
  it('keeps every allowed role and is case and spacing tolerant', () => {
    for (const r of ROLES) expect(normalizeRole(r)).toBe(r)
    expect(normalizeRole('  Mediator ')).toBe('mediator')
  })

  it.each([
    ['attacking', 'attacker'], ['aggressor', 'attacker'], ['attacked', 'target'], ['belligerent', 'party'],
    ['backing', 'supporting'], ['ally', 'supporting'], ['mediating', 'mediator'], ['hosting', 'host'], ['impacted', 'affected'],
  ])('maps %s to %s', (word, role) => {
    expect(normalizeRole(word)).toBe(role)
  })

  it('returns null for a word outside the set', () => {
    expect(normalizeRole('overlord')).toBeNull()
    expect(normalizeRole('')).toBeNull()
    expect(normalizeRole(undefined)).toBeNull()
  })

  it('drops an entry with an unknown role and reports the word, keeping the rest', () => {
    const seen: string[] = []
    const schema = withRoles({ name: z.string() }, (w) => seen.push(w))
    expect(schema.parse([{ name: 'A', role: 'Backing' }, { name: 'B', role: 'overlord' }])).toEqual([{ name: 'A', role: 'supporting' }])
    expect(seen).toEqual(['overlord'])
  })

  it('a read output with an unknown role still validates', () => {
    const seen: string[] = []
    const out = readSchemaFor((w) => seen.push(w)).parse({
      items: [{ i: 1, relevant: true, skipReason: null, event: 'x', needsArticle: false, countries: [{ name: 'Chad', role: 'bystander' }] }],
    })
    expect(out.items[0].countries).toEqual([])
    expect(seen).toEqual(['bystander'])
  })

  it('the JSON schema sent to the model offers only the role set and the four changes', () => {
    const text = JSON.stringify(jsonSchemaOf(judgeSchema))
    expect(text).toContain(JSON.stringify([...ROLES]))
    expect(text).toContain(JSON.stringify(['pulled_in', 'joined', 'stepped_out', 'role_changed']))
  })

  it('both prompts list the role set', () => {
    for (const system of [READ_SYSTEM, JUDGE_SYSTEM]) expect(system).toContain(ROLES.join(', '))
    expect(JUDGE_SYSTEM).toContain('role_changed')
  })
})

export interface Involvement {
  country: string
  role: string
}

export interface Situation {
  id: string
  kind: string
  involved: Involvement[]
}

export type InvolvementState = 'pulled-in' | 'joined'

export interface Fill {
  role: string
  involvement: InvolvementState
}

export function involvementState(role: string): InvolvementState {
  return role === 'party' ? 'pulled-in' : 'joined'
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Invalid situation data: "${field}" must be a non-empty string`)
  }
  return value
}

export function parseSituations(raw: unknown): Situation[] {
  const list = (raw as { situations?: unknown } | null)?.situations
  if (!Array.isArray(list)) {
    throw new Error('Invalid situation data: "situations" must be an array')
  }
  const seen = new Set<string>()
  return list.map((item: Record<string, unknown>, i) => {
    const id = nonEmptyString(item?.id, `situations[${i}].id`)
    if (seen.has(id)) {
      throw new Error(`Invalid situation data: duplicate "id" ${id}`)
    }
    seen.add(id)
    const kind = nonEmptyString(item.kind, `situations[${i}].kind`)
    if (!Array.isArray(item.involved)) {
      throw new Error(`Invalid situation data: "situations[${i}].involved" must be an array`)
    }
    const involved = item.involved.map((inv: Record<string, unknown>, j) => ({
      country: nonEmptyString(inv?.country, `situations[${i}].involved[${j}].country`),
      role: nonEmptyString(inv?.role, `situations[${i}].involved[${j}].role`),
    }))
    return { id, kind, involved }
  })
}

export function situationsForCountry(list: Situation[], countryKey: string): Situation[] {
  return list.filter((s) => s.involved.some((inv) => inv.country === countryKey))
}

export function countryFills(list: Situation[], selectedId: string | null): Map<string, Fill> {
  const fills = new Map<string, Fill>()
  for (const s of list) {
    if (selectedId !== null && s.id !== selectedId) continue
    for (const inv of s.involved) {
      if (fills.has(inv.country)) continue
      fills.set(inv.country, { role: inv.role, involvement: involvementState(inv.role) })
    }
  }
  return fills
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function involvementLines(situation: Situation, nameOf: (key: string) => string): string[] {
  const byRole = new Map<string, string[]>()
  for (const inv of situation.involved) {
    const names = byRole.get(inv.role) ?? []
    names.push(nameOf(inv.country))
    byRole.set(inv.role, names)
  }
  const lines: string[] = []
  const parties = byRole.get('party')
  if (parties) lines.push(parties.join(', '))
  for (const [role, names] of byRole) {
    if (role !== 'party') lines.push(`${capitalise(role)}: ${names.join(', ')}`)
  }
  return lines
}

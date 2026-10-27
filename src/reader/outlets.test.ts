import { describe, expect, it } from 'vitest'
import { OUTLETS, hostAllowed, isIndependent } from './outlets'

describe('OUTLETS', () => {
  it('has 33 outlets, unique ids, no domain in two outlets\' hosts', () => {
    expect(OUTLETS).toHaveLength(33)
    expect(new Set(OUTLETS.map((o) => o.id)).size).toBe(33)
    const all = OUTLETS.flatMap((o) => o.hosts)
    expect(new Set(all).size).toBe(all.length)
    for (const o of OUTLETS) {
      for (const other of OUTLETS) {
        if (o === other) continue
        for (const h of o.hosts) expect(hostAllowed(h, other.hosts), `${o.id} ${h} vs ${other.id}`).toBe(false)
      }
    }
  })

  it('gives every row name, url, region, ownerType, language, format, ownerSource, non-empty hosts', () => {
    for (const o of OUTLETS) {
      for (const field of ['name', 'url', 'region', 'ownerType', 'language', 'format', 'ownerSource'] as const) {
        expect(o[field], `${o.id}.${field}`).toBeTruthy()
      }
      expect(o.hosts.length, o.id).toBeGreaterThan(0)
    }
  })

  it('has exactly Kyodo and Global Times as html, exactly Wikipedia as mediawiki', () => {
    expect(OUTLETS.filter((o) => o.format === 'html').map((o) => o.name).sort()).toEqual(['Global Times', 'Kyodo'])
    expect(OUTLETS.filter((o) => o.format === 'mediawiki').map((o) => o.name)).toEqual(['Wikipedia Current events'])
  })

  it('has every url on one of its own hosts', () => {
    for (const o of OUTLETS) expect(hostAllowed(new URL(o.url).hostname, o.hosts), o.id).toBe(true)
  })

  it('groups state-* owners as state-run', () => {
    const stateRun = OUTLETS.filter((o) => o.ownerType === 'state-run').map((o) => o.name).sort()
    expect(stateRun).toEqual(
      ['Al Jazeera', 'Anadolu Agency', 'CNA', 'Global Times', 'RT', 'Tehran Times', 'The National', 'Yonhap', 'teleSUR'].sort(),
    )
    for (const o of OUTLETS) expect(isIndependent(o)).toBe(o.ownerType !== 'state-run')
  })
})

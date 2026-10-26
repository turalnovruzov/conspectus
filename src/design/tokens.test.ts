import { describe, expect, it } from 'vitest'
import tokensCss from './tokens.css?raw'
import componentsCss from './components.css?raw'
import { contrast, hexToRgb, luminance } from './contrast'

const tokens = new Map<string, string>()
for (const m of tokensCss.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens.set(m[1], m[2].trim())

function value(name: string): string {
  const raw = tokens.get(name)
  if (raw === undefined) throw new Error(`undefined token ${name}`)
  const ref = raw.match(/^var\((--[\w-]+)\)$/)
  return ref ? value(ref[1]) : raw
}
const hex = (name: string) => hexToRgb(value(name))
const resolved = (name: string): string =>
  value(name).replace(/var\((--[\w-]+)\)/g, (_, ref: string) => resolved(ref))
const hexIn = (name: string) => hexToRgb(resolved(name).match(/#[0-9a-f]{6}/i)![0])
const ratio = (fg: string, bg: string) => contrast(hex(fg), hex(bg))

const boardColours: Record<string, string> = {
  '--color-ground': '#0B0D12',
  '--color-land': '#1C2130',
  '--color-land-edge': '#2C3345',
  '--color-line': '#3A3F4B',
  '--color-edge': '#5A6173',
  '--color-text': '#F2F2F2',
  '--color-text-2': '#C9CDD6',
  '--color-label': '#A0A6B4',
  '--color-text-struck': '#8A90A0',
  '--color-joined': '#D8DBE2',
  '--color-accent': '#FF6A45',
  '--color-accent-text': '#FF8A6B',
  '--color-accent-hover': '#FF9478',
  '--color-on-accent': '#0B0D12',
  '--color-control-line': '#5A6173',
}

const rule = (selector: string) => {
  const m = componentsCss.match(new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))
  if (!m) throw new Error(`no rule ${selector}`)
  return m[1]
}

describe('guards', () => {
  it('has something to check', () => {
    expect(tokens.size).toBeGreaterThanOrEqual(30)
    expect(componentsCss.match(/var\(--/g)?.length ?? 0).toBeGreaterThanOrEqual(1)
  })

  it('formula sanity', () => {
    expect(contrast(hexToRgb('#000000'), hexToRgb('#FFFFFF'))).toBeCloseTo(21, 5)
    expect(contrast(hexToRgb('#123456'), hexToRgb('#123456'))).toBe(1)
  })
})

describe('tokens', () => {
  it('defines every category', () => {
    for (const prefix of ['--color-', '--text-', '--weight-', '--space-', '--radius-', '--border-']) {
      expect([...tokens.keys()].some((k) => k.startsWith(prefix))).toBe(true)
    }
    const required = [
      ...Object.keys(boardColours),
      '--involvement-pulled-in-fill', '--involvement-joined-fill', '--involvement-stepped-out-fill',
      '--involvement-stepped-out-stroke', '--involvement-stepped-out-dash', '--involvement-glow-opacity',
      '--graph-edge', '--graph-edge-stepped-out-dash', '--graph-node-r', '--graph-node-focus-r',
      '--font-sans', '--font-mono', '--text-display', '--text-title', '--text-body-lg', '--text-body',
      '--text-small', '--text-label', '--weight-regular', '--weight-medium', '--weight-heavy',
      '--tracking-display', '--tracking-title', '--leading-display', '--leading-title', '--leading-body',
      '--leading-small', '--space-6', '--space-8', '--space-10', '--space-12', '--space-14', '--space-16',
      '--space-20', '--space-24', '--space-28', '--space-40', '--space-48', '--grid-columns', '--grid-gap',
      '--radius-sharp', '--radius-round', '--border-hairline', '--border-control', '--border-accent',
      '--border-stepped-out', '--control-h', '--control-h-lg', '--focus-ring',
    ]
    for (const name of required) expect(tokens.has(name), name).toBe(true)
  })

  it('colours match the Night side board', () => {
    for (const [name, want] of Object.entries(boardColours)) {
      expect(value(name).toLowerCase(), name).toBe(want.toLowerCase())
    }
  })

  it('text pairs reach 4.5:1', () => {
    const pairs: [string, string][] = [
      ['--color-text', '--color-ground'],
      ['--color-text-2', '--color-ground'],
      ['--color-label', '--color-ground'],
      ['--color-text-struck', '--color-ground'],
      ['--color-accent-text', '--color-ground'],
      ['--color-joined', '--color-ground'],
      ['--color-on-accent', '--color-accent'],
      ['--color-ground', '--color-text'],
      ['--color-ground', '--color-accent-hover'],
    ]
    for (const [fg, bg] of pairs) expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
  })

  it('control boundaries reach 3:1', () => {
    const ground = hex('--color-ground')
    expect(contrast(hex('--color-control-line'), ground)).toBeGreaterThanOrEqual(3)
    expect(contrast(hexIn('--border-stepped-out'), ground)).toBeGreaterThanOrEqual(3)
    expect(contrast(hexIn('--focus-ring'), ground)).toBeGreaterThanOrEqual(3)
    for (const sel of ['.btn-secondary', '.field-input']) {
      expect(rule(sel)).toContain('var(--border-control)')
      expect(rule(sel)).not.toContain('var(--border-hairline)')
    }
  })

  it('stepped out differs by more than hue', () => {
    expect(value('--involvement-stepped-out-fill')).toBe('none')
    expect(value('--involvement-stepped-out-dash').trim().length).toBeGreaterThan(0)
    expect(value('--border-stepped-out')).toContain('dashed')
    const l1 = luminance(hex('--involvement-pulled-in-fill'))
    const l2 = luminance(hex('--involvement-joined-fill'))
    const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    expect(r).toBeGreaterThan(1.5)
  })
})

describe('components', () => {
  it('use defined tokens only', () => {
    const used = [...componentsCss.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(0)
    for (const name of used) expect(tokens.has(name), name).toBe(true)
  })

  it('carry no raw colour', () => {
    expect(componentsCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/)
  })

  it('stepped-out tag is struck and dashed', () => {
    const r = rule('.tag-stepped-out')
    expect(r).toContain('line-through')
    expect(r).toContain('var(--border-stepped-out)')
  })
})

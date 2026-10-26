import { describe, expect, it } from 'vitest'
import stylesCss from './styles.css?raw'
import tokensCss from './design/tokens.css?raw'
import appSrc from './App.tsx?raw'
import mapSrc from './WorldMap.tsx?raw'
import listSrc from './SituationList.tsx?raw'
import mainSrc from './main.tsx?raw'

const tsx = { 'App.tsx': appSrc, 'WorldMap.tsx': mapSrc, 'SituationList.tsx': listSrc }
const sources = { 'styles.css': stylesCss, ...tsx }

describe('app uses the design system', () => {
  it('reads all four sources and styles.css uses tokens', () => {
    for (const [name, src] of Object.entries(sources)) expect(src.length, name).toBeGreaterThan(0)
    expect(stylesCss.match(/var\(--/g)?.length ?? 0).toBeGreaterThanOrEqual(10)
  })

  it('has no raw colour in the app files', () => {
    for (const [name, src] of Object.entries(sources)) {
      expect(src, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/)
    }
  })

  it('sets no SVG colour attributes and no inline style in the components', () => {
    for (const [name, src] of Object.entries(tsx)) {
      expect(src, name).not.toMatch(/\s(fill|stroke|stopColor|strokeWidth)=/)
      expect(src, name).not.toContain('style={{')
    }
  })

  it('only uses tokens that tokens.css defines', () => {
    const defined = new Set([...tokensCss.matchAll(/(--[\w-]+):/g)].map((m) => m[1]))
    const used = [...stylesCss.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(0)
    for (const name of used) expect(defined.has(name), name).toBe(true)
  })

  it('has no old font and no :root block', () => {
    expect(stylesCss).not.toContain('Space Grotesk')
    expect(stylesCss).not.toMatch(/:root\s*\{/)
  })

  it('imports the design CSS before styles.css', () => {
    const at = (file: string) => mainSrc.indexOf(file)
    for (const f of ['fonts.css', 'tokens.css', 'components.css']) expect(at(f), f).toBeGreaterThan(-1)
    expect(at('fonts.css')).toBeLessThan(at('tokens.css'))
    expect(at('tokens.css')).toBeLessThan(at('components.css'))
    expect(at('components.css')).toBeLessThan(at("'./styles.css'"))
  })
})

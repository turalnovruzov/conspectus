import { describe, expect, it } from 'vitest'
import html from '../../style-guide.html?raw'
import css from './style-guide.css?raw'
import tokensCss from './tokens.css?raw'

const defined = new Set([...tokensCss.matchAll(/(--[\w-]+):/g)].map((m) => m[1]))
const h2s = [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1].trim())

describe('style guide', () => {
  it('guards: something to check', () => {
    expect((html + css).match(/var\(--/g)?.length ?? 0).toBeGreaterThanOrEqual(1)
    expect(html.match(/<h2[\s>]/g)?.length).toBe(10)
  })

  it('uses defined tokens only', () => {
    for (const source of [html, css]) {
      for (const m of source.matchAll(/var\((--[\w-]+)\)/g)) expect(defined.has(m[1]), m[1]).toBe(true)
    }
  })

  it('carries no raw colour', () => {
    for (const source of [html, css]) expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/)
    expect(html).not.toMatch(/\s(fill|stroke|stop-color)=/)
  })

  it('has no third-party URL', () => {
    expect(html).not.toMatch(/(?:href|src)=["'](?:https?:)?\/\//)
  })

  it('has sections in order', () => {
    expect(h2s).toEqual([
      'Colour', 'Type', 'Spacing', 'Radius and borders', 'Buttons', 'Panel', 'Tags', 'Input',
      'Map involvement', 'Graph',
    ])
  })

  it('shows three involvement states', () => {
    for (const state of ['pulled-in', 'joined', 'stepped-out']) {
      expect(html).toContain(`data-involvement="${state}"`)
    }
  })
})

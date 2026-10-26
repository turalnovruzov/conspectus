import type { Page } from '@playwright/test'

export interface RenderedText {
  text: string
  fg: number[]
  bg: number[]
}

export function renderedText(page: Page): Promise<RenderedText[]> {
  return page.evaluate(() => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number)
    const opaque = (c: string) => {
      const p = parse(c)
      return p.length >= 3 && (p.length === 3 || p[3] > 0)
    }
    const out: { text: string; fg: number[]; bg: number[] }[] = []
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('svg')) continue
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim() !== '')
      if (!own || !(el as HTMLElement).offsetParent && getComputedStyle(el).position !== 'fixed') continue
      let bgEl: Element | null = el
      while (bgEl && !opaque(getComputedStyle(bgEl).backgroundColor)) bgEl = bgEl.parentElement
      const bg = bgEl ? parse(getComputedStyle(bgEl).backgroundColor) : [255, 255, 255]
      out.push({ text: el.textContent!.trim().slice(0, 30), fg: parse(getComputedStyle(el).color), bg })
    }
    return out
  })
}

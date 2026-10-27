import { parseHTML } from 'linkedom'
import { hostAllowed } from '../outlets.ts'
import type { OutletRef, RawItem } from '../types.ts'
import { collapse } from './text.ts'

// Confirmed against one live fetch of each index page on 2026-10-27.
export const ARTICLE_PATHS: Record<string, RegExp> = {
  kyodo: /^\/articles\/-\/\d+$/,
  'global-times': /^\/page\/\d{6}\/\d+\.shtml$/,
}

export function parseIndex(html: string, outlet: OutletRef, baseUrl: string = outlet.url): RawItem[] {
  const pattern = ARTICLE_PATHS[outlet.id]
  if (!pattern) return []
  const { document } = parseHTML(html)
  const headlines = new Map<string, string>()
  for (const a of document.querySelectorAll('a[href]')) {
    let url: URL
    try {
      url = new URL(a.getAttribute('href') ?? '', baseUrl)
    } catch {
      continue
    }
    if (!hostAllowed(url.hostname, outlet.hosts) || !pattern.test(url.pathname)) continue
    url.hash = ''
    const key = url.toString()
    const label = collapse(a.textContent ?? '') || collapse(a.querySelector('img')?.getAttribute('alt') ?? '')
    if ((headlines.get(key) ?? '').length < label.length) headlines.set(key, label)
    else if (!headlines.has(key)) headlines.set(key, label)
  }
  return [...headlines]
    .filter(([, headline]) => headline)
    .map(([url, headline]) => ({ outletId: outlet.id, url, headline, blurb: '', publishedAt: null, language: outlet.language }))
}

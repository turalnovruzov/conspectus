import { createHash } from 'node:crypto'
import { parseHTML } from 'linkedom'
import type { RawItem } from '../types.ts'
import { collapse } from './text.ts'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const WIKIPEDIA_OUTLET_ID = 'wikipedia'
const HEADLINE_MAX = 300

export function pageTitle(date: Date): string {
  return `Portal:Current_events/${date.getUTCFullYear()}_${MONTHS[date.getUTCMonth()]}_${date.getUTCDate()}`
}

export function currentEventsUrl(date: Date): string {
  return `https://en.wikipedia.org/w/api.php?action=parse&page=${pageTitle(date)}&prop=text&format=json&formatversion=2`
}

export function portalPageUrl(date: Date): string {
  return `https://en.wikipedia.org/wiki/${pageTitle(date)}`
}

// linkedom's element type is loose; only these members are used.
interface El {
  tagName: string
  textContent: string | null
  childNodes: ArrayLike<El> & Iterable<El>
  children: ArrayLike<El> & Iterable<El>
  nodeType: number
  classList?: { contains(c: string): boolean }
  getAttribute?(name: string): string | null
  querySelectorAll(selector: string): Iterable<El>
}

function ownText(li: El): string {
  let out = ''
  for (const node of li.childNodes) {
    if (node.nodeType === 1 && node.tagName === 'UL') break
    out += node.textContent ?? ''
  }
  return collapse(out)
}

function entryParts(li: El): { text: string; citedUrl: string | null } {
  let text = ''
  let citedUrl: string | null = null
  const walk = (node: El) => {
    if (node.nodeType === 3) {
      text += node.textContent ?? ''
      return
    }
    if (node.nodeType !== 1) return
    if (node.tagName === 'A' && node.classList?.contains('external')) {
      citedUrl ??= node.getAttribute?.('href') ?? null
      return
    }
    for (const child of node.childNodes) walk(child)
  }
  for (const child of li.childNodes) walk(child)
  return { text: collapse(text), citedUrl }
}

export function lineKey(text: string): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 10)
}

/** One item per leaf line of the day's Current events page. */
export function parseDay(json: unknown, date: Date): RawItem[] {
  const html = (json as { parse?: { text?: unknown } })?.parse?.text
  if (typeof html !== 'string') return []
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`)
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const items: RawItem[] = []
  const visit = (ul: El, path: string[]) => {
    for (const li of ul.children) {
      if (li.tagName !== 'LI') continue
      const nested = [...li.children].filter((c) => c.tagName === 'UL')
      if (nested.length > 0) {
        for (const child of nested) visit(child, [...path, ownText(li)])
        continue
      }
      const { text, citedUrl } = entryParts(li)
      if (!text) continue
      const headline = text.length > HEADLINE_MAX ? `${text.slice(0, HEADLINE_MAX - 1)}…` : text
      items.push({
        outletId: WIKIPEDIA_OUTLET_ID,
        url: citedUrl ?? `${portalPageUrl(day)}#${lineKey(text)}`,
        headline,
        blurb: `${path.filter(Boolean).join(' › ')} — ${text}`,
        publishedAt: day,
        language: 'en',
        citedUrl,
      })
    }
  }
  for (const content of document.querySelectorAll('.current-events-content') as Iterable<El>) {
    let section = ''
    for (const child of content.children) {
      if (child.tagName === 'P') section = collapse(child.textContent ?? '')
      else if (child.tagName === 'UL') visit(child, [section])
    }
  }
  return items
}

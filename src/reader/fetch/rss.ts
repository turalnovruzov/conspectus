import { XMLParser } from 'fast-xml-parser'
import type { OutletRef, RawItem } from '../types.ts'
import { htmlToText } from './text.ts'
import { httpUrl } from './url.ts'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  htmlEntities: true,
  isArray: (name) => name === 'item' || name === 'entry' || name === 'link',
})

type Node = Record<string, unknown>

function text(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return text(value[0])
  if (typeof value === 'object') return text((value as Node)['#text'])
  return ''
}

function linkOf(item: Node): string {
  const links = (item.link as unknown[] | undefined) ?? []
  const alternate = links.find((l) => typeof l === 'object' && l !== null && ((l as Node)['@_rel'] ?? 'alternate') === 'alternate')
  for (const l of alternate ? [alternate] : links) {
    const href = typeof l === 'object' && l !== null ? text((l as Node)['@_href'] ?? (l as Node)['#text']) : text(l)
    if (href.trim()) return href.trim()
  }
  const guid = text(item.guid).trim()
  if (/^https?:\/\//.test(guid)) return guid
  return text(item['@_about']).trim()
}

// Folha wraps every link in a click counter: https://redir.folha.com.br/...*https://www1.folha.uol.com.br/...
function unwrapRedirect(url: string): string {
  return url.match(/^https?:\/\/redir\.[^*]+\*(https?:\/\/.+)$/)?.[1] ?? url
}

function dateOf(item: Node): Date | null {
  const raw = text(item.pubDate ?? item.date ?? item.published ?? item.updated).trim()
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function parseFeed(xml: string, outlet: OutletRef): RawItem[] {
  const doc = parser.parse(xml) as Node
  const rss = doc.rss as Node | undefined
  const rdf = doc.RDF as Node | undefined
  const feed = doc.feed as Node | undefined
  const items = ((rss?.channel as Node | undefined)?.item ??
    rdf?.item ??
    (rdf?.channel as Node | undefined)?.item ??
    feed?.entry ??
    []) as Node[]
  const out: RawItem[] = []
  for (const item of items) {
    const headline = htmlToText(text(item.title))
    const link = linkOf(item)
    if (!headline || !link) continue
    const url = httpUrl(unwrapRedirect(link), outlet.url)
    if (!url) continue
    out.push({
      outletId: outlet.id,
      url,
      headline,
      blurb: htmlToText(text(item.description ?? item.summary ?? item.content ?? item.encoded)),
      publishedAt: dateOf(item),
      language: outlet.language,
    })
  }
  return out
}

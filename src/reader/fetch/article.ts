import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { type FetchFn, fetchText } from '../http.ts'
import { hostAllowed } from '../outlets.ts'
import type { OutletRef } from '../types.ts'
import { collapse } from './text.ts'

export const ARTICLE_MAX_CHARS = 12_000

export type ArticleResult = { text: string } | { refused: string } | { error: string }

export function extractArticle(html: string): string | null {
  const { document } = parseHTML(html)
  const parsed = new Readability(document as unknown as Document).parse()
  const text = collapse(parsed?.textContent ?? '')
  return text ? text.slice(0, ARTICLE_MAX_CHARS) : null
}

export async function fetchArticle(
  url: string,
  outlet: OutletRef,
  deps: { fetchFn?: FetchFn } = {},
): Promise<ArticleResult> {
  if (outlet.format === 'mediawiki') return { refused: 'wikipedia lines are never article-fetched' }
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return { refused: 'invalid url' }
  }
  if (!hostAllowed(host, outlet.hosts)) return { refused: 'off-list host' }
  const res = await fetchText(url, { allowedHosts: outlet.hosts, fetchFn: deps.fetchFn })
  if (!res.ok) return { error: res.error }
  try {
    const text = extractArticle(res.text)
    return text ? { text } : { error: 'no article text found' }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

import { hostAllowed } from './outlets.ts'

export const USER_AGENT = 'Conspectus/0.1 (+https://github.com/turalnovruzov/conspectus)'
export const REPO_URL = 'https://github.com/turalnovruzov/conspectus'

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export type FetchResult =
  | { ok: true; status: number; text: string; ms: number; url: string }
  | { ok: false; status: number | null; error: string; ms: number; url: string }

export interface FetchOptions {
  allowedHosts: readonly string[]
  fetchFn?: FetchFn
  timeoutMs?: number
  maxBytes?: number
}

const MAX_REDIRECTS = 5

function permitted(url: string, allowedHosts: readonly string[]): boolean {
  try {
    const u = new URL(url)
    return (u.protocol === 'https:' || u.protocol === 'http:') && hostAllowed(u.hostname, allowedHosts)
  } catch {
    return false
  }
}

function charsetOf(contentType: string | null, head: string): string {
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1]
  const fromXml = head.match(/^<\?xml[^>]*encoding=["']([\w-]+)["']/i)?.[1]
  const fromMeta = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1]
  return fromHeader ?? fromXml ?? fromMeta ?? 'utf-8'
}

function decode(bytes: Uint8Array, contentType: string | null): string {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  try {
    return new TextDecoder(charsetOf(contentType, head)).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer())
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

/** The only network path for outlet content: refuses any host outside `allowedHosts`, redirects included. Never throws. */
export async function fetchText(url: string, options: FetchOptions): Promise<FetchResult> {
  const { allowedHosts, fetchFn = fetch, timeoutMs = 20_000, maxBytes = 5_000_000 } = options
  const started = Date.now()
  const fail = (error: string, status: number | null, at: string): FetchResult => ({
    ok: false, status, error, ms: Date.now() - started, url: at,
  })
  let current = url
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!permitted(current, allowedHosts)) return fail(`refused: off-list host ${hostOf(current)}`, null, current)
      const res = await fetchFn(current, {
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        if (!location) return fail(`redirect ${res.status} without location`, res.status, current)
        current = new URL(location, current).toString()
        continue
      }
      if (res.status !== 200) return fail(`http ${res.status}`, res.status, current)
      const bytes = await readCapped(res, maxBytes)
      if (!bytes) return fail(`body over ${maxBytes} bytes`, res.status, current)
      return { ok: true, status: res.status, text: decode(bytes, res.headers.get('content-type')), ms: Date.now() - started, url: current }
    }
    return fail(`more than ${MAX_REDIRECTS} redirects`, null, current)
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), null, current)
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return '(invalid url)'
  }
}

/** The URL resolved against `base`, or null unless it is an http(s) URL. Every URL the reader stores passes through here. */
export function httpUrl(raw: string | null | undefined, base?: string): string | null {
  if (!raw?.trim()) return null
  try {
    const url = new URL(raw.trim(), base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

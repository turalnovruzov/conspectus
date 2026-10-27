import { describe, expect, it, vi } from 'vitest'
import { fetchText } from './http'

const bbc = ['bbc.co.uk', 'bbc.com', 'bbci.co.uk']

describe('fetchText', () => {
  it('sends the UA with the repo URL and no email', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => new Response('ok'))
    await fetchText('https://feeds.bbci.co.uk/news/world/rss.xml', { allowedHosts: bbc, fetchFn })
    const ua = (fetchFn.mock.calls[0][1]?.headers as Record<string, string>)['User-Agent']
    expect(ua).toContain('https://github.com/turalnovruzov/conspectus')
    expect(ua).not.toContain('@')
  })

  it('returns a non-200 as an error value, not a throw', async () => {
    const fetchFn = vi.fn(async () => new Response('no', { status: 403 }))
    expect(await fetchText('https://www.bbc.com/x', { allowedHosts: bbc, fetchFn })).toMatchObject({ ok: false, status: 403 })
  })

  it('returns a network error as an error value', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('socket hang up')
    })
    expect(await fetchText('https://www.bbc.com/x', { allowedHosts: bbc, fetchFn })).toMatchObject({ ok: false, error: 'socket hang up' })
  })

  it.each(['https://www.google.com/search?q=x', 'https://reuters.com/x', 'https://bbc.com.evil.test/x', 'file:///etc/passwd'])(
    'refuses %s without calling fetchFn',
    async (url) => {
      const fetchFn = vi.fn()
      expect(await fetchText(url, { allowedHosts: bbc, fetchFn })).toMatchObject({ ok: false })
      expect(fetchFn).not.toHaveBeenCalled()
    },
  )

  it('refuses a 301 from a listed host to an off-list host, never fetching its Location', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 301, headers: { location: 'https://evil.test/x' } }))
    const res = await fetchText('https://www.bbc.com/x', { allowedHosts: bbc, fetchFn })
    expect(res).toMatchObject({ ok: false })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('follows a 301 between two of BBC\'s hosts', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.startsWith('https://www.bbc.co.uk')
        ? new Response(null, { status: 301, headers: { location: 'https://www.bbc.com/news/1' } })
        : new Response('body'),
    )
    const res = await fetchText('https://www.bbc.co.uk/news/1', { allowedHosts: bbc, fetchFn })
    expect(res).toMatchObject({ ok: true, text: 'body', url: 'https://www.bbc.com/news/1' })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('decodes an ISO-8859-1 feed by its XML declaration', async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('<?xml version="1.0" encoding="ISO-8859-1"?><t>Elei'), 0xe7, 0xe3, 0x6f, ...new TextEncoder().encode('</t>')])
    const fetchFn = vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'text/xml' } }))
    const res = await fetchText('https://www.bbc.com/x', { allowedHosts: bbc, fetchFn })
    expect(res.ok && res.text).toContain('Eleição')
  })

  it('refuses a body over maxBytes', async () => {
    const fetchFn = vi.fn(async () => new Response('x'.repeat(100)))
    expect(await fetchText('https://www.bbc.com/x', { allowedHosts: bbc, fetchFn, maxBytes: 10 })).toMatchObject({ ok: false })
  })
})

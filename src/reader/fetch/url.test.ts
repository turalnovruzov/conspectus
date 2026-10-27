import { describe, expect, it } from 'vitest'
import { httpUrl } from './url'

describe('httpUrl', () => {
  it('keeps absolute http and https URLs, resolving relative ones against the base', () => {
    expect(httpUrl('https://www.example-news.test/a')).toBe('https://www.example-news.test/a')
    expect(httpUrl('http://www.example-news.test/a')).toBe('http://www.example-news.test/a')
    expect(httpUrl('/world/b', 'https://feeds.example-news.test/rss.xml')).toBe('https://feeds.example-news.test/world/b')
    expect(httpUrl('//www.example-news.test/c', 'https://en.wikipedia.org/')).toBe('https://www.example-news.test/c')
  })

  it.each([
    'javascript:alert(1)',
    ' JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://files.example.test/x',
    'file:///etc/passwd',
    'mailto:desk@example.test',
    'vbscript:msgbox(1)',
    '',
    '   ',
  ])('refuses %j', (raw) => {
    expect(httpUrl(raw, 'https://feeds.example-news.test/rss.xml')).toBeNull()
  })

  it('refuses a relative URL with no base', () => {
    expect(httpUrl('/world/b')).toBeNull()
    expect(httpUrl(null)).toBeNull()
  })
})

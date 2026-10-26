import { expect, test, type Page } from '@playwright/test'
import { contrast, type Rgb } from '../src/design/contrast'

const ORIGIN = 'http://localhost:4173'

async function open(page: Page) {
  await page.goto('/style-guide.html')
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
}

const style = (page: Page, selector: string, prop: string) =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)

test('no request leaves the local server', async ({ page }) => {
  const urls: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  await open(page)
  expect(urls.some((u) => u.includes('.woff2'))).toBe(true)
  for (const u of urls) expect(u.startsWith(ORIGIN), u).toBe(true)
})

test('fonts load from the repo', async ({ page }) => {
  await open(page)
  const faces = await page.evaluate(() =>
    [...document.fonts].map((f) => ({ family: f.family.replace(/^["']|["']$/g, ''), status: f.status })),
  )
  for (const family of ['Inter', 'JetBrains Mono']) {
    expect(faces.find((f) => f.family === family)?.status, family).toBe('loaded')
  }
  expect(await style(page, 'h1', 'font-family')).toMatch(/^Inter/)
  expect(await style(page, '.label-mono', 'font-family')).toMatch(/^"?JetBrains Mono/)
})

test('ground and text', async ({ page }) => {
  await open(page)
  expect(await style(page, 'body', 'background-color')).toBe('rgb(11, 13, 18)')
  expect(await style(page, 'body', 'color')).toBe('rgb(242, 242, 242)')
})

test('buttons', async ({ page }) => {
  await open(page)
  expect(await style(page, '.btn-primary', 'background-color')).toBe('rgb(242, 242, 242)')
  expect(await style(page, '.btn-primary', 'color')).toBe('rgb(11, 13, 18)')
  expect(await style(page, '.btn-primary', 'border-top-left-radius')).toBe('2px')
  const box = await page.locator('.btn-primary').first().boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  const secondary = page.locator('.btn-secondary').first()
  expect(await secondary.evaluate((el) => getComputedStyle(el).border)).toContain('1px solid rgb(90, 97, 115)')
  expect(await style(page, '.btn-accent', 'background-color')).toBe('rgb(255, 106, 69)')
  expect(await style(page, 'input[type="text"]', 'border-top-color')).toBe('rgb(90, 97, 115)')
})

test('involvement is told apart by more than hue', async ({ page }) => {
  await open(page)
  expect(await style(page, '[data-involvement="pulled-in"]', 'fill')).toBe('rgb(255, 106, 69)')
  expect(await style(page, '[data-involvement="joined"]', 'fill')).toBe('rgb(216, 219, 226)')
  expect(await style(page, '[data-involvement="stepped-out"]', 'fill')).toBe('none')
  expect(await style(page, '[data-involvement="stepped-out"]', 'stroke-dasharray')).not.toBe('none')
})

test('stepped-out tag is struck and dashed', async ({ page }) => {
  await open(page)
  expect(await style(page, '.tag-stepped-out', 'text-decoration-line')).toContain('line-through')
  expect(await style(page, '.tag-stepped-out', 'border-top-style')).toBe('dashed')
})

test('input has a label and a focus ring', async ({ page }) => {
  await open(page)
  const input = page.getByLabel('SEARCH COUNTRIES')
  await expect(input).toBeVisible()
  await input.focus()
  await expect(input).toBeFocused()
  expect(await input.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
})

test('rendered text contrast', async ({ page }) => {
  await open(page)
  const results = await page.evaluate(() => {
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
  expect(results.length).toBeGreaterThan(0)
  for (const r of results) {
    const ratio = contrast(r.fg.slice(0, 3) as Rgb, r.bg.slice(0, 3) as Rgb)
    expect(ratio, `${r.text} ${r.fg} on ${r.bg}`).toBeGreaterThanOrEqual(4.5)
  }
  console.log(`rendered text elements checked: ${results.length}`)
})

test('phone width 390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await open(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

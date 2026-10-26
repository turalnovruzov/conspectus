import { expect, test, type Page } from '@playwright/test'
import { contrast, type Rgb } from '../src/design/contrast'
import { renderedText } from './rendered-contrast'

const ORIGIN = 'http://localhost:4173'
const ACCENT = 'rgb(255, 106, 69)'
const JOINED = 'rgb(216, 219, 226)'
const LAND = 'rgb(28, 33, 48)'
const LINE = 'rgb(58, 63, 75)'
const TEXT = 'rgb(242, 242, 242)'
const GROUND = 'rgb(11, 13, 18)'

const country = (id: string) => '[data-country="' + id + '"]'
const css = (page: Page, selector: string, prop: string) =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('loads the page with the sample situations coloured', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Conspectus' })).toBeVisible()
  await expect(page.getByText('The world, from above')).toBeVisible()
  await expect(page.getByText('Sample data — made up')).toBeVisible()

  const cards = page.locator('button[data-situation]')
  await expect(cards).toHaveCount(3)
  for (const kind of ['Armed conflict', 'Mass protests', 'Diplomatic crisis']) {
    await expect(page.getByRole('button', { name: kind, exact: true })).toBeVisible()
  }

  const brazil = page.locator(country('076'))
  await expect(brazil).toHaveAttribute('data-state', 'party')
  await expect(brazil).toHaveAttribute('data-involvement', 'pulled-in')
  expect(await css(page, country('076'), 'fill')).toBe(ACCENT)

  const turkey = page.locator(country('792'))
  await expect(turkey).toHaveAttribute('data-state', 'supporting')
  await expect(turkey).toHaveAttribute('data-involvement', 'joined')
  expect(await css(page, country('792'), 'fill')).toBe(JOINED)
  await expect(turkey).not.toHaveAttribute('fill', /.*/)
  await expect(turkey).not.toHaveAttribute('stroke', /.*/)

  await expect(page.locator(country('276'))).toHaveAttribute('data-state', 'none')
  expect(await css(page, country('276'), 'fill')).toBe(LAND)
})

test('no country path carries a fill attribute', async ({ page }) => {
  await expect(page.locator('path[data-country]')).toHaveCount(177)
  await expect(page.locator('path[data-country][fill]')).toHaveCount(0)
})

test('picking a situation narrows the map and picking it again restores it', async ({ page }) => {
  const protests = page.getByRole('button', { name: 'Mass protests', exact: true })
  await protests.click()
  await expect(protests).toHaveAttribute('aria-pressed', 'true')
  expect(await protests.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(ACCENT)
  const crisis = page.getByRole('button', { name: 'Diplomatic crisis', exact: true })
  expect(await crisis.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(LINE)
  expect(await css(page, country('076'), 'fill')).toBe(ACCENT)
  await expect(page.locator(country('398'))).toHaveAttribute('data-state', 'none')

  await protests.click()
  await expect(protests).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator(country('398'))).toHaveAttribute('data-state', 'party')
})

test('picking a country filters the list, and Show all restores it', async ({ page }) => {
  const kazakhstan = page.locator(country('398'))
  await kazakhstan.click()
  await expect(kazakhstan).toHaveAttribute('data-selected', 'true')
  expect(await css(page, country('398'), 'stroke')).toBe(TEXT)
  await expect(page.getByText('Situations involving Kazakhstan')).toBeVisible()
  const cards = page.locator('button[data-situation]')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toHaveAccessibleName('Armed conflict')

  await page.getByRole('button', { name: 'Show all' }).click()
  await expect(cards).toHaveCount(3)
})

test('a country in no situation says so', async ({ page }) => {
  await page.locator(country('276')).click()
  await expect(page.getByText('No situations for Germany in the sample data.')).toBeVisible()
  await expect(page.locator('button[data-situation]')).toHaveCount(0)
})

test('the legend names the two roles and no stepped-out state', async ({ page }) => {
  const legend = page.locator('[data-legend]')
  await expect(legend).toContainText('Party')
  await expect(legend).toContainText('Supporting')
  await expect(legend).not.toContainText('Stepped out')
})

test('body uses the ground and text colours', async ({ page }) => {
  expect(await css(page, 'body', 'background-color')).toBe(GROUND)
  expect(await css(page, 'body', 'color')).toBe(TEXT)
})

test('fonts are self-hosted and applied', async ({ page }) => {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  const faces = await page.evaluate(() =>
    [...document.fonts].map((f) => ({ family: f.family.replace(/^["']|["']$/g, ''), status: f.status })),
  )
  for (const family of ['Inter', 'JetBrains Mono']) {
    expect(faces.find((f) => f.family === family)?.status, family).toBe('loaded')
  }
  expect(await css(page, 'h1', 'font-family')).toMatch(/^"?Inter/)
})

test('no request leaves the local server', async ({ page }) => {
  const urls: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  expect(urls.some((u) => u.includes('.woff2'))).toBe(true)
  for (const u of urls) expect(u.startsWith(ORIGIN), u).toBe(true)
})

test('rendered text contrast', async ({ page }) => {
  await page.locator(country('398')).click()
  const results = await renderedText(page)
  expect(results.length).toBeGreaterThan(0)
  for (const r of results) {
    const ratio = contrast(r.fg.slice(0, 3) as Rgb, r.bg.slice(0, 3) as Rgb)
    expect(ratio, `${r.text} ${r.fg} on ${r.bg}`).toBeGreaterThanOrEqual(4.5)
  }
  console.log(`map page text elements checked: ${results.length}`)
})

test.describe('phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the list sits under the map without horizontal scroll', async ({ page }) => {
    const map = await page.locator('svg.map').boundingBox()
    const aside = await page.locator('aside').boundingBox()
    expect(aside!.y).toBeGreaterThanOrEqual(map!.y + map!.height)
    await expect(page.getByRole('heading', { name: 'Conspectus' })).toBeVisible()
    await expect(page.getByText('Sample data — made up')).toBeVisible()
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(390)
  })
})

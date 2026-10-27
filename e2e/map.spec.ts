import { expect, test, type Page } from '@playwright/test'
import { contrast, type Rgb } from '../src/design/contrast'
import { renderedText } from './rendered-contrast'

const ORIGIN = 'http://localhost:4173'
const ACCENT = 'rgb(255, 106, 69)'
const JOINED = 'rgb(216, 219, 226)'
const LAND = 'rgb(28, 33, 48)'
const TEXT = 'rgb(242, 242, 242)'
const GROUND = 'rgb(11, 13, 18)'

const country = (id: string) => '[data-country="' + id + '"]'
const css = (page: Page, selector: string, prop: string) =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)

const ALPHA = 'Fixture border clash alpha'
const BETA = 'Fixture protests beta'
const GAMMA = 'Fixture standoff gamma'
const DISCLAIMER =
  'Compiled automatically from the news by an AI. It may not be fully accurate: every situation links to its sources.'

const alphaCard = (page: Page) => page.locator('[data-situation-card]').filter({ has: page.locator('button[data-situation]', { hasText: ALPHA }) })
const card = (page: Page, title: string) => page.getByRole('button', { name: title, exact: true })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('header, disclaimer and heading', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Conspectus' })).toBeVisible()
  await expect(page.getByText('The world, from above')).toBeVisible()
  await expect(page.locator('[data-live]')).toHaveText('LIVE · 7 OUTLETS · UPDATED 27 OCT 2026 06:05 UTC')
  await expect(page.locator('[data-disclaimer]')).toHaveText(DISCLAIMER)
  await expect(page.locator('[data-situations-heading]')).toHaveText('SITUATIONS · 3 FROM THE NEWS')
  await expect(page.getByText(/sample data/i)).toHaveCount(0)
})

test('only corroborated ongoing situations are listed', async ({ page }) => {
  const cards = page.locator('button[data-situation]')
  await expect(cards).toHaveCount(3)
  await expect(cards.nth(0)).toHaveAccessibleName(ALPHA)
  await expect(cards.nth(1)).toHaveAccessibleName(BETA)
  await expect(cards.nth(2)).toHaveAccessibleName(GAMMA)
  for (const hidden of ['delta', 'epsilon', 'zeta', 'eta']) await expect(page.getByText(new RegExp(`Fixture .* ${hidden}`))).toHaveCount(0)
  await expect(page.locator(country('643'))).toHaveAttribute('data-state', 'none')
  await expect(page.locator(country('250'))).toHaveAttribute('data-state', 'none')
})

test('the map draws involvement', async ({ page }) => {
  const kazakhstan = page.locator(country('398'))
  await expect(kazakhstan).toHaveAttribute('data-involvement', 'pulled-in')
  expect(await css(page, country('398'), 'fill')).toBe(ACCENT)
  await expect(page.locator(country('792'))).toHaveAttribute('data-involvement', 'joined')
  expect(await css(page, country('792'), 'fill')).toBe(JOINED)
  await expect(page.locator(country('762'))).toHaveAttribute('data-involvement', 'stepped-out')
  expect(await css(page, country('762'), 'fill')).toBe('none')
  expect(await css(page, country('762'), 'stroke-dasharray')).not.toBe('none')
  await expect(kazakhstan).not.toHaveAttribute('fill', /.*/)
  await expect(page.locator(country('124'))).toHaveAttribute('data-quiet', 'true')
  await expect(page.locator(country('076'))).not.toHaveAttribute('data-quiet', /.*/)
  const quiet = Number(await css(page, country('124'), 'opacity'))
  const living = Number(await css(page, country('076'), 'opacity'))
  expect(quiet).toBeLessThan(living)
  expect(await css(page, country('276'), 'fill')).toBe(LAND)
})

test('no country path carries a fill attribute', async ({ page }) => {
  await expect(page.locator('path[data-country]')).toHaveCount(177)
  await expect(page.locator('path[data-country][fill]')).toHaveCount(0)
})

test("picking a situation opens the board's panel", async ({ page }) => {
  await card(page, ALPHA).click()
  await expect(card(page, ALPHA)).toHaveAttribute('aria-pressed', 'true')
  const alpha = alphaCard(page)
  await expect(alpha).toHaveClass(/\bpanel\b/)
  await expect(page.locator('[data-situation-card]').nth(1)).toHaveClass(/panel-quiet/)
  await expect(alpha.locator('.kicker')).toHaveText('SITUATION 01 · SINCE 1 OCT 2026')
  await expect(alpha.locator('.tag')).toHaveText(['ACTIVE', 'ARMED CONFLICT › BORDER CLASH'])
  await expect(alpha).toContainText('Two made-up neighbours trade fire over a made-up river crossing.')
  const struck = alpha.locator('.struck')
  await expect(struck).toHaveText('Tajikistan')
  expect(await struck.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('line-through')

  await expect(alpha.locator('[data-sources] .label-mono')).toHaveText('SOURCES · 5 OUTLETS · 5 REGIONS · 4 INDEPENDENT · 1 STATE-RUN')
  const rows = alpha.locator('.source-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toHaveText('Wikipedia Current events · NON-PROFIT · 26 OCT 2026 — Fixture border clash alpha: report 1')
  await expect(rows.nth(1)).toContainText('Crescent State News · STATE-RUN')
  await expect(alpha.locator('[data-more]')).toHaveText('+ 2 more · latest event 26 OCT 2026')
  await alpha.locator('[data-more]').click()
  await expect(rows).toHaveCount(5)
  await expect(alpha.locator('[data-more]')).toHaveCount(0)

  const credit = alpha.locator('[data-credit]')
  await expect(credit).toBeVisible()
  await expect(credit.locator('a[href="https://en.wikipedia.org/wiki/Portal:Current_events"]')).toHaveCount(1)
  await expect(credit.locator('a[href*="creativecommons.org/licenses/by-sa/4.0/"]')).toHaveCount(1)
  await expect(page.locator(country('124'))).toHaveAttribute('data-state', 'none')
})

test('a row with no article date shows none and does not sort first', async ({ page }) => {
  await card(page, BETA).click()
  const rows = page.locator('[data-situation-card]').nth(1).locator('.source-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).not.toContainText('Ledger Wire')
  await expect(rows.nth(2)).toHaveText('Ledger Wire · PRIVATE — Fixture protests beta: report 3')
  await expect(rows.nth(2)).not.toContainText('2026')
})

test('every source is a real link', async ({ page }) => {
  await card(page, ALPHA).click()
  await alphaCard(page).locator('[data-more]').click()
  const links = alphaCard(page).locator('[data-sources] a.source-row')
  await expect(links).toHaveCount(5)
  for (const link of await links.all()) {
    expect(await link.getAttribute('href')).toMatch(/^https:\/\/([a-z]+\.example|en\.wikipedia\.org)\//)
    expect(await link.getAttribute('rel')).toContain('noopener')
    expect(await link.getAttribute('target')).toBe('_blank')
  }
})

test('quiet panels carry their phase and no sources until picked', async ({ page }) => {
  const [beta, gamma] = await page.locator('[data-situation-card]').all().then((all) => [all[1], all[2]])
  await expect(beta.locator('.tag')).toHaveText('EASING')
  await expect(gamma.locator('.tag')).toHaveText('QUIET')
  await expect(page.locator('[data-sources]')).toHaveCount(0)
})

test('picking it again restores', async ({ page }) => {
  await card(page, ALPHA).click()
  await card(page, ALPHA).click()
  await expect(card(page, ALPHA)).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-sources]')).toHaveCount(0)
  await expect(page.locator(country('124'))).toHaveAttribute('data-quiet', 'true')
})

test('picking a country filters the list, and Show all restores it', async ({ page }) => {
  const kazakhstan = page.locator(country('398'))
  await kazakhstan.click()
  await expect(kazakhstan).toHaveAttribute('data-selected', 'true')
  expect(await css(page, country('398'), 'stroke')).toBe(TEXT)
  await expect(page.getByText('Situations involving Kazakhstan')).toBeVisible()
  const cards = page.locator('button[data-situation]')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toHaveAccessibleName(ALPHA)

  await page.getByRole('button', { name: 'Show all' }).click()
  await expect(cards).toHaveCount(3)

  await page.locator(country('762')).dispatchEvent('click')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toHaveAccessibleName(ALPHA)
  await page.getByRole('button', { name: 'Show all' }).click()
  await expect(cards).toHaveCount(3)
})

test('a country in no situation says so', async ({ page }) => {
  await page.locator(country('276')).click()
  await expect(page.locator('[data-empty]')).toHaveText('No situations for Germany from the news.')
  await expect(page.locator('button[data-situation]')).toHaveCount(0)
})

test('the legend names the three involvement states', async ({ page }) => {
  const legend = page.locator('[data-legend]')
  for (const name of ['Pulled in', 'Joined', 'Stepped out']) await expect(legend).toContainText(name)
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

async function expectReadable(page: Page) {
  const results = await renderedText(page)
  expect(results.length).toBeGreaterThan(0)
  for (const r of results) {
    const ratio = contrast(r.fg.slice(0, 3) as Rgb, r.bg.slice(0, 3) as Rgb)
    expect(ratio, `${r.text} ${r.fg} on ${r.bg}`).toBeGreaterThanOrEqual(4.5)
  }
  console.log(`map page text elements checked: ${results.length}`)
}

test('rendered text contrast after a country click', async ({ page }) => {
  await page.locator(country('398')).click()
  await expectReadable(page)
})

test('rendered text contrast with a situation open and its sources expanded', async ({ page }) => {
  await card(page, ALPHA).click()
  await alphaCard(page).locator('[data-more]').click()
  await expectReadable(page)
})

test.describe('phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the list sits under the map without horizontal scroll', async ({ page }) => {
    const map = await page.locator('svg.map').boundingBox()
    const aside = await page.locator('aside').boundingBox()
    expect(aside!.y).toBeGreaterThanOrEqual(map!.y + map!.height)
    await expect(page.getByRole('heading', { name: 'Conspectus' })).toBeVisible()
    await expect(page.locator('[data-live]')).toBeVisible()
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(390)
  })
})

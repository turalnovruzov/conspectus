import { expect, test } from '@playwright/test'

const country = (id: string) => '[data-country="' + id + '"]'

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

  await expect(page.locator(country('076'))).toHaveAttribute('data-state', 'party')
  const turkey = page.locator(country('792'))
  await expect(turkey).toHaveAttribute('data-state', 'supporting')
  await expect(turkey).toHaveAttribute('fill', '#fdba74')
  await expect(turkey).not.toHaveAttribute('fill-opacity', /.*/)
  await expect(page.locator(country('276'))).toHaveAttribute('data-state', 'none')
})

test('picking a situation narrows the map and picking it again restores it', async ({ page }) => {
  const protests = page.getByRole('button', { name: 'Mass protests', exact: true })
  await protests.click()
  await expect(protests).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator(country('076'))).toHaveAttribute('fill', '#38bdf8')
  await expect(page.locator(country('398'))).toHaveAttribute('data-state', 'none')

  await protests.click()
  await expect(protests).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator(country('398'))).toHaveAttribute('data-state', 'party')
})

test('picking a country filters the list, and Show all restores it', async ({ page }) => {
  const kazakhstan = page.locator(country('398'))
  await kazakhstan.click()
  await expect(kazakhstan).toHaveAttribute('data-selected', 'true')
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

test.describe('phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the list sits under the map without horizontal scroll', async ({ page }) => {
    const map = await page.locator('svg.map').boundingBox()
    const aside = await page.locator('aside').boundingBox()
    expect(aside!.y).toBeGreaterThanOrEqual(map!.y + map!.height)
    await expect(page.getByText('Sample data — made up')).toBeVisible()
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(390)
  })
})

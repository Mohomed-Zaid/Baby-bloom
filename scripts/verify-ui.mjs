import { chromium } from 'playwright-core'
import { strict as assert } from 'node:assert'

const baseUrl = 'http://127.0.0.1:5173'
const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, executablePath })
const consoleErrors = []

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  desktop.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  desktop.on('pageerror', (error) => consoleErrors.push(error.message))

  await desktop.goto(`${baseUrl}/dashboard`)
  await desktop.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor()
  await desktop.screenshot({ path: 'artifacts/dashboard-desktop.png', fullPage: true })

  const sectionButtons = desktop.locator('.desktop-sidebar button[aria-expanded]')
  const sectionCount = await sectionButtons.count()
  assert(sectionCount >= 8, 'All expandable navigation sections should render')
  for (let index = 0; index < sectionCount; index += 1) await sectionButtons.nth(index).click()

  const routePaths = await desktop.locator('.desktop-sidebar a[href]').evaluateAll((links) =>
    [...new Set(links.map((link) => link.getAttribute('href')).filter((href) => href && href !== '/dashboard' && href !== '/login'))],
  )
  assert(routePaths.length >= 66, 'All module routes should be available in navigation')

  for (const path of routePaths) {
    const response = await desktop.goto(`${baseUrl}${path}`)
    assert(response?.ok(), `Route failed to load: ${path}`)
    assert.equal(await desktop.locator('main h1').count(), 1, `Route needs one page title: ${path}`)
    assert((await desktop.locator('.breadcrumbs').innerText()).includes('Home'), `Route needs a breadcrumb: ${path}`)
  }

  await desktop.reload()
  assert.equal(await desktop.locator('main h1').count(), 1, 'Refreshing a nested route must preserve the page')
  await desktop.goto(`${baseUrl}/dashboard`)
  const expandedWidth = await desktop.locator('.sidebar').evaluate((element) => element.getBoundingClientRect().width)
  await desktop.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await desktop.waitForTimeout(200)
  const collapsedWidth = await desktop.locator('.sidebar').evaluate((element) => element.getBoundingClientRect().width)
  assert(collapsedWidth < expandedWidth, 'Sidebar should collapse')

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
  mobile.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  mobile.on('pageerror', (error) => consoleErrors.push(error.message))
  await mobile.goto(`${baseUrl}/dashboard`)
  await mobile.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await mobile.getByRole('dialog', { name: 'Navigation menu', exact: true }).waitFor()
  await mobile.screenshot({ path: 'artifacts/mobile-navigation.png', fullPage: true })
  await mobile.getByRole('dialog', { name: 'Navigation menu', exact: true }).getByRole('button', { name: 'Close navigation', exact: true }).click()
  assert.equal(await mobile.getByRole('dialog', { name: 'Navigation menu', exact: true }).count(), 0, 'Mobile drawer should close')

  await mobile.goto(`${baseUrl}/login`)
  assert.equal(await mobile.getByLabel('Email or username', { exact: true }).count(), 1)
  assert.equal(await mobile.getByLabel('Password', { exact: true }).count(), 1)
  assert.equal(await mobile.getByRole('button', { name: 'Show password', exact: true }).count(), 1)

  assert.deepEqual(consoleErrors, [], `Console errors found: ${consoleErrors.join(' | ')}`)
  console.log(`UI verification passed: ${routePaths.length} module routes, nested refresh, desktop collapse, mobile drawer, login controls, and zero console errors.`)
} finally {
  await browser.close()
}
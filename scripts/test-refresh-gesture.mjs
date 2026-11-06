/* global document, window, Event, HTMLElement */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, webkit, devices } from '@playwright/test'
import { fixture } from './operations-fixture.mjs'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const empty = Object.fromEntries(Object.keys(fixture).map(key => [key, []]))
const profile = { id: 'refresh-professional', name: 'Profissional de teste', active: true, email: 'refresh@example.invalid', photo_url: null, business_name: 'Unidade de teste' }
const preferences = { weekly_commission_goal_cents: 30000, weekly_service_goal: 15, weekly_customer_goal: 15, visible_cards: ['earned', 'pending', 'paid', 'services', 'customers'], show_goals: true, goals_managed_by_admin: true }
const scenarios = [{ name: 'android-web', engine: chromium, options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }, { name: 'iphone-webkit', engine: webkit, options: devices['iPhone 13'] }]
const results = []
await mkdir('.private', { recursive: true })

for (const scenario of scenarios) {
  const browser = await scenario.engine.launch(), context = await browser.newContext({ ...scenario.options, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' }), page = await context.newPage()
  const calls = { snapshot: 0, catalog: 0 }, errors = []
  let failing = false
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => { window.__refreshErrors = []; window.addEventListener('unhandledrejection', event => { window.__refreshErrors.push(String(event.reason)); event.preventDefault() }) })
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()); let data = null
    if (url.pathname === '/api/professional/access') data = { profile, administrative: false, choices: [profile] }
    else if (url.pathname === '/api/professional/snapshot') { calls.snapshot++; await new Promise(resolve => setTimeout(resolve, 150)); data = empty }
    else if (url.pathname === '/api/professional/catalog') { calls.catalog++; await new Promise(resolve => setTimeout(resolve, 150)); data = { business: { name: profile.business_name }, professionals: [{ id: profile.id, name: profile.name, active: true }], services: [], links: [] } }
    else if (url.pathname === '/api/professional/cash') data = { from: url.searchParams.get('from'), to: url.searchParams.get('to'), earned: 0, pending: 0, paid: 0, totalPending: 0, services: 0, customers: 0, preferences, entries: [] }
    if (failing && ['/api/professional/snapshot', '/api/professional/catalog'].includes(url.pathname)) return route.fulfill({ status: 503, json: { error: { message: 'Serviço de teste temporariamente indisponível.' } } })
    await route.fulfill({ json: { data, error: null } })
  })
  const event = async (selector, type, dx = 0, dy = 0, fingers = 1) => page.locator(selector).evaluate((node, input) => {
    const touch = new Event(input.type, { bubbles: true, cancelable: true })
    Object.defineProperty(touch, 'touches', { value: ['touchend', 'touchcancel'].includes(input.type) ? [] : Array.from({ length: input.fingers }, (_, index) => ({ clientX: 100 + input.dx + index * 20, clientY: 150 + input.dy, identifier: index, target: node })) })
    node.dispatchEvent(touch)
  }, { type, dx, dy, fingers })
  const swipe = async (selector = '.pro-wallet-heading', dx = 0, dy = 180, fingers = 1) => { await event(selector, 'touchstart', 0, 0, fingers); await event(selector, 'touchmove', dx, dy, fingers); await event(selector, 'touchend') }
  const idle = async () => page.waitForFunction(() => document.querySelector('.refresh-gesture-status')?.getAttribute('data-phase') === 'idle')
  const stableCounts = () => ({ ...calls })
  const noRefresh = async (action, label) => { const before = stableCounts(); await action(); await page.waitForTimeout(220); assert.deepEqual(calls, before, scenario.name + ': ' + label); await idle() }
  try {
    await page.goto(base + '/profissional/caixa')
    await page.getByRole('heading', { name: 'Meu Caixa', exact: true }).waitFor()
    await page.locator('.pro-cash-content[aria-busy=false]').waitFor({ state: 'attached' })
    const resultsDisclosure = page.locator('.pro-results-disclosure')
    if (await resultsDisclosure.count()) await resultsDisclosure.locator('summary').click()
    await page.evaluate(() => window.scrollTo(0, 0))
    await idle(); await page.waitForTimeout(350)
    assert.equal(await page.locator('.topbar').getByRole('button', { name: /Atualizar/i }).count(), 0)

    const initial = stableCounts()
    await event('.pro-wallet-heading', 'touchstart'); await event('.pro-wallet-heading', 'touchmove', 0, 180)
    await page.waitForFunction(() => document.querySelector('.refresh-gesture-status')?.getAttribute('data-phase') === 'ready')
    await event('.pro-wallet-heading', 'touchend')
    await page.waitForFunction(() => document.querySelector('.refresh-gesture-status')?.getAttribute('data-phase') === 'refreshing')
    await idle()
    assert.equal(calls.snapshot, initial.snapshot + 1); assert.equal(calls.catalog, initial.catalog + 1)
    await page.waitForTimeout(500)

    await noRefresh(() => swipe('.pro-wallet-heading', 180, 35), 'gesto horizontal não atualiza')
    await noRefresh(() => swipe('.pro-wallet-heading', 0, -180), 'gesto para cima não atualiza')
    await noRefresh(() => swipe('.pro-wallet-heading', 0, 180, 2), 'dois dedos não atualizam')
    await noRefresh(async () => { await event('.pro-wallet-heading', 'touchstart'); await event('.pro-wallet-heading', 'touchmove', 0, 180); await event('.pro-wallet-heading', 'touchcancel') }, 'gesto cancelado não atualiza')
    await page.waitForTimeout(500)

    await page.evaluate(() => window.scrollTo(0, 180)); assert.ok(await page.evaluate(() => window.scrollY > 1))
    await noRefresh(() => swipe(), 'gesto abaixo do topo não atualiza'); await page.evaluate(() => window.scrollTo(0, 0))
    await page.evaluate(() => { const box = document.createElement('div'); box.id = 'refresh-test-scroller'; box.style.cssText = 'height:90px;overflow:auto'; box.innerHTML = '<div style="height:400px"><span id="refresh-test-child">Rolagem interna de teste</span></div>'; document.querySelector('main').append(box); box.scrollTop = 100 })
    await noRefresh(() => swipe('#refresh-test-child'), 'rolagem interna fora do topo não atualiza')
    await page.evaluate(() => document.getElementById('refresh-test-scroller').remove())
    await page.evaluate(() => { const input = document.createElement('input'); input.id = 'refresh-test-input'; input.setAttribute('aria-label', 'Campo do teste de gesto'); document.querySelector('main').append(input) })
    await noRefresh(() => swipe('#refresh-test-input'), 'campo de texto não inicia gesto')
    await page.evaluate(() => document.getElementById('refresh-test-input').remove())

    await page.getByRole('button', { name: 'Personalizar meu Caixa', exact: true }).click()
    await page.getByRole('dialog', { name: 'Personalizar meu Caixa' }).waitFor()
    await noRefresh(() => swipe(), 'janela aberta bloqueia gesto da página')
    await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click()

    const keyboard = page.getByRole('button', { name: 'Atualizar dados', exact: true }), beforeKeyboard = stableCounts()
    await keyboard.focus(); await page.keyboard.press('Enter'); await idle()
    assert.equal(calls.snapshot, beforeKeyboard.snapshot + 1); assert.equal(calls.catalog, beforeKeyboard.catalog + 1)
    await page.getByRole('heading', { name: 'Meu Caixa', exact: true }).focus().catch(() => {})
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await page.waitForTimeout(500)

    failing = true
    await swipe(); await idle(); await page.getByRole('alert').filter({ hasText: 'temporariamente indisponível' }).waitFor()
    assert.equal(await keyboard.isDisabled(), false, 'erro libera uma nova tentativa')
    assert.deepEqual(await page.evaluate(() => window.__refreshErrors), [], 'erro de rede não produz rejeição solta')
    failing = false; await page.waitForTimeout(500); await swipe(); await idle()
    await page.getByRole('alert').filter({ hasText: 'temporariamente indisponível' }).waitFor({ state: 'hidden' })

    await page.evaluate(() => { const main = document.querySelector('main'); main.style.height = '400px'; main.style.minHeight = '400px'; main.style.overflowY = 'auto'; main.scrollTop = 100; window.scrollTo(0, 0) })
    assert.ok(await page.locator('main').evaluate(node => node.scrollTop > 1))
    await noRefresh(() => swipe(), 'contêiner principal fora do topo não atualiza')
    await page.evaluate(() => { const main = document.querySelector('main'); main.style.height = ''; main.style.minHeight = ''; main.style.overflowY = ''; main.scrollTop = 0 })
    await page.evaluate(() => { const root = document.getElementById('root'); root.style.height = '400px'; root.style.minHeight = '400px'; root.style.overflowY = 'auto'; root.scrollTop = 100; window.scrollTo(0, 0) })
    assert.ok(await page.locator('#root').evaluate(node => node.scrollTop > 1))
    await noRefresh(() => swipe(), 'ancestral acima do main fora do topo não atualiza')
    await page.evaluate(() => { const root = document.getElementById('root'); root.style.height = ''; root.style.minHeight = ''; root.style.overflowY = ''; root.scrollTop = 0 })
    assert.deepEqual(errors, [])
    results.push({ name: scenario.name, status: 'passed', snapshotAndCatalog: true, blocked: ['horizontal', 'upward', 'multi-touch', 'cancelled', 'below-top', 'nested-scroll', 'main-scroll', 'root-scroll', 'input', 'modal'], keyboard: true, networkErrorRecovery: true })
    console.log(`PASS ${scenario.name}: gesto atualiza agenda/catálogo, respeita rolagem/janelas/campos, teclado e recuperação de erro.`)
  } finally { await browser.close() }
}
await writeFile('.private/nov06-refresh-gesture-verification.json', JSON.stringify({ date: new Date().toISOString(), base, fixtureOnly: true, results }, null, 2))

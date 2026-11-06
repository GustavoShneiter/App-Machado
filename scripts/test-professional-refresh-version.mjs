/* global document, window, Event */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, webkit, devices } from '@playwright/test'
import { fixture } from './operations-fixture.mjs'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const fixedTime = new Date('2026-11-06T12:00:00.000Z')
const profile = { id: 'refresh-version-professional', name: 'Profissional de teste', active: true, email: 'refresh-version@example.invalid', photo_url: null, business_name: 'Unidade de teste' }
const empty = Object.fromEntries(Object.keys(fixture).map(key => [key, []]))
const scenarios = [
  { name: 'android-web', engine: chromium, options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  { name: 'iphone-webkit', engine: webkit, options: devices['iPhone 13'] },
]
const results = []
await mkdir('.private', { recursive: true })

for (const scenario of scenarios) {
  const browser = await scenario.engine.launch()
  const context = await browser.newContext({ ...scenario.options, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  const page = await context.newPage()
  const calls = { snapshot: 0, cash: 0, preferences: 0 }, errors = [], unknown = []
  let amount = 10000, showGoals = true
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  // Date stays identical for both refreshes; browser timers and gesture animations still run.
  await page.clock.setFixedTime(fixedTime)
  const preferences = () => ({ weekly_commission_goal_cents: 30000, weekly_service_goal: 15, weekly_customer_goal: 15, visible_cards: ['earned', 'pending', 'paid', 'services', 'customers'], show_goals: showGoals, goals_managed_by_admin: true })
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()); let data
    if (url.pathname === '/api/professional/access') data = { profile, administrative: false, choices: [profile] }
    else if (url.pathname === '/api/professional/catalog') data = { business: { name: profile.business_name }, professionals: [{ id: profile.id, name: profile.name, active: true }], services: [], links: [] }
    else if (url.pathname === '/api/professional/snapshot') { calls.snapshot++; data = empty }
    else if (url.pathname === '/api/professional/cash') { calls.cash++; data = { from: url.searchParams.get('from'), to: url.searchParams.get('to'), earned: amount, pending: amount, paid: 0, totalPending: amount, services: 1, customers: 1, preferences: preferences(), entries: [] } }
    else if (url.pathname === '/api/professional/preferences') { calls.preferences++; data = preferences() }
    else { unknown.push(url.pathname); return route.fulfill({ status: 404, json: { error: { message: 'Endpoint sem fixture.' } } }) }
    await route.fulfill({ json: { data, error: null } })
  })
  const swipe = async selector => {
    await page.evaluate(() => window.scrollTo(0, 0))
    for (const type of ['touchstart', 'touchmove', 'touchend']) await page.locator(selector).evaluate((node, eventType) => {
      const event = new Event(eventType, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'touches', { value: eventType === 'touchend' ? [] : [{ clientX: 100, clientY: eventType === 'touchmove' ? 330 : 150, identifier: 0, target: node }] })
      node.dispatchEvent(event)
    }, type)
    await page.waitForFunction(() => document.querySelector('.refresh-gesture-status')?.getAttribute('data-phase') === 'idle')
  }
  const fixedClock = async () => assert.equal(await page.evaluate(() => Date.now()), fixedTime.getTime(), 'dois refreshes com a mesma data, sem depender do texto de horário')
  try {
    await page.goto(base + '/profissional/caixa')
    await page.locator('.pro-cash-content[aria-busy=false]').waitFor({ state: 'attached' })
    await page.waitForFunction(() => document.querySelector('.pro-wallet-balance strong')?.textContent?.includes('100,00'))
    for (const [nextAmount, visible] of [[20000, '200,00'], [30000, '300,00']]) {
      amount = nextAmount
      const before = { ...calls }
      await swipe('.pro-wallet-heading')
      await page.waitForFunction(value => document.querySelector('.pro-wallet-balance strong')?.textContent?.includes(value) && document.querySelector('.pro-result-earned strong')?.textContent?.includes(value), visible)
      await page.locator('.pro-cash-content[aria-busy=false]').waitFor({ state: 'attached' })
      assert.equal(calls.snapshot, before.snapshot + 1, 'cada gesto recarrega o snapshot')
      assert.ok(calls.cash > before.cash, 'cada gesto recarrega as comissões')
      await fixedClock()
    }

    // A new page load resets click suppression after the gesture while preserving the fixed clock.
    await page.goto(base + '/profissional/menu')
    await page.getByText('Metas visíveis no Meu Caixa', { exact: true }).waitFor()
    for (const [visible, message] of [[false, 'Metas ocultas no Meu Caixa'], [true, 'Metas visíveis no Meu Caixa']]) {
      showGoals = visible
      const before = { ...calls }
      await swipe('.page-head')
      await page.getByText(message, { exact: true }).waitFor()
      assert.equal(calls.snapshot, before.snapshot + 1)
      assert.equal(calls.preferences, before.preferences + 1, 'cada gesto recarrega as preferências do Menu')
      await fixedClock()
    }
    assert.deepEqual(errors, []); assert.deepEqual(unknown, [])
    results.push({ name: scenario.name, status: 'passed', fixedTime: fixedTime.toISOString(), cashValues: [10000, 20000, 30000], menuGoalVisibility: [true, false, true], cashGestures: 2, menuGestures: 2 })
    console.log(`PASS ${scenario.name}: dois gestos com relógio fixo atualizam comissões visíveis e preferências do Menu.`)
  } finally { await browser.close() }
}
await writeFile('.private/nov06-professional-refresh-version-verification.json', JSON.stringify({ date: new Date().toISOString(), base, fixtureOnly: true, noDatabaseWrites: true, results }, null, 2))

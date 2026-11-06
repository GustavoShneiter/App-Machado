/* global window, document, getComputedStyle, structuredClone, scrollY, innerHeight, location */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { fixture } from './operations-fixture.mjs'

// Unlike dispatchEvent tests, CDP dispatches trusted touch input and lets the
// browser perform its native scrolling/default actions. All API data is mocked.
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const identity = { id: '11111111-1111-4111-8111-111111111111', name: 'Dono de teste', email: 'scroll@example.invalid' }
const profile = { id: 'p1', name: 'Profissional de teste', active: true, email: 'professional.scroll@example.invalid', photo_url: null, business_name: 'Unidade de teste' }
const preferences = { weekly_commission_goal_cents: 20000, weekly_service_goal: 20, weekly_customer_goal: 15, visible_cards: ['earned', 'pending', 'paid', 'services', 'customers'], show_goals: true, goals_managed_by_admin: true }
const catalog = { business: { name: 'Unidade de teste' }, professionals: [{ id: profile.id, name: profile.name, active: true, default_commission_percent: 50 }], services: [{ id: 's1', name: 'Corte de teste', price_cents: 1000, duration_minutes: 40, active: true }], links: [{ service_id: 's1', professional_id: profile.id, commission_percent: 50 }] }
const empty = Object.fromEntries(Object.keys(fixture).map(key => [key, []]))
const operations = { ...structuredClone(fixture), movements: Array.from({ length: 24 }, (_, index) => ({ ...fixture.movements[0], id: 'move-' + index, notes: 'Movimentação de teste ' + index })) }
const cases = [{ name: 'android', width: 390, height: 844 }, { name: 'small-android', width: 360, height: 640 }]
const results = []
await mkdir('.private/screenshots', { recursive: true })

async function installMocks(page, counts) {
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url())
    let data
    if (url.pathname === '/api/auth/get-session') return route.fulfill({ json: { user: identity, session: { id: 'fixture-session', userId: identity.id } } })
    if (url.pathname === '/api/professional/access') data = { profile, administrative: false, choices: [] }
    else if (url.pathname === '/api/professional/snapshot') { counts.snapshot++; await new Promise(resolve => setTimeout(resolve, 180)); data = empty }
    else if (['/api/catalog', '/api/professional/catalog'].includes(url.pathname)) { counts.catalog++; await new Promise(resolve => setTimeout(resolve, 180)); data = catalog }
    else if (url.pathname === '/api/professional/cash') data = { from: url.searchParams.get('from'), to: url.searchParams.get('to'), earned: 500, pending: 500, paid: 0, totalPending: 500, services: 1, customers: 1, preferences, entries: [{ id: 'e1', commission_cents: 500, status: 'pending', description: 'Corte de teste', type: 'service', quantity: 1, customer_name: 'Cliente de teste', occurred_at: new Date().toISOString() }] }
    else if (url.pathname === '/api/rpc') {
      const { name } = req.postDataJSON()
      if (name === 'can_access_admin') data = true
      else if (name === 'office_snapshot') { counts.snapshot++; await new Promise(resolve => setTimeout(resolve, 180)); data = operations }
      else if (['public_booking_slots', 'public_available_slots'].includes(name)) data = []
      else throw new Error('An unexpected mutation was requested during a scroll-only test.')
    } else if (url.pathname === '/api/system-status') return route.fulfill({ json: { version: 'test', professionalVersion: 'test', backend: 'fixture', database: 'fixture', lastBackup: null } })
    else throw new Error('An API endpoint lacks a local fixture: ' + url.pathname)
    await route.fulfill({ json: { data, error: null } })
  })
  await page.addInitScript(() => {
    // Count only gesture requests, without the stores' independent 10/15/30s
    // background pollers racing this deliberately slow native-input suite.
    const interval = window.setInterval.bind(window)
    window.setInterval = (handler, timeout, ...args) => interval(handler, [10000, 15000, 30000].includes(timeout) ? 2147483647 : timeout, ...args)
    window.__touchEvidence = []
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) document.addEventListener(type, event => {
      window.__touchEvidence.push({ type, trusted: event.isTrusted, prevented: event.defaultPrevented, target: event.target.closest('a,button')?.textContent || event.target.tagName })
    })
    window.__clickEvidence = []
    document.addEventListener('click', event => window.__clickEvidence.push({ target: event.target.closest('a,button')?.textContent, trusted: event.isTrusted, prevented: event.defaultPrevented }), true)
  })
}
const top = page => page.evaluate(() => window.scrollY)
const idle = page => page.waitForFunction(() => document.querySelector('.refresh-gesture-status')?.getAttribute('data-phase') === 'idle')
async function audit(page) {
  return page.evaluate(() => ({ scrollY, scrollingElement: document.scrollingElement?.tagName, surfaces: ['html', 'body', '#root', '.app-shell', 'main'].map(selector => { const node = document.querySelector(selector), style = getComputedStyle(node); return { selector, scrollTop: node.scrollTop, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, overflowY: style.overflowY, overscrollY: style.overscrollBehaviorY, touchAction: style.touchAction } }) }))
}

for (const test of cases) for (const edition of ['admin', 'professional']) {
  const browser = await chromium.launch(), context = await browser.newContext({ viewport: { width: test.width, height: test.height }, isMobile: true, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' }), page = await context.newPage()
  const counts = { snapshot: 0, catalog: 0 }, errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.setDefaultTimeout(15000)
  await installMocks(page, counts)
  const cdp = await context.newCDPSession(page)
  async function tap(locator) {
    // Standard Playwright pointer input remains trusted. The scrolling checks
    // themselves exclusively use native CDP touch, never DOM dispatchEvent.
    await locator.click()
  }
  async function swipe(fromY, toY, x = test.width / 2) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y: fromY }] })
    for (let step = 1; step <= 14; step++) {
      // Ease the finger to a stop before releasing. A linear, high-velocity
      // release starts a native fling, whose next tap intentionally stops it
      // instead of activating navigation (even after reaching the boundary).
      const progress = 1 - (1 - step / 14) ** 3
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x, y: fromY + (toY - fromY) * progress }] })
      await page.waitForTimeout(20)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(350)
  }
  const nav = () => page.locator('.mobile-nav')
  const section = async label => {
    // A first tap during native momentum stops the fling on Android. Wait for
    // that native motion to settle before checking navigation activation.
    await page.waitForTimeout(150)
    await tap(nav().getByRole('link', { name: label, exact: true }))
  }
  const agendaLabel = edition === 'admin' ? 'Agenda' : 'Minha Agenda'
  const cashLabel = edition === 'admin' ? 'Caixa' : 'Meu Caixa'
  const route = edition === 'admin' ? '/app/admin/agenda' : '/profissional/agenda'
  const movement = []
  try {
    await page.goto(base + route)
    await page.locator('.agenda-schedule').waitFor()
    await idle(page); await page.waitForTimeout(400)
    const initialAudit = await audit(page)
    assert.notEqual(initialAudit.surfaces.find(row => row.selector === 'body').overscrollY, 'contain', 'The content-sized body must permit scroll chaining to the viewport.')
    for (const surface of ['agenda', 'cash']) {
      if (surface === 'cash') {
        await section(cashLabel)
        await page.getByRole('heading', { name: cashLabel, exact: true }).waitFor()
        const details = page.locator('.pro-results-disclosure')
        if (await details.count()) await tap(details.locator('summary'))
      }
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(350)
      const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
      assert.ok(maxScroll > 100, `${edition}/${surface} must contain a real, scrollable page.`)
      const before = { ...counts }, lower = Math.min(test.height - 170, 650), upper = Math.max(180, lower - 340)
      await swipe(lower, upper)
      const scrolled = await top(page)
      assert.ok(scrolled > 100, `${edition}/${surface}: a trusted upward swipe must move the actual page.`)
      await swipe(upper, lower)
      const returned = await top(page)
      assert.ok(returned < scrolled - 60, `${edition}/${surface}: a trusted downward swipe must return toward the top.`)
      assert.deepEqual(counts, before, 'Scrolling from below the top must not refresh, even if it reaches the top.')
      await idle(page)
      movement.push({ surface, scrolled, returned, realContentMovedBothDirections: true })
    }

    await section(agendaLabel); await page.locator('.agenda-schedule').waitFor()
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(450)
    const beforePull = { ...counts }
    await swipe(175, 450, 26)
    await idle(page)
    assert.equal(counts.snapshot, beforePull.snapshot + 1, 'A downward pull beginning at the top must refresh once.')
    assert.equal(counts.catalog, beforePull.catalog + 1, 'Refresh must update both records and catalog once.')
    await page.waitForTimeout(450)

    // A trusted toolbar tap still opens the calendar, and dragging its dialog
    // must not claim the page refresh gesture.
    const beforeModal = { ...counts }
    await tap(page.getByRole('button', { name: 'Semana selecionada: escolher mês e ano', exact: true }))
    let dialog = page.getByRole('dialog', { name: 'Escolher data' })
    await dialog.waitFor()
    const calendarBox = await dialog.boundingBox()
    await swipe(calendarBox.y + Math.min(170, calendarBox.height / 2), calendarBox.y + Math.min(330, calendarBox.height - 24), calendarBox.x + 24)
    assert.deepEqual(counts, beforeModal)
    await tap(dialog.getByRole('button', { name: 'Fechar', exact: true }))
    await dialog.waitFor({ state: 'hidden' })

    await tap(page.locator('.mobile-create'))
    await tap(page.getByRole('dialog', { name: 'Opções da Agenda' }).getByRole('button', { name: 'Novo agendamento', exact: true }))
    dialog = page.getByRole('dialog', { name: 'Novo agendamento', exact: true })
    await dialog.waitFor()
    const field = dialog.getByLabel('Cliente', { exact: true })
    await field.fill('Cliente local do teste')
    const box = await field.boundingBox(), beforeForm = { ...counts }
    await swipe(box.y + box.height / 2, Math.min(test.height - 120, box.y + 180), box.x + 18)
    assert.deepEqual(counts, beforeForm, 'A touch beginning in a form must not refresh the page.')
    assert.equal(await field.inputValue(), 'Cliente local do teste')
    // The real, long booking form retains its own native scrolling.
    const formBox = await dialog.boundingBox()
    await swipe(formBox.y + formBox.height - 60, formBox.y + 130, formBox.x + 18)
    if (await dialog.evaluate(node => node.scrollHeight > node.clientHeight + 80)) assert.ok(await dialog.evaluate(node => node.scrollTop > 0), 'The booking dialog must still scroll natively.')
    await tap(dialog.getByRole('button', { name: 'Fechar', exact: true }))
    await dialog.waitFor({ state: 'hidden' })
    await section(cashLabel)
    await page.getByRole('heading', { name: cashLabel, exact: true }).waitFor()
    await section(agendaLabel)
    await page.locator('.agenda-schedule').waitFor()
    assert.deepEqual(errors, [])
    const evidence = await page.evaluate(() => window.__touchEvidence)
    assert.ok(evidence.filter(event => event.type === 'touchmove').length > 30)
    assert.ok(evidence.every(event => event.trusted), 'Scrolling assertions must be based on trusted browser input.')
    await page.screenshot({ path: `.private/screenshots/refresh-scroll-${edition}-${test.name}.png` })
    results.push({ name: test.name, edition, trustedEvents: evidence.length, movement, toolbar: true, navigation: true, modalAndForm: true, refreshOnlyAtTop: true, initialAudit })
    console.log(`PASS ${test.name}/${edition}: toque real rola Agenda/Caixa nos dois sentidos, atualiza apenas no topo e mantém formulário, janela e navegação.`)
  } catch (error) {
    await page.screenshot({ path: `.private/screenshots/refresh-scroll-failure-${edition}-${test.name}.png` })
    console.error('Visible dialogs:', await page.getByRole('dialog').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))))
    console.error('Input evidence:', await page.evaluate(() => ({ url: location.href, click: window.__clickEvidence, touch: window.__touchEvidence.slice(-5) })))
    throw error
  } finally { await browser.close() }
}

// The same stylesheet is used by the PC administration/professional versions.
// Native wheel input must retain ordinary document scrolling there as well.
for (const edition of ['admin']) {
  const browser = await chromium.launch(), context = await browser.newContext({ viewport: { width: 1440, height: 800 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' }), page = await context.newPage()
  const counts = { snapshot: 0, catalog: 0 }
  try {
    await installMocks(page, counts)
    await page.goto(base + (edition === 'admin' ? '/admin/agenda' : '/profissional/agenda'))
    await page.locator('.agenda-schedule').waitFor()
    await idle(page); await page.waitForTimeout(350)
    const before = { ...counts }
    await page.mouse.move(1100, 600)
    await page.mouse.wheel(0, 400); await page.waitForTimeout(350)
    const scrolled = await top(page)
    assert.ok(scrolled > 60, 'PC wheel must move the page.')
    await page.mouse.wheel(0, -400); await page.waitForTimeout(350)
    const returned = await top(page)
    assert.ok(returned < scrolled - 50, 'PC wheel must return toward the top.')
    assert.deepEqual(counts, before, 'PC scrolling must not trigger refresh.')
    results.push({ name: 'desktop', edition, trustedWheel: true, movement: [{ surface: 'agenda', scrolled, returned, realContentMovedBothDirections: true }] })
    console.log(`PASS desktop/${edition}: rolagem nativa do mouse nos dois sentidos, sem atualização indevida.`)
  } finally { await browser.close() }
}
await writeFile('.private/nov06-refresh-native-scroll-verification.json', JSON.stringify({ date: new Date().toISOString(), fixtureOnly: true, trustedCDPInput: true, results }, null, 2))

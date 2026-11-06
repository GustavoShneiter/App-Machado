/* global document, window, getComputedStyle */
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { chromium, webkit, devices, expect } from '@playwright/test'

const base = (process.env.TEST_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
const accounts = JSON.parse(await readFile(process.env.TEST_ACCOUNT_FILE || '.private/professional-delivery.json', 'utf8'))
assert.ok(Array.isArray(accounts), 'TEST_ACCOUNT_FILE deve conter um array privado de contas profissionais.')
const account = accounts.find(value => value && typeof value.email === 'string' && typeof value.password === 'string' && value.password && typeof value.id === 'string' && value.id)
assert.ok(account, 'Informe uma conta de teste com id profissional, e-mail e senha no arquivo privado.')
const cases = [
  { name: 'professional-android-web', engine: chromium, options: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } },
  { name: 'professional-iphone', engine: webkit, options: devices['iPhone 13'] },
  { name: 'professional-pc', engine: chromium, options: { viewport: { width: 1440, height: 1000 } } },
]
const selectedCases = cases.filter(value => !process.env.TEST_BROWSER_CASE || value.name === process.env.TEST_BROWSER_CASE)
assert.ok(selectedCases.length, 'TEST_BROWSER_CASE deve ser professional-android-web, professional-iphone ou professional-pc.')
await mkdir('.private/screenshots', { recursive: true })

const settle = page => page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))).map(animation => animation.finished.catch(() => {}))) })
const close = async (page, title) => page.getByRole('dialog', { name: title, exact: true }).getByRole('button', { name: 'Fechar', exact: true }).click()
const money = cents => new RegExp('R\\$\\s*' + (cents / 100).toFixed(2).replace('.', ','))
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const shiftDate = (date, days) => new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10)
const monday = shiftDate(today, -((new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7))
const goals = { weekly_commission_goal_cents: 80000, weekly_service_goal: 30, weekly_customer_goal: 25 }
const goalValues = value => Object.fromEntries(Object.keys(goals).map(key => [key, value[key]]))
const results = [], runTag = randomBytes(2).toString('hex')

async function assertLayout(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Sem estouro horizontal')
  for (const dialog of await page.getByRole('dialog').all()) {
    const bounds = await dialog.boundingBox(), viewport = page.viewportSize()
    assert.ok(bounds && bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, 'Popup cabe na janela')
  }
}

for (const [index, test] of selectedCases.entries()) {
  const browser = await test.engine.launch({ headless: true })
  const options = { ...test.options, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', extraHTTPHeaders: { 'x-forwarded-for': `2001:db8:${runTag}:${100 + index}::1` } }
  const context = await browser.newContext(options), page = await context.newPage(), errors = [], preferenceWrites = [], cashRequests = []
  page.setDefaultTimeout(18000)
  page.on('pageerror', error => errors.push(error.message))
  try {
    // Authentication, agenda, identity and session checks use the real API.
    await page.goto(base + '/profissional')
    await page.getByRole('heading', { name: 'Entre na sua conta', exact: true }).waitFor()
    await page.getByLabel('E-mail de acesso', { exact: true }).fill(account.email)
    await page.getByLabel('Senha', { exact: true }).fill(account.password)
    const login = page.waitForResponse(response => response.url().endsWith('/api/professional-auth/sign-in/email') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    assert.equal((await login).status(), 200, 'Login profissional real')
    await page.getByRole('heading', { name: 'Minha Agenda', exact: true }).waitFor()
    const identityResponse = await context.request.get(base + '/api/professional/access')
    assert.equal(identityResponse.status(), 200)
    const identity = (await identityResponse.json()).data.profile
    assert.ok(identity.id === account.id, 'A sessão corresponde ao profissional esperado')
    assert.ok((await page.locator('.pro-header-identity').innerText()).includes(identity.name))
    assert.equal(await page.locator('.pro-nav a').count(), 3)
    assert.equal(await page.locator('.agenda-professionals').count(), 0)
    const agendaHeight = await page.locator('.agenda-time-grid').evaluate(element => element.getBoundingClientRect().height)
    assert.ok(agendaHeight >= 650 && agendaHeight < 1400, 'Agenda compacta mantém a carga horária')
    assert.equal(await page.locator('.agenda-slot').count(), 26)
    assert.equal(await page.locator('.agenda-time-axis time').first().innerText(), '06:00')
    assert.equal(await page.locator('.agenda-time-axis time').last().innerText(), '23:00')
    await settle(page); await page.screenshot({ path: `.private/screenshots/${test.name}-agenda.png`, fullPage: true })
    await page.getByRole('button', { name: 'Novo agendamento, encaixe ou bloqueio' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Criar encaixe', exact: true }).click()
    let dialog = page.getByRole('dialog', { name: 'Criar encaixe', exact: true })
    await dialog.waitFor()
    const professionalOptions = await dialog.getByLabel('Profissional', { exact: true }).locator('option').evaluateAll(options => options.map(option => option.value).filter(Boolean))
    assert.deepEqual(professionalOptions, [account.id], 'Encaixe permite somente o profissional conectado')
    const titleSize = await dialog.locator('h2').evaluate(element => parseFloat(getComputedStyle(element).fontSize))
    assert.ok(titleSize >= 15 && titleSize <= 20, 'Título do popup mantém a escala do app')
    await assertLayout(page); await close(page, 'Criar encaixe')
    const snapshot = await context.storageState()

    // UI-only fixtures: never POST goals, preferences or photos to the database.
    // Display updates cannot discard goals assigned by the administration.
    let prefs = { ...goals, visible_cards: ['earned', 'pending', 'services'], show_goals: true, goals_managed_by_admin: true, goals_assigned_by: 'Administração', goals_updated_at: today + 'T12:00:00-03:00' }
    await page.route('**/api/professional/preferences', async route => {
      if (route.request().method() === 'POST') {
        const payload = route.request().postDataJSON()
        assert.ok(payload.professional_id === account.id, 'Preferências da própria conta')
        assert.deepEqual(Object.keys(payload.preferences).sort(), ['show_goals', 'visible_cards'], 'O profissional envia somente preferências visuais')
        preferenceWrites.push({ show_goals: payload.preferences.show_goals, visible_cards: [...payload.preferences.visible_cards] })
        prefs = { ...prefs, ...payload.preferences }
      }
      await route.fulfill({ json: { data: prefs } })
    })
    await page.route('**/api/professional/photo', async route => {
      assert.ok(route.request().postDataJSON().professional_id === account.id, 'Foto da própria conta')
      await route.fulfill({ json: { data: { photo_url: base + '/professional-icon-192.png' } } })
    })
    await page.route('**/api/professional/cash?**', async route => {
      const url = new URL(route.request().url()), from = url.searchParams.get('from'), to = url.searchParams.get('to')
      assert.ok(url.searchParams.get('professional_id') === account.id, 'Caixa consulta somente a própria conta')
      assert.match(from, /^\d{4}-\d{2}-\d{2}$/); assert.match(to, /^\d{4}-\d{2}-\d{2}$/)
      cashRequests.push({ from, to })
      const factor = from === shiftDate(monday, -14) ? 0 : from === monday ? 1 : .5
      const at = from + 'T12:00:00-03:00'
      const entries = factor ? [
        { id: 'ui-service-pending', commission_cents: 30000 * factor, status: 'pending', description: 'Corte de cabelo', type: 'service', quantity: 12, customer_name: 'Cliente visual 1' },
        { id: 'ui-service-paid', commission_cents: 10000 * factor, status: 'paid', description: 'Corte e barba', type: 'service', quantity: 6, customer_name: 'Cliente visual 2' },
        { id: 'ui-product-paid', commission_cents: 5000 * factor, status: 'paid', description: 'Pomada modeladora', type: 'product', quantity: 1, customer_name: 'Cliente visual 2' },
      ].map(entry => ({ ...entry, created_at: at, occurred_at: at, paid_at: entry.status === 'paid' ? from + 'T13:00:00-03:00' : null })) : []
      const total = status => entries.filter(entry => !status || entry.status === status).reduce((sum, entry) => sum + entry.commission_cents, 0)
      await route.fulfill({ json: { data: { from, to, earned: total(), pending: total('pending'), paid: total('paid'), totalPending: 30000, services: factor ? 18 : 0, customers: factor ? 2 : 0, preferences: prefs, entries }, error: null } })
    })

    await page.getByRole('link', { name: 'Meu Caixa', exact: true }).click()
    await page.getByRole('heading', { name: 'Sua evolução', exact: true }).waitFor()
    await page.locator('.pro-cash-content[aria-busy="false"]').waitFor()
    assert.equal(await page.locator('.pro-results-grid article').count(), prefs.visible_cards.length, 'Quantidade de indicadores respeita a personalização')
    await expect(page.locator('.pro-result-earned strong')).toHaveText(money(45000))
    await expect(page.getByRole('progressbar', { name: 'Meta de comissão', exact: true })).toHaveAttribute('aria-valuenow', '56')
    await page.getByRole('button', { name: 'Ver meu progresso', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Meu progresso da semana', exact: true })
    assert.ok(await dialog.locator('.pro-goal-bar>span').first().evaluate(element => element.getAnimations().some(animation => animation.effect?.getComputedTiming().duration === 950)), 'Barra da meta inicia animação real')
    await expect(dialog).toContainText(money(35000)); await expect(dialog.locator('.pro-goal-tip')).toContainText('16 serviços')
    await expect(dialog.locator('input[type="number"]')).toHaveCount(0)
    await assertLayout(page); await settle(page); await page.screenshot({ path: `.private/screenshots/${test.name}-progresso.png` })
    await close(page, 'Meu progresso da semana')
    await page.getByRole('button', { name: 'Entender meu saldo', exact: true }).click()
    await page.getByRole('dialog', { name: 'Meu saldo a receber', exact: true }).getByRole('button', { name: 'Entendi', exact: true }).click()

    await page.getByRole('button', { name: 'Ver relatório', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Meu relatório', exact: true })
    await expect(dialog.locator('.report-donut-total strong')).toHaveText(money(45000))
    await expect(dialog.locator('.report-donut-breakdown')).toContainText(money(40000))
    await expect(dialog.locator('.report-donut-breakdown')).toContainText(money(5000))
    await expect(dialog.getByRole('combobox')).toHaveCount(0)
    await expect(dialog).toContainText('Somente suas comissões e atendimentos')
    await assertLayout(page); await settle(page); await page.screenshot({ path: `.private/screenshots/${test.name}-relatorio.png` })
    await dialog.getByRole('button', { name: 'Período', exact: true }).click()
    await close(page, 'Escolher período'); await expect(dialog).toBeVisible()
    await close(page, 'Meu relatório')

    await page.getByRole('button', { name: 'Ver semana passada', exact: true }).click()
    await expect(page.locator('.pro-result-earned strong')).toHaveText(money(22500))
    await page.getByRole('button', { name: 'Ver semana retrasada', exact: true }).click()
    await expect(page.locator('.pro-result-earned strong')).toHaveText(money(0))
    await expect(page.getByText('Nenhuma comissão neste filtro.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Ver relatório', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Meu relatório', exact: true })
    await expect(dialog.locator('.report-donut-total strong')).toHaveText(money(0))
    await expect(dialog.locator('.report-donut-segment')).toHaveCount(0)
    await close(page, 'Meu relatório')
    await page.getByRole('button', { name: 'Escolher período das comissões', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Escolher período', exact: true })
    await dialog.getByRole('button', { name: 'Personalizar datas', exact: true }).click()
    const custom = { from: shiftDate(today, -35), to: shiftDate(today, -21) }
    await dialog.getByLabel('Data inicial', { exact: true }).fill(custom.from)
    await dialog.getByLabel('Data final', { exact: true }).fill(custom.to)
    await dialog.getByRole('button', { name: 'Ver resultados', exact: true }).click()
    await expect(page.locator('.pro-result-earned strong')).toHaveText(money(22500))
    assert.ok(cashRequests.some(row => row.from === custom.from && row.to === custom.to), 'Datas escolhidas seguem corretamente à API')
    await page.getByRole('button', { name: 'Recebidas', exact: true }).click()
    await expect(page.locator('.pro-commission-row')).toHaveCount(2)
    await page.locator('.pro-commission-row').first().click()
    await page.getByRole('dialog', { name: 'Detalhes da comissão', exact: true }).getByRole('button', { name: 'Concluir', exact: true }).click()
    await page.getByRole('button', { name: 'Ver esta semana', exact: true }).click()
    await expect(page.locator('.pro-result-earned strong')).toHaveText(money(45000))
    await settle(page); await page.screenshot({ path: `.private/screenshots/${test.name}-caixa.png`, fullPage: true })

    await page.getByRole('button', { name: 'Opções de exibição das metas', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Personalizar meu Caixa', exact: true })
    await expect(dialog.locator('input[type="number"]')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: /Remover.*metas|Ajustar.*metas/ })).toHaveCount(0)
    await expect(dialog.locator('.pro-assigned-goals')).toContainText(money(80000))
    await dialog.getByRole('switch', { name: /Mostrar metas no Meu Caixa/ }).uncheck()
    await dialog.getByRole('button', { name: 'Salvar preferências', exact: true }).click()
    await expect(page.locator('.pro-goal-journey')).toHaveCount(0)
    assert.deepEqual(goalValues(prefs), goals, 'Ocultar preserva todas as metas administrativas')
    await page.getByRole('link', { name: 'Menu', exact: true }).click()
    await expect(page.getByText('Metas ocultas no Meu Caixa', { exact: true })).toBeVisible()
    const webLink = page.getByRole('link', { name: /^Versão web Entre/ })
    await expect(webLink).toHaveAttribute('href', 'https://barbearia-machado-rose.vercel.app/profissional')
    await expect(webLink).toHaveAttribute('target', '_blank')
    await webLink.click({ trial: true })
    await page.getByRole('button', { name: /^Minhas metas da semana Acompanhe/ }).click()
    dialog = page.getByRole('dialog', { name: 'Personalizar meu Caixa', exact: true })
    await expect(dialog.locator('input[type="number"]')).toHaveCount(0)
    await expect(dialog.locator('.pro-assigned-goals')).toContainText(money(80000))
    await dialog.getByRole('switch', { name: /Mostrar metas no Meu Caixa/ }).check()
    await dialog.getByRole('tab', { name: 'Indicadores', exact: true }).click()
    await dialog.getByLabel('Serviços realizados', { exact: true }).uncheck()
    await dialog.getByLabel('Comissão já repassada', { exact: true }).check()
    await dialog.getByRole('button', { name: 'Salvar preferências', exact: true }).click()
    await expect(page.getByText('Metas visíveis no Meu Caixa', { exact: true })).toBeVisible()
    assert.deepEqual(goalValues(prefs), goals, 'Reexibir e personalizar indicadores preserva os objetivos')
    assert.deepEqual(prefs.visible_cards, ['earned', 'pending', 'paid'])
    assert.ok(preferenceWrites.length >= 2)
    await page.getByRole('button', { name: 'Editar minha foto', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Minha foto de perfil', exact: true })
    await dialog.getByLabel('Escolher foto de perfil', { exact: true }).setInputFiles('public/professional-icon-192.png')
    await dialog.getByRole('button', { name: 'Salvar minha foto', exact: true }).click()
    await page.locator('.pro-header-avatar img').waitFor()
    assert.ok((await page.locator('.pro-header-avatar img').getAttribute('src')).includes('professional-icon-192.png'))
    await settle(page); await page.screenshot({ path: `.private/screenshots/${test.name}-menu.png`, fullPage: true })

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('link', { name: 'Meu Caixa', exact: true }).click()
    await page.getByRole('progressbar', { name: 'Meta de comissão', exact: true }).waitFor()
    await expect(page.locator('.pro-results-grid article')).toHaveCount(3)
    await expect(page.locator('.pro-result-services')).toHaveCount(0)
    await expect(page.locator('.pro-result-paid strong')).toHaveText(money(15000))
    assert.equal(await page.locator('.pro-primary-goal .pro-goal-bar>span').evaluate(element => element.getAnimations().length), 0, 'Respeita a preferência de reduzir movimentos')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.getByRole('button', { name: 'Minha conta', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Minha conta profissional', exact: true })
    assert.ok(await dialog.getByLabel('E-mail de acesso', { exact: true }).inputValue() === account.email, 'Conta mostra somente o próprio e-mail')
    await close(page, 'Minha conta profissional'); await assertLayout(page)
    const highlight = await page.locator('.pro-nav .mobile-nav-highlight').boundingBox(), nav = await page.locator('.pro-nav').boundingBox()
    assert.ok(highlight.width < nav.width * .35 && highlight.width > nav.width * .29)

    const reopened = await browser.newContext({ ...options, storageState: snapshot }), again = await reopened.newPage()
    try {
      await again.goto(base + '/profissional'); await again.getByRole('heading', { name: 'Minha Agenda', exact: true }).waitFor()
      // A single-account fixture works; an unrelated legacy UUID must still
      // resolve to the connected account rather than becoming a selector.
      const otherId = accounts.find(value => value?.id && value.id !== account.id)?.id ?? randomUUID()
      await again.goto(base + `/profissional/p/${encodeURIComponent(otherId)}/agenda`)
      await again.getByRole('heading', { name: 'Minha Agenda', exact: true }).waitFor()
      assert.equal(new URL(again.url()).pathname, '/profissional/agenda')
      assert.ok((await again.locator('.pro-header-identity').innerText()).includes(identity.name))
      await again.goto(base + '/admin'); await again.getByRole('heading', { name: 'Entrar no painel', exact: true }).waitFor()
    } finally { await reopened.close() }
    await page.goto(base + '/profissional/instalar')
    await page.getByRole('heading', { name: 'Machado Profissional', exact: true }).waitFor()
    const manifest = await page.locator('link[rel="manifest"]').getAttribute('href')
    assert.equal(manifest, '/professional.webmanifest')
    const manifestData = await (await context.request.get(base + manifest)).json()
    assert.equal(manifestData.start_url, '/profissional/agenda')
    assert.deepEqual(errors, [])
    console.log(`PASS ${test.name}: agenda compacta, metas administrativas preservadas, indicadores personalizáveis, relatório próprio, popups, Menu web e sessão isolada.`)
    results.push({ name: test.name, status: 'passed', live: ['login', 'compact-agenda-06h-23h', 'own-identity', 'session', 'admin-denial', 'manifest'], fixture: ['commission-only-report', 'empty-report', 'period-filters', 'goal-progress-animation', 'admin-goals-readonly', 'hide-preserves-goals', 'custom-indicators', 'own-photo-menu', 'web-link', 'ledger-details', 'reduced-motion'] })
  } catch (error) {
    await page.screenshot({ path: `.private/screenshots/${test.name}-failure.png`, fullPage: true })
    throw error
  } finally { await context.close(); await browser.close() }
}
await writeFile('.private/professional-browser-verification.json', JSON.stringify({ date: new Date().toISOString(), base, businessDataMutated: false, fixtureBoundary: 'Somente Caixa/preferências/foto interceptados no navegador; login/agenda/identidade/sessão usam a API real.', results, physicalDevice: 'Instalação e uso no iPhone físico não automatizados.' }, null, 2))

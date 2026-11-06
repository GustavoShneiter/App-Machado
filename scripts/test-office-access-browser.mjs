/* global document, window, navigator, performance */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, webkit, devices } from '@playwright/test'
import { fixture } from './operations-fixture.mjs'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const password = 'Password-only-for-browser-test-742!'
const identity = { id: '11111111-1111-4111-8111-111111111111', name: 'Ana Pereira', email: 'ana.browser@example.invalid' }
const business = { id: '22222222-2222-4222-8222-222222222222', name: 'Machado — Unidade Teste', unit_slug: 'machado-unidade-teste' }
const recoveryCodes = ['a'.repeat(48), 'b'.repeat(48), 'c'.repeat(48)]
const empty = Object.fromEntries(Object.keys(fixture).map(key => [key, []]))
const cases = [
  { name: 'android-web', engine: chromium, options: { viewport: { width: 390, height: 844 } } },
  { name: 'iphone-webkit', engine: webkit, options: devices['iPhone 13'] },
  { name: 'pc', engine: chromium, options: { viewport: { width: 1440, height: 1000 } } },
]
const results = []
await mkdir('.private/screenshots', { recursive: true })

for (const test of cases) for (const path of ['/admin', '/app/admin']) {
  const browser = await test.engine.launch(), context = await browser.newContext({ ...test.options, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' }), page = await context.newPage()
  const errors = [], unknown = [], calls = { register: 0, signIn: 0, signOut: 0 }, sentRegistration = []
  let loggedIn = false, mode = 'success', holdSession = false, releaseSession = null
  page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => { window.__copiedCodes = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copiedCodes = text } } }) })
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.pathname === '/api/catalog') return route.fulfill({ json: { data: { business: loggedIn ? business : { name: 'Barbearia Machado' }, services: [], professionals: [], links: [] }, error: null } })
    if (url.pathname === '/api/auth/get-session') {
      const sessionAtRequestStart = loggedIn
      if (holdSession) { holdSession = false; await new Promise(resolve => { releaseSession = resolve }) }
      return route.fulfill({ json: sessionAtRequestStart ? { user: identity, session: { id: 'session-browser-test', userId: identity.id } } : null })
    }
    if (url.pathname === '/api/register') {
      calls.register++; const body = request.postDataJSON(); sentRegistration.push(body)
      assert.deepEqual(Object.keys(body).sort(), ['business_name', 'email', 'name', 'password'])
      if (mode === 'duplicate') return route.fulfill({ status: 409, json: { error: { message: 'Este e-mail já tem uma conta. Entre ou recupere seu acesso.' } } })
      if (mode === 'rate') return route.fulfill({ status: 429, json: { error: { message: 'Muitas tentativas. Aguarde alguns minutos.' } } })
      if (mode === 'network') return route.abort('failed')
      return route.fulfill({ status: 201, json: { data: { user: identity, business, recoveryCodes } } })
    }
    if (url.pathname === '/api/auth/sign-in/email') {
      calls.signIn++
      if (mode === 'credentials') return route.fulfill({ status: 401, json: { message: 'Credenciais inválidas.' } })
      if (mode === 'rate') return route.fulfill({ status: 429, json: { message: 'Muitas tentativas.' } })
      if (mode === 'network') return route.abort('failed')
      const body = request.postDataJSON(); assert.equal(body.email, identity.email); assert.equal(body.password, password); assert.equal(body.rememberMe, true)
      loggedIn = true
      return route.fulfill({ json: { user: identity, token: 'test-session-not-a-real-credential' } })
    }
    if (url.pathname === '/api/auth/sign-out') { calls.signOut++; loggedIn = false; return route.fulfill({ json: { success: true } }) }
    if (url.pathname === '/api/rpc') {
      const { name } = request.postDataJSON()
      if (name === 'can_access_admin') return route.fulfill({ json: { data: loggedIn, error: null } })
      if (name === 'office_snapshot') return route.fulfill({ json: { data: { ...empty, business: [business] }, error: null } })
      unknown.push('rpc:' + name); return route.fulfill({ status: 400, json: { error: { message: 'RPC sem fixture: ' + name } } })
    }
    if (url.pathname === '/api/system-status') return route.fulfill({ json: { version: 'test', professionalVersion: 'test', backend: 'Vercel', database: 'Neon', lastBackup: null } })
    unknown.push(url.pathname); return route.fulfill({ status: 404, json: { error: { message: 'Endpoint sem fixture.' } } })
  })
  const field = label => page.getByLabel(label, { exact: true })
  const signup = () => page.getByRole('button', { name: 'Criar conta e unidade', exact: true }).click()
  const login = () => page.getByRole('button', { name: 'Entrar', exact: true }).click()
  const alert = () => page.getByRole('alert')
  const settle = () => page.waitForTimeout(400)
  try {
    await page.goto(base + path)
    await page.getByRole('heading', { name: path.startsWith('/app') ? 'Machado Gestão' : 'Entrar no painel', exact: true }).waitFor()
    assert.equal(await field('Senha').inputValue(), '', 'login não recebe senha automática')
    await page.getByRole('button', { name: 'Cadastrar conta', exact: true }).click()
    await page.getByRole('heading', { name: 'Cadastrar unidade', exact: true }).waitFor()
    assert.equal(await page.locator('.access-card').evaluate(form => form.noValidate), true)
    await field('Seu nome').fill(identity.name); await field('Nome da unidade').fill(business.name); await field('E-mail').fill(identity.email); await field('Senha').fill(password); await field('Repita a senha').fill(password)
    for (const [label, invalid, valid, message] of [['Seu nome', 'A', identity.name, /seu nome/i], ['Nome da unidade', 'M', business.name, /nome da unidade/i], ['E-mail', 'email-invalido', identity.email, /e-mail válido/i], ['Senha', 'curta', password, /12 a 128/i], ['Repita a senha', 'Outro-password-de-teste', password, /senhas precisam ser iguais/i]]) {
      await field(label).fill(invalid); await signup(); assert.match(await alert().innerText(), message); assert.equal(await field(label).getAttribute('aria-invalid'), 'true'); assert.equal(await field(label).evaluate(input => input === document.activeElement), true); assert.equal(calls.register, 0); await field(label).fill(valid)
    }
    for (const [failure, message] of [['duplicate', /e-mail já tem uma conta/i], ['rate', /Muitas tentativas/i], ['network', /Não foi possível conectar|Confira a internet|Confira sua conexão/i]]) {
      mode = failure; await signup(); assert.match(await alert().innerText(), message); assert.equal(loggedIn, false); assert.equal(await page.getByRole('button', { name: 'Criar conta e unidade', exact: true }).isDisabled(), false)
    }
    mode = 'success'; await signup()
    await page.getByRole('heading', { name: 'Sua unidade está pronta', exact: true }).waitFor()
    assert.equal(calls.signIn, 0, 'cadastro não autentica automaticamente'); assert.equal(loggedIn, false)
    assert.deepEqual(await page.locator('.access-recovery-codes code').allTextContents(), recoveryCodes)
    assert.equal(await page.locator('input[type=password]').count(), 0)
    assert.equal((await page.locator('body').innerText()).includes(password), false)
    assert.equal(await page.evaluate(codes => [window.localStorage, window.sessionStorage].some(storage => Object.values(storage).some(value => codes.some(code => String(value).includes(code)))), recoveryCodes), false)
    await page.getByRole('button', { name: 'Copiar códigos', exact: true }).click(); await page.getByRole('button', { name: 'Códigos copiados', exact: true }).waitFor()
    const copied = await page.evaluate(() => window.__copiedCodes); assert.ok(recoveryCodes.every(code => copied.includes(code))); assert.ok(copied.includes(identity.email)); assert.ok(!copied.includes(password))
    await settle(); await page.screenshot({ path: `.private/screenshots/nov06-office-register-${test.name}-${path.startsWith('/app') ? 'app' : 'pc-route'}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Guardei os códigos. Entrar', exact: true }).click()
    assert.equal(await field('E-mail').inputValue(), identity.email); assert.equal(await field('Senha').inputValue(), ''); assert.equal(await page.locator('.access-recovery-codes').count(), 0)
    await field('Senha').fill(password)
    for (const [failure, message] of [['credentials', /E-mail ou senha inválidos/i], ['rate', /Muitas tentativas/i], ['network', /Não foi possível conectar|Confira a internet|Confira sua conexão/i]]) { mode = failure; await login(); assert.match(await alert().innerText(), message); assert.equal(loggedIn, false) }
    mode = 'success'
    // A late, pre-login getSession response must not overwrite SIGNED_IN.
    holdSession = true
    await page.evaluate(async () => {
      const modules = performance.getEntriesByType('resource').filter(entry => entry.name.includes('/src/dataClient.ts'))
      const { backend } = await import(modules[modules.length - 1]?.name || '/src/dataClient.ts')
      window.__sessionRaceTask = backend.auth.getSession(true)
    })
    for (let i = 0; i < 25 && !releaseSession; i++) await page.waitForTimeout(20)
    assert.equal(typeof releaseSession, 'function')
    await login(); await page.getByRole('heading', { name: 'Visão geral', exact: true }).waitFor()
    releaseSession(); releaseSession = null
    assert.equal(await page.evaluate(async () => (await window.__sessionRaceTask).data.session?.user.email), identity.email)
    await settle(); await page.getByRole('heading', { name: 'Visão geral', exact: true }).waitFor()
    assert.equal(await page.locator('.topbar').getByRole('button', { name: /Atualizar/i }).count(), 0)
    const menus = page.getByRole('link', { name: /^(Menu|Configurações)$/ }); let opened = false
    for (const item of await menus.all()) if (await item.isVisible()) { await item.click(); opened = true; break }
    assert.ok(opened, 'Menu da administração disponível')
    await page.getByRole('heading', { name: 'Menu', exact: true }).waitFor()
    const versions = page.getByRole('region', { name: 'Versões web da administração' }).or(page.locator('.admin-web-versions'))
    const pcLink = versions.getByRole('link', { name: /Versão web admin/ }), appLink = versions.locator('a[href="https://barbearia-machado-rose.vercel.app/app"]')
    assert.equal(await pcLink.getAttribute('href'), 'https://barbearia-machado-rose.vercel.app/admin')
    assert.equal(await appLink.getAttribute('href'), 'https://barbearia-machado-rose.vercel.app/app')
    assert.ok((await appLink.innerText()).includes('Versão web'))
    await appLink.click({ trial: true }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false)
    await page.locator('.page').getByRole('button', { name: 'Sair da conta', exact: true }).click()
    await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor(); assert.equal(loggedIn, false); assert.equal(calls.signOut, 1); assert.equal(await field('Senha').inputValue(), '')
    await page.reload(); await page.getByRole('button', { name: 'Cadastrar conta', exact: true }).waitFor(); assert.equal(await page.locator('.access-recovery-codes').count(), 0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false)
    assert.deepEqual(errors, []); assert.deepEqual(unknown, []); assert.equal(sentRegistration[sentRegistration.length - 1].business_name, business.name)
    results.push({ browser: test.name, path, status: 'passed', inlineValidation: true, recoveryCodesSingleDisplay: true, noAutomaticLogin: true, staleGetSessionGuard: true, realSignOutFlow: true, webLinks: true, errors: ['409', '429', 'network', 'invalid-credentials'] })
    console.log(`PASS ${test.name} ${path}: cadastro isolado simulado, validação, códigos únicos na tela, login normal, corrida de sessão, links e sair.`)
  } catch (error) { await page.screenshot({ path: `.private/screenshots/nov06-office-access-failure-${test.name}-${path.startsWith('/app') ? 'app' : 'admin'}.png`, fullPage: true }); throw error }
  finally { if (releaseSession) releaseSession(); await browser.close() }
}
await writeFile('.private/nov06-office-access-browser-verification.json', JSON.stringify({ date: new Date().toISOString(), base, fixtureOnly: true, noDatabaseWrites: true, results }, null, 2))

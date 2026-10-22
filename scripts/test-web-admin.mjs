import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { chromium, webkit, devices } from '@playwright/test'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const account = JSON.parse(await readFile('.private/qa-account.json', 'utf8'))
await mkdir('.private/screenshots', { recursive: true })
for (const [engine, options, label] of [
  [chromium, { viewport: { width: 1440, height: 900 } }, 'pc'],
  [webkit, { ...devices['iPhone 13'] }, 'iphone'],
]) {
  const browser = await engine.launch({ headless: true })
  const context = await browser.newContext({ ...options, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(base + '/admin')
    await page.getByRole('heading', { name: 'Entrar no painel', exact: true }).waitFor()
    assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), '/admin.webmanifest')
    assert.equal(await page.title(), 'Machado Gestão')
    const manifestResponse = await page.request.get(base + '/admin.webmanifest')
    assert.equal(manifestResponse.status(), 200)
    const manifest = await manifestResponse.json()
    assert.equal(manifest.start_url, '/admin'); assert.equal(manifest.display, 'standalone')
    for (const icon of manifest.icons) { const response = await page.request.get(base + icon.src); assert.equal(response.status(), 200); assert.match(response.headers()['content-type'], /image\/png/) }
    const appleIcon = await page.request.get(base + '/apple-touch-icon.png'); assert.equal(appleIcon.status(), 200)
    await page.getByText('Adicionar ao iPhone', { exact: true }).click()
    await page.screenshot({ path: `.private/screenshots/web-access-1194-${label}.png`, animations: 'disabled' })
    await page.getByLabel('E-mail', { exact: true }).fill(account.email)
    await page.getByLabel('Senha', { exact: true }).fill(account.password)
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await page.getByRole('heading', { name: 'Visão geral', exact: true }).waitFor()
    await page.goto(base + '/admin/agenda')
    await page.locator('.agenda-professionals button').first().waitFor()
    await page.getByRole('button', { name: 'Semana selecionada: escolher mês e ano' }).click()
    const dialog = page.getByRole('dialog', { name: 'Escolher data', exact: true })
    await dialog.getByLabel('Ano', { exact: true }).selectOption('2028')
    await dialog.getByLabel('Mês', { exact: true }).selectOption('1')
    await dialog.getByRole('button', { name: 'Selecionar 29/02/2028', exact: true }).click()
    assert.match(await page.locator('.agenda-week-picker').innerText(), /fevereiro de 2028/i)
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth + 1), false)
    await page.screenshot({ path: `.private/screenshots/web-admin-1194-${label}.png`, animations: 'disabled' })
    await page.goto(base + '/')
    await page.getByRole('link', { name: /Agendamento/ }).first().waitFor()
    assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), '/manifest.webmanifest')
    assert.deepEqual(errors, [])
    console.log(`PASS web admin ${label}: login, sessão após recarregar, API/Neon, calendário, manifest administrativo, ícones e entrada pública separada.`)
  } finally { await browser.close() }
}

import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { chromium, webkit, devices } from '@playwright/test'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const account = JSON.parse(await readFile('.private/qa-account.json', 'utf8'))
await mkdir('.private/screenshots', { recursive: true })
for (const [engine, settings, label] of [
  [chromium, { viewport: { width: 390, height: 844 } }, 'android-web'],
  [webkit, { ...devices['iPhone 13'] }, 'iphone-web'],
]) {
  const browser = await engine.launch({ headless: true })
  const options = { ...settings, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' }
  const context = await browser.newContext(options), page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(base + '/app')
    await page.getByRole('heading', { name: 'Machado Gestão', exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/app/admin')
    assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), '/app.webmanifest')
    const manifest = await (await page.request.get(base + '/app.webmanifest')).json()
    assert.equal(manifest.start_url, '/app/admin'); assert.equal(manifest.scope, '/app/'); assert.equal(manifest.display, 'standalone')
    await page.getByRole('link', { name: 'Adicionar ao iPhone', exact: true }).click()
    await page.getByRole('heading', { name: 'Seu aplicativo no iPhone', exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/app/instalar')
    await page.screenshot({ path: `.private/screenshots/app-instalar-${label}.png`, animations: 'disabled' })
    await page.getByRole('link', { name: 'Abrir Machado Gestão', exact: true }).click()
    await page.getByRole('link', { name: 'Esqueci minha senha', exact: true }).click()
    await page.getByRole('heading', { name: /acesso|senha/i }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/app/recuperar-acesso')
    await page.getByRole('link', { name: 'Voltar ao painel', exact: true }).click()
    await page.getByLabel('E-mail', { exact: true }).fill(account.email)
    await page.getByLabel('Senha', { exact: true }).fill(account.password)
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await page.getByRole('heading', { name: 'Visão geral', exact: true }).waitFor()
    const nav = page.getByRole('navigation', { name: 'Navegação principal', exact: true })
    assert.deepEqual(await nav.getByRole('link').allTextContents(), ['Caixa', 'Comandas', 'Agenda', 'Clientes', 'Menu'])
    for (const [name, section] of [['Caixa', 'caixa'], ['Comandas', 'comandas'], ['Agenda', 'agenda'], ['Clientes', 'clientes'], ['Menu', 'configuracoes']]) {
      const link = nav.getByRole('link', { name, exact: true })
      assert.equal(await link.getAttribute('href'), `/app/admin/${section}`)
      await link.click(); await page.waitForTimeout(450)
      assert.equal(new URL(page.url()).pathname, `/app/admin/${section}`)
      assert.equal(await nav.locator('a.active').innerText(), name)
      const iconWidth = await nav.locator('a.active svg').evaluate(element => globalThis.getComputedStyle(element).width); assert.equal(iconWidth, '22px')
      const active = await link.boundingBox(), highlight = await nav.locator('.mobile-nav-highlight').boundingBox()
      assert.ok(Math.abs(active.x - highlight.x) < 2 && Math.abs(active.width - highlight.width) < 2)
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth + 1), false)
      if (name === 'Agenda') {
        assert.equal(await page.locator('.agenda-create-toolbar').count(), 0)
        await page.getByRole('button', { name: 'Semana selecionada: escolher mês e ano' }).click()
        const dialog = page.getByRole('dialog', { name: 'Escolher data', exact: true })
        await dialog.getByLabel('Ano', { exact: true }).selectOption('2028'); await dialog.getByLabel('Mês', { exact: true }).selectOption('1')
        await dialog.getByRole('button', { name: 'Selecionar 29/02/2028', exact: true }).click()
      }
      if (name === 'Clientes') {
        await page.getByRole('button', { name: 'Novo cliente', exact: true }).first().click()
        const dialog = page.getByRole('dialog', { name: 'Novo cliente', exact: true })
        assert.equal(await dialog.locator('h2').evaluate(element => globalThis.getComputedStyle(element).fontSize), '17px')
        assert.equal(await dialog.evaluate(element => element.scrollWidth > element.clientWidth + 1), false)
        await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
      }
      if (name === 'Menu') {
        await page.getByRole('heading', { name: 'Administração do proprietário', exact: true }).waitFor()
        assert.equal(await page.getByRole('button', { name: 'Zerar agenda, caixa e relatórios', exact: true }).count(), 0)
        assert.equal(await page.getByRole('heading', { name: 'Gestão no PC e no iPhone', exact: true }).count(), 0)
        await page.locator('.menu-shortcuts a').filter({ hasText: 'Serviços' }).click()
        assert.equal(new URL(page.url()).pathname, '/app/admin/servicos')
        await page.getByRole('button', { name: 'Novo serviço', exact: true }).click()
        await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click()
        await nav.getByRole('link', { name: 'Menu', exact: true }).click()
        await page.getByRole('heading', { name: 'Menu', exact: true }).waitFor()
      }
      await page.screenshot({ path: `.private/screenshots/app-${label}-${section}.png`, animations: 'disabled' })
    }
    const state = await context.storageState()
    const reopened = await browser.newContext({ ...options, storageState: state }), again = await reopened.newPage()
    await again.goto(base + '/app/admin/agenda'); await again.locator('.agenda-professionals button').first().waitFor()
    assert.equal(await again.getByRole('button', { name: 'Entrar', exact: true }).count(), 0)
    await reopened.close()
    await page.goto(base + '/admin/configuracoes')
    await page.getByRole('heading', { name: 'Cópias de segurança', exact: true }).waitFor()
    assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), '/admin.webmanifest')
    await page.goto(base + '/'); await page.getByRole('link', { name: /Agendamento/ }).first().waitFor()
    assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), '/manifest.webmanifest')
    assert.deepEqual(errors, [])
    console.log(`PASS ${label}: modo aplicativo, cinco seções, navegação verde, janelas da base Android, Menu equivalente, calendário, sessão preservada e painel/site separados.`)
  } finally { await browser.close() }
}

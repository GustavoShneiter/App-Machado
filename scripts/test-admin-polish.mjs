import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, webkit, devices } from '@playwright/test'

await mkdir('.private/screenshots', { recursive: true })
for (const [engine, options, name] of [
  [chromium, { viewport: { width: 1440, height: 900 } }, 'pc'],
  [chromium, { viewport: { width: 360, height: 640 } }, 'android-small'],
  [webkit, { ...devices['iPhone 13'] }, 'iphone-webkit'],
]) {
  const browser = await engine.launch({ headless: true })
  const page = await browser.newPage({ ...options, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  const viewport = page.viewportSize()
  async function bounds(dialog) {
    await dialog.waitFor(); await page.waitForTimeout(260)
    const box = await dialog.boundingBox()
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${name}: janela fora da tela`)
    assert.ok(box.width <= 501, `${name}: janela larga demais`)
    assert.equal(await dialog.evaluate(element => element.scrollWidth > element.clientWidth + 1), false)
    assert.ok(parseFloat(await dialog.locator('h2').evaluate(element => globalThis.getComputedStyle(element).fontSize)) <= 18)
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click({ trial: true })
  }
  async function close() { await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click() }
  async function section(label) {
    if (viewport.width > 980 && !['Pacotes', 'Empresa'].includes(label)) await page.locator('.sidebar').getByRole('link', { name: label, exact: true }).click()
    else if (['Agenda', 'Caixa', 'Comandas', 'Clientes'].includes(label)) await page.locator('.mobile-nav').getByRole('link', { name: label, exact: true }).click()
    else {
      await page.getByRole('link', { name: viewport.width > 980 ? 'Configurações' : 'Menu', exact: true }).last().click()
      await page.locator('.menu-shortcuts a').filter({ hasText: label === 'Produtos' ? 'Produtos e estoque' : label }).click()
    }
    await page.waitForTimeout(260)
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth + 1), false, `${name}: ${label} estourou a tela`)
  }
  try {
    await page.goto('http://127.0.0.1:5188/__qa')
    await page.locator('.agenda-professionals button').first().waitFor()
    assert.equal(await page.locator('.agenda-create-toolbar').count(), 0)
    assert.ok((await page.locator('.agenda-professionals button>span').first().boundingBox()).width <= 42)
    await page.screenshot({ path: `.private/screenshots/agenda-1194-${name}.png` })
    await page.getByRole('button', { name: 'Semana selecionada: escolher mês e ano' }).click()
    let dialog = page.getByRole('dialog', { name: 'Escolher data' }); await bounds(dialog)
    await dialog.getByLabel('Ano', { exact: true }).selectOption('2028')
    await dialog.getByLabel('Mês', { exact: true }).selectOption('1')
    await page.screenshot({ path: `.private/screenshots/calendar-1194-${name}.png` })
    await dialog.getByRole('button', { name: 'Selecionar 29/02/2028', exact: true }).click()
    assert.match(await page.locator('.agenda-week-picker').innerText(), /fevereiro de 2028/i)
    assert.match(await page.locator('.agenda-week button.active').innerText(), /29/)
    await page.getByRole('button', { name: 'Próxima semana', exact: true }).click()
    assert.match(await page.locator('.agenda-week-picker').innerText(), /março de 2028/i)
    await page.getByRole('button', { name: 'Semana selecionada: escolher mês e ano' }).click()
    dialog = page.getByRole('dialog'); await dialog.getByLabel('Ano', { exact: true }).selectOption('2026'); await dialog.getByLabel('Mês', { exact: true }).selectOption('8')
    await dialog.getByRole('button', { name: 'Selecionar 18/09/2026', exact: true }).click()
    await page.locator('.agenda-event.blocked').first().click(); await bounds(page.getByRole('dialog')); await close()
    await page.locator('.agenda-event:not(.blocked)').first().click(); await bounds(page.getByRole('dialog')); await close(); await section('Agenda')
    await page.locator('.mobile-create').click(); await bounds(page.getByRole('dialog')); await page.getByRole('button', { name: 'Ver bloqueios', exact: true }).click(); await bounds(page.getByRole('dialog')); await close()
    await section('Clientes')
    for (const label of ['Editar Cliente integrado', 'Histórico de Cliente integrado']) { await page.getByRole('button', { name: label, exact: true }).click(); await bounds(page.getByRole('dialog')); await close() }
    await section('Comandas')
    for (const label of ['Nova comanda', 'Itens', 'Receber']) { await page.getByRole('button', { name: label, exact: true }).first().click(); await bounds(page.getByRole('dialog')); await close() }
    await section('Caixa')
    await page.getByRole('button', { name: 'Fechar caixa', exact: true }).click(); await bounds(page.getByRole('dialog')); await close()
    await page.getByRole('button', { name: 'Novo lançamento', exact: true }).first().click(); await bounds(page.getByRole('dialog')); await close()
    await section('Produtos')
    for (const label of ['Editar', 'Estoque']) { await page.getByRole('button', { name: label, exact: true }).first().click(); await bounds(page.getByRole('dialog')); await close() }
    await section('Serviços'); await page.getByRole('button', { name: 'Editar Corte integrado', exact: true }).first().click(); await bounds(page.getByRole('dialog')); await close()
    await section('Profissionais'); await page.getByRole('button', { name: 'Editar', exact: true }).first().click(); await bounds(page.getByRole('dialog')); await page.getByRole('button', { name: 'Configurar comissões' }).click(); await bounds(page.getByRole('dialog')); await close()
    await section('Pacotes')
    await page.getByRole('button', { name: 'Vender', exact: true }).click(); await bounds(page.getByRole('dialog')); await close()
    await page.getByRole('button', { name: /Vendidos/ }).click(); await page.getByRole('button', { name: 'Usar sessão', exact: true }).click(); await bounds(page.getByRole('dialog')); await close()
    await section('Empresa'); await section('Relatórios')
    await page.getByRole('link', { name: viewport.width > 980 ? 'Configurações' : 'Menu', exact: true }).last().click()
    await page.getByText('Adicionar ao iPhone', { exact: true }).click()
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth + 1), false)
    assert.deepEqual(errors, [])
    console.log(`PASS ${name}: calendário com mês/ano, ano bissexto, semana, Agenda limpa; edição, histórico, bloqueios, Comandas, Caixa, estoque, comissões e pacotes dentro da tela.`)
  } catch (error) { await page.screenshot({path:'.private/screenshots/polish-failure-'+name+'.png'}); throw error } finally { await browser.close() }
}

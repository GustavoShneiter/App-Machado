import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium, request } from '@playwright/test'

// Only the disposable database; never select a target through an environment URL.
const base = 'http://127.0.0.1:5173'
const sandbox = JSON.parse(await readFile('.private/nov06-sandbox.json', 'utf8'))
const processes = JSON.parse(await readFile('.private/nov06-dev-processes.json', 'utf8'))
assert.match(sandbox.databaseName, /^machado_qa_units_[a-f0-9]+$/)
assert.equal(sandbox.removed, false); assert.equal(processes.apiMode, 'sandbox')
const tag = randomUUID().slice(0, 8), contexts = [], checks = []
const browser = await chromium.launch({ headless: true })
async function context(number) {
  const value = await request.newContext({ baseURL: base, extraHTTPHeaders: { Origin: base, 'x-forwarded-for': `2001:db8:${tag.slice(0, 4)}:${tag.slice(4)}::${number}` } })
  contexts.push(value); return value
}
async function call(ctx, path, body, status = 200) {
  const response = await ctx[body === undefined ? 'get' : 'post']('/api' + path, body === undefined ? {} : { data: body })
  const result = await response.json()
  assert.equal(response.status(), status, path + ': ' + (result.error?.message || response.status()))
  return result.data
}
const rpc = (ctx, name, params = {}, slug) => call(ctx, '/rpc' + (slug ? '?unit=' + slug : ''), { name, params })
try {
  const owner = await context(1), anon = await context(2), competing = await context(3)
  assert.equal((await call(anon, '/catalog')).business.name, 'Machado — unidade de testes')
  const email = `booking.${tag}@example.invalid`, password = 'QA-booking-' + randomUUID()
  const created = await call(anon, '/register', { name: 'Responsável Agenda QA', business_name: 'Machado Agenda QA ' + tag, email, password }, 201)
  await call(owner, '/auth/sign-in/email', { email, password })
  const pro = (await rpc(owner, 'save_professional_profile', { payload: { name: 'Barbeiro Agenda QA', active: true, service_commission: 50, product_commission: 20 } })).id
  const service = (await rpc(owner, 'save_service_profile', { payload: { name: 'Corte Agenda QA', price: 4000, duration: 40, active: true, commission_mode: 'professional' } })).id
  const slug = (await call(owner, '/catalog')).business.unit_slug
  const day = new Date(Date.now() + 2 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const params = { chosen_service: service, booking_day: day, preferred_professional: pro }
  let slots = await rpc(anon, 'public_booking_slots', params, slug)
  assert.deepEqual(slots.slice(0, 3).map(row => row.slot_time.slice(0, 5)), ['06:00', '06:40', '07:20'])
  assert.equal(slots.at(-1).slot_time.slice(0, 5), '22:00')
  const block = (await rpc(owner, 'create_schedule_block', { professional_id: pro, starts_at: day + 'T07:20:00-03:00', ends_at: day + 'T08:00:00-03:00', reason: 'Pausa QA' })).id
  slots = await rpc(anon, 'public_booking_slots', params, slug)
  assert.equal(slots.find(row => row.slot_time.startsWith('07:20')).available, false)
  await rpc(owner, 'delete_schedule_block', { block_id: block })
  const weekday = ((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1
  const recurring = (await rpc(owner, 'create_recurring_schedule_block', { payload: { professional_id: pro, starts_on: day, until_on: day, weekdays: [weekday], start_time: '09:20', end_time: '10:00', reason: 'Recorrência QA' } })).id
  slots = await rpc(anon, 'public_booking_slots', params, slug)
  assert.equal(slots.find(row => row.slot_time.startsWith('09:20')).available, false)
  await rpc(owner, 'delete_recurring_schedule_block', { block_id: recurring })
  checks.push('grade 06h–23h com intervalos de 40min, bloqueio pontual e recorrente')

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base + '/?unidade=' + slug)
  await page.getByRole('heading', { name: 'Como podemos te atender?' }).waitFor()
  assert.ok((await page.getByRole('link', { name: /Agendamento Reserve/ }).getAttribute('href')).includes('unidade=' + slug))
  // An unconfigured new unit must not send customers to the primary unit's phone.
  assert.equal(await page.locator('a[href^="https://wa.me/"]').count(), 0)
  await page.getByRole('link', { name: /Agendamento Reserve/ }).click()
  await page.getByRole('heading', { name: 'Escolha seu serviço' }).waitFor()
  await page.locator('.service-options button').filter({ hasText: 'Corte Agenda QA' }).click()
  await page.getByRole('heading', { name: 'Preferência de profissional' }).waitFor()
  await page.locator('.professional-card').filter({ hasText: 'Barbeiro Agenda QA' }).click()
  await page.getByRole('heading', { name: 'Escolha o horário' }).waitFor()
  await page.getByLabel('Escolha uma data').fill(day, { force: true })
  await page.locator('.slots button:not([disabled])').first().waitFor()
  await page.locator('.slots button').filter({ hasText: '08:00' }).click()
  await page.getByLabel('Nome completo').fill('Cliente Navegador QA')
  await page.getByLabel('WhatsApp', { exact: true }).fill('45999990111')
  assert.equal(await page.getByRole('checkbox').count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Continuar', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click()
  await page.getByRole('heading', { name: 'Até breve!' }).waitFor()
  assert.ok((await page.getByRole('link', { name: 'Fazer outro agendamento' }).getAttribute('href')).includes('unidade=' + slug))
  const snapshot = await rpc(owner, 'office_snapshot')
  const appointment = snapshot.appointments.find(row => row.customer_name === 'Cliente Navegador QA')
  assert.equal(appointment.professional_id, pro)
  slots = await rpc(anon, 'public_booking_slots', params, slug)
  assert.equal(slots.find(row => row.slot_time.startsWith('08:00')).available, false)
  checks.push('landing da unidade → serviço/profissional automático → reserva → Agenda sem aceite extra')

  const payload = { customer_name: 'Cliente Concorrência QA', customer_phone: '45999990112', chosen_service: service, chosen_professional: pro, start_time: day + 'T08:40:00-03:00' }
  const results = await Promise.all([anon, competing].map(ctx => ctx.post('/api/rpc?unit=' + slug, { data: { name: 'create_public_appointment', params: payload } })))
  assert.deepEqual(results.map(row => row.status()).sort(), [200, 400])
  const final = await rpc(owner, 'office_snapshot')
  assert.equal(final.appointments.filter(row => new Date(row.starts_at).getTime() === new Date(payload.start_time).getTime()).length, 1)
  const primary = (await call(anon, '/catalog')).business
  assert.notEqual(primary.unit_slug, slug)
  assert.deepEqual(await rpc(anon, 'public_booking_slots', params, primary.unit_slug), [])
  assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false)
  assert.deepEqual(errors, [])
  await page.screenshot({ path: '.private/screenshots/nov06-public-unit-booking.png', fullPage: true })
  checks.push('duas reservas simultâneas: apenas uma aceita; serviço não aparece na unidade vizinha')
  await writeFile('.private/nov06-unit-booking-verification.json', JSON.stringify({ date: new Date().toISOString(), databaseName: sandbox.databaseName, productionDataTouched: false, unit: created.business.id, passed: true, checks }, null, 2))
  console.log('PASS navegador → API → banco: agendamento público da própria unidade, Agenda, bloqueios e concorrência.')
} finally { await browser.close(); await Promise.all(contexts.map(ctx => ctx.dispose())) }

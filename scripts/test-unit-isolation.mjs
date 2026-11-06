import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import pg from 'pg'
import { pool, resolveBusinessUnit } from '../server/db.mjs'
import { createOfficeRegistration } from '../server/registration.mjs'
import { ensureProfessionalAccess, professionalFor } from '../server/professionals.mjs'

// Disposable DATABASE, never fixtures in the live business. Its runtime role is
// uniquely named too, because Postgres roles are shared by every database.
const suffix = randomBytes(6).toString('hex')
const dbName = 'machado_qa_units_' + suffix, runtimeRole = 'machado_runtime_qa_' + suffix
const quote = name => { assert.match(name, /^[a-z][a-z0-9_]{1,62}$/); return '"' + name + '"' }
const sourceUrl = new URL(process.env.DATABASE_URL)
assert.notEqual(dbName, sourceUrl.pathname.slice(1))
const tempUrl = new URL(sourceUrl); tempUrl.pathname = '/' + dbName; tempUrl.searchParams.delete('sslmode')
let temporary, created = false
const checks = [], started = Date.now()
const sql = async (client, text, values = []) => (await client.query(text, values)).rows
async function scope(client, userId, unitId, work, commit = true) {
  await client.query('begin')
  try {
    await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.business_id',$2,true)", [userId || '', unitId || ''])
    await client.query('set local role ' + quote(runtimeRole))
    const result = await work(client)
    await client.query(commit ? 'commit' : 'rollback')
    return result
  } catch (error) { await client.query('rollback'); throw error }
}
async function denied(work, code) { await assert.rejects(work, error => error.code === code) }
async function fingerprints(client, tables) {
  const result = {}
  for (const name of tables) result[name] = (await sql(client, `select md5(coalesce(jsonb_agg(to_jsonb(t)-'tenant_id' order by (to_jsonb(t)-'tenant_id')::text)::text,'[]')) digest from ${name} t`))[0].digest
  return result
}
try {
  await pool.query('create database ' + quote(dbName)); created = true
  temporary = new pg.Pool({ connectionString: tempUrl.toString(), ssl: { rejectUnauthorized: true }, max: 1, statement_timeout: 90000 })
  const client = await temporary.connect()
  try {
    for (const file of (await readdir('database')).filter(name => /^\d{3}_.+\.sql$/.test(name) && Number(name.slice(0, 3)) <= 10).sort()) await client.query(await readFile('database/' + file, 'utf8'))
    const oldId = randomUUID(), oldService = randomUUID()
    await client.query('begin')
    await client.query('insert into auth.users(id,email) values($1,$2)', [oldId, 'legacy-' + suffix + '@example.invalid'])
    await client.query("insert into profiles(id,name,role,created_at,updated_at) values($1,'Machado legado','owner','2026-01-01','2026-01-02')", [oldId])
    await client.query("insert into business_settings(id,name,updated_at) values(true,'Machado original','2026-01-02')")
    await client.query("insert into services(id,name,price_cents,duration_minutes,created_at,updated_at) values($1,'Corte original',4000,40,'2026-01-01','2026-01-02')", [oldService])
    await client.query("insert into customers(name,phone,created_at,updated_at) values('Cliente original','45999990001','2026-01-01','2026-01-02')")
    await client.query('commit')
    const tables = (await sql(client, "select quote_ident(schemaname)||'.'||quote_ident(tablename) name from pg_tables where schemaname in ('public','auth') order by schemaname,tablename")).map(row => row.name)
    const before = await fingerprints(client, tables)
    await client.query('begin')
    await client.query((await readFile('database/011_unit_accounts.sql', 'utf8')).replaceAll('machado_runtime', runtimeRole))
    assert.deepEqual(await fingerprints(client, tables), before, 'Backfill changed historical values/timestamps')
    await client.query('commit')
    checks.push('all historical rows, IDs and timestamps preserved by fast-default backfill')

    const primary = (await sql(client, 'select id,slug from business_units where is_primary'))[0]
    const register = createOfficeRegistration({ provision: async payload => {
      await client.query('begin')
      try { const value = (await sql(client, 'select provision_workspace_owner($1::jsonb) value', [payload]))[0].value; await client.query('commit'); return value }
      catch (error) { await client.query('rollback'); throw error }
    } })
    const input = label => ({ name: 'Responsável ' + label, business_name: 'Machado Unidade ' + label, email: `qa.${suffix}.${label.toLowerCase()}@example.invalid`, password: 'QA-unidade-' + randomUUID() })
    const aInput = input('A'), bInput = input('B'), a = await register(aInput), b = await register(bInput)
    assert.equal(a.recoveryCodes.length, 3); assert.equal(new Set(a.recoveryCodes).size, 3)
    assert.notEqual(a.business.id, b.business.id)
    await assert.rejects(() => register({ ...aInput, email: aInput.email.toUpperCase() }), error => error.status === 409)
    assert.equal((await sql(client, 'select count(*)::int n from business_units'))[0].n, 3)
    checks.push('atomic owner/unit registration, normalized global email uniqueness and one-time recovery codes')

    const objects = {}
    for (const [label, account] of [['A', a], ['B', b]]) {
      objects[label] = await scope(client, account.user.id, account.business.id, async c => {
        assert.equal((await sql(c, 'select current_user role'))[0].role, runtimeRole)
        assert.equal((await sql(c, 'select can_access_admin() allowed'))[0].allowed, true)
        for (const table of ['services', 'professionals', 'customers', 'cash_sessions', 'cash_movements', 'appointments', 'commission_entries']) assert.equal((await sql(c, 'select count(*)::int n from ' + table))[0].n, 0, 'New unit inherited ' + table)
        assert.equal((await sql(c, 'select count(*)::int n from business_settings'))[0].n, 1)
        assert.equal((await sql(c, 'select count(*)::int n from business_hours'))[0].n, 7)
        const pro = (await sql(c, 'select save_professional_profile($1::jsonb) value', [{ name: 'Barbeiro ' + label, service_commission: 50, product_commission: 20 }]))[0].value
        const access = await ensureProfessionalAccess(c, pro.id, { email: `qa.pro.${suffix}.${label.toLowerCase()}@example.invalid`, password: 'QA-profissional-' + randomUUID() })
        const profile = (await sql(c, 'select profile_id from professionals where id=$1', [pro.id]))[0].profile_id
        const service = (await sql(c, 'select save_service_profile($1::jsonb) value', [{ name: 'Corte ' + label, price: 4000, duration: 40, commission: 50 }]))[0].value
        const customer = (await sql(c, 'select save_customer_profile($1::jsonb) value', [{ name: 'Cliente ' + label, phone: '45999990000' }]))[0].value
        const product = (await sql(c, "insert into products(name,sale_price_cents,cost_cents,internal_code,barcode) values($1,1000,500,'CODE-SHARED','BARCODE-SHARED') returning id", ['Pomada ' + label]))[0]
        const session = (await sql(c, 'insert into cash_sessions(opened_by,opening_balance_cents) values($1,$2) returning id', [account.user.id, label === 'A' ? 10000 : 20000]))[0]
        await sql(c, 'select save_business_settings($1::jsonb)', [{ name: 'Machado Unidade ' + label, city: 'Toledo' }])
        const snapshot = (await sql(c, 'select office_snapshot() value'))[0].value
        assert.equal(snapshot.customers.length, 1); assert.equal(snapshot.sessions.length, 1)
        assert.equal(snapshot.sessions[0].opening_balance_cents, label === 'A' ? 10000 : 20000)
        assert.equal(access.id, pro.id)
        return { professional: pro.id, profile, service: service.id, customer: customer.id, product: product.id, session: session.id }
      })
    }
    checks.push('new units start empty; duplicate customer phones/product codes are isolated; real save/profile/settings/office functions work')

    await scope(client, a.user.id, a.business.id, async c => {
      for (const [table, id] of [['professionals', objects.B.professional], ['customers', objects.B.customer], ['products', objects.B.product], ['cash_sessions', objects.B.session]]) assert.equal((await sql(c, 'select count(*)::int n from ' + table + ' where id=$1', [id]))[0].n, 0)
      assert.equal((await sql(c, 'select count(*)::int n from auth_user where id=$1', [b.user.id]))[0].n, 0)
      assert.equal((await sql(c, 'update customers set name=$1 where id=$2 returning id', ['INTRUSÃO', objects.B.customer])).length, 0)
      await c.query("select set_config('request.business_id',$1,true)", [b.business.id])
      assert.equal((await sql(c, 'select current_business_id() id'))[0].id, null)
      assert.equal((await sql(c, 'select count(*)::int n from customers'))[0].n, 0)
    })
    checks.push('owner A cannot read/update B data or identity; mismatched tenant GUC denies all rows')
    await denied(() => scope(client, a.user.id, a.business.id, async c => {
      await sql(c, 'insert into professional_services(professional_id,service_id) values($1,$2)', [objects.A.professional, objects.B.service])
      await c.query('set constraints all immediate')
    }), '23503')
    await denied(() => scope(client, a.user.id, a.business.id, c => c.query('truncate customers')), '42501')
    await denied(() => scope(client, a.user.id, a.business.id, c => c.query('select provision_workspace_owner($1::jsonb)', [{}])), '42501')
    checks.push('foreign-unit UUID relationships rejected; runtime cannot TRUNCATE or provision owners')

    await scope(client, objects.A.profile, a.business.id, async c => {
      assert.equal((await sql(c, 'select can_access_admin() allowed'))[0].allowed, false)
      const session = { user: { id: objects.A.profile, email: 'test@example.invalid' }, profile: { role: 'professional' } }
      assert.equal((await professionalFor(c, session, objects.A.professional)).profile.id, objects.A.professional)
      await assert.rejects(() => professionalFor(c, session, objects.B.professional), error => error.status === 403)
      await c.query("select set_config('request.business_id',$1,true)", [b.business.id])
      assert.equal((await sql(c, 'select current_business_id() id'))[0].id, null)
    })
    await denied(() => scope(client, objects.A.profile, a.business.id, c => c.query('select office_snapshot()')), '42501')
    checks.push('professional accounts stay in their unit/profile and cannot open the office snapshot')
    await scope(client, null, a.business.id, async c => {
      const catalog = (await sql(c, 'select public_catalog() value'))[0].value
      assert.equal(catalog.services.length, 1); assert.equal(catalog.services[0].id, objects.A.service)
      assert.equal(catalog.business.name, 'Machado Unidade A')
    })
    await scope(client, oldId, '', async c => assert.equal((await sql(c, 'select current_business_id() id'))[0].id, primary.id))
    await scope(client, null, '', async c => assert.equal((await sql(c, 'select public_catalog() value'))[0].value.services[0].id, oldService))
    await assert.rejects(() => resolveBusinessUnit(client, null, 'missing-unit-' + suffix), error => error.status === 404)
    const bSlug = (await sql(client, 'select slug from business_units where id=$1', [b.business.id]))[0].slug
    await assert.rejects(() => resolveBusinessUnit(client, a.user.id, bSlug), error => error.status === 403)
    checks.push('anonymous catalog is unit-scoped; legacy actor/anonymous contexts retain original unit; bad/mismatched slugs reject')

    await scope(client, a.user.id, a.business.id, c => c.query('select reset_operational_data($1)', ['ZERAR OPERAÇÃO']))
    await scope(client, b.user.id, b.business.id, async c => {
      assert.equal((await sql(c, 'select count(*)::int n from customers'))[0].n, 1)
      assert.equal((await sql(c, 'select sum(opening_balance_cents)::int amount from cash_sessions'))[0].amount, 20000)
    })
    checks.push('reset A leaves unit B customers and cash intact')
    const unsafe = await sql(client, "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and p.prosecdef and r.rolbypassrls and p.proname<>'current_business_id' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')")
    assert.equal(unsafe.length, 0)
    checks.push('only the documented scope-bootstrap function retains privileged ownership')
  } finally { client.release() }
  await mkdir('.private', { recursive: true })
  await writeFile('.private/unit-isolation-verification.json', JSON.stringify({ date: new Date().toISOString(), disposableDatabase: true, permanentProductionChanges: false, checks, durationMs: Date.now() - started, passed: true }, null, 2))
  for (const check of checks) console.log('PASS ' + check)
} finally {
  if (temporary) await temporary.end()
  if (created) { assert.match(dbName, /^machado_qa_units_[a-f0-9]{12}$/); assert.notEqual(dbName, sourceUrl.pathname.slice(1)); await pool.query('drop database ' + quote(dbName) + ' with(force)') }
  const roles = await pool.query('select 1 from pg_roles where rolname=$1', [runtimeRole])
  if (roles.rowCount) { assert.match(runtimeRole, /^machado_runtime_qa_[a-f0-9]{12}$/); await pool.query('drop role ' + quote(runtimeRole)) }
  await pool.end()
}

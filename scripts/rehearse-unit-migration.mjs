import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pool } from '../server/db.mjs'

// Intentionally NO apply/commit option. Every schema/role/fixture change below
// is rolled back, even when every assertion passes. Run only as the migrator.
const migration = await readFile('database/011_unit_accounts.sql', 'utf8')
const targets = [...migration.match(/INSERT INTO _machado_unit_tables VALUES([\s\S]+?);/)[1].matchAll(/\('([^']+)','([^']+)'\)/g)].map(match => '"' + match[1] + '"."' + match[2] + '"')
const client = await pool.connect(), checks = [], started = Date.now()
let began = false, passed = false, fingerprintCount = 0
async function fingerprints(unitId) {
  const result = {}
  for (const table of targets) result[table] = (await client.query(`select md5(coalesce(jsonb_agg(to_jsonb(t)-'tenant_id' order by (to_jsonb(t)-'tenant_id')::text)::text,'[]')) digest from ${table} t${unitId ? ' where tenant_id=$1' : ''}`, unitId ? [unitId] : [])).rows[0].digest
  return result
}
async function context(userId, unitId, runtime = true) {
  await client.query('reset role')
  await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.business_id',$2,true)", [userId || '', unitId || ''])
  if (runtime) await client.query('set local role machado_runtime')
}
const initial = (await client.query("select to_regclass('public.business_units') is not null units_exist,exists(select 1 from pg_roles where rolname='machado_runtime') role_exists")).rows[0]
try {
  await client.query('begin'); began = true
  await client.query("set local lock_timeout='3s'; set local statement_timeout='90s'")
  // Acquire the exact locks the DDL needs BEFORE its stable historical snapshot.
  // The short timeout avoids waiting behind the live app for a long period.
  await client.query('lock table ' + targets.join(',') + ' in access exclusive mode')
  const before = await fingerprints()
  const actor = (await client.query("select id from public.profiles where active and role='owner' order by created_at,id limit 1")).rows[0]?.id
  assert.ok(actor, 'An existing owner is required for legacy-compatibility rehearsal')
  await client.query(migration)
  const primary = (await client.query('select id from public.business_units where is_primary')).rows[0].id
  assert.deepEqual(await fingerprints(primary), before)
  fingerprintCount = targets.length
  checks.push('all pre-existing rows, UUIDs and timestamps unchanged')
  await context(actor, '')
  assert.equal((await client.query('select public.current_business_id() id,public.can_access_admin() allowed')).rows[0].id, primary)
  assert.equal((await client.query('select public.can_access_admin() allowed')).rows[0].allowed, true)
  await context(null, '')
  assert.equal((await client.query('select public.current_business_id() id')).rows[0].id, primary)
  checks.push('old deployed transaction format keeps existing owner and anonymous catalog scoped to Machado')

  await context(null, '', false)
  const provision = async name => {
    const payload = { id: randomUUID(), account_id: randomUUID(), name: 'QA responsável ' + name, business_name: 'QA unidade ' + name, email: `qa.rehearsal.${randomUUID()}@example.invalid`, password_hash: randomBytes(64).toString('hex'), recovery_codes: Array.from({ length: 3 }, () => ({ code_hash: randomBytes(32).toString('hex') })) }
    return (await client.query('select provision_workspace_owner($1::jsonb) value', [payload])).rows[0].value
  }
  const a = await provision('A'), b = await provision('B')
  await context(a.id, a.business_id)
  const customerA = (await client.query('select save_customer_profile($1::jsonb) value', [{ name: 'QA cliente A', phone: '45999990000' }])).rows[0].value.id
  assert.ok(customerA)
  await context(b.id, b.business_id)
  const customerB = (await client.query('select save_customer_profile($1::jsonb) value', [{ name: 'QA cliente B', phone: '45999990000' }])).rows[0].value.id
  await client.query('insert into cash_sessions(opened_by,opening_balance_cents) values($1,22000)', [b.id])
  await context(a.id, a.business_id)
  assert.equal((await client.query('select count(*)::int n from customers')).rows[0].n, 1)
  assert.equal((await client.query('select count(*)::int n from customers where id=$1', [customerB])).rows[0].n, 0)
  assert.equal((await client.query('select count(*)::int n from cash_sessions')).rows[0].n, 0)
  await client.query('savepoint cross_unit_fk')
  let foreignRejected = false
  try {
    await client.query('insert into commands(customer_id) values($1)', [customerB])
    await client.query('set constraints all immediate')
  } catch (error) { assert.equal(error.code, '23503'); foreignRejected = true }
  await client.query('rollback to savepoint cross_unit_fk')
  assert.equal(foreignRejected, true)
  await client.query("select set_config('request.business_id',$1,true)", [b.business_id])
  assert.equal((await client.query('select current_business_id() id')).rows[0].id, null)
  assert.equal((await client.query('select count(*)::int n from customers')).rows[0].n, 0)
  checks.push('transient owners A/B, duplicate phone, isolated cash, foreign UUID and mismatched-GUC checks passed')
  await context(null, '', false)
  assert.deepEqual(await fingerprints(primary), before)
  checks.push('original unit remains byte-for-byte unchanged after transient fixture work')
  passed = true
} finally {
  if (began) await client.query('rollback')
  const after = (await client.query("select to_regclass('public.business_units') is not null units_exist,exists(select 1 from pg_roles where rolname='machado_runtime') role_exists")).rows[0]
  assert.deepEqual(after, initial, 'Rehearsal did not restore the initial registry/role state')
  client.release(); await pool.end()
  await mkdir('.private', { recursive: true })
  await writeFile('.private/unit-migration-rehearsal.json', JSON.stringify({ date: new Date().toISOString(), passed, rolledBack: true, permanentProductionChanges: false, fingerprintCount, durationMs: Date.now() - started, checks }, null, 2))
}
for (const check of checks) console.log('PASS ' + check)
console.log('PASS original database rehearsal rolled back completely; no permanent data/schema/role changes.')

import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { pool } from '../server/db.mjs'

const args = process.argv.slice(2)
assert.ok(args.every(arg => ['--check', '--apply'].includes(arg)), 'Use --check (default) or --apply explicitly.')
assert.ok(!(args.includes('--check') && args.includes('--apply')), 'Choose either --check or --apply.')
const mode = args.includes('--apply') ? 'apply' : 'check'
const sha256 = value => createHash('sha256').update(value).digest('hex')
const files = ['011_unit_accounts.sql', '012_managed_professional_goals.sql']
const migrations = await Promise.all(files.map(async file => {
  const sql = (await readFile('database/' + file, 'utf8')).replace(/\r\n?/g, '\n')
  return { file, sql, checksum: sha256(sql) }
}))
const targets = [...migrations[0].sql.match(/INSERT INTO _machado_unit_tables VALUES([\s\S]+?);/)[1].matchAll(/\('([^']+)','([^']+)'\)/g)].map(match => ({ schema: match[1], table: match[2] }))
assert.equal(targets.length, 33, 'Review the preservation inventory if migration 011 changes its target list.')
const quote = value => { assert.match(value, /^[A-Za-z_][A-Za-z0-9_]*$/); return '"' + value + '"' }
const qualified = target => quote(target.schema) + '.' + quote(target.table)
const reportPath = `.private/unit-accounts-migration-${mode}.json`
const report = { format: 'machado-unit-migration-verification', date: new Date().toISOString(), mode, committed: false, rolledBack: false, status: 'running', migrations: migrations.map(({ file, checksum }) => ({ file, checksum, checksumNormalization: 'LF' })) }
const started = Date.now(), client = await pool.connect()
let began = false

function planFor(history) {
  const present = new Map(history.map(row => [row.file_name, row.checksum_sha256]))
  let missingSeen = false
  const pending = []
  for (const migration of migrations) {
    const checksum = present.get(migration.file)
    if (checksum !== undefined) {
      if (checksum !== migration.checksum) throw new Error('Migration checksum drift: ' + migration.file)
      if (missingSeen) throw new Error('Migration history has a dependency gap before ' + migration.file)
    } else { missingSeen = true; pending.push(migration) }
  }
  return pending
}

async function historyRows() {
  return (await client.query('select file_name,checksum_sha256,applied_at from public.machado_schema_migrations where file_name=any($1::text[]) order by file_name', [files])).rows
}

async function originalColumns() {
  const result = []
  for (const target of targets) {
    const columns = (await client.query('select a.attname name from pg_attribute a where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped order by a.attnum', [qualified(target)])).rows.map(row => row.name)
    assert.ok(columns.length, 'Missing preservation target: ' + qualified(target))
    result.push({ ...target, columns })
  }
  return result
}

async function fingerprints(inventory) {
  const result = {}
  for (const target of inventory) {
    // Project EXACTLY the columns that existed before either migration. New
    // columns are not discarded by name: existing tenant/goals columns are
    // included too when a database has already reached either schema version.
    const projection = target.columns.map(quote).join(',')
    const row = (await client.query(`select count(*)::text row_count,coalesce(jsonb_agg(to_jsonb(s) order by to_jsonb(s)::text),'[]'::jsonb)::text serialized from(select ${projection} from ${qualified(target)}) s`)).rows[0]
    result[target.schema + '.' + target.table] = { rows: row.row_count, columns: target.columns, sha256: sha256(row.serialized) }
  }
  return result
}

function preserved(before, after) {
  const changed = Object.keys(before).filter(table => before[table].rows !== after[table]?.rows || before[table].sha256 !== after[table]?.sha256)
  if (changed.length) throw new Error('Historical values changed in: ' + changed.join(', '))
}

async function freshBackup(allTables) {
  const tables = {}
  for (const table of allTables) tables[table.schema + '.' + table.table] = (await client.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) value from ${qualified(table)} t`)).rows[0].value
  const functions = (await client.query("select n.nspname schema,p.proname name,p.oid::regprocedure::text signature,r.rolname owner,p.prosecdef security_definer,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname in('public','auth') and p.prokind='f' order by n.nspname,p.proname,p.oid")).rows
  const constraints = (await client.query("select n.nspname schema,t.relname table_name,c.conname name,c.convalidated validated,pg_get_constraintdef(c.oid) definition from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname in('public','auth') order by n.nspname,t.relname,c.conname")).rows
  const tableSecurity = (await client.query("select n.nspname schema,c.relname table_name,r.rolname owner,c.relrowsecurity enabled,c.relforcerowsecurity forced from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner where n.nspname in('public','auth') and c.relkind='r' order by n.nspname,c.relname")).rows
  const policies = (await client.query("select * from pg_policies where schemaname in('public','auth') order by schemaname,tablename,policyname")).rows
  const snapshot = { format: 'machado-pre-unit-migration-backup', createdAt: new Date().toISOString(), migrations: files, tables, functions, constraints, tableSecurity, policies }
  const folder = resolve('.private/backups')
  await mkdir(folder, { recursive: true })
  const stem = 'pre-units-' + snapshot.createdAt.replace(/[:.]/g, '-') + '-' + randomBytes(4).toString('hex')
  const path = resolve(folder, stem + '.json'), digestPath = resolve(folder, stem + '.sha256')
  assert.equal(dirname(path), folder); assert.equal(dirname(digestPath), folder)
  const bytes = Buffer.from(JSON.stringify(snapshot)), digest = sha256(bytes)
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600, flush: true })
  await writeFile(digestPath, digest + '\n', { flag: 'wx', mode: 0o600, flush: true })
  const reread = await readFile(path), expected = (await readFile(digestPath, 'utf8')).trim()
  assert.match(expected, /^[a-f0-9]{64}$/); assert.equal(sha256(reread), expected)
  const verified = JSON.parse(reread.toString('utf8'))
  assert.equal(verified.format, snapshot.format)
  assert.equal(Object.keys(verified.tables).length, allTables.length)
  return { path, digestPath, sha256: digest, bytes: bytes.length, tableCount: allTables.length, verified: true }
}

try {
  const role = (await client.query('select rolbypassrls,rolsuper from pg_roles where rolname=current_user')).rows[0]
  assert.ok(role?.rolbypassrls || role?.rolsuper, 'Use the private migrator connection, not the operational role.')
  const initial = (await client.query("select to_regclass('public.machado_schema_migrations') is not null history_exists,to_regclass('public.business_units') is not null units_exist,exists(select 1 from pg_roles where rolname='machado_runtime') role_exists,exists(select 1 from pg_attribute where attrelid='public.profiles'::regclass and attname='tenant_id' and not attisdropped) profiles_scoped")).rows[0]
  report.initialMetadata = initial
  await client.query('begin'); began = true
  await client.query("set local lock_timeout='3s'; set local statement_timeout='90s'")
  assert.equal((await client.query('select pg_try_advisory_xact_lock(180120) allowed')).rows[0].allowed, true, 'Another schema migration is running.')
  await client.query(`create table if not exists public.machado_schema_migrations(
    file_name text primary key,checksum_sha256 text not null check(checksum_sha256 ~ '^[a-f0-9]{64}$'),
    applied_at timestamptz not null default now(),applied_by text not null default current_user,metadata jsonb not null default '{}'::jsonb)`)
  await client.query('alter table public.machado_schema_migrations enable row level security; alter table public.machado_schema_migrations force row level security; revoke all on public.machado_schema_migrations from public')
  const historyBefore = await historyRows(), pending = planFor(historyBefore)
  report.historyBefore = historyBefore; report.pending = pending.map(item => item.file); report.alreadyApplied = pending.length === 0

  const allTables = (await client.query('select schemaname as "schema",tablename as "table" from pg_tables where schemaname in(\'public\',\'auth\') order by schemaname,tablename')).rows
  const lockTargets = mode === 'apply' && pending.length ? allTables : [...targets, { schema: 'public', table: 'machado_schema_migrations' }]
  const locked = [...new Set(lockTargets.map(qualified))].sort()
  await client.query('lock table ' + locked.join(',') + ' in access exclusive mode')
  const inventory = await originalColumns(), before = await fingerprints(inventory)
  report.before = before; report.fingerprintCount = inventory.length
  if (mode === 'apply' && pending.length) report.backup = await freshBackup(allTables)
  for (const migration of pending) {
    await client.query(migration.sql)
    preserved(before, await fingerprints(inventory))
    await client.query('insert into public.machado_schema_migrations(file_name,checksum_sha256,metadata) values($1,$2,$3::jsonb)', [migration.file, migration.checksum, { runner: 'unit-accounts-v1', preservedTables: inventory.length, backupSha256: report.backup?.sha256 ?? null }])
  }
  const after = await fingerprints(inventory)
  preserved(before, after); report.after = after; report.allPreexistingValuesPreserved = true
  const finalHistory = await historyRows()
  assert.equal(planFor(finalHistory).length, 0, 'Completed migrations should produce an empty second-run plan.')
  report.historyAfter = finalHistory; report.idempotencyPlanVerified = true
  // A future file edit must fail even if it changes no rows. Exercise the same
  // drift guard with a deliberately mismatched in-memory checksum, not a DB write.
  const alteredHistory = finalHistory.map((row, index) => index ? row : { ...row, checksum_sha256: '0'.repeat(64) })
  assert.throws(() => planFor(alteredHistory), /checksum drift/); report.driftGuardVerified = true
  await client.query('revoke all on public.machado_schema_migrations from machado_runtime')
  await client.query('set constraints all immediate')
  await client.query(mode === 'apply' ? 'commit' : 'rollback'); began = false
  report.committed = mode === 'apply'; report.rolledBack = mode === 'check'
  if (mode === 'check') {
    const restored = (await client.query("select to_regclass('public.machado_schema_migrations') is not null history_exists,to_regclass('public.business_units') is not null units_exist,exists(select 1 from pg_roles where rolname='machado_runtime') role_exists,exists(select 1 from pg_attribute where attrelid='public.profiles'::regclass and attname='tenant_id' and not attisdropped) profiles_scoped")).rows[0]
    assert.deepEqual(restored, initial, 'Check mode did not restore the initial schema/role state.')
    report.rollbackMetadataVerified = true
  }
  report.status = 'passed'
} catch (error) {
  if (began) { await client.query('rollback').catch(() => {}); report.rolledBack = true; began = false }
  report.status = 'failed'; report.error = { code: error.code ?? 'verification_error', message: error.message }
  process.exitCode = 1
} finally {
  if (began) { await client.query('rollback').catch(() => {}); report.rolledBack = true }
  client.release(); await pool.end()
  report.durationMs = Date.now() - started
  await mkdir('.private', { recursive: true })
  await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 })
}
if (report.status === 'passed') console.log(`PASS 011/012: ${mode === 'check' ? 'ensaio revertido' : report.alreadyApplied ? 'já aplicadas; nenhuma migração repetida' : 'aplicação atômica concluída'}; ${report.fingerprintCount} tabelas e todas as colunas pré-existentes preservadas; checksums LF, idempotência e guarda contra drift verificados.`)
else console.error('FAIL 011/012: operação interrompida e revertida. Consulte o relatório privado; nenhum dado de cliente foi impresso.')

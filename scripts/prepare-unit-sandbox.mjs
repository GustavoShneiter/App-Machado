import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import pg from 'pg'
import { pool } from '../server/db.mjs'

const metadataPath = '.private/nov06-sandbox.json'
const sourceUrl = new URL(process.env.DATABASE_URL)
const quoted = value => { assert.match(value, /^machado_qa_units_[a-f0-9]{12}$/); assert.notEqual(value, sourceUrl.pathname.slice(1)); return '"' + value + '"' }
let saved
try { saved = JSON.parse(await readFile(metadataPath, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
if (process.argv.includes('--remove')) {
  assert.ok(saved?.databaseName && !saved.removed, 'There is no active unit sandbox to remove')
  const database = quoted(saved.databaseName)
  await pool.query('drop database if exists ' + database + ' with(force)')
  let runtimeRoleKept = !saved.runtimeRoleCreated
  if (saved.runtimeRoleCreated) {
    try { await pool.query('drop role if exists machado_runtime') }
    catch (error) { if (error.code !== '2BP01') throw error; runtimeRoleKept = true }
  }
  await writeFile(metadataPath, JSON.stringify({ ...saved, removed: true, removedAt: new Date().toISOString(), runtimeRoleKept }, null, 2))
  await pool.end()
  console.log('Disposable unit sandbox removed. Runtime role ' + (runtimeRoleKept ? 'preserved because it already existed or has live dependencies.' : 'removed.'))
  process.exit(0)
}

if (saved && !saved.removed && (await pool.query('select 1 from pg_database where datname=$1', [saved.databaseName])).rowCount) {
  quoted(saved.databaseName)
  await pool.end()
  console.log('Unit sandbox already prepared: ' + saved.databaseName)
  process.exit(0)
}
const databaseName = 'machado_qa_units_' + randomBytes(6).toString('hex')
const runtimeRoleCreated = !(await pool.query("select 1 from pg_roles where rolname='machado_runtime'")).rowCount
const sandboxUrl = new URL(sourceUrl); sandboxUrl.pathname = '/' + databaseName; sandboxUrl.searchParams.delete('sslmode')
let sandbox, created = false
try {
  await pool.query('create database ' + quoted(databaseName)); created = true
  sandbox = new pg.Pool({ connectionString: sandboxUrl.toString(), ssl: { rejectUnauthorized: true }, max: 1, statement_timeout: 90000 })
  const client = await sandbox.connect()
  try {
    const files = (await readdir('database')).filter(file => /^\d{3}_.+\.sql$/.test(file) && Number(file.slice(0, 3)) <= 12).sort()
    for (const file of files) {
      await client.query('begin')
      try { await client.query(await readFile('database/' + file, 'utf8')); await client.query('commit') }
      catch (error) { await client.query('rollback'); throw error }
    }
    await client.query("insert into public.business_settings(id,name,tenant_id) select true,'Machado — unidade de testes',id from public.business_units b where b.is_primary and not exists(select 1 from public.business_settings s where s.tenant_id=b.id)")
    await client.query("insert into public.business_hours(weekday,opens_at,closes_at,tenant_id) select day,'06:00'::time,'23:00'::time,b.id from public.business_units b cross join generate_series(1,7) day where b.is_primary and not exists(select 1 from public.business_hours h where h.tenant_id=b.id)")
    await mkdir('.private', { recursive: true })
    await writeFile(metadataPath, JSON.stringify({ databaseName, createdAt: new Date().toISOString(), runtimeRole: 'machado_runtime', runtimeRoleCreated, sourceDataCopied: false, migrations: files, removed: false }, null, 2))
  } finally { client.release() }
} catch (error) {
  if (sandbox) await sandbox.end(); sandbox = null
  if (created) await pool.query('drop database ' + quoted(databaseName) + ' with(force)')
  if (runtimeRoleCreated) { try { await pool.query('drop role if exists machado_runtime') } catch { /* Keep a role if another trusted migration has acquired dependencies. */ } }
  throw error
} finally { if (sandbox) await sandbox.end(); await pool.end() }
console.log('Unit sandbox prepared: ' + databaseName + '. Database name saved privately; no connection URL or live data copied.')

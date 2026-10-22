import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pool } from '../server/db.mjs'

const client=await pool.connect()
try {
  await client.query('begin')
  await client.query('select pg_advisory_xact_lock(180121)')
  const duplicates=await client.query('select count(*)::int amount from (select lower(email) from auth_user group by lower(email) having count(*)>1) x')
  assert.equal(duplicates.rows[0].amount,0,'Há contas com e-mails duplicados que precisam ser revisadas.')
  const fingerprint=async()=> (await client.query("select md5(coalesce(jsonb_agg(to_jsonb(u) order by id)::text,'')) value from auth_user u")).rows[0].value
  const before=await fingerprint()
  const migration=await readFile('database/009_professional_login.sql','utf8')
  await client.query(migration);await client.query(migration)
  assert.equal(await fingerprint(),before,'A migração não pode alterar dados de acesso existentes.')
  await client.query(process.argv.includes('--check')?'rollback':'commit')
  console.log('PASS migração 009: unicidade do e-mail sem diferenciar maiúsculas; acessos existentes preservados. '+(process.argv.includes('--check')?'Verificação revertida.':'Aplicada.'))
} finally {await client.query('rollback').catch(()=>{});client.release();await pool.end()}

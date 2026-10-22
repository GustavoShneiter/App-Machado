import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pool } from '../server/db.mjs'
const client=await pool.connect()
try {
  await client.query('begin');await client.query('select pg_advisory_xact_lock(180121)')
  const fingerprint=async()=> (await client.query("select md5(coalesce(jsonb_agg(to_jsonb(p)-'show_goals' order by professional_id)::text,'')) value from professional_preferences p")).rows[0].value
  const before=await fingerprint(),sql=await readFile('database/010_professional_goals.sql','utf8')
  await client.query(sql);await client.query(sql)
  assert.equal(await fingerprint(),before,'As metas existentes precisam ser preservadas.')
  await client.query(process.argv.includes('--check')?'rollback':'commit')
  console.log('PASS migração 010: opção de ocultar metas, migração repetida e metas existentes preservadas.')
} finally {await client.query('rollback').catch(()=>{});client.release();await pool.end()}

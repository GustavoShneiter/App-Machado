import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {pool} from '../server/db.mjs'

const client=await pool.connect()
try{
  await client.query('begin')
  await client.query('select pg_advisory_xact_lock(180120)')
  const counts=async()=> (await client.query("select (select count(*) from customers)::int customers,(select count(*) from appointments)::int appointments,(select count(*) from payments)::int payments,(select count(*) from command_items)::int items,(select count(*) from professionals)::int professionals")).rows[0]
  const before=await counts()
  const history=async()=> (await client.query("select md5(coalesce((select jsonb_agg(to_jsonb(i) order by id)::text from command_items i),'')) items, md5(coalesce((select jsonb_agg(to_jsonb(p) order by id)::text from payments p),'')) payments, md5(coalesce((select jsonb_agg(to_jsonb(c) order by id)::text from commission_entries c),'')) commissions")).rows[0]
  const historyBefore=await history()
  await client.query(await readFile('database/006_item_commissions_and_deletions.sql','utf8'))
  // Reapplying the migration must preserve explicit overrides and existing history.
  await client.query(await readFile('database/006_item_commissions_and_deletions.sql','utf8'))
  assert.deepEqual(await counts(),before)
  assert.deepEqual(await history(),historyBefore)
  await client.query(await readFile('database/tests/final-adjustments.sql','utf8'))
  assert.deepEqual(await counts(),before)
  await client.query('set constraints all immediate')
  await client.query(process.argv.includes('--check')?'rollback':'commit')
  console.log(process.argv.includes('--check')?'PASS migração e testes, tudo revertido.':'PASS migração 006 aplicada e verificada. Cadastros, atendimentos e pagamentos preservados.')
}finally{await client.query('rollback').catch(()=>{});client.release();await pool.end()}

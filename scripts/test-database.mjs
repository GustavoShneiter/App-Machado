import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pool } from '../server/db.mjs'

const client=await pool.connect()
try{
  await client.query('begin')
  const before=(await client.query("select (select count(*) from customers) as customers,(select count(*) from appointments) as appointments")).rows[0]
  await client.query(await readFile('supabase/tests/connected_operations.sql','utf8'))
  await client.query(await readFile('database/tests/agenda.sql','utf8'))
  await client.query(await readFile('database/tests/final-adjustments.sql','utf8'))
  const data=await client.query("select (select count(*) from customers) as customers,(select count(*) from appointments) as appointments")
  assert.equal(Number(data.rows[0].customers),Number(before.customers))
  assert.equal(Number(data.rows[0].appointments),Number(before.appointments))
  await client.query("select set_config('request.jwt.claim.sub','',true)")
  await assert.rejects(client.query('select office_snapshot()'),error=>error.code==='42501')
  await client.query('rollback')
  console.log('PASS Neon: agendamento público, conflito de horário, comanda, comissão, pagamento e repasse sem duplicação, estoque, despesa e acesso anônimo bloqueado. Fixtures revertidas.')
}finally{await client.query('rollback').catch(()=>{});client.release();await pool.end()}

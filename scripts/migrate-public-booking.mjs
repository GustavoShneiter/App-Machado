import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pool } from '../server/db.mjs'

const client = await pool.connect()
try {
  await client.query('begin')
  await client.query('select pg_advisory_xact_lock(180122)')
  const before = (await client.query('select (select count(*) from customers)::int customers, (select count(*) from appointments)::int appointments')).rows[0]
  const sql = await readFile('database/009_public_booking_without_terms.sql', 'utf8')
  await client.query(sql)
  const definition = (await client.query("select pg_get_functiondef('public.create_public_appointment(text,text,uuid,uuid,timestamptz,boolean)'::regprocedure) as body")).rows[0].body
  assert.match(definition, /terms_accepted boolean DEFAULT false/i)
  assert.doesNotMatch(definition, /IF terms_accepted/i)
  await client.query('savepoint booking_validation')
  try {
    await client.query("select public.create_public_appointment(customer_name => 'A', customer_phone => '1', chosen_service => null, chosen_professional => null, start_time => null)")
    assert.fail('O nome e telefone inválidos deveriam ser recusados.')
  } catch (error) {
    assert.match(error.message, /Confira nome e telefone/)
  } finally {
    await client.query('rollback to savepoint booking_validation')
  }
  const after = (await client.query('select (select count(*) from customers)::int customers, (select count(*) from appointments)::int appointments')).rows[0]
  assert.deepEqual(after, before)
  await client.query(process.argv.includes('--check') ? 'rollback' : 'commit')
  console.log(process.argv.includes('--check') ? 'PASS: migração validada e revertida.' : 'PASS: agendamento sem aceite obrigatório habilitado.')
} finally {
  await client.query('rollback').catch(() => {})
  client.release()
  await pool.end()
}

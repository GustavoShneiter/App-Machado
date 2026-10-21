import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {pool} from '../server/db.mjs'
const client=await pool.connect()
try{
 await client.query('begin');await client.query('select pg_advisory_xact_lock(180120)')
 const history=async()=> (await client.query("select (select count(*) from customers)::int customers,(select count(*) from appointments)::int appointments,md5(coalesce((select jsonb_agg(to_jsonb(i) order by id)::text from command_items i),'')) items,md5(coalesce((select jsonb_agg(to_jsonb(p) order by id)::text from payments p),'')) payments")).rows[0]
 const before=await history(),sql=await readFile('database/007_agenda_and_commission_modes.sql','utf8')
 await client.query(sql);await client.query(sql)
 assert.deepEqual(await history(),before)
 await client.query(await readFile('database/tests/scheduling.sql','utf8'))
 assert.deepEqual(await history(),before);await client.query('set constraints all immediate')
 await client.query(process.argv.includes('--check')?'rollback':'commit')
 console.log('PASS migração 007: modos de comissão, 06h–23h/40 minutos, encaixe e bloqueios recorrentes, sem alterar o histórico.'+(process.argv.includes('--check')?' Verificação revertida.':' Migração aplicada.'))
}finally{await client.query('rollback').catch(()=>{});client.release();await pool.end()}

import {readFile} from 'node:fs/promises'
import {transaction,pool} from '../server/db.mjs'
try {
  const sql=await readFile('database/004_agenda.sql','utf8')
  const commissions=await readFile('database/005_service_commissions.sql','utf8')
  const final=await readFile('database/006_item_commissions_and_deletions.sql','utf8')
  await transaction(null,async client=>{
    await client.query('select pg_advisory_xact_lock(180120)')
    const upgraded=(await client.query("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='services' and column_name='commission_mode') upgraded")).rows[0].upgraded
    if(!upgraded){await client.query(sql);await client.query(commissions);await client.query(final)}
    await client.query(await readFile('database/007_agenda_and_commission_modes.sql','utf8'))
  })
  console.log('Migrações da Agenda até 007 aplicadas: grade de 40 minutos, encaixes e recorrência.')
}finally{await pool.end()}

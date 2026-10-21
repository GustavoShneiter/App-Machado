import {readFile} from 'node:fs/promises'
import {transaction,pool} from '../server/db.mjs'
try {
  const sql=await readFile('database/004_agenda.sql','utf8')
  const commissions=await readFile('database/005_service_commissions.sql','utf8')
  await transaction(null,async client=>{
    await client.query('select pg_advisory_xact_lock(180120)')
    await client.query(sql)
    await client.query(commissions)
  })
  console.log('Migrações 004/005 aplicadas: remoção da Agenda preserva o histórico e novos serviços usam a comissão configurada por serviço/profissional.')
}finally{await pool.end()}

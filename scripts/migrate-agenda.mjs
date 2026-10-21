import {readFile} from 'node:fs/promises'
import {transaction,pool} from '../server/db.mjs'
try {
  const sql=await readFile('database/004_agenda.sql','utf8')
  const commissions=await readFile('database/005_service_commissions.sql','utf8')
  const final=await readFile('database/006_item_commissions_and_deletions.sql','utf8')
  await transaction(null,async client=>{
    await client.query('select pg_advisory_xact_lock(180120)')
    await client.query(sql)
    await client.query(commissions)
    await client.query(final)
  })
  console.log('Migrações 004/005/006 aplicadas: comissões por item/profissional e exclusão definitiva da Agenda.')
}finally{await pool.end()}

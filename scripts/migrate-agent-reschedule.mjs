import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {pool} from '../server/db.mjs'

const apply=process.argv.includes('--apply')
assert(process.argv.slice(2).every(arg=>['--check','--apply'].includes(arg)))
const file='035_agent_reschedule.sql'
const sql=await readFile('database/'+file,'utf8')
const checksum=createHash('sha256').update(sql.replace(/\r\n?/g,'\n')).digest('hex')
const client=await pool.connect()
try{
 const history=(await client.query('select checksum_sha256 from machado_schema_migrations where file_name=$1',[file])).rows[0]
 if(history){assert.equal(history.checksum_sha256,checksum);console.log('Remarcação já instalada; checksum confirmado.')}
 else{
  assert.equal((await client.query("select to_regclass('public.agent_reschedule_requests') present")).rows[0].present,null,'Tabela existe sem registro de migração.')
  await client.query('begin')
  try{
   await client.query(sql)
   if(apply){
    await client.query('insert into machado_schema_migrations(file_name,checksum_sha256) values($1,$2)',[file,checksum])
    await client.query('commit')
    console.log('Remarcação instalada; reservas e mensagens existentes preservadas.')
   }else{
    await client.query('rollback')
    console.log('Ensaio da migração aprovado e revertido.')
   }
  }catch(error){await client.query('rollback');throw error}
 }
}finally{client.release();await pool.end()}

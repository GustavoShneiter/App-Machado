import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {pool} from '../server/db.mjs'

for(const file of ['017_professional_command_groups.sql','018_spreadsheet_years.sql','019_shared_command_agenda.sql','020_unit_integration_guards.sql','021_google_unit_workbooks.sql']){
const sql=await readFile('database/'+file,'utf8')
const checksum=createHash('sha256').update(sql.replace(/\r\n?/g,'\n')).digest('hex')
const client=await pool.connect()
try{
 await client.query('begin')
 await client.query("set local lock_timeout='5s'")
 await client.query("select pg_advisory_xact_lock(hashtext('machado-schema-migrations'))")
 const existing=(await client.query('select checksum_sha256 from machado_schema_migrations where file_name=$1',[file])).rows[0]
 if(existing)assert.equal(existing.checksum_sha256,checksum)
 else{
  await client.query(sql)
  await client.query('insert into machado_schema_migrations(file_name,checksum_sha256) values($1,$2)',[file,checksum])
 }
 await client.query('commit')
 console.log('Operational migration applied and verified.')
}catch(error){await client.query('rollback');throw error}
finally{client.release()}
}
await pool.end()

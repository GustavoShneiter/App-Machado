import { readFile,writeFile,mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { pool } from '../server/db.mjs'
import { createBackup } from '../server/backups.mjs'
const apply=process.argv.includes('--apply')
assert(process.argv.slice(2).every(a=>['--check','--apply'].includes(a)))
const file='013_agent_whatsapp.sql',sql=await readFile('database/'+file,'utf8'),checksum=createHash('sha256').update(sql.replace(/\r\n?/g,'\n')).digest('hex')
const client=await pool.connect()
try {
 const history=(await client.query('select * from machado_schema_migrations where file_name=$1',[file])).rows[0]
 if(history){assert.equal(history.checksum_sha256,checksum);console.log('Migration already applied; checksum valid.');process.exitCode=0}
 else {
  assert((await client.query("select to_regclass('agent_settings') present")).rows[0].present===null,'Schema exists without migration record. Review before proceeding.')
  if(apply){const backup=await createBackup();await mkdir('.private',{recursive:true});await writeFile('.private/pre-agent-backup.json',JSON.stringify(backup));console.log('Private recovery backup saved before migration.')}
  await client.query('begin')
  try {
   const fingerprint=async()=>{
    const names=['customers','appointments','commands','command_items','payments','commission_entries','cash_sessions','cash_movements','professionals','services','products']
    const result={}
    for(const name of names)result[name]=(await client.query(`select md5(coalesce(jsonb_agg(to_jsonb(t)-'appointment_notification_revision'-'notification_cycle_at' order by id)::text,'[]')) hash from ${name} t`)).rows[0].hash
    return result
   }
   const before=await fingerprint();await client.query(sql);assert.deepEqual(await fingerprint(),before,'Historical data changed')
   assert.equal((await client.query('select count(*)::int n from agent_outbox')).rows[0].n,0)
   if(apply) {
    await client.query('insert into machado_schema_migrations(file_name,checksum_sha256) values($1,$2)',[file,checksum])
    await client.query('commit')
   } else await client.query('rollback')
   console.log(apply?'Migration committed, historical records preserved, queue empty.':'Migration rehearsal passed and rolled back; historical records preserved.')
  }catch(e){await client.query('rollback');throw e}
 }
}finally{client.release();await pool.end()}

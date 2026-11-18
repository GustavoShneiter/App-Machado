import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {pool} from '../server/db.mjs'
const apply=process.argv.includes('--apply'),file='014_appointment_attendee.sql'
assert(process.argv.slice(2).every(a=>['--check','--apply'].includes(a)))
const sql=await readFile('database/'+file,'utf8'),checksum=createHash('sha256').update(sql.replace(/\r\n?/g,'\n')).digest('hex'),c=await pool.connect()
try{
 const existing=(await c.query('select checksum_sha256 from machado_schema_migrations where file_name=$1',[file])).rows[0]
 if(existing){assert.equal(existing.checksum_sha256,checksum);console.log('Attendee migration already applied; checksum valid.')}
 else{
  await c.query('begin')
  try{
   await c.query("set local lock_timeout='5s'")
   await c.query('lock table appointments,customers in share row exclusive mode')
   const before=async()=>{
    const a=(await c.query("select md5(coalesce(jsonb_agg(to_jsonb(a)-'attendee_name' order by id)::text,'[]')) as hash from appointments a")).rows[0].hash
    const b=(await c.query("select md5(coalesce(jsonb_agg(to_jsonb(a) order by id)::text,'[]')) as hash from customers a")).rows[0].hash
    return {appointments:a,customers:b}
   }
   const fingerprint=await before()
   if(apply){
    const backup={createdAt:new Date().toISOString(),appointments:(await c.query('select * from appointments')).rows,customers:(await c.query('select * from customers')).rows,functions:(await c.query("select proname,pg_get_functiondef(oid) as definition from pg_proc where oid in('public.office_snapshot()'::regprocedure,'public.create_public_appointment(text,text,uuid,uuid,timestamp with time zone,boolean)'::regprocedure)")).rows}
    await mkdir('.private/backups',{recursive:true});await writeFile('.private/backups/pre-attendee-2026-11-18.json',JSON.stringify(backup))
   }
   await c.query(sql);assert.deepEqual(await before(),fingerprint,'Existing appointment/customer records changed')
   if(apply){await c.query('insert into machado_schema_migrations(file_name,checksum_sha256) values($1,$2)',[file,checksum]);await c.query('commit')}
   else await c.query('rollback')
   console.log(apply?'Attendee column applied; existing contacts/reservations preserved, no controls or queues changed.':'Attendee rehearsal passed and rolled back; records preserved.')
  }catch(e){await c.query('rollback');throw e}
 }
}finally{c.release();await pool.end()}

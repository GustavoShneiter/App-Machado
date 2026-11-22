import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {pool} from '../server/db.mjs'
const file='023_business_hours_permissions.sql',apply=process.argv.includes('--apply')
const sql=(await readFile(new URL('../database/'+file,import.meta.url),'utf8')).replace(/\r\n?/g,'\n')
const checksum=createHash('sha256').update(sql).digest('hex'),client=await pool.connect()
try{
 await client.query('begin');await client.query("select pg_advisory_xact_lock(hashtext('machado-schema-migrations'))")
 const existing=(await client.query('select checksum_sha256 from machado_schema_migrations where file_name=$1',[file])).rows[0]
 if(existing)assert.equal(existing.checksum_sha256,checksum)
 else{
  await client.query(sql)
  await client.query('insert into machado_schema_migrations(file_name,checksum_sha256) values($1,$2)',[file,checksum])
 }
 const count=(await client.query('select count(*)::int n from business_units')).rows[0].n
 if(!existing){
  assert.equal((await client.query('select count(*)::int n from business_hours')).rows[0].n,count*6)
  assert.equal((await client.query("select count(*)::int n from business_hours where weekday=7 or opens_at<>'08:00' or closes_at<>'22:00'")).rows[0].n,0)
 }
 await client.query(apply?'commit':'rollback')
 console.log(JSON.stringify({migration:file,applied:apply,already_applied:Boolean(existing),units:count,default:'Mon-Sat 08:00-22:00; Sunday closed'}))
}catch(e){await client.query('rollback');throw e}finally{client.release();await pool.end()}

import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {pool} from '../server/db.mjs'
const mode=process.argv[2]
assert(['freeze','unfreeze'].includes(mode),'Choose freeze or unfreeze explicitly')
assert(new URL(process.env.DATABASE_URL).hostname.endsWith('.neon.tech'),'This guard belongs only to the original Neon database')
const client=await pool.connect(),quote=s=>'"'+s.replaceAll('"','""')+'"'
try{
 await client.query('begin')
 await client.query("set local lock_timeout='20s'")
 if(mode==='freeze'){
  assert.equal((await client.query('select count(*)::int n from business_units where is_primary')).rows[0].n,1)
  await client.query("create or replace function public.machado_migration_write_guard() returns trigger language plpgsql as $$ begin raise exception using errcode='55000',message='Sistema em migracao. Tente novamente em instantes.'; end $$")
  const tables=(await client.query("select schemaname,tablename from pg_tables where schemaname in('public','auth') order by schemaname,tablename")).rows
  for(const {schemaname,tablename} of tables){
   const name=quote(schemaname)+'.'+quote(tablename)
   await client.query(`drop trigger if exists machado_migration_freeze on ${name}`)
   await client.query(`create trigger machado_migration_freeze before insert or update or delete or truncate on ${name} for each statement execute function public.machado_migration_write_guard()`)
  }
 }else await client.query('drop function if exists public.machado_migration_write_guard() cascade')
 await client.query('commit')
 await writeFile('.private/migration/source-write-state.json',JSON.stringify({frozen:mode==='freeze',at:new Date().toISOString()}))
 console.log(mode==='freeze'?'Original database is write-frozen; existing data retained.':'Original database writes restored. Ensure no destination writes before using rollback.')
}catch(error){await client.query('rollback');throw error}finally{client.release();await pool.end()}

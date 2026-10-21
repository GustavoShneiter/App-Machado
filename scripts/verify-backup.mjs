import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pool } from '../server/db.mjs'
import { businessTables,identityTables,archiveBackup } from '../server/backups.mjs'
import { get } from '@vercel/blob'

const file=process.argv.find(arg=>arg.endsWith('.json')) || '.private/verified-backup.json'
const data=JSON.parse(await readFile(file,'utf8'))
assert.equal(data.format,'machado-backup');assert.equal(data.version,1)
const client=await pool.connect()
try{
  await client.query('begin')
  const names=[...businessTables,...identityTables]
  for(const name of names){
    assert.ok(Array.isArray(data.tables[name]),`Tabela ausente: ${name}`)
    await client.query(`create temporary table "restore_${name}" (like public."${name}" including all) on commit drop`)
    await client.query(`insert into "restore_${name}" select * from jsonb_populate_recordset(null::public."${name}",$1::jsonb)`,[JSON.stringify(data.tables[name])])
    assert.equal(Number((await client.query(`select count(*) as n from "restore_${name}"`)).rows[0].n),data.tables[name].length)
  }
  await client.query('create temporary table restore_identity_users(id uuid primary key) on commit drop')
  await client.query('insert into restore_identity_users select id::uuid from restore_auth_user')
  const foreignKeys=await client.query("select c.conname,t.relname,pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_class t on t.oid=c.conrelid where c.contype='f' and t.relnamespace='public'::regnamespace")
  for(const row of foreignKeys.rows){
    if(!names.includes(row.relname))continue
    const definition=row.definition.replace(/REFERENCES auth\.users\(/,'REFERENCES restore_identity_users(').replace(/REFERENCES (?:public\.)?"?([a-z_]+)"?\(/,(_match,name)=>name==='restore_identity_users'?'REFERENCES restore_identity_users(':`REFERENCES "restore_${name}"(`)
    await client.query(`alter table "restore_${row.relname}" add constraint "restore_${row.conname}" ${definition}`)
  }
  await client.query('set constraints all immediate')
  await client.query('rollback')
  console.log('PASS restauração: dados importados em tabelas temporárias com tipos, índices, validações e referências entre registros. Nenhum registro operacional alterado.')
  if(process.argv.includes('--archive')){
    const archived=await archiveBackup()
    const row=(await pool.query('select pathname,sha256 from backup_runs order by created_at desc limit 1')).rows[0]
    const result=await get(row.pathname,{access:'private',token:process.env.BACKUP_READ_WRITE_TOKEN})
    assert.equal(result.statusCode,200)
    const body=await new Response(result.stream).text()
    assert.equal(createHash('sha256').update(body).digest('hex'),row.sha256)
    assert.equal(JSON.parse(body).format,'machado-backup')
    console.log('PASS backup privado: gravação, leitura e SHA-256 conferidos;',archived.tables,'tabelas.')
  }
}finally{await client.query('rollback').catch(()=>{});client.release();await pool.end()}

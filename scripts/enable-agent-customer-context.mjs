import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {pool} from '../server/db.mjs'

// Explicitly authorized for the existing Machado integration only. No token rotation or message settings changes.
const apply=process.argv.includes('--apply'),c=await pool.connect()
try{
 await c.query('begin');await c.query("set local lock_timeout='5s'")
 const unit=(await c.query("select id from business_units where slug='machado' and is_primary and active")).rows[0]
 assert(unit,'Machado unit unavailable')
 const rows=(await c.query("select id,permissions from agent_integrations where tenant_id=$1 and name='WhatsApp Machado' and active for update",[unit.id])).rows
 assert.equal(rows.length,1,'Expected exactly the existing active Machado integration')
 const integration=rows[0];assert(integration.permissions.includes('catalog')&&integration.permissions.includes('pending_booking'))
 const settingsBefore=(await c.query('select md5(config::text) hash,revision from agent_settings where tenant_id=$1',[unit.id])).rows
 if(!integration.permissions.includes('customer_context')){
  if(apply){await mkdir('.private/backups',{recursive:true});await writeFile('.private/backups/pre-customer-context-permission.json',JSON.stringify({unit:unit.id,integration:integration.id,permissions:integration.permissions,createdAt:new Date().toISOString()}))}
  await c.query("update agent_integrations set permissions=array_append(permissions,'customer_context') where id=$1 and tenant_id=$2",[integration.id,unit.id])
 }
 assert.deepEqual((await c.query('select md5(config::text) hash,revision from agent_settings where tenant_id=$1',[unit.id])).rows,settingsBefore)
 await c.query(apply?'commit':'rollback')
 console.log(apply?'Machado customer_context permission enabled; token and message controls preserved.':'Permission rehearsal passed and rolled back; no settings changed.')
}catch(error){await c.query('rollback');throw error}finally{c.release();await pool.end()}

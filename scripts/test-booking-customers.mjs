import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {pool} from '../server/db.mjs'
import {professionalCommands} from '../server/professional-commands.mjs'
const c=await pool.connect()
try{
 await c.query('begin');await c.query('set local jit=off')
 const owner=(await c.query("select id,tenant_id from profiles where role='owner' and active order by created_at limit 1")).rows[0]
 const uid=randomUUID(),foreign=(await c.query('select provision_workspace_owner($1) value',[JSON.stringify({id:uid,account_id:randomUUID(),name:'QA Lookup',business_name:'QA Lookup',email:`lookup-${uid}@example.invalid`,password_hash:'x'.repeat(96),recovery_codes:[1,2,3].map(i=>({code_hash:String(i).repeat(64)}))})])).rows[0].value
 await c.query("select set_config('request.business_id',$1,true),set_config('request.jwt.claim.sub',$2,true)",[foreign.business_id,uid]);await c.query('set local role machado_runtime')
 const other=(await c.query("insert into customers(name,phone) values('QA Foreign','4500000770') returning id")).rows[0]
 await c.query("select set_config('request.business_id',$1,true),set_config('request.jwt.claim.sub',$2,true)",[owner.tenant_id,owner.id])
 const pro=(await c.query('select p.id,p.profile_id,s.service_id from professionals p join profiles r on r.id=p.profile_id join professional_services s on s.professional_id=p.id where p.active and r.active limit 1')).rows[0]
 const records=(await c.query("insert into customers(name,phone,notes) values('QA João Silva','4500000771','private note'),('QA João Silva','(45) 00000-771','private note'),('QA Without phone','QA-ABSENT','private note') returning id,name,phone")).rows
 const count=(await c.query('select count(*)::int n from customers')).rows[0].n
 await c.query("select set_config('request.jwt.claim.sub',$1,true)",[pro.profile_id])
 const directory=await professionalCommands(c,pro.id)
 assert.equal(directory.customers.length,count,'Professional sees full unit directory')
 for(const row of records)assert.equal(directory.customers.find(p=>p.id===row.id).notes,null,'Unrelated profile notes are not shared')
 assert.ok(!directory.customers.some(p=>p.id===other.id),'Other unit is not visible')
 const payload={name:'Untrusted supplied name',phone:'4500000999',professional_id:pro.id,service_id:pro.service_id,starts_at:'2098-03-10T09:20:00-03:00',fit_in:false}
 const booking=(await c.query('select professional_create_appointment($1) value',[{...payload,customer_id:records[1].id}])).rows[0].value
 assert.equal((await c.query('select customer_id from appointments where id=$1',[booking.id])).rows[0].customer_id,records[1].id,'Selected ID wins over normalized duplicate phone')
 const fit=(await c.query('select professional_create_appointment($1) value',[{...payload,customer_id:records[2].id,starts_at:'2098-03-10T10:40:00-03:00',fit_in:true,duration:15}])).rows[0].value
 assert.equal((await c.query('select customer_id from appointments where id=$1',[fit.id])).rows[0].customer_id,records[2].id,'No fake WhatsApp required for an existing client')
 assert.equal((await c.query('select count(*)::int n from customers')).rows[0].n,count,'No duplicate clients')
 assert.deepEqual((await c.query('select id,name,phone from customers where id=any($1::uuid[]) order by id',[records.map(r=>r.id)])).rows,records.toSorted((a,b)=>a.id.localeCompare(b.id)),'Booking does not rewrite the customer profile')
 await c.query('savepoint forbidden_customer')
 await assert.rejects(c.query('select professional_create_appointment($1) value',[{...payload,customer_id:other.id}]),e=>e.code==='42501')
 await c.query('rollback to savepoint forbidden_customer')
 await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner.id])
 const admin=(await c.query('select create_office_appointment($1) value',[{...payload,customer_id:records[0].id,starts_at:'2098-03-10T12:00:00-03:00'}])).rows[0].value
 assert.equal((await c.query('select customer_id from appointments where id=$1',[admin.id])).rows[0].customer_id,records[0].id,'Gestão uses the same explicit selection')
 await c.query('rollback')
 console.log('PASS customer booking: complete unit directory, other unit blocked, private notes restricted, duplicate names/phones, existing ID, missing phone, admin and professional; all fixtures and notification jobs rolled back')
}catch(e){await c.query('rollback');throw e}finally{c.release();await pool.end()}

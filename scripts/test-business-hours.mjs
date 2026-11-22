import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {pool} from '../server/db.mjs'
import {businessHours} from '../server/business-hours.mjs'
const client=await pool.connect()
try{
 await client.query('begin');await client.query('set local jit=off')
 if(!process.argv.includes('--existing'))await client.query((await readFile(new URL('../database/023_business_hours_permissions.sql',import.meta.url),'utf8')).replace(/\r\n?/g,'\n'))
 const owner=(await client.query("select id,tenant_id from profiles where role='owner' and active order by created_at limit 1")).rows[0]
 const userId=randomUUID(),recovery=[1,2,3].map(i=>({code_hash:String(i).repeat(64)}))
 const unit=(await client.query('select provision_workspace_owner($1) value',[JSON.stringify({id:userId,account_id:randomUUID(),name:'QA Hours',business_name:'QA Hours',email:`hours-${userId}@example.invalid`,password_hash:'x'.repeat(96),recovery_codes:recovery})])).rows[0].value
 assert.equal((await client.query("select count(*)::int n from business_hours where tenant_id=$1 and weekday between 1 and 6 and opens_at='08:00' and closes_at='22:00'",[unit.business_id])).rows[0].n,6,'New account default')
 await client.query("select set_config('request.business_id',$1,true),set_config('request.jwt.claim.sub',$2,true)",[owner.tenant_id,owner.id])
 await client.query('set local role machado_runtime')
 const initial=await businessHours(client,owner.id)
 assert.equal(initial.can_edit,true);assert.equal(initial.can_delegate,true)
 const pro=initial.accounts[0];assert.ok(pro,'An active professional account is needed for authorization tests')
 const rows=Array.from({length:7},(_,i)=>({weekday:i+1,closed:i===6,opens_at:'08:00',closes_at:'22:00'}))
 await client.query("select set_config('request.jwt.claim.sub',$1,true)",[pro.id])
 assert.equal((await businessHours(client,pro.id)).can_edit,false)
 await assert.rejects(businessHours(client,pro.id,{action:'hours',revision:initial.revision,hours:rows}),{status:403})
 await client.query("select set_config('request.jwt.claim.sub',$1,true)",[owner.id])
 const granted=await businessHours(client,owner.id,{action:'permissions',revision:initial.revision,profile_ids:[pro.id]})
 await client.query("select set_config('request.jwt.claim.sub',$1,true)",[pro.id])
 assert.equal((await businessHours(client,pro.id)).can_edit,true)
 await assert.rejects(businessHours(client,pro.id,{action:'permissions',revision:granted.revision,profile_ids:[]}),{status:403})
 await assert.rejects(businessHours(client,pro.id,{action:'hours',revision:-1,hours:rows}),{status:409})
 await assert.rejects(businessHours(client,pro.id,{action:'hours',revision:granted.revision,hours:rows.map(r=>({...r,closes_at:'07:00'}))}),{status:400})
 const updated=await businessHours(client,pro.id,{action:'hours',revision:granted.revision,hours:rows})
 const checks=(await client.query(`select business_hours_allow('2026-11-23T08:00:00-03:00','2026-11-23T08:40:00-03:00') morning,
 business_hours_allow('2026-11-23T21:20:00-03:00','2026-11-23T22:00:00-03:00') closing,
 business_hours_allow('2026-11-23T21:40:00-03:00','2026-11-23T22:20:00-03:00') overtime,
 business_hours_allow('2026-11-29T08:00:00-03:00','2026-11-29T08:40:00-03:00') sunday`)).rows[0]
 assert.deepEqual(checks,{morning:true,closing:true,overtime:false,sunday:false})
 const linked=(await client.query('select p.id,s.service_id from professionals p join professional_services s on s.professional_id=p.id where p.profile_id=$1 limit 1',[pro.id])).rows[0]
 assert.equal((await client.query("select count(*)::int n from public_booking_slots($1,'2026-11-29',$2)",[linked.service_id,linked.id])).rows[0].n,0,'Public Sunday has no slots')
 await client.query('savepoint blocked_booking')
 await assert.rejects(client.query('select professional_create_appointment($1)',[JSON.stringify({professional_id:linked.id,service_id:linked.service_id,name:'QA Hours client',phone:'4500000889',starts_at:'2026-11-29T10:00:00-03:00',fit_in:true,duration:40})]),/fechada/)
 await client.query('rollback to savepoint blocked_booking')
 await client.query("select set_config('request.jwt.claim.sub',$1,true)",[owner.id])
 await businessHours(client,owner.id,{action:'permissions',revision:updated.revision,profile_ids:[]})
 assert.equal((await businessHours(client,pro.id)).can_edit,false,'Revocation')
 await assert.rejects(businessHours(client,owner.id,{action:'permissions',revision:updated.revision+1,profile_ids:[userId]}),{status:403})
 await client.query("select set_config('request.business_id',$1,true),set_config('request.jwt.claim.sub',$2,true)",[unit.business_id,userId])
 assert.equal((await businessHours(client,userId)).accounts.length,0,'Other unit cannot see professional accounts')
 await assert.rejects(businessHours(client,userId,{action:'permissions',revision:0,profile_ids:[pro.id]}),{status:403})
 await client.query('rollback')
 console.log('PASS work hours: new-unit defaults, Sunday, closing, booking guard, delegation, revocation, stale revisions, invalid intervals and unit isolation; all test writes rolled back')
}catch(e){await client.query('rollback');throw e}finally{client.release();await pool.end()}

import assert from 'node:assert/strict'
import { randomBytes,randomUUID,createHash } from 'node:crypto'
import { readFile,readdir } from 'node:fs/promises'
import pg from 'pg'
import { pool } from '../server/db.mjs'
import { administrativeAgent } from '../server/agent-settings.mjs'
import { agentAction,externalAgent } from '../server/agent.mjs'
import { enqueueCampaigns } from '../server/agent-queue.mjs'
import { professionalSnapshot } from '../server/professionals.mjs'
import { customerContext } from '../server/agent-customer.mjs'
import { defaultConfig,validateConfig,renderMessage,actions } from '../shared/agent-config.mjs'

const suffix=randomBytes(6).toString('hex'),database='machado_qa_agent_'+suffix,role='machado_agent_qa_'+suffix
const token=randomBytes(48).toString('base64url')
const target=new URL(process.env.DATABASE_URL);target.pathname='/'+database;target.searchParams.delete('sslmode')
let temp,created=false,tearingDown=false
process.env.AGENT_ENABLED='true'
try {
 await pool.query(`create database "${database}"`);created=true
 temp=new pg.Pool({connectionString:target.toString(),ssl:{rejectUnauthorized:true,...(process.env.DATABASE_SSL_CA_FILE?{ca:await readFile(process.env.DATABASE_SSL_CA_FILE,'utf8')}:{})},max:3,statement_timeout:90000})
 temp.on('error',error=>{if(!tearingDown||error.code!=='57P01')throw error})
 const client=await temp.connect()
 try {
  for(const file of (await readdir('database')).filter(f=>/^\d{3}_.*\.sql$/.test(f)).sort()) {
   await client.query('begin');try{await client.query((await readFile('database/'+file,'utf8')).replaceAll('machado_runtime',role));await client.query('commit')}catch(e){await client.query('rollback');throw Object.assign(e,{migration:file})}
  }
  const units=(await client.query("insert into business_units(slug,name) values($1,'Teste A'),($2,'Teste B') returning id",['qa-a-'+suffix,'qa-b-'+suffix])).rows
  const user=randomUUID()
  await client.query('insert into auth.users(id,email,tenant_id) values($1,$2,$3)',[user,suffix+'@example.invalid',units[0].id])
  await client.query("insert into profiles(id,name,role,tenant_id) values($1,'Teste','owner',$2)",[user,units[0].id])
  const scoped=async(index,work)=>{
   await client.query('begin');try{await client.query("select set_config('request.business_id',$1,true),set_config('request.jwt.claim.sub',$2,true)",[units[index].id,'']);await client.query(`set local role "${role}"`);const r=await work(client);await client.query('commit');return r}catch(e){await client.query('rollback');throw e}
  }
  let integration,customer,pro,service,appointment,financeBefore
  await scoped(0,async c=>{
   financeBefore=(await c.query('select count(*)::int n from commission_entries where status in(\'pending\',\'paid\')')).rows[0].n
   await c.query("insert into business_settings(id,name) values(true,'Machado teste')")
   integration=(await c.query("insert into agent_integrations(name,token_hash,permissions) values('Teste',$1,$2) returning *",[createHash('sha256').update(token).digest('hex'),actions])).rows[0]
   customer=(await c.query("insert into customers(name,phone,birth_date) values('Cliente Teste','45999990000',current_date) returning id")).rows[0].id
   pro=(await c.query("insert into professionals(name) values('Barbeiro') returning id")).rows[0].id
   service=(await c.query("insert into services(name,price_cents,duration_minutes) values('Corte',4000,40) returning id")).rows[0].id
   const cfg={...defaultConfig(),assistant_enabled:true,confirmations_enabled:true,reminders_enabled:true,birthday_enabled:true,reactivation_enabled:true,reminder_offsets_minutes:[1440,120]}
   await administrativeAgent(c,'settings','POST',{...cfg,expected_revision:1},{id:user,role:'owner'})
   appointment=(await c.query("insert into appointments(customer_id,professional_id,service_id,starts_at,ends_at,expected_price_cents) values($1,$2,$3,now()+interval '3 days',now()+interval '3 days 40 minutes',4000) returning id",[customer,pro,service])).rows[0].id
  })
  await assert.rejects(scoped(0,c=>administrativeAgent(c,'settings','POST',{...defaultConfig(),expected_revision:1},{id:user,role:'owner'})),e=>e.status===409)
  await scoped(1,async c=>{assert.equal((await c.query('select * from agent_outbox')).rows.length,0);assert.equal((await c.query('select * from agent_booking_drafts')).rows.length,0)})
  await scoped(0,async c=>{
   const job=await agentAction(c,'claim_notification',{},integration);assert.equal(job.kind,'confirmation');assert.match(job.message_text,/Cliente Teste/);assert(job.settings_revision>0)
   const snapshot=job.message_text
   const row=await administrativeAgent(c,'settings','GET',{},{});const {revision,updated_at,...cfg}=row;void updated_at;cfg.message_templates.confirmation.text='Nova mensagem para {cliente}'
   await administrativeAgent(c,'settings','POST',{...cfg,expected_revision:revision},{id:user,role:'owner'})
   assert.equal((await c.query('select message_text from agent_outbox where id=$1',[job.id])).rows[0].message_text,snapshot)
   await agentAction(c,'delivery_update',{event_id:'read1',provider_message_id:'provider1',status:'read',occurred_at:new Date().toISOString()},integration)
   const ack={id:job.id,claim_token:job.claim_token,status:'sent',provider_message_id:'provider1'}
   assert((await agentAction(c,'ack_notification',ack,integration)).acknowledged)
   assert((await agentAction(c,'ack_notification',ack,integration)).acknowledged)
   assert.equal((await c.query('select status from agent_outbox where id=$1',[job.id])).rows[0].status,'read')
   await c.query('update appointments set expected_price_cents=5000 where id=$1',[appointment]);assert.equal((await c.query('select count(*)::int n from agent_outbox')).rows[0].n,1)
   await c.query("update appointments set starts_at=starts_at+interval '1 day',ends_at=ends_at+interval '1 day' where id=$1",[appointment]);assert.equal((await c.query('select count(*)::int n from agent_outbox')).rows[0].n,2)
   await c.query("update appointments set status='cancelled' where id=$1",[appointment]);assert.equal(await agentAction(c,'claim_notification',{},integration),null)
   await administrativeAgent(c,'contact-consent','POST',{phone:'45999990000',marketing_opt_in:true,evidence:'Autorização presencial do cliente.'},{id:user})
   await agentAction(c,'enqueue_campaigns',{},integration);await agentAction(c,'opt_out',{phone:'45999990000'},integration)
   assert.equal((await c.query("select count(*)::int n from agent_outbox where kind='birthday' and status='pending'")).rows[0].n,0)
   assert.equal((await c.query("select count(*)::int n from commission_entries where status in('pending','paid')")).rows[0].n,financeBefore)
   await c.query('insert into professional_services(professional_id,service_id) values($1,$2)',[pro,service])
   await c.query("insert into business_hours(weekday,opens_at,closes_at) select n,'06:00','23:00' from generate_series(1,7)n")
   const slot=(await c.query("select ((current_date+5+s.slot_time) at time zone 'America/Sao_Paulo') starts_at from public_available_slots($1,current_date+5,$2)s limit 1",[service,pro])).rows[0]
   assert(slot)
   const payload={phone:'45999990000',customer_name:'Cliente Teste',service_id:service,professional_id:pro,starts_at:slot.starts_at.toISOString(),message_id:'origin1'}
   const draft=await agentAction(c,'prepare_booking',payload,integration)
   assert.equal((await agentAction(c,'prepare_booking',payload,integration)).id,draft.id)
   const confirm={draft_id:draft.id,phone:payload.phone,message_id:'confirm1',message_text:'sim'}
   const booked=await agentAction(c,'confirm_booking',confirm,integration)
   assert.equal((await agentAction(c,'confirm_booking',confirm,integration)).appointment_id,booked.appointment_id)
   assert.equal((await c.query('select count(*)::int n from payments')).rows[0].n,0)
   await c.query("update appointments set starts_at=now()+interval '23 hours 50 minutes',ends_at=now()+interval '24 hours 30 minutes' where id=$1",[booked.appointment_id])
   await c.query("update appointments set notification_cycle_at=now()-interval '2 days' where id=$1",[booked.appointment_id])
   assert.equal((await agentAction(c,'enqueue_reminders',{},integration)).queued,1)
   assert.equal((await agentAction(c,'enqueue_reminders',{},integration)).queued,0)
   const reminderJob=(await c.query("select * from agent_outbox where kind='reminder' and status='pending'")).rows[0]
   assert(reminderJob)
   await c.query("update agent_outbox set status='suppressed' where kind='confirmation' and status='pending'")
   const remind=await agentAction(c,'claim_notification',{},integration)
   assert.equal(remind.kind,'reminder');assert.equal(remind.reminder_index,1)
   assert.match(remind.message_text,/24 horas/)
   await agentAction(c,'ack_notification',{id:remind.id,claim_token:remind.claim_token,status:'uncertain',provider_message_id:null},integration)
   assert.equal(await agentAction(c,'claim_notification',{},integration),null)
  })
  assert.equal(validateConfig({...defaultConfig(),reactivation_days:20}).reactivation_days,20)
  assert.equal(validateConfig({...defaultConfig(),reactivation_days:1}).reactivation_days,1)
  assert.equal(validateConfig({...defaultConfig(),reactivation_days:0}).reactivation_days,0)
  assert.throws(()=>validateConfig({...defaultConfig(),reactivation_days:-1}))
  assert.throws(()=>validateConfig({...defaultConfig(),reactivation_days:1.5}))
  assert.throws(()=>validateConfig({...defaultConfig(),confirmation_delay_minutes:61}))
  assert.throws(()=>validateConfig({...defaultConfig(),reminder_offsets_minutes:[60,60]}))
  assert.throws(()=>renderMessage('birthday','Olá {servico}',{cliente:'Teste'}))
  assert.match(renderMessage('birthday','Olá {cliente}',{cliente:'Teste'}),/responda SAIR/)
  const call=async(action,payload={},secret=token)=>{
   let result
   await externalAgent({method:'POST',headers:{authorization:'Bearer '+secret}},{},{pool:temp,readBody:async()=>({action,payload}),send:(_res,_code,value)=>{result=value.data},transaction:(_actor,work)=>scoped(0,work)})
   return result
  }
  assert.equal((await call('capabilities')).contract_revision,'2.2')
  await scoped(0,c=>c.query('update customers set notes=$2 where id=$1',[customer,'Prefere atendimento silencioso.']))
  const known=await call('customer_context',{phone:'5545999990000'})
  assert.equal(known.found,true);assert.equal(known.business.name,'Machado teste');assert.equal(known.customer.id,customer)
  assert.equal(known.customer.notes,'Prefere atendimento silencioso.');assert.match(known.customer.birth_date,/^\d{4}-\d{2}-\d{2}$/)
  assert(known.upcoming_appointments.length<=5);assert(!JSON.stringify(known).includes('price_cents'))
  assert.equal((await call('customer_context',{phone:'45999990000'})).customer.id,customer)
  assert.equal((await call('customer_context',{phone:'45999991111'})).found,false)
  await assert.rejects(call('customer_context',{phone:'invalido'}),e=>e.status===400)
  await assert.rejects(call('customer_context',{phone:'45999990000',tenant_id:units[1].id}),e=>e.status===400)
  await scoped(1,async c=>{
   assert.equal((await customerContext(c,{phone:'45999990000'})).found,false)
   await assert.rejects(agentAction(c,'customer_context',{phone:'45999990000'},integration),e=>e.status===503)
  })
  await scoped(0,c=>c.query("update agent_integrations set permissions=array_remove(permissions,'customer_context') where id=$1",[integration.id]))
  await assert.rejects(call('customer_context',{phone:'45999990000'}),e=>e.status===403)
  await scoped(0,c=>c.query('update agent_integrations set permissions=$2 where id=$1',[integration.id,actions]))
  await scoped(0,async c=>{
   const duplicate=(await c.query("insert into customers(name,phone) values('Cadastro duplicado','5545999990000') returning id")).rows[0].id
   const ambiguous=await customerContext(c,{phone:'45999990000'})
   assert.equal(ambiguous.ambiguous,true);assert.equal(ambiguous.found,false);assert.equal(ambiguous.customer,null)
   await c.query('delete from customers where id=$1',[duplicate])
  })
  // Exercise the API action and its complete SQL, not only the slot function.
  const day=(await client.query("select to_char(current_date+5,'YYYY-MM-DD') as day")).rows[0].day
  const availability={service_id:service,day,professional_id:pro}
  const chronological=await call('availability',availability)
  assert.equal(chronological.requested_day,day);assert.equal(chronological.search_days,14)
  assert.equal(chronological.slots.length,6);assert.equal(chronological.slots[0].slot_time,'06:00:00')
  const nearest=await call('availability',{...availability,preferred_time:'15:29'})
  assert.equal(nearest.preferred_time,'15:29');assert.equal(nearest.period,null)
  assert.equal(nearest.slots[0].slot_time,'15:20:00')
  assert(nearest.slots.every(s=>s.day===day&&s.professional_id===pro))
  const tied=await call('availability',{...availability,preferred_time:'15:40'})
  assert.deepEqual(tied.slots.slice(0,2).map(s=>s.slot_time),['15:20:00','16:00:00'])
  for(const [period,min,max] of [['morning',0,12],['afternoon',12,18],['evening',18,24]]) {
   const result=await call('availability',{...availability,preferred_time:'15:29',period})
   assert.equal(result.period,period);assert(result.slots.length>0)
   assert(result.slots.every(s=>Number(s.slot_time.slice(0,2))>=min&&Number(s.slot_time.slice(0,2))<max))
  }
  assert.equal((await call('availability',{...availability,professional_id:null})).slots.length,6)
  assert.equal((await call('availability',{...availability,service_id:randomUUID()})).slots.length,0)
  for(const extra of [{preferred_time:'24:00'},{preferred_time:'15:60'},{preferred_time:1529},{period:'night'},{day:'2026-02-30'}]) {
   await assert.rejects(call('availability',{...availability,...extra}),e=>e.status===400)
  }
  // A real booking already made above must be absent; block its entire day and
  // require fallback to the next actual day, while respecting the period.
  const firstBooked=(await scoped(0,c=>c.query('select starts_at from appointments where id in(select appointment_id from agent_booking_drafts where appointment_id is not null)'))).rows[0]
  const bookedLocal=(await client.query("select to_char($1::timestamptz at time zone 'America/Sao_Paulo','YYYY-MM-DD') as day,($1::timestamptz at time zone 'America/Sao_Paulo')::time::text as time",[firstBooked.starts_at])).rows[0]
  const occupied=await call('availability',{...availability,day:bookedLocal.day,preferred_time:bookedLocal.time.slice(0,5)})
  assert(!occupied.slots.some(s=>s.day===bookedLocal.day&&s.slot_time===bookedLocal.time))
  await scoped(0,c=>c.query("insert into schedule_blocks(professional_id,starts_at,ends_at,reason) values($1,($2::date at time zone 'America/Sao_Paulo'),(($2::date+1) at time zone 'America/Sao_Paulo'),'QA full day')",[pro,day]))
  const fallback=await call('availability',{...availability,preferred_time:'15:29',period:'afternoon'})
  assert.equal(fallback.slots.length,6);assert(fallback.slots.every(s=>s.day>day))
  assert.equal(fallback.slots[0].slot_time,'15:20:00')
  await scoped(1,async c=>assert.equal((await agentAction(c,'settings',{},integration)).assistant_enabled,false))
  await assert.rejects(call('capabilities',{},'x'.repeat(64)),e=>e.status===401)
  await assert.rejects(call('reset_database'),e=>e.status===403)
  await assert.rejects(call('catalog',{tenant_id:units[1].id}),e=>e.status===400)
  await call('heartbeat',{component:'bridge',instance_name:'teste',connection_state:'open',assistant_state:'active',notifications_state:'paused',last_success_at:new Date().toISOString()})
  await scoped(0,async c=>assert.equal((await administrativeAgent(c,'status','GET',{},{})).runtime.stale,false))
  // A dependent can book using the existing contact's phone without renaming it.
  await scoped(0,async c=>{
   const next=(await c.query("select ((current_date+7+s.slot_time) at time zone 'America/Sao_Paulo') as starts_at from public_available_slots($1,current_date+7,$2) s limit 1",[service,pro])).rows[0]
   const draft=await agentAction(c,'prepare_booking',{phone:'45999990000',customer_name:'Filho do Cliente',service_id:service,professional_id:pro,starts_at:next.starts_at.toISOString(),message_id:'dependent-origin'},integration)
   const booked=await agentAction(c,'confirm_booking',{draft_id:draft.id,phone:'45999990000',message_id:'dependent-confirm',message_text:'sim'},integration)
   const contact=(await c.query('select name from customers where id=$1',[customer])).rows[0]
   assert.equal(contact.name,'Cliente Teste')
   assert.equal((await c.query("select count(*)::int as n from customers where phone='45999990000'")).rows[0].n,1)
   assert.equal((await c.query('select attendee_name from appointments where id=$1',[booked.appointment_id])).rows[0].attendee_name,'Filho do Cliente')
   assert.equal((await professionalSnapshot(c,pro)).appointments.find(a=>a.id===booked.appointment_id).customer_name,'Filho do Cliente')
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user])
   const office=(await c.query('select office_snapshot() as value')).rows[0].value
   assert.equal(office.appointments.find(a=>a.id===booked.appointment_id).customer_name,'Filho do Cliente')
  })
  // Save the caller-chosen 20 days through the actual settings API, then exercise eligibility.
  await scoped(0,async c=>{
   const before=await administrativeAgent(c,'settings','GET',{}, {id:user,role:'owner'});
   const {revision,updated_at,...input}=before;void updated_at;
   const saved=await administrativeAgent(c,'settings','POST',{...input,reactivation_enabled:true,reactivation_days:20,birthday_enabled:false,campaign_start_hour:0,campaign_end_hour:24,expected_revision:revision},{id:user,role:'owner'});
   assert.equal(saved.reactivation_days,20);
   const eligible=[];
   for(const [index,days,consent] of [[1,21,true],[2,19,true],[3,21,false]]){
    const phone='4599999001'+index;
    const person=(await c.query("insert into customers(name,phone) values('Retorno QA',$1) returning id",[phone])).rows[0].id;
    const last=(await c.query("insert into appointments(customer_id,professional_id,service_id,starts_at,ends_at,expected_price_cents,status) values($1,$2,$3,((now() at time zone 'America/Sao_Paulo')::date-$4::int+make_interval(hours=>$5::int)) at time zone 'America/Sao_Paulo',((now() at time zone 'America/Sao_Paulo')::date-$4::int+make_interval(hours=>$5::int,mins=>40)) at time zone 'America/Sao_Paulo',4000,'completed') returning id",[person,pro,service,days,10+index])).rows[0];
    void last;
    await c.query('insert into agent_contacts(phone,marketing_opt_in,opted_out) values($1,$2,false)',[phone,consent]);
    eligible.push(person);
   }
   await enqueueCampaigns(c,saved);
   const invitations=(await c.query("select customer_id from agent_outbox where kind='reactivation' and customer_id=any($1::uuid[])",[eligible])).rows;
   assert.deepEqual(invitations.map(r=>r.customer_id),[eligible[0]],'20-day eligibility: 21 days authorized only; 19 days and no-consent excluded');
   await enqueueCampaigns(c,saved);
   assert.equal((await c.query("select count(*)::int n from agent_outbox where kind='reactivation' and customer_id=$1",[eligible[0]])).rows[0].n,1,'No duplicate return invitation');
  });
  await scoped(0,c=>c.query('update agent_integrations set active=false where id=$1',[integration.id]))
  await assert.rejects(call('capabilities'),e=>e.status===401)
  console.log('PASS: full schema migrations, tenant isolation, settings conflicts, queue snapshots, callback-before-ack, repeat ack, revision/cancellation, consent and template validation. No production fixtures.')
 } finally {client.release()}
} finally {
 tearingDown=true
 await temp?.end()
 if(created)await pool.query(`drop database "${database}" with(force)`)
 await pool.query(`drop role if exists "${role}"`)
 await pool.end()
}

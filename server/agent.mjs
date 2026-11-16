import { createHash } from 'node:crypto'
import { actions,deliveryStates,cleanPhone,fail } from '../shared/agent-config.mjs'
import { settings,effectiveSettings } from './agent-settings.mjs'
import { enqueueReminders,enqueueCampaigns,claimNotification,acknowledge,reconcileDelivery } from './agent-queue.mjs'
const uuid=value=>{if(typeof value!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw fail('Identificador inválido.');return value}
const instant=value=>{if(typeof value!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw fail('Data e horário inválidos.');return new Date(value).toISOString()}
export async function agentAction(client,action,p,integration) {
 const cfg=effectiveSettings(await settings(client,true))
 if(action==='capabilities')return {contract_version:2,contract_revision:'2.1',notification_content:'claim_snapshot',timezone:'America/Sao_Paulo',draft_ttl_seconds:900,actions:integration.permissions,delivery_states:deliveryStates}
 if(action==='settings')return cfg
 if(action==='heartbeat') {
  if(p.component!=='bridge'||!['open','connecting','close','unknown'].includes(p.connection_state)||!['active','paused','disabled'].includes(p.assistant_state)||!['active','paused','disabled'].includes(p.notifications_state))throw fail('Estado inválido.')
  const state={component:'bridge',instance_name:String(p.instance_name||'').slice(0,100),connection_state:p.connection_state,assistant_state:p.assistant_state,notifications_state:p.notifications_state,last_success_at:p.last_success_at?instant(p.last_success_at):null,last_error_code:String(p.last_error_code||'').replace(/[^a-z0-9_-]/ig,'').slice(0,80)||null}
  const row=(await client.query('insert into agent_runtime_status(integration_id,state) values($1,$2) on conflict(integration_id) do update set state=$2,received_at=now() returning received_at',[integration.id,state])).rows[0];return {recorded:true,...row}
 }
 if(action==='opt_out') {
  const phone=cleanPhone(p.phone)
  await client.query('insert into agent_contacts(phone,opted_out) values($1,true) on conflict(tenant_id,phone) do update set opted_out=true,updated_at=now()',[phone])
  await client.query("update agent_outbox set status='suppressed',last_error_code='opt_out' where status='pending' and kind in('birthday','reactivation') and customer_id in(select id from customers where phone=$1)",[phone]);return {opted_out:true}
 }
 if(action==='enqueue_campaigns')return enqueueCampaigns(client,cfg)
 if(action==='enqueue_reminders')return enqueueReminders(client,cfg)
 if(action==='claim_notification')return claimNotification(client,cfg,integration)
 if(action==='ack_notification'){uuid(p.id);uuid(p.claim_token);return acknowledge(client,p,integration)}
 if(action==='delivery_update') {
  if(!['delivered','read','failed'].includes(p.status)||!p.event_id||String(p.event_id).length>255||!p.provider_message_id||String(p.provider_message_id).length>255)throw fail('Evento inválido.')
  await client.query('insert into agent_delivery_events(integration_id,event_id,provider_message_id,status,occurred_at) values($1,$2,$3,$4,$5) on conflict do nothing',[integration.id,p.event_id,p.provider_message_id,p.status,instant(p.occurred_at)])
  await reconcileDelivery(client,integration,p.provider_message_id);return {acknowledged:true}
 }
 if(!cfg.assistant_enabled)throw fail('Atendimento automático pausado.',503)
 if(action==='catalog') {
  const value=(await client.query('select public_catalog() value')).rows[0].value
  return {services:value.services.map(s=>({id:s.id,name:s.name,price:s.price_cents,duration_minutes:s.duration_minutes})),professionals:value.professionals.map(p=>({id:p.id,name:p.name})),business:value.business}
 }
 if(action==='availability') {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.day||'')||!Number.isFinite(Date.parse(p.day))||new Date(p.day).toISOString().slice(0,10)!==p.day)throw fail('Dia inválido.')
  const rows=(await client.query(`select to_char(d.day,'YYYY-MM-DD') day,s.slot_time::text,s.professional_id,pr.name professional_name,((d.day::date+s.slot_time) at time zone 'America/Sao_Paulo') starts_at from generate_series($1::date,$1::date+13,interval '1 day') d(day) cross join lateral public_available_slots($2::uuid,d.day::date,$3::uuid) s join professionals pr on pr.id=s.professional_id order by d.day,s.slot_time,pr.id limit 6`,[p.day,uuid(p.service_id),p.professional_id?uuid(p.professional_id):null])).rows
  return {requested_day:p.day,search_days:14,slots:rows}
 }
 if(action==='pending_booking')return (await client.query('select id,customer_name,service_id,professional_id,starts_at,appointment_id,expires_at from agent_booking_drafts where phone=$1 and expires_at>now() order by created_at desc limit 1',[cleanPhone(p.phone)])).rows[0]??null
 if(action==='prepare_booking') {
  const phone=cleanPhone(p.phone),name=String(p.customer_name||'').trim(),service=uuid(p.service_id),pro=uuid(p.professional_id),start=instant(p.starts_at),message=String(p.message_id||'')
  if(name.length<3||name.length>100||!message||message.length>255)throw fail('Confira nome e mensagem de origem.')
  const hash=createHash('sha256').update(JSON.stringify([phone,name,service,pro,start])).digest('hex')
  await client.query('select pg_advisory_xact_lock(hashtextextended(current_business_id()::text||$1,42))',[message])
  const old=(await client.query('select * from agent_booking_drafts where source_message_id=$1',[message])).rows[0]
  if(old){if(old.payload_hash!==hash)throw fail('Mensagem já usada para outra escolha.',409);return {id:old.id,starts_at:old.starts_at,expires_at:old.expires_at,requires_confirmation:true}}
  if(!(await client.query("select 1 from public_available_slots($1,($2::timestamptz at time zone 'America/Sao_Paulo')::date,$3) where slot_time=($2::timestamptz at time zone 'America/Sao_Paulo')::time",[service,start,pro])).rows.length)throw fail('Horário indisponível.',409)
  const row=(await client.query('insert into agent_booking_drafts(phone,customer_name,service_id,professional_id,starts_at,source_message_id,payload_hash) values($1,$2,$3,$4,$5,$6,$7) returning id,starts_at,expires_at',[phone,name,service,pro,start,message,hash])).rows[0]
  return {...row,requires_confirmation:true}
 }
 if(action==='confirm_booking') {
  const phone=cleanPhone(p.phone)
  if(!/^(sim|sim por favor|pode marcar|pode agendar|confirmo|confirmar|confirmado|pode confirmar|isso|fechado)[.!\s]*$/i.test(String(p.message_text||'').trim())||typeof p.message_id!=='string'||!p.message_id.trim()||p.message_id.length>255)throw fail('Peça confirmação explícita em uma nova mensagem.')
  const draft=(await client.query('select * from agent_booking_drafts where id=$1 and phone=$2 for update',[uuid(p.draft_id),phone])).rows[0]
  if(!draft)throw fail('Reserva temporária não encontrada.',404)
  if(draft.appointment_id)return {appointment_id:draft.appointment_id,booked:true,confirmation_queued:(await client.query('select 1 from agent_outbox where appointment_id=$1',[draft.appointment_id])).rows.length>0}
  if(new Date(draft.expires_at)<=new Date()||draft.source_message_id===p.message_id)throw fail('Reserva expirada ou confirmação na mesma mensagem.',409)
  let id
  try {id=(await client.query('select create_public_appointment($1,$2,$3,$4,$5) id',[draft.customer_name,phone,draft.service_id,draft.professional_id,draft.starts_at])).rows[0].id}
  catch(e){if(e.code==='23P01'||e.message==='slot_not_available')throw fail('Esse horário acabou de ser reservado. Escolha outro.',409);throw e}
  await client.query("update appointments set source='whatsapp_agent' where id=$1",[id]);await client.query('update agent_booking_drafts set appointment_id=$1 where id=$2',[id,draft.id])
  return {appointment_id:id,booked:true,confirmation_queued:cfg.confirmations_enabled}
 }
 throw fail('Ação inválida.',403)
}
export async function externalAgent(req,res,{readBody,send,pool,transaction}) {
 if(req.method!=='POST')throw fail('Método inválido.',405)
 if(process.env.AGENT_ENABLED!=='true')throw fail('Integração desligada.',503)
 const token=/^Bearer ([A-Za-z0-9_-]{40,128})$/.exec(req.headers.authorization||'')?.[1]
 if(!token)throw fail('Acesso negado.',401)
 const integration=(await pool.query('select i.id,i.tenant_id,i.permissions,i.rate_limit_per_minute,b.slug from agent_integrations i join business_units b on b.id=i.tenant_id where i.token_hash=$1 and i.active and b.active',[createHash('sha256').update(token).digest('hex')])).rows[0]
 if(!integration)throw fail('Acesso negado.',401)
 const {action,payload={}}=await readBody(req,24000)
 if(!actions.includes(action)||!integration.permissions.includes(action))throw fail('Ação não permitida.',403)
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||['tenant_id','tenant','unit','slug'].some(k=>Object.hasOwn(payload,k)))throw fail('Dados inválidos.')
 const key='agent:'+integration.id,bucket=new Date(Math.floor(Date.now()/60000)*60000)
 const count=(await pool.query('insert into request_limits(key,bucket,requests) values($1,$2,1) on conflict(key) do update set requests=case when request_limits.bucket=excluded.bucket then request_limits.requests+1 else 1 end,bucket=excluded.bucket returning requests',[key,bucket])).rows[0].requests
 if(count>integration.rate_limit_per_minute)throw fail('Limite da integração atingido.',429)
 const data=await transaction(null,async client=>{
  if(!(await client.query('select id from agent_integrations where id=$1 and active for share',[integration.id])).rows.length)throw fail('Credencial revogada.',401)
  const result=await agentAction(client,action,payload,integration)
  if(!['settings','capabilities','heartbeat','claim_notification','catalog','availability','pending_booking'].includes(action))await client.query("insert into audit_logs(integration_id,operation,entity_type,result) values($1,$2,'agent','success')",[integration.id,'agent:'+action])
  return result
 },{businessSlug:integration.slug})
 send(res,200,{data})
}

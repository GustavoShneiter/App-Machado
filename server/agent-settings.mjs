import { randomBytes,createHash } from 'node:crypto'
import { defaultConfig,validateConfig,cleanPhone,actions,fail } from '../shared/agent-config.mjs'

export async function settings(client,lock=false) {
 if(lock)await client.query('insert into agent_settings(config) values($1) on conflict(tenant_id) do nothing',[defaultConfig()])
 const row=(await client.query('select config,revision,updated_at from agent_settings'+(lock?' for update':''))).rows[0]
 return {config:row?.config??defaultConfig(),revision:row?.revision??1,updated_at:row?.updated_at??null}
}
export const effectiveSettings=row=>({...row.config,assistant_enabled:process.env.AGENT_ENABLED==='true'&&row.config.assistant_enabled,confirmations_enabled:process.env.AGENT_ENABLED==='true'&&row.config.confirmations_enabled,reminders_enabled:process.env.AGENT_ENABLED==='true'&&row.config.reminders_enabled,birthday_enabled:process.env.AGENT_ENABLED==='true'&&row.config.birthday_enabled,reactivation_enabled:process.env.AGENT_ENABLED==='true'&&row.config.reactivation_enabled,revision:row.revision,updated_at:row.updated_at})
export async function administrativeAgent(client,path,method,body,user) {
 const write=method==='POST';
 if(path==='settings') {
  const row=await settings(client,write)
  if(!write)return {...row.config,revision:row.revision,updated_at:row.updated_at}
  const {expected_revision,...input}=body
  if(expected_revision!==row.revision)throw fail('As configurações mudaram em outra sessão. Recarregue antes de salvar.',409)
  const config=validateConfig(input,row.config)
  await client.query("update agent_outbox set status='suppressed',last_error_code='expired' where status='pending' and expires_at<=now()")
  const result=(await client.query('update agent_settings set config=$1,revision=revision+1,updated_by=$2,updated_at=now() returning config,revision,updated_at',[config,user.id])).rows[0]
  // Only pending jobs may change scheduling. Claims and terminal records are immutable.
  await client.query(`update agent_outbox j set due_at=a.notification_cycle_at+make_interval(mins=>$1),available_at=a.notification_cycle_at+make_interval(mins=>$1)
   from appointments a where j.appointment_id=a.id and j.kind='confirmation' and j.status='pending'`,[config.confirmation_delay_minutes])
  await client.query(`update agent_outbox j set due_at=a.starts_at-make_interval(mins=>($1::jsonb->>(j.reminder_index-1))::integer),available_at=a.starts_at-make_interval(mins=>($1::jsonb->>(j.reminder_index-1))::integer),expires_at=a.starts_at-make_interval(mins=>($1::jsonb->>(j.reminder_index-1))::integer)+interval '1 hour'
   from appointments a where j.appointment_id=a.id and j.kind='reminder' and j.status='pending' and j.reminder_index<=jsonb_array_length($1::jsonb)`,[JSON.stringify(config.reminder_offsets_minutes)])
  await client.query(`update agent_outbox set status='suppressed',last_error_code='slot_removed' where status='pending' and kind='reminder' and reminder_index>$1`,[config.reminder_offsets_minutes.length])
  await client.query(`update agent_outbox set status='suppressed',last_error_code='expired' where status='pending' and (expires_at<=now() or (kind='confirmation' and due_at>=expires_at))`)
  await client.query(`update agent_outbox set due_at=((created_at at time zone 'America/Sao_Paulo')::date+make_time($1,0,0)) at time zone 'America/Sao_Paulo',available_at=((created_at at time zone 'America/Sao_Paulo')::date+make_time($1,0,0)) at time zone 'America/Sao_Paulo',expires_at=(((created_at at time zone 'America/Sao_Paulo')::date::timestamp+make_interval(hours=>$2))) at time zone 'America/Sao_Paulo' where kind='birthday' and status='pending'`,[config.birthday_send_hour,config.campaign_end_hour])
  return {...result.config,revision:result.revision,updated_at:result.updated_at}
 }
 if(path==='status') {
  const integrations=(await client.query('select id,name,active,created_at from agent_integrations order by created_at desc')).rows
  const runtime=(await client.query("select s.*,received_at<now()-interval '3 minutes' stale from agent_runtime_status s join agent_integrations i on i.id=s.integration_id where i.active order by received_at desc limit 1")).rows[0]??null
  return {global_enabled:process.env.AGENT_ENABLED==='true',integrations,runtime,owner:user.role==='owner'}
 }
 if(path==='activity') {
  const page=Math.max(0,Math.min(100000,Number(body.page)||0))
  const state=body.status||null;if(state&&!['pending','sending','sent','delivered','read','failed','uncertain','suppressed'].includes(state))throw fail('Filtro inválido.')
  return {items:(await client.query(`select j.id,j.kind,j.status,j.created_at,j.due_at,j.sent_at,j.last_error_code,j.attempts,c.name customer_name from agent_outbox j join customers c on c.id=j.customer_id where ($1::text is null or j.status=$1) order by j.created_at desc,j.id desc limit 30 offset $2`,[state,page*30])).rows,page}
 }
 if(path==='contact-consent') {
  const phone=cleanPhone(body.phone)
  if(!write)return (await client.query('select marketing_opt_in,opted_out,consent_note,updated_at from agent_contacts where phone=$1',[phone])).rows[0]??{marketing_opt_in:false,opted_out:false,consent_note:''}
  if(typeof body.marketing_opt_in!=='boolean'||(body.marketing_opt_in&&String(body.evidence||'').trim().length<10))throw fail('Registre como o cliente autorizou as campanhas (pelo menos 10 caracteres).')
  if(!(await client.query('select id from customers where phone=$1',[phone])).rows.length)throw fail('Cliente não encontrado.',404)
  await client.query(`insert into agent_contacts(phone,marketing_opt_in,opted_out,consent_note,updated_by) values($1,$2,not $2,$3,$4) on conflict(tenant_id,phone) do update set marketing_opt_in=$2,opted_out=not $2,consent_note=$3,updated_by=$4,updated_at=now()`,[phone,body.marketing_opt_in,String(body.evidence||'').trim().slice(0,500),user.id]);return {saved:true}
 }
 if(path.startsWith('credentials/')) {
  if(user.role!=='owner')throw fail('Somente o proprietário gerencia a conexão.',403)
  await client.query("update agent_integrations set active=false where name='WhatsApp Machado'")
  if(path==='credentials/revoke')return {revoked:true}
  const token=randomBytes(48).toString('base64url'),hash=createHash('sha256').update(token).digest('hex')
  await client.query(`insert into agent_integrations(name,token_hash,permissions) values('WhatsApp Machado',$1,$2) on conflict(tenant_id,name) do update set token_hash=$1,permissions=$2,active=true,created_at=now()`,[hash,actions])
  return {token}
 }
 throw fail('Página não encontrada.',404)
}

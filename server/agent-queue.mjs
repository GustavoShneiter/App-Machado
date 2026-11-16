import { randomUUID } from 'node:crypto'
import { renderMessage,fail } from '../shared/agent-config.mjs'

export async function enqueueReminders(client,cfg) {
 if(!cfg.reminders_enabled)return {queued:0}
 let queued=0
 for(const [index,offset] of cfg.reminder_offsets_minutes.entries()) {
  const r=await client.query(`insert into agent_outbox(kind,event_key,customer_id,appointment_id,appointment_revision,reminder_index,due_at,available_at,expires_at)
   select 'reminder','reminder:'||a.id||':'||a.appointment_notification_revision||':'||$1::integer,a.customer_id,a.id,a.appointment_notification_revision,$1::integer,a.starts_at-make_interval(mins=>$2),a.starts_at-make_interval(mins=>$2),a.starts_at-make_interval(mins=>$2)+interval '1 hour'
   from appointments a where a.status not in('cancelled','no_show','completed') and a.starts_at>now() and a.notification_cycle_at<=a.starts_at-make_interval(mins=>$2)
   and a.starts_at-make_interval(mins=>$2)<=now() and a.starts_at-make_interval(mins=>$2)+interval '1 hour'>now()
   on conflict(tenant_id,event_key) do nothing returning id`,[index+1,offset]);queued+=r.rowCount
 }
 return {queued}
}
export async function enqueueCampaigns(client,cfg) {
 let queued=0
 if(cfg.birthday_enabled) {
  const r=await client.query(`insert into agent_outbox(kind,event_key,customer_id,due_at,available_at,expires_at)
   select 'birthday','birthday:'||c.id||':'||extract(year from now() at time zone 'America/Sao_Paulo'),c.id,
    ((current_timestamp at time zone 'America/Sao_Paulo')::date+make_interval(hours=>$1)) at time zone 'America/Sao_Paulo',
    ((current_timestamp at time zone 'America/Sao_Paulo')::date+make_interval(hours=>$1)) at time zone 'America/Sao_Paulo',
    ((current_timestamp at time zone 'America/Sao_Paulo')::date+make_interval(hours=>$2)) at time zone 'America/Sao_Paulo'
   from customers c join agent_contacts ac on ac.phone=c.phone and ac.tenant_id=c.tenant_id where ac.marketing_opt_in and not ac.opted_out and to_char(c.birth_date,'MM-DD')=to_char(now() at time zone 'America/Sao_Paulo','MM-DD')
   on conflict(tenant_id,event_key) do nothing returning id`,[cfg.birthday_send_hour,cfg.campaign_end_hour]);queued+=r.rowCount
 }
 if(cfg.reactivation_enabled) {
  const r=await client.query(`insert into agent_outbox(kind,event_key,customer_id,due_at,available_at,expires_at)
   select 'reactivation','return:'||c.id||':'||v.id,c.id,now(),now(),((now() at time zone 'America/Sao_Paulo')::date+make_interval(hours=>$2)) at time zone 'America/Sao_Paulo'
   from customers c join agent_contacts ac on ac.phone=c.phone and ac.tenant_id=c.tenant_id
   cross join lateral(select id,starts_at from appointments where customer_id=c.id and status='completed' order by starts_at desc limit 1) v
   where ac.marketing_opt_in and not ac.opted_out and v.starts_at<=now()-make_interval(days=>$1)
   and not exists(select 1 from appointments where customer_id=c.id and starts_at>now() and status not in('cancelled','no_show'))
   and extract(hour from now() at time zone 'America/Sao_Paulo')<$2
   on conflict(tenant_id,event_key) do nothing returning id`,[cfg.reactivation_days,cfg.campaign_end_hour]);queued+=r.rowCount
 }
 return {queued}
}
export async function claimNotification(client,cfg,integration) {
 await client.query("update agent_outbox set status='uncertain',last_error_code='claim_expired' where status='sending' and claimed_at<now()-interval '10 minutes'")
 await client.query("update agent_outbox set status='suppressed',last_error_code='expired' where status='pending' and expires_at<=now()")
 const row=(await client.query(`select * from agent_outbox where status='pending' and available_at<=now()
  and ((kind='confirmation' and $1) or (kind='reminder' and $2) or (kind='birthday' and $3) or (kind='reactivation' and $4))
  and (kind in('confirmation','reminder') or (extract(hour from now() at time zone 'America/Sao_Paulo') >= $5 and extract(hour from now() at time zone 'America/Sao_Paulo')<$6))
  order by (kind='confirmation') desc,available_at,id for update skip locked limit 1`,[cfg.confirmations_enabled,cfg.reminders_enabled,cfg.birthday_enabled,cfg.reactivation_enabled,cfg.campaign_start_hour,cfg.campaign_end_hour])).rows[0]
 if(!row)return null
 const customer=(await client.query('select id,name,phone,birth_date from customers where id=$1',[row.customer_id])).rows[0]
 const a=row.appointment_id?(await client.query(`select a.id,a.starts_at,a.notification_cycle_at,a.status,a.appointment_notification_revision revision,s.name service_name,p.name professional_name from appointments a join services s on s.id=a.service_id join professionals p on p.id=a.professional_id where a.id=$1`,[row.appointment_id])).rows[0]:null
 let suppress=!customer||!/^[1-9]\d{9,10}$/.test(customer.phone)
 if(row.kind==='confirmation'||row.kind==='reminder') {
  suppress ||= !a||a.revision!==row.appointment_revision||['completed','cancelled','no_show'].includes(a.status)||new Date(a.starts_at)<=new Date()
  if(row.kind==='reminder'&&a) {
   const offset=cfg.reminder_offsets_minutes[row.reminder_index-1]
   suppress ||= !offset||new Date(a.notification_cycle_at)>new Date(new Date(a.starts_at).getTime()-offset*60000)
  }
 } else {
  const pref=(await client.query('select * from agent_contacts where phone=$1',[customer?.phone||''])).rows[0]
  suppress ||= !pref?.marketing_opt_in||pref.opted_out
  if(row.kind==='birthday')suppress ||= !(await client.query("select 1 from customers where id=$1 and to_char(birth_date,'MM-DD')=to_char(now() at time zone 'America/Sao_Paulo','MM-DD')",[row.customer_id])).rows.length
  if(row.kind==='reactivation') {
   const last=(await client.query("select id,starts_at<=now()-make_interval(days=>$2) eligible from appointments where customer_id=$1 and status='completed' order by starts_at desc limit 1",[row.customer_id,cfg.reactivation_days])).rows[0]
   suppress ||= !last?.eligible||row.event_key!==`return:${row.customer_id}:${last.id}`||(await client.query("select 1 from appointments where customer_id=$1 and starts_at>now() and status not in('cancelled','no_show') limit 1",[row.customer_id])).rows.length>0
  }
 }
 if(suppress){await client.query("update agent_outbox set status='suppressed',last_error_code='ineligible' where id=$1",[row.id]);return {suppressed:true}}
 const key=row.kind==='reminder'?`reminder_${row.reminder_index}`:row.kind
 const template=cfg.message_templates[key],business=(await client.query('select name from business_settings where id=true')).rows[0]
 const date=a?new Date(a.starts_at):null
 const offset=cfg.reminder_offsets_minutes[row.reminder_index-1]
 const text=renderMessage(key,template.text,{cliente:customer.name,barbearia:business?.name||'Machado',servico:a?.service_name,profissional:a?.professional_name,data:date?.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}),hora:date?.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}),antecedencia:offset%60===0?`${offset/60} horas`:`${offset} minutos`})
 const claim=randomUUID()
 await client.query("update agent_outbox set status='sending',claim_token=$2,integration_id=$3,claimed_at=now(),attempts=attempts+1,message_text=$4,settings_revision=$5,template_revision=$6 where id=$1",[row.id,claim,integration.id,text,cfg.revision,template.revision])
 return {id:row.id,claim_token:claim,kind:row.kind,event_key:row.event_key,reminder_index:row.reminder_index,customer:{name:customer.name,phone:customer.phone},appointment:a?{id:a.id,starts_at:a.starts_at,service_name:a.service_name,professional_name:a.professional_name,status:a.status,revision:a.revision}:null,message_text:text,settings_revision:cfg.revision,template_revision:template.revision}
}
export async function reconcileDelivery(client,integration,providerId) {
 const events=(await client.query('select status,occurred_at from agent_delivery_events where integration_id=$1 and provider_message_id=$2 order by occurred_at',[integration.id,providerId])).rows
 for(const e of events)await client.query(`update agent_outbox set status=case when status='read' then status when $3='read' then 'read' when status='delivered' then status when $3='delivered' then 'delivered' when status='sent' then 'failed' else status end,
 delivered_at=case when $3='delivered' then coalesce(delivered_at,$4) else delivered_at end,read_at=case when $3='read' then coalesce(read_at,$4) else read_at end where integration_id=$1 and provider_message_id=$2 and status in('sent','delivered','read','uncertain')`,[integration.id,providerId,e.status,e.occurred_at])
}
export async function acknowledge(client,p,integration) {
 if(!['sent','failed','uncertain'].includes(p.status)||p.status==='sent'&&(!p.provider_message_id||String(p.provider_message_id).length>255))throw fail('Confirmação de envio inválida.')
 const row=(await client.query('select * from agent_outbox where id=$1 and claim_token=$2 and integration_id=$3 for update',[p.id,p.claim_token,integration.id])).rows[0]
 if(!row)return {acknowledged:false}
 if(row.status!=='sending')return {acknowledged:row.status===p.status&&row.provider_message_id===(p.provider_message_id||null)||p.status==='sent'&&['delivered','read'].includes(row.status)&&row.provider_message_id===p.provider_message_id}
 await client.query(`update agent_outbox set status=$2,provider_message_id=$3,last_error_code=$4,last_error=$5,sent_at=case when $2='sent' then now() end where id=$1`,[row.id,p.status,p.provider_message_id||null,String(p.error_code||'').replace(/[^a-z0-9_-]/ig,'').slice(0,80)||null,p.last_error?'Falha informada pelo provedor. Consulte o agente responsável.':null])
 if(p.provider_message_id)await reconcileDelivery(client,integration,p.provider_message_id)
 return {acknowledged:true}
}

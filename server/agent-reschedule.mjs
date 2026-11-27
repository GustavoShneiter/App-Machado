import {cleanPhone,fail} from '../shared/agent-config.mjs'

const uuid=value=>{if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw fail('Identificador inválido.');return value}
const instant=value=>{if(typeof value!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw fail('Data e horário inválidos.');return new Date(value).toISOString()}
const day=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw fail('Dia inválido.');return value}
const preferredTime=value=>{if(value==null)return null;if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw fail('Horário de preferência inválido.');return value}
const phoneVariants=phone=>[phone,'55'+phone]

async function appointmentForPhone(client,id,phone,lock=false){
 return (await client.query(`select a.id,a.customer_id,a.professional_id,a.service_id,a.starts_at,a.ends_at,a.status
  from appointments a join customers c on c.id=a.customer_id
  where a.id=$1 and regexp_replace(c.phone,'[^0-9]','','g')=any($2::text[])
  ${lock?'for update of a':''}`,[id,phoneVariants(phone)])).rows[0]
}
function movable(a){
 if(!a)throw fail('Agendamento não encontrado para este WhatsApp.',404)
 if(!['scheduled','confirmed'].includes(a.status)||new Date(a.starts_at)<=new Date())throw fail('Este agendamento não pode ser remarcado.',409)
}
async function freeSlots(client,a,bookingDay,time){
 const duration=new Date(a.ends_at).getTime()-new Date(a.starts_at).getTime()
 if(!Number.isFinite(duration)||duration<=0)throw fail('Duração do agendamento inválida.',409)
 const rows=(await client.query(`with candidates as (
   select g.local_start::time slot_time,(g.local_start at time zone 'America/Sao_Paulo') starts_at
   from business_hours h cross join business_settings b
   cross join lateral generate_series(($1::date+h.opens_at)::timestamp,
    ($1::date+h.closes_at)::timestamp-($2::timestamptz-$3::timestamptz),
    make_interval(mins=>b.slot_interval_minutes)) g(local_start)
   where h.weekday=extract(isodow from $1::date) and b.id=true
  ) select c.slot_time::text,c.starts_at
  from candidates c
  where c.starts_at>now()+interval '5 minutes'
   and not schedule_is_blocked($4::uuid,c.starts_at,c.starts_at+($2::timestamptz-$3::timestamptz))
   and not exists(select 1 from appointments other where other.professional_id=$4 and other.id<>$5
    and other.status not in('cancelled','no_show') and other.starts_at<c.starts_at+($2::timestamptz-$3::timestamptz)
    and other.ends_at>c.starts_at)
  order by case when $6::time is null then 0 else abs(extract(epoch from (c.slot_time-$6::time))) end,c.slot_time
  limit 6`,[bookingDay,a.ends_at,a.starts_at,a.professional_id,a.id,time])).rows
 return {rows,duration}
}

export async function rescheduleOptions(client,p){
 const phone=cleanPhone(p.phone),id=uuid(p.appointment_id),bookingDay=day(p.day),time=preferredTime(p.preferred_time)
 const a=await appointmentForPhone(client,id,phone)
 movable(a)
 const {rows}=await freeSlots(client,a,bookingDay,time)
 return {appointment_id:a.id,current_starts_at:a.starts_at,professional_id:a.professional_id,service_id:a.service_id,
  requested_day:bookingDay,preferred_time:time,exact_available:time===null?null:rows.some(s=>s.slot_time.slice(0,5)===time),slots:rows}
}

export async function rescheduleAppointment(client,p){
 const phone=cleanPhone(p.phone),id=uuid(p.appointment_id),expected=instant(p.expected_starts_at),next=instant(p.new_starts_at)
 const message=typeof p.source_message_id==='string'?p.source_message_id.trim():''
 if(!message||message.length>255)throw fail('Informe a mensagem que confirmou a troca.')
 if(next===expected)throw fail('Escolha um horário diferente do atual.',409)
 // A confirmed message is a durable idempotency key. Never replay an old change.
 await client.query('select pg_advisory_xact_lock(hashtextextended(current_business_id()::text||$1,43))',[message])
 const old=(await client.query('select * from agent_reschedule_requests where source_message_id=$1',[message])).rows[0]
 if(old){
  if(old.appointment_id!==id||old.phone!==phone||new Date(old.expected_starts_at).toISOString()!==expected||new Date(old.new_starts_at).toISOString()!==next)throw fail('Mensagem já usada para outra remarcação.',409)
  return {appointment_id:id,previous_starts_at:old.expected_starts_at,starts_at:old.new_starts_at,rescheduled:true,already_applied:true}
 }
 // Match the lock order used by schedule blocks and appointment inserts.
 const initial=await appointmentForPhone(client,id,phone)
 movable(initial)
 await client.query('select pg_advisory_xact_lock(hashtextextended($1::text,0))',[initial.professional_id])
 const a=await appointmentForPhone(client,id,phone,true)
 movable(a)
 if(a.professional_id!==initial.professional_id||new Date(a.starts_at).toISOString()!==expected)throw fail('O agendamento mudou. Consulte o horário atual antes de confirmar.',409)
 const end=new Date(new Date(next).getTime()+new Date(a.ends_at).getTime()-new Date(a.starts_at).getTime())
 if(!Number.isFinite(end.getTime())||new Date(next)<=new Date(Date.now()+5*60_000))throw fail('Escolha um horário futuro disponível.',409)
 const valid=(await client.query(`select exists(
   select 1 from professionals p where p.id=$1 and p.active
  ) and business_slot_aligned($2::timestamptz) and exists(
   select 1 from business_hours h where h.weekday=extract(isodow from $2::timestamptz at time zone 'America/Sao_Paulo')
    and ($2::timestamptz at time zone 'America/Sao_Paulo')::time>=h.opens_at
    and ($3::timestamptz at time zone 'America/Sao_Paulo')::date=($2::timestamptz at time zone 'America/Sao_Paulo')::date
    and ($3::timestamptz at time zone 'America/Sao_Paulo')::time<=h.closes_at
  ) and not schedule_is_blocked($1::uuid,$2::timestamptz,$3::timestamptz)
  and not exists(select 1 from appointments other where other.professional_id=$1 and other.id<>$4
   and other.status not in('cancelled','no_show') and other.starts_at<$3 and other.ends_at>$2) as available`,[a.professional_id,next,end.toISOString(),id])).rows[0]?.available
 if(!valid)throw fail('Esse horário não está disponível para o mesmo profissional.',409)
 try{
  await client.query('update appointments set starts_at=$2,ends_at=$3 where id=$1',[id,next,end.toISOString()])
 }catch(e){if(e.code==='23P01'||e.code==='23505')throw fail('Esse horário acabou de ser reservado. Escolha outro.',409);throw e}
 await client.query('insert into agent_reschedule_requests(source_message_id,appointment_id,phone,expected_starts_at,new_starts_at) values($1,$2,$3,$4,$5)',[message,id,phone,expected,next])
 return {appointment_id:id,previous_starts_at:expected,starts_at:next,ends_at:end.toISOString(),rescheduled:true,already_applied:false}
}

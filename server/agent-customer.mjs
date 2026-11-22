import {cleanPhone} from '../shared/agent-config.mjs'

// The bridge supplies the verified sender phone, never a number extracted from free text.
// Unit RLS is established from the integration token by externalAgent before this query.
export async function customerContext(client,payload) {
 const phone=cleanPhone(payload.phone)
 const business=(await client.query('select name from business_settings where id=true')).rows[0]??{name:null}
 const rows=(await client.query(`select id,name,phone,to_char(birth_date,'YYYY-MM-DD') birth_date,notes from customers
  where regexp_replace(phone,'[^0-9]','','g')=any($1::text[]) order by id limit 2`,[[phone,'55'+phone]])).rows
 // Two differently formatted registrations of one number require human resolution, not arbitrary identity selection.
 if(rows.length!==1)return {business,found:false,ambiguous:rows.length>1,customer:null,upcoming_appointments:[]}
 const customer=rows[0]
 const upcoming=(await client.query(`select a.id,coalesce(nullif(a.attendee_name,''),c.name) customer_name,
  coalesce((select string_agg(i.description,' + ' order by i.id) from commands cmd join command_items i on i.command_id=cmd.id where cmd.appointment_id=a.id and i.type='service'),s.name) service_name,p.name professional_name,a.starts_at,a.status
  from appointments a join customers c on c.id=a.customer_id join services s on s.id=a.service_id join professionals p on p.id=a.professional_id
  where a.customer_id=$1 and a.starts_at>=now() and a.status in ('scheduled','confirmed','arrived','in_service') order by a.starts_at,a.id limit 5`,[customer.id])).rows
 return {business,found:true,ambiguous:false,customer,upcoming_appointments:upcoming}
}

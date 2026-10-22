import { randomBytes, randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'

const fail=(message,status=400)=>Object.assign(new Error(message),{status})
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export const professionalLink=id=>`/profissional/p/${id}/agenda`

// Called in the same transaction that saves the professional. Password is returned once, never stored as plain text.
export async function ensureProfessionalAccess(client,id,{reset=false}={}) {
  if(!uuid(id))throw fail('Profissional inválido.')
  const pro=(await client.query('select p.*,r.role from professionals p left join profiles r on r.id=p.profile_id where p.id=$1 for update of p',[id])).rows[0]
  if(!pro)throw fail('Profissional não encontrado.',404)
  if(pro.profile_id&&['owner','admin'].includes(pro.role))return {id:pro.id,administrative:true,link:professionalLink(pro.id)}
  let userId=pro.profile_id
  if(userId) {
    const account=(await client.query('select u.email from auth_user u join auth_account a on a."userId"=u.id and a."providerId"=\'credential\' where u.id=$1',[userId])).rows[0]
    if(account&&!reset)return null
  }
  userId??=randomUUID()
  const slug=pro.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'').slice(0,36)||'profissional'
  const email=(await client.query('select email from auth_user where id=$1',[userId])).rows[0]?.email||`${slug}.${id.slice(0,8)}@profissionais.machado.invalid`
  const password=`Mp!${randomBytes(18).toString('base64url')}`
  const passwordHash=await hashPassword(password)
  await client.query('insert into auth.users(id,email) values($1,$2) on conflict(id) do nothing',[userId,email])
  await client.query("insert into profiles(id,name,role,active) values($1,$2,'professional',true) on conflict(id) do update set name=excluded.name",[userId,pro.name])
  await client.query('insert into auth_user(id,name,email,"emailVerified","createdAt","updatedAt") values($1,$2,$3,true,now(),now()) on conflict(id) do update set name=excluded.name,"updatedAt"=now()',[userId,pro.name,email])
  await client.query('delete from auth_session where "userId"=$1',[userId])
  const updated=await client.query('update auth_account set password=$2,"updatedAt"=now() where "userId"=$1 and "providerId"=\'credential\' returning id',[userId,passwordHash])
  if(!updated.rowCount)await client.query('insert into auth_account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),userId,passwordHash])
  await client.query('update professionals set profile_id=$2 where id=$1',[id,userId])
  return {id:pro.id,name:pro.name,email,password,link:professionalLink(pro.id),reset}
}

export async function professionalDirectory(client) {
  return (await client.query('select p.id,p.name,p.active,p.photo_url,u.email,r.role,coalesce(r.active,false) account_active from professionals p left join profiles r on r.id=p.profile_id left join auth_user u on u.id=p.profile_id::text order by p.name')).rows.map(row=>({...row,link:professionalLink(row.id)}))
}

export async function professionalFor(client,session,requestedId) {
  if(!session)throw fail('Entre com seu acesso profissional.',401)
  const administrative=['owner','admin'].includes(session.profile.role)
  if(requestedId&&!uuid(requestedId))throw fail('Link de profissional inválido.',400)
  const rows=administrative
    ?(await client.query('select id,name,active,photo_url from professionals where active order by name')).rows
    :(await client.query('select id,name,active,photo_url from professionals where profile_id=$1 and active',[session.user.id])).rows
  if(!rows.length)throw fail('Seu acesso profissional está inativo ou não foi vinculado. Fale com a administração.',403)
  const profile=requestedId?rows.find(row=>row.id===requestedId):rows[0]
  if(!profile)throw fail('Este acesso pertence a outro profissional. Abra seu próprio link.',403)
  await client.query('select require_schedule_access($1)',[profile.id])
  return {profile,administrative,choices:administrative?rows:[]}
}

export async function professionalCatalog(client,id) {
  return {
    services:(await client.query('select s.* from services s join professional_services ps on ps.service_id=s.id where ps.professional_id=$1 and s.active order by s.name',[id])).rows,
    professionals:(await client.query('select id,name,phone,specialties,photo_url,active from professionals where id=$1',[id])).rows,
    links:[],business:null,
  }
}
export async function professionalSnapshot(client,id) {
  return {
    appointments:(await client.query('select a.id,a.customer_id,a.professional_id,a.service_id,a.starts_at,a.ends_at,a.expected_price_cents,a.status,a.source,a.is_fit_in,c.name customer_name,c.phone customer_phone,p.name professional_name,s.name service_name from appointments a join customers c on c.id=a.customer_id join professionals p on p.id=a.professional_id join services s on s.id=a.service_id where a.professional_id=$1 order by a.starts_at',[id])).rows,
    blocks:(await client.query('select id,professional_id,starts_at,ends_at,reason,created_at from schedule_blocks where professional_id=$1 order by starts_at',[id])).rows,
    recurringBlocks:(await client.query('select id,professional_id,starts_on,until_on,weekdays,start_time,end_time,reason from recurring_schedule_blocks where professional_id=$1 order by starts_on',[id])).rows,
    customers:[],commands:[],items:[],payments:[],commissions:[],sessions:[],movements:[],products:[],packages:[],packageSales:[],packageRedemptions:[],business:[],
  }
}

const cards=['earned','pending','paid','services','customers']
export async function professionalPreferences(client,id,payload) {
  const amount=Number(payload.weekly_commission_goal_cents),services=Number(payload.weekly_service_goal),customers=Number(payload.weekly_customer_goal)
  if(!Number.isInteger(amount)||amount<0||amount>100000000||!Number.isInteger(services)||services<0||services>10000||!Number.isInteger(customers)||customers<0||customers>10000||!Array.isArray(payload.visible_cards)||payload.visible_cards.length>cards.length||!payload.visible_cards.length||payload.visible_cards.some(value=>!cards.includes(value))||new Set(payload.visible_cards).size!==payload.visible_cards.length)throw fail('Confira as metas e escolha pelo menos um indicador.')
  return (await client.query('insert into professional_preferences(professional_id,weekly_commission_goal_cents,weekly_service_goal,weekly_customer_goal,visible_cards) values($1,$2,$3,$4,$5) on conflict(professional_id) do update set weekly_commission_goal_cents=$2,weekly_service_goal=$3,weekly_customer_goal=$4,visible_cards=$5,updated_at=now() returning *',[id,amount,services,customers,payload.visible_cards])).rows[0]
}
export async function professionalCash(client,id,from,to) {
  const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value
  if(!validDate(from)||!validDate(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>366)throw fail('Selecione um período válido de até um ano.')
  const start=from+'T00:00:00-03:00',end=to+'T23:59:59.999999-03:00'
  // Only the professional's commission leaves this endpoint. No gross, shop share, payments or cash sessions.
  const entries=(await client.query(`select e.id,e.commission_cents,e.status,e.created_at,e.paid_at,i.description,i.type,i.quantity,cus.name customer_name,
    coalesce(a.starts_at,c.closed_at,c.created_at) occurred_at
    from commission_entries e join command_items i on i.id=e.command_item_id join commands c on c.id=i.command_id
    left join appointments a on a.id=c.appointment_id left join customers cus on cus.id=c.customer_id
    where e.professional_id=$1 and i.professional_id=$1 and e.status in ('pending','paid') and c.status in ('awaiting_payment','closed')
    and coalesce(a.starts_at,c.closed_at,c.created_at)>=$2::timestamptz and coalesce(a.starts_at,c.closed_at,c.created_at)<=$3::timestamptz
    order by occurred_at desc,e.id`,[id,start,end])).rows
  const summary=(await client.query(`select coalesce(sum(i.quantity) filter(where i.type='service'),0)::int services,count(distinct c.customer_id)::int customers
    from command_items i join commands c on c.id=i.command_id left join appointments a on a.id=c.appointment_id
    where i.professional_id=$1 and c.status in ('awaiting_payment','closed') and coalesce(a.starts_at,c.closed_at,c.created_at)>=$2::timestamptz and coalesce(a.starts_at,c.closed_at,c.created_at)<=$3::timestamptz`,[id,start,end])).rows[0]
  const pending=(await client.query("select coalesce(sum(e.commission_cents),0)::bigint amount from commission_entries e join command_items i on i.id=e.command_item_id join commands c on c.id=i.command_id where e.professional_id=$1 and i.professional_id=$1 and e.status='pending' and c.status in ('awaiting_payment','closed')",[id])).rows[0]
  const preferences=(await client.query('select * from professional_preferences where professional_id=$1',[id])).rows[0]||{weekly_commission_goal_cents:0,weekly_service_goal:0,weekly_customer_goal:0,visible_cards:cards}
  const value=status=>entries.filter(entry=>entry.status===status).reduce((sum,entry)=>sum+entry.commission_cents,0)
  return {from,to,earned:entries.reduce((sum,entry)=>sum+entry.commission_cents,0),pending:value('pending'),paid:value('paid'),totalPending:Number(pending.amount),...summary,preferences,entries}
}

const allowedActions=new Set(['create_appointment','set_status','set_price','cancel_appointment','create_schedule_block','delete_schedule_block','create_recurring_block','delete_recurring_block'])
export async function professionalAction(client,id,action,payload) {
  if(!allowedActions.has(action)||!payload||typeof payload!=='object'||Array.isArray(payload))throw fail('Operação não disponível para profissionais.',403)
  if(payload.professional_id&&payload.professional_id!==id)throw fail('Você só pode alterar a sua própria agenda.',403)
  const flat=action==='create_recurring_block'?payload.payload:payload
  if(!flat||typeof flat!=='object'||Array.isArray(flat)||(flat.professional_id&&flat.professional_id!==id))throw fail('Você só pode alterar a sua própria agenda.',403)
  return (await client.query('select professional_schedule_action($1,$2) value',[action,{...flat,professional_id:id}])).rows[0].value
}

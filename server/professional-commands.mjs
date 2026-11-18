// Called only inside the authenticated professional transaction (unit RLS stays active).
const fail=(message,status=400)=>Object.assign(new Error(message),{status})
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export const commandActions=new Set(['add_command_service','edit_command_service','receive','close_package_command'])

const ownCommands=`select c.* from commands c join appointments a on a.id=c.appointment_id
 where a.professional_id=$1 and not exists(select 1 from command_items i where i.command_id=c.id and i.professional_id is distinct from $1::uuid)`
export async function professionalCommands(client,id) {
 const commands=(await client.query(ownCommands+' order by c.created_at desc',[id])).rows
 const ids=commands.map(c=>c.id)
 return {
  commands,
  items:(await client.query('select id,command_id,type,service_id,product_id,professional_id,description,unit_price_cents,quantity from command_items where command_id=any($1::uuid[]) and professional_id=$2',[ids,id])).rows,
  payments:(await client.query('select id,command_id,method,amount_cents,paid_at,reversed_at from payments where command_id=any($1::uuid[])',[ids])).rows,
  packageRedemptions:(await client.query("select r.id,r.command_item_id,r.redeemed_at,p.name package_name from package_redemptions r join command_items i on i.id=r.command_item_id join package_sales ps on ps.id=r.sale_id join service_packages p on p.id=ps.package_id where i.command_id=any($1::uuid[]) and i.professional_id=$2",[ids,id])).rows,
 }
}
export async function professionalCommandAction(client,id,action,payload) {
 if(!commandActions.has(action))throw fail('Operação não disponível para profissionais.',403)
 await client.query('select require_schedule_access($1)',[id])
 const commandId=action==='receive'||action==='close_package_command'?payload.id:payload.command_id
 if(!uuid(commandId))throw fail('Atendimento inválido.')
 // Same lock order as office_action: active drawer, then command. Concurrent receipts serialize.
 const receiving=action==='receive',method=payload.method??'pix'
 if(receiving&&!['cash','pix','debit','credit','other'].includes(method))throw fail('Forma de pagamento inválida.')
 const session=receiving?(await client.query('select id from cash_sessions where closed_at is null order by opened_at desc limit 1 for update')).rows[0]:null
 const command=(await client.query(ownCommands+' and c.id=$2 for update of c',[id,commandId])).rows[0]
 if(!command)throw fail('Este atendimento não está disponível no seu acesso. Procure a gestão.',403)
 if(['receive','close_package_command'].includes(action)&&command.status==='closed')return {id:command.id,already_received:true}
 if(command.status!=='awaiting_payment')throw fail(command.status==='open'?'Conclua o atendimento na Agenda antes de alterar os serviços ou receber.':'Este atendimento já foi encerrado. Procure a gestão.')
 if((await client.query('select 1 from payments where command_id=$1 and reversed_at is null',[commandId])).rowCount)throw fail('Este atendimento já possui pagamento. Atualize os dados ou procure a gestão.',409)
 if(receiving||action==='close_package_command') {
  const total=Number((await client.query('select coalesce(sum(unit_price_cents*quantity),0)-$2::integer+$3::integer amount from command_items where command_id=$1',[commandId,command.discount_cents,command.surcharge_cents])).rows[0].amount)
  if(action==='close_package_command') {
   const covered=(await client.query('select 1 from package_redemptions r join command_items i on i.id=r.command_item_id where i.command_id=$1',[commandId])).rowCount
   if(total!==0||!covered)throw fail('Este atendimento não está integralmente coberto pelo plano.')
  }else{
   if(!session)throw fail('Peça à gestão para abrir o caixa antes de receber.')
   if(!Number.isSafeInteger(payload.expected_total)||payload.expected_total!==total)throw fail('O total do atendimento mudou. Atualize os dados antes de confirmar o pagamento.',409)
   if(total<=0)throw fail('Defina o valor dos serviços antes de receber.')
   await client.query('insert into payments(command_id,method,amount_cents,recorded_by) values($1,$2,$3,auth.uid())',[commandId,method,total])
   await client.query("insert into cash_movements(session_id,type,amount_cents,payment_method,notes,created_by,command_id) values($1,'sale',$2,$3,'Recebimento de comanda',auth.uid(),$4)",[session.id,total,method,commandId])
  }
  await client.query("update commands set status='closed',closed_at=now() where id=$1",[commandId])
  return {id:commandId}
 }
 if(!uuid(payload.service_id))throw fail('Escolha um serviço válido.')
 const service=(await client.query('select s.id,s.name,s.price_cents from services s join professional_services ps on ps.service_id=s.id where s.id=$1 and ps.professional_id=$2 and s.active',[payload.service_id,id])).rows[0]
 if(!service)throw fail('Este serviço não está disponível para você.',403)
 const amount=action==='edit_command_service'?payload.amount:service.price_cents
 if(!Number.isSafeInteger(amount)||amount<0||amount>100000000)throw fail('Informe um valor válido para o serviço.')
 const rule=(await client.query("select rate,round($3::numeric*rate/100)::integer commission from (select item_commission_rate('service',$1,$2) rate) r",[id,service.id,amount])).rows[0]
 const rate=Number(rule.rate),commission=rule.commission
 let itemId
 if(action==='edit_command_service') {
  if(!uuid(payload.item_id))throw fail('Serviço inválido.')
  const item=(await client.query("select id from command_items where id=$1 and command_id=$2 and professional_id=$3 and type='service' and quantity=1 for update",[payload.item_id,commandId,id])).rows[0]
  if(!item)throw fail('Serviço não encontrado neste atendimento.',403)
  const entries=(await client.query('select status from commission_entries where command_item_id=$1 for update',[item.id])).rows
  if(entries.some(entry=>entry.status!=='pending')||(await client.query('select 1 from package_redemptions where command_item_id=$1',[item.id])).rowCount)throw fail('Este serviço já tem repasse ou sessão de plano. Procure a gestão.')
  await client.query("update command_items set service_id=$2,description=$3,unit_price_cents=$4,commission_kind='percent',commission_value=$5,commission_cents=$6 where id=$1",[item.id,service.id,service.name,amount,rate,commission])
  if(!commission)await client.query("delete from commission_entries where command_item_id=$1 and status='pending'",[item.id])
  itemId=item.id
 }else{
  itemId=(await client.query("insert into command_items(command_id,type,service_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents) values($1,'service',$2,$3,$4,$5,1,'percent',$6,$7) returning id",[commandId,service.id,id,service.name,amount,rate,commission])).rows[0].id
 }
 if(commission>0)await client.query("insert into commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status) values($1,$2,$3,$4,jsonb_build_object('rate_percent',$5::numeric,'barbershop_cents',$6::integer),'pending') on conflict(command_item_id) do update set gross_cents=excluded.gross_cents,commission_cents=excluded.commission_cents,rule_snapshot=excluded.rule_snapshot",[itemId,id,amount,commission,rate,amount-commission])
 return {id:itemId}
}

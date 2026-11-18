// Called only inside the authenticated professional transaction (unit RLS stays active).
const fail=(message,status=400)=>Object.assign(new Error(message),{status})
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export const commandActions=new Set(['add_command_service','edit_command_service','add_command_product','set_command_adjustments','remove_command_item','delete_command','receive','close_package_command'])

async function addProduct(client, professionalId, command, payload) {
 const commandId=command.id
 const quantity=payload.quantity
 if(!uuid(payload.product_id)||!Number.isSafeInteger(quantity)||quantity<1)throw fail('Escolha um produto e informe uma quantidade válida.')
 const product=(await client.query('select id,name,sale_price_cents,quantity from products where id=$1 and active for update',[payload.product_id])).rows[0]
 if(!product||quantity>product.quantity)throw fail('Estoque insuficiente ou produto indisponível.',409)
 const {rate,commission}=(await client.query(
  "select rate,round($3::numeric*rate/100)::integer commission from (select item_commission_rate('product',$1,$2) rate) r",
  [professionalId,product.id,product.sale_price_cents])).rows[0]
 const gross=product.sale_price_cents*quantity, earned=commission*quantity
 if(gross>2147483647)throw fail('O valor dos produtos excede o limite da comanda.')
 const item=(await client.query(`insert into command_items(command_id,type,product_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents)
  values($1,'product',$2,$3,$4,$5,$6,'percent',$7,$8) returning id`,
  [commandId,product.id,professionalId,product.name,product.sale_price_cents,quantity,rate,earned])).rows[0]
 await client.query('update products set quantity=quantity-$2 where id=$1',[product.id,quantity])
 await client.query("insert into stock_movements(product_id,type,quantity_delta,reference_id,reason,created_by) values($1,'sale',$2,$3,'Adicionado à comanda',auth.uid())",[product.id,-quantity,commandId])
 if(earned>0&&command.status==='awaiting_payment')await client.query(`insert into commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status)
  values($1,$2,$3,$4,jsonb_build_object('rate_percent',$5::numeric,'barbershop_cents',$6::integer,'type','product'),'pending')`,[item.id,professionalId,gross,earned,rate,gross-earned])
 return item
}

async function removeItems(client, command, itemId) {
 const whole=itemId===null
 if(!whole&&!uuid(itemId))throw fail('Item inválido.')
 const items=(await client.query('select id,product_id,quantity from command_items where command_id=$1 and ($2::uuid is null or id=$2) order by product_id,id for update',[command.id,itemId])).rows
 if(!whole&&!items.length)throw fail('Item não encontrado nesta comanda.',404)
 const ids=items.map(item=>item.id)
 const commissions=(await client.query('select status from commission_entries where command_item_id=any($1::uuid[]) for update',[ids])).rows
 if(commissions.some(entry=>entry.status!=='pending'))throw fail('Existe repasse registrado. Peça à gestão para revisar a comanda.',409)
 const redemptions=(await client.query('select id,sale_id,service_id from package_redemptions where command_item_id=any($1::uuid[]) for update',[ids])).rows
 if(!whole&&redemptions.length)throw fail('Este item já utilizou uma sessão de plano.',409)
 for(const session of redemptions){
  await client.query('update package_sale_balances set remaining=least(total,remaining+1) where sale_id=$1 and service_id=$2',[session.sale_id,session.service_id])
  await client.query("update package_sales set status='active' where id=$1 and status='completed'",[session.sale_id])
  await client.query('delete from package_redemptions where id=$1',[session.id])
 }
 for(const item of items.filter(item=>item.product_id)){
  await client.query('update products set quantity=quantity+$2 where id=$1',[item.product_id,item.quantity])
  if(!whole)await client.query("insert into stock_movements(product_id,type,quantity_delta,reference_id,reason,created_by) values($1,'return',$2,$3,'Removido da comanda',auth.uid())",[item.product_id,item.quantity,command.id])
 }
 await client.query('delete from commission_entries where command_item_id=any($1::uuid[])',[ids])
 await client.query('delete from command_items where command_id=$1 and id=any($2::uuid[])',[command.id,ids])
 if(whole){
  await client.query('delete from stock_movements where reference_id=$1',[command.id])
  await client.query('delete from commands where id=$1',[command.id])
  await client.query('delete from appointments where id=$1',[command.appointment_id])
 }else if(command.discount_cents>0){
  const {subtotal}=(await client.query('select coalesce(sum(unit_price_cents::bigint*quantity),0) subtotal from command_items where command_id=$1',[command.id])).rows[0]
  if(Number(subtotal)+command.surcharge_cents<=command.discount_cents)throw fail('Reduza o desconto antes de remover este item.')
 }
 return {id:itemId??command.id}
}

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
 const commandId=['receive','close_package_command','delete_command'].includes(action)?payload.id:payload.command_id
 if(!uuid(commandId))throw fail('Atendimento inválido.')
 // Same lock order as office_action: active drawer, then command. Concurrent receipts serialize.
 const receiving=action==='receive',method=payload.method??'pix'
 if(receiving&&!['cash','pix','debit','credit','other'].includes(method))throw fail('Forma de pagamento inválida.')
 const session=receiving?(await client.query('select id from cash_sessions where closed_at is null order by opened_at desc limit 1 for update')).rows[0]:null
 const command=(await client.query(ownCommands+' and c.id=$2 for update of c',[id,commandId])).rows[0]
 if(!command||!(await client.query(ownCommands+' and c.id=$2',[id,commandId])).rowCount)throw fail('Este atendimento não está disponível no seu acesso. Procure a gestão.',403)
 if(['receive','close_package_command'].includes(action)&&command.status==='closed')return {id:command.id,already_received:true}
 if(!['open','awaiting_payment'].includes(command.status))throw fail('Este atendimento já foi encerrado. Procure a gestão.')
 if(command.status==='open'&&(receiving||action==='close_package_command'))throw fail('Finalize o atendimento antes de receber.')
 if((await client.query('select 1 from payments where command_id=$1 and reversed_at is null',[commandId])).rowCount)throw fail('Este atendimento já possui pagamento. Atualize os dados ou procure a gestão.',409)
 if(action==='add_command_product')return addProduct(client,id,command,payload)
 if(action==='delete_command'){
  if((await client.query('select 1 from payments where command_id=$1',[commandId])).rowCount)throw fail('Existe um histórico de pagamento. Solicite a exclusão à gestão.',409)
  return removeItems(client,command,null)
 }
 if(command.status==='open'&&['edit_command_service','remove_command_item'].includes(action)){
  const target=action==='edit_command_service'?payload.item_id:payload.id
  if(!uuid(target))throw fail('Item inválido.')
  if((await client.query('select 1 from appointments a join command_items i on i.service_id=a.service_id where a.id=$1 and i.command_id=$2 and i.id=$3',[command.appointment_id,commandId,target])).rowCount)throw fail('Finalize o atendimento para alterar o serviço originalmente agendado.')
 }
 if(action==='remove_command_item'){
  if(!uuid(payload.id))throw fail('Item inválido.')
  return removeItems(client,command,payload.id)
 }
 if(action==='set_command_adjustments'){
  const discount=payload.discount===undefined?command.discount_cents:payload.discount
  const tip=payload.surcharge===undefined?command.surcharge_cents:payload.surcharge
  if(![discount,tip].every(value=>Number.isSafeInteger(value)&&value>=0&&value<=2147483647))throw fail('Informe valores válidos para desconto e gorjeta.')
  const {subtotal}=(await client.query('select coalesce(sum(unit_price_cents::bigint*quantity),0) subtotal from command_items where command_id=$1',[commandId])).rows[0]
  const total=Number(subtotal)-discount+tip
  if(total<=0||total>2147483647)throw fail('O total da comanda precisa ser positivo e estar dentro do limite.')
  await client.query('update commands set discount_cents=$2,surcharge_cents=$3 where id=$1',[commandId,discount,tip])
  return {id:commandId}
 }
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
 if(commission>0&&command.status==='awaiting_payment')await client.query("insert into commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status) values($1,$2,$3,$4,jsonb_build_object('rate_percent',$5::numeric,'barbershop_cents',$6::integer),'pending') on conflict(command_item_id) do update set gross_cents=excluded.gross_cents,commission_cents=excluded.commission_cents,rule_snapshot=excluded.rule_snapshot",[itemId,id,amount,commission,rate,amount-commission])
 return {id:itemId}
}

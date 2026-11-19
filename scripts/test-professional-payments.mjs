import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import {readFile,readdir} from 'node:fs/promises'
import pg from 'pg'
import {pool} from '../server/db.mjs'
import {professionalAction,professionalSnapshot} from '../server/professionals.mjs'
import {spreadsheetAdmin,sheetSnapshot,sheetCatalog,subtractBaseline} from '../server/spreadsheets.mjs'

// Disposable database/role: no test customers, commands or payments in production.
const suffix=randomBytes(6).toString('hex'),database='machado_qa_payments_'+suffix,role='machado_qa_pay_'+suffix
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+database;url.searchParams.delete('sslmode')
let temp,created=false
try{
 await pool.query(`create database "${database}"`);created=true
 temp=new pg.Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true,...(process.env.DATABASE_SSL_CA_FILE?{ca:await readFile(process.env.DATABASE_SSL_CA_FILE,'utf8')}:{})},max:5,statement_timeout:90000})
 for(const file of (await readdir('database')).filter(f=>/^\d{3}_.*\.sql$/.test(f)).sort())await temp.query((await readFile('database/'+file,'utf8')).replaceAll('machado_runtime',role))
 const units=(await temp.query("insert into business_units(slug,name) values($1,'QA A'),($2,'QA B') returning id",['pay-a-'+suffix,'pay-b-'+suffix])).rows
 const owner=randomUUID(),user=randomUUID(),otherUser=randomUUID()
 const scoped=async(actor,work,unit=units[0].id)=>{
  const c=await temp.connect();try{await c.query('begin');await c.query("select set_config('request.business_id',$1,true),set_config('request.jwt.claim.sub',$2,true)",[unit,actor]);await c.query(`set local role "${role}"`);const value=await work(c);await c.query('commit');return value}catch(e){await c.query('rollback');throw e}finally{c.release()}
 }
 let pro,otherPro,service,secondService,command,appointment,item
 await temp.query("insert into auth.users(id,email,tenant_id) values($1,'owner@example.invalid',$4),($2,'pro@example.invalid',$4),($3,'other@example.invalid',$4)",[owner,user,otherUser,units[0].id])
 await temp.query("insert into profiles(id,name,role,tenant_id) values($1,'Owner','owner',$4),($2,'Pro','professional',$4),($3,'Other','professional',$4)",[owner,user,otherUser,units[0].id])
 await scoped(owner,async c=>{
  pro=(await c.query("insert into professionals(name,profile_id,default_commission_percent) values('Pro',$1,40) returning id",[user])).rows[0].id
  otherPro=(await c.query("insert into professionals(name,profile_id,default_commission_percent) values('Other',$1,60) returning id",[otherUser])).rows[0].id
  service=(await c.query("insert into services(name,price_cents,duration_minutes,commission_mode) values('Corte',4000,40,'professional') returning id")).rows[0].id
  secondService=(await c.query("insert into services(name,price_cents,duration_minutes,commission_mode) values('Barba',3000,30,'professional') returning id")).rows[0].id
  await c.query('insert into professional_services(professional_id,service_id) values($1,$3),($1,$4),($2,$3)',[pro,otherPro,service,secondService])
  const customer=(await c.query("insert into customers(name,phone) values('Cliente Teste','45999990001') returning id")).rows[0].id
  appointment=(await c.query("insert into appointments(customer_id,professional_id,service_id,starts_at,ends_at,expected_price_cents) values($1,$2,$3,'2098-03-11T10:00:00-03:00','2098-03-11T10:40:00-03:00',4000) returning id",[customer,pro,service])).rows[0].id
  await c.query("update appointments set status='completed' where id=$1",[appointment])
  command=(await c.query('select id from commands where appointment_id=$1',[appointment])).rows[0].id
  item=(await c.query('select id from command_items where command_id=$1',[command])).rows[0].id
 })
 const action=(actor,pid,name,payload,unit)=>scoped(actor,c=>professionalAction(c,pid,name,payload),unit)
 await scoped(owner,async c=>{
  const catalog=await sheetCatalog(c)
  assert(catalog.some(row=>row.key==='service:'+service))
  const snapshot=await sheetSnapshot(c,2098,'2098-03-11')
  assert.equal(snapshot.find(row=>row.key==='service:'+service).amount,4000)
  assert.deepEqual(subtractBaseline(snapshot,snapshot),[])
  const connection=await spreadsheetAdmin(c,'connect','POST',{spreadsheet_url:'https://docs.google.com/spreadsheets/d/123456789012345678901234/edit',year:2098,starts_on:'2098-03-11'},{id:owner,role:'owner'},'https://example.invalid')
  assert(connection.script.includes('instalarMachado'))
  const visible=await spreadsheetAdmin(c,'settings','GET',{}, {id:owner,role:'owner'})
  assert(!JSON.stringify(visible).includes('token_hash'))
 })
 await scoped(user,async c=>assert.rejects(spreadsheetAdmin(c,'settings','GET',{}, {id:user,role:'professional'})))
 await scoped(owner,async c=>assert.equal((await c.query('select * from spreadsheet_connections')).rowCount,0),units[1].id)
 let product,extraCommand,extraVisit
 await scoped(owner,async c=>{
  product=(await c.query("insert into products(name,sale_price_cents,cost_cents,quantity,commission_percent) values('Pomada',2000,500,4,20) returning id")).rows[0].id
  extraVisit=(await c.query("insert into appointments(customer_id,professional_id,service_id,starts_at,ends_at,expected_price_cents) select customer_id,professional_id,service_id,starts_at+interval '1 hour',ends_at+interval '1 hour',4000 from appointments where id=$1 returning id",[appointment])).rows[0].id
  await c.query("update appointments set status='in_service' where id=$1",[extraVisit])
  extraCommand=(await c.query('select id from commands where appointment_id=$1',[extraVisit])).rows[0].id
 })
 const edit=(name,fields={})=>action(user,pro,name,{command_id:extraCommand,...fields})
 const line=await edit('add_command_product',{product_id:product,quantity:2,amount:1})
 assert.equal((await scoped(user,c=>professionalSnapshot(c,pro))).products[0].quantity,2)
 await assert.rejects(edit('add_command_product',{product_id:product,quantity:3}),/Estoque/)
 await assert.rejects(action(otherUser,otherPro,'delete_command',{id:extraCommand}),e=>e.status===403)
 await assert.rejects(edit('remove_command_item',{id:null}),/inválido/)
 await edit('set_command_adjustments',{discount:500})
 await edit('set_command_adjustments',{surcharge:200})
 await scoped(owner,async c=>{
  const summary=(await c.query('select office_snapshot() snap')).rows[0].snap
  const sale=summary.commands.find(row=>row.id===extraCommand)
  assert.equal(sale.discount_cents,500);assert.equal(sale.surcharge_cents,200)
  assert.equal(summary.items.find(row=>row.id===line.id).unit_price_cents,2000)
  assert(!summary.commissions.some(row=>row.command_item_id===line.id))
  await c.query("update appointments set status='completed' where id=$1",[extraVisit])
 })
 await scoped(owner,async c=>assert.equal((await c.query('select commission_cents from commission_entries where command_item_id=$1',[line.id])).rows[0].commission_cents,800))
 await edit('remove_command_item',{id:line.id})
 await edit('add_command_product',{product_id:product,quantity:1})
 await edit('delete_command',{id:extraCommand})
 await scoped(owner,async c=>{
  assert.equal((await c.query('select quantity from products where id=$1',[product])).rows[0].quantity,4)
  assert.equal((await c.query('select id from appointments where id=$1',[extraVisit])).rowCount,0)
  assert.equal((await c.query('select id from commands where id=$1',[extraCommand])).rowCount,0)
  assert.equal((await c.query('select id from customers')).rowCount,1)
 })
 await assert.rejects(action(otherUser,otherPro,'receive',{id:command,method:'pix',expected_total:7500}),e=>e.status===403)
 await assert.rejects(action(user,pro,'receive',{id:command,method:'pix',expected_total:7500}),/abrir o caixa/)
 await assert.rejects(action(user,pro,'edit_command_service',{command_id:command,item_id:item,service_id:secondService,amount:-1}),/valor válido/)
 await assert.rejects(action(user,pro,'add_command_service',{command_id:command,service_id:service,professional_id:otherPro}),e=>e.status===403)
 await assert.rejects(action(user,pro,'pay_commissions',{id:pro}),e=>e.status===403)
 await action(user,pro,'edit_command_service',{command_id:command,item_id:item,service_id:secondService,amount:3500})
 await scoped(owner,async c=>{
  assert.equal((await c.query('select commission_cents from commission_entries where command_item_id=$1',[item])).rows[0].commission_cents,1400)
  await c.query("select office_action('open_cash','{\"amount\":0}')")
 })
 await action(user,pro,'add_command_service',{command_id:command,service_id:service,amount:1,commission:100})
 const before=await scoped(user,c=>professionalSnapshot(c,pro))
 assert.equal(before.commands.length,1);assert.equal(before.items.length,2)
 assert.equal(before.items.find(i=>i.id!==item).unit_price_cents,4000,'Catalog price cannot be forged on add')
 for(const key of ['customers','sessions','movements','commissions'])assert.deepEqual(before[key],[])
 assert(!JSON.stringify(before.items).includes('commission_'),'No internal commission rules in command payload')
 const alien=await scoped(otherUser,c=>professionalSnapshot(c,otherPro));assert.deepEqual(alien.commands,[]);assert.deepEqual(alien.payments,[])
 await assert.rejects(action(user,pro,'receive',{id:command,method:'pix',expected_total:1}),e=>e.status===409)
 await action(user,pro,'add_command_product',{command_id:command,product_id:product,quantity:1})
 await action(user,pro,'set_command_adjustments',{command_id:command,discount:2200})
 await action(user,pro,'set_command_adjustments',{command_id:command,surcharge:200})
 const receipts=await Promise.all([action(user,pro,'receive',{id:command,method:'pix',expected_total:7500}),action(user,pro,'receive',{id:command,method:'pix',expected_total:7500})])
 assert.equal(receipts.filter(r=>r.already_received).length,1)
 await scoped(owner,async c=>{
  const snapshot=(await c.query('select office_snapshot() value')).rows[0].value
  assert.equal(snapshot.commands.find(x=>x.id===command).status,'closed')
  assert.equal(snapshot.payments.length,1);assert.equal(snapshot.payments[0].amount_cents,7500)
  assert.equal(snapshot.movements.length,1);assert.equal(snapshot.movements[0].amount_cents,7500)
  assert(snapshot.commissions.every(e=>e.status==='pending'),'Receiving customer money must not pay professional commissions')
  await c.query("select office_action('receive',jsonb_build_object('id',$1::text,'method','cash'))",[command])
  assert.equal((await c.query('select count(*)::int n from payments')).rows[0].n,1,'Management must not receive again')
 })
 await assert.rejects(action(user,pro,'edit_command_service',{command_id:command,item_id:item,service_id:service,amount:4000}),/encerrado/)
 await assert.rejects(action(user,pro,'receive',{id:command,method:'invalid'}),/pagamento inválida/)
 await assert.rejects(action(user,pro,'receive',{id:command,method:'pix',expected_total:7500},units[1].id))
 const after=await scoped(user,c=>professionalSnapshot(c,pro));assert.equal(after.payments.length,1);assert.equal(after.commands[0].status,'closed')
 // Package-covered visits close without creating a second receipt; paid commissions block edits.
 let coveredCommand,coveredItem,mixedCommand
 await scoped(owner,async c=>{
  const customer=(await c.query('select customer_id from appointments where id=$1',[appointment])).rows[0].customer_id
  const pack=(await c.query("select save_service_package(jsonb_build_object('name','Plano QA','price',10000,'items',jsonb_build_array(jsonb_build_object('service_id',$1::text,'quantity',3)))) value",[service])).rows[0].value.id
  await c.query("select sell_service_package($1,$2,'pix')",[pack,customer])
  const a=(await c.query("insert into appointments(customer_id,professional_id,service_id,starts_at,ends_at,expected_price_cents) values($1,$2,$3,'2098-03-12T10:00:00-03:00','2098-03-12T10:40:00-03:00',4000) returning id",[customer,pro,service])).rows[0].id
  await c.query("update appointments set status='completed' where id=$1",[a])
  coveredCommand=(await c.query('select id from commands where appointment_id=$1',[a])).rows[0].id
  coveredItem=(await c.query('select id from command_items where command_id=$1',[coveredCommand])).rows[0].id
 })
 await assert.rejects(action(user,pro,'edit_command_service',{command_id:coveredCommand,item_id:coveredItem,service_id:service,amount:4000}),/sessão de plano/)
 await action(user,pro,'close_package_command',{id:coveredCommand})
 await scoped(owner,async c=>{
  assert.equal((await c.query('select count(*)::int n from payments')).rows[0].n,1)
  const customer=(await c.query('select customer_id from appointments where id=$1',[appointment])).rows[0].customer_id
  const a=(await c.query("insert into appointments(customer_id,professional_id,service_id,starts_at,ends_at,expected_price_cents) values($1,$2,$3,'2098-03-13T10:00:00-03:00','2098-03-13T10:30:00-03:00',3000) returning id",[customer,pro,secondService])).rows[0].id
  await c.query("update appointments set status='completed' where id=$1",[a])
  mixedCommand=(await c.query('select id from commands where appointment_id=$1',[a])).rows[0].id
  const ownItem=(await c.query('select id from command_items where command_id=$1',[mixedCommand])).rows[0].id
  await c.query("update commission_entries set status='paid',paid_at=now() where command_item_id=$1",[ownItem])
  await assert.rejects(professionalAction(c,pro,'edit_command_service',{command_id:mixedCommand,item_id:ownItem,service_id:service,amount:5000}),/repasse/)
  await c.query('select add_service_to_command($1,$2,$3)',[mixedCommand,service,otherPro])
 })
 await assert.rejects(action(user,pro,'receive',{id:mixedCommand,method:'cash',expected_total:7000}),e=>e.status===403)
 assert(!(await scoped(user,c=>professionalSnapshot(c,pro))).commands.some(c=>c.id===mixedCommand),'Shared commands remain with management')
 console.log('PASS: own service edit/add, server commissions/catalog pricing, own snapshot, tenant isolation, no drawer leak, closed drawer guard, concurrent receipt exactly once, management synchronization and separate unpaid commission.')
}finally{
 if(temp)await temp.end()
 if(created)await pool.query(`drop database if exists "${database}" with (force)`)
 await pool.query(`drop role if exists "${role}"`);await pool.end()
}

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile,writeFile } from 'node:fs/promises'
import { request } from '@playwright/test'
import { pool,transaction } from '../server/db.mjs'

const base=process.env.TEST_API_URL||'http://127.0.0.1:3000'
const account=JSON.parse(await readFile('.private/qa-account.json','utf8'))
const tag=randomUUID().slice(0,8),serviceId=randomUUID(),customerId=randomUUID()
const contexts=[],professionals=[],customerIds=new Set([customerId])
const context=async label=>{const ctx=await request.newContext({baseURL:base,extraHTTPHeaders:{Origin:new URL(base).origin,'x-forwarded-for':`198.51.100.${label}`}});contexts.push(ctx);return ctx}
const admin=await context(31),pro1=await context(32),pro2=await context(33),anonymous=await context(34)
const call=async(ctx,path,body,status=200)=>{const res=await ctx[body===undefined?'get':'post']('/api'+path,body===undefined?{}:{data:body});const json=await res.json();assert.equal(res.status(),status,`${path}: ${JSON.stringify(json)}`);return json}
const rpc=(name,params)=>call(admin,'/rpc',{name,params})
let ownerSigned=false
try {
  await call(admin,'/auth/sign-in/email',{email:account.email,password:account.password,rememberMe:true});ownerSigned=true
  for(const name of ['Primeiro','Segundo']){
    const email=`qa.${name.toLowerCase()}.${tag}@example.invalid`,password='QA-escolhida-'+randomUUID()
    const result=await rpc('save_professional_profile',{payload:{name:`QA Pro ${name} ${tag}`,active:true,service_commission:50,product_commission:20,access:{email:email.toUpperCase(),password}}})
    assert.equal(result.data.access.password,password,'Deve usar exatamente a senha definida pelo administrador')
    assert.equal(result.data.access.email,email,'Deve normalizar o e-mail definido pelo administrador')
    assert.equal(result.data.access.link,'/profissional')
    assert.equal(result.data.id,result.data.access.id)
    professionals.push(result.data.access)
  }
  const [first,second]=professionals
  await transaction(account.id,async client=>{
    await client.query("insert into services(id,name,price_cents,duration_minutes,active,commission_mode) values($1,$2,5000,40,true,'professional')",[serviceId,`QA Pro Serviço ${tag}`])
    for(const pro of professionals)await client.query('insert into professional_services(professional_id,service_id) values($1,$2)',[pro.id,serviceId])
    await client.query('insert into customers(id,name,phone) values($1,$2,$3)',[customerId,`QA Pro Cliente ${tag}`,'4500000901'])
  })
  await call(pro1,'/professional-auth/sign-in/email',{email:first.email,password:first.password,rememberMe:true})
  await call(pro2,'/professional-auth/sign-in/email',{email:second.email,password:second.password,rememberMe:true})
  const own=await call(pro1,'/professional/access');assert.equal(own.data.profile.id,first.id);assert.equal(own.data.profile.email,first.email);assert.equal(own.data.administrative,false);assert.deepEqual(own.data.choices,[])
  const directory=await call(admin,'/professional-accounts?professional_id='+first.id);assert.equal(directory.data.length,1);assert.equal(directory.data[0].id,first.id);assert.equal(directory.data[0].email,first.email);assert.ok(!JSON.stringify(directory).includes(first.password))
  await call(admin,'/professional-accounts',{professional_id:first.id,email:second.email.toUpperCase()},409)
  await call(admin,'/professional-accounts',{professional_id:first.id,email:account.email.toUpperCase()},409)
  await call(admin,'/professional-accounts',{professional_id:first.id,email:'sem-arroba'},400)
  await call(admin,'/professional-accounts',{professional_id:first.id,email:first.email,password:'curta'},400)
  for(const access of [{email:second.email,password:first.password},{email:'invalido',password:first.password},{email:`qa.invalido.${tag}@example.invalid`,password:'curta'},{password:first.password}]) {
    const invalidName=`QA inválido ${tag}`
    await call(admin,'/rpc',{name:'save_professional_profile',params:{payload:{name:invalidName,active:false,access}}},access.email===second.email?409:400)
    assert.equal((await pool.query('select count(*)::int n from professionals where name=$1',[invalidName])).rows[0].n,0,'Falha no acesso deve reverter o cadastro inteiro')
  }
  await call(anonymous,'/professional/access',undefined,401)
  await call(pro1,'/professional/access?professional_id='+second.id,undefined,403)
  await call(pro1,'/professional/snapshot?professional_id='+second.id,undefined,403)
  await call(pro1,'/professional/catalog?professional_id='+second.id,undefined,403)
  await call(pro1,`/professional/cash?professional_id=${second.id}&from=2026-01-01&to=2026-12-31`,undefined,403)
  await call(pro1,'/professional-accounts',undefined,401)
  await call(pro1,'/backup',undefined,401)
  await call(pro1,'/rpc',{name:'office_snapshot'},401)
  await call(pro1,'/rpc',{name:'office_action',params:{action:'receive',payload:{id:first.id}}},401)
  await call(pro1,'/rpc',{name:'reset_operational_data',params:{confirmation:'ZERAR OPERAÇÃO'}},401)
  console.log('PASS API: login escolhido pelo administrador, endereço comum, e-mail próprio, duplicidade e senha inválida revertidas, conta própria e bloqueio de dados alheios.')
  const newAppointment=(id,starts,fit=false)=>({name:`QA Agendado ${tag}`,phone:'4500000902',professional_id:id,service_id:serviceId,starts_at:starts,fit_in:fit,duration:15,amount:5000})
  await call(pro1,'/professional/action',{professional_id:first.id,action:'create_appointment',payload:newAppointment(second.id,'2097-07-10T06:40:00-03:00')},403)
  const created=await call(pro1,'/professional/action',{professional_id:first.id,action:'create_appointment',payload:newAppointment(first.id,'2097-07-10T06:40:00-03:00')})
  const a=created.data.id
  const snapshot=await call(pro1,'/professional/snapshot?professional_id='+first.id)
  assert.ok(snapshot.data.appointments.some(row=>row.id===a));assert.ok(snapshot.data.appointments.every(row=>row.professional_id===first.id))
  for(const key of ['commands','items','payments','commissions','sessions','movements','products','customers'])assert.deepEqual(snapshot.data[key],[])
  for(const row of snapshot.data.appointments)customerIds.add(row.customer_id)
  await call(pro1,'/professional/action',{professional_id:first.id,action:'create_appointment',payload:newAppointment(first.id,'2097-07-10T06:50:00-03:00',true)},409)
  const fit=await call(pro1,'/professional/action',{professional_id:first.id,action:'create_appointment',payload:newAppointment(first.id,'2097-07-10T07:25:00-03:00',true)})
  assert.ok(fit.data.id)
  await call(pro2,'/professional/action',{professional_id:second.id,action:'set_status',payload:{id:a,status:'completed'}},403)
  await call(pro1,'/professional/action',{professional_id:first.id,action:'set_status',payload:{id:a,status:'completed'}})
  await call(pro1,'/professional/action',{professional_id:first.id,action:'cancel_appointment',payload:{id:a}},400)
  await call(pro1,'/professional/action',{professional_id:first.id,action:'receive',payload:{id:a}},403)
  const block=await call(pro1,'/professional/action',{professional_id:first.id,action:'create_schedule_block',payload:{professional_id:first.id,starts_at:'2097-07-11T00:00:00-03:00',ends_at:'2097-07-18T00:00:00-03:00',reason:'QA semana'}})
  await call(pro1,'/professional/action',{professional_id:first.id,action:'create_appointment',payload:newAppointment(first.id,'2097-07-12T06:40:00-03:00')},409)
  await call(pro2,'/professional/action',{professional_id:second.id,action:'delete_schedule_block',payload:{id:block.data.id}},403)
  await call(pro1,'/professional/action',{professional_id:first.id,action:'delete_schedule_block',payload:{id:block.data.id}})
  const recurring=await call(pro1,'/professional/action',{professional_id:first.id,action:'create_recurring_block',payload:{payload:{professional_id:first.id,starts_on:'2097-08-01',until_on:null,weekdays:[6],start_time:'00:00',end_time:'24:00',reason:'QA sábados'}}})
  await call(pro1,'/professional/action',{professional_id:first.id,action:'delete_recurring_block',payload:{id:recurring.data.id}})
  console.log('PASS API: agendamento, encaixe, concorrência, bloqueio por semana e recorrência; conclusão gera comissão no Caixa administrativo.')
  // Comissões de teste em comandas que misturam profissionais. O extrato deve mostrar somente a parte própria.
  const manual=randomUUID(),item1=randomUUID(),item2=randomUUID()
  await transaction(account.id,async client=>{
    await client.query("insert into commands(id,customer_id,status,created_at,closed_at) values($1,$2,'closed','2026-10-12T12:00:00-03:00','2026-10-12T12:00:00-03:00')",[manual,customerId])
    for(const [item,pro,commission] of [[item1,first,2500],[item2,second,9999]]){
      await client.query("insert into command_items(id,command_id,type,service_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents) values($1,$2,'service',$3,$4,'QA comissão isolada',20000,1,'percent',50,$5)",[item,manual,serviceId,pro.id,commission])
      await client.query("insert into commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status,created_at,paid_at) values($1,$2,20000,$3,'{}','paid','2026-10-12T12:00:00-03:00','2026-10-13T12:00:00-03:00')",[item,pro.id,commission])
    }
  })
  const cash=await call(pro1,`/professional/cash?professional_id=${first.id}&from=2026-10-12&to=2026-10-18`)
  assert.equal(cash.data.earned,2500);assert.equal(cash.data.paid,2500);assert.equal(cash.data.pending,0);assert.equal(cash.data.services,1);assert.equal(cash.data.customers,1)
  assert.equal(cash.data.entries.length,1);assert.ok(!JSON.stringify(cash).includes('9999'));assert.ok(!JSON.stringify(cash).includes(second.id))
  for(const key of ['gross_cents','rule_snapshot','payment_method','opening_balance_cents','unit_price_cents','barbershop_cents'])assert.ok(!JSON.stringify(cash).includes(key),`Campo financeiro privado: ${key}`)
  const prefs={weekly_commission_goal_cents:100000,weekly_service_goal:30,weekly_customer_goal:25,visible_cards:['earned','services']}
  await call(pro1,'/professional/preferences',{professional_id:first.id,preferences:prefs})
  const stored=await call(pro1,`/professional/cash?professional_id=${first.id}&from=2026-10-12&to=2026-10-18`);assert.deepEqual(stored.data.preferences.visible_cards,prefs.visible_cards);assert.equal(stored.data.preferences.weekly_service_goal,30)
  const other=await call(pro2,`/professional/cash?professional_id=${second.id}&from=2026-10-12&to=2026-10-18`);assert.equal(other.data.preferences.weekly_service_goal,0)
  await call(pro1,'/professional/preferences',{professional_id:second.id,preferences:prefs},403)
  await call(pro1,'/professional/preferences',{professional_id:first.id,preferences:{...prefs,visible_cards:['gross']}},400)
  await call(pro1,`/professional/cash?professional_id=${first.id}&from=2026-02-30&to=2026-03-10`,undefined,400)
  console.log('PASS API: comanda mista isolada, comissão paga/pendente, sem faturamento da barbearia, metas persistidas por perfil e datas validadas.')
  // A conta administrativa e a profissional usam cookies distintos no mesmo navegador.
  await call(admin,'/professional-auth/sign-in/email',{email:first.email,password:first.password,rememberMe:true})
  const stillAdmin=await call(admin,'/rpc',{name:'can_access_admin'});assert.equal(stillAdmin.data,true)
  await call(admin,'/professional-auth/sign-out',{})
  await call(admin,'/professional/access?professional_id='+second.id,undefined,401)
  const adminProfessional=await context(35)
  await call(adminProfessional,'/professional-auth/sign-in/email',{email:account.email,password:account.password})
  await call(adminProfessional,'/professional/access',undefined,403)
  const oldStorage=await pro1.storageState()
  const oldToken=oldStorage.cookies.find(cookie=>cookie.name.includes('session_token'))?.value
  const changedEmail=`qa.alterado.${tag}@example.invalid`
  const changed=await call(admin,'/professional-accounts',{professional_id:first.id,email:changedEmail})
  assert.equal(changed.data.email,changedEmail);assert.equal(changed.data.password,undefined)
  await call(pro1,'/professional/access',undefined,401)
  await call(pro1,'/professional-auth/sign-in/email',{email:changedEmail,password:first.password})
  const chosenNewPassword='QA-nova-escolhida-'+randomUUID()
  const rotated=await call(admin,'/professional-accounts',{professional_id:first.id,email:changedEmail,password:chosenNewPassword})
  assert.equal(rotated.data.password,chosenNewPassword)
  assert.ok(rotated.data.password);assert.notEqual(rotated.data.password,first.password)
  await call(pro1,'/professional/access',undefined,401)
  await call(pro1,'/professional-auth/sign-in/email',{email:changedEmail,password:first.password},401)
  await call(pro1,'/professional-auth/sign-in/email',{email:changedEmail,password:rotated.data.password})
  await call(pro1,'/professional-auth/change-password',{currentPassword:rotated.data.password,newPassword:'QA-temporaria-'+randomUUID(),revokeOtherSessions:true})
  assert.ok(oldToken)
  await pool.query('update professionals set active=false where id=$1',[first.id])
  await call(pro1,'/professional/access',undefined,403)
  await call(pro1,'/professional/action',{professional_id:first.id,action:'create_appointment',payload:newAppointment(first.id,'2097-09-01T06:40:00-03:00')},403)
  console.log('PASS API: cookies separados, sem prévia administrativa, edição do e-mail mantém senha, nova senha escolhida revoga sessões, troca de senha e bloqueio de inativo.')
  await writeFile('.private/professional-api-verification.json',JSON.stringify({date:new Date().toISOString(),base,checks:['admin-chosen-credentials','common-portal','own-email','duplicate-email-denial','invalid-credentials-rollback','email-change-preserves-password','own-scope','cross-professional-denial','admin-denial','no-shop-finances','mixed-command-commissions','date-validation','goals-persistence','scheduling','fits','blocks','recurrence','cash-integration','separate-cookies','password-rotation','password-change','inactive-denial'],status:'passed'},null,2))
} finally {
  if(ownerSigned)await transaction(account.id,async client=>{
    for(const pro of professionals)await client.query('select delete_professional_record($1)',[pro.id])
    await client.query('delete from services where id=$1',[serviceId])
    for(const id of customerIds)await client.query('delete from customers where id=$1 and not exists(select 1 from appointments where customer_id=$1) and not exists(select 1 from commands where customer_id=$1)',[id])
  })
  for(const ctx of contexts)await ctx.dispose()
  await pool.end()
}

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { request } from '@playwright/test'

// This suite creates records only in the explicitly prepared disposable DB.
// The production smoke test has its own cleanup and is never selected by env.
const base='http://127.0.0.1:3000'
const sandbox=JSON.parse(await readFile('.private/nov06-sandbox.json','utf8'))
const processes=JSON.parse(await readFile('.private/nov06-dev-processes.json','utf8'))
assert.match(sandbox.databaseName,/^machado_qa_units_[a-f0-9]+$/)
assert.equal(sandbox.removed,false)
assert.equal(processes.apiMode,'sandbox')
for(let attempt=0;attempt<25;attempt++) {
  try {const response=await fetch(base+'/api/health',{signal:globalThis.AbortSignal.timeout(2000)});await response.arrayBuffer();if(response.ok)break}catch{/* Wait for the isolated API process to finish starting. */}
  if(attempt===24)throw new Error('A API descartável não está pronta.')
  await new Promise(resolve=>setTimeout(resolve,200))
}
const contexts=[],checks=[],tag=randomUUID().slice(0,8)
async function context(number,token) {
  const value=await request.newContext({baseURL:base,extraHTTPHeaders:{Origin:token?'https://localhost':base,'x-forwarded-for':`2001:db8:${tag.slice(0,4)}:${tag.slice(4)}::${number}`,...(token?{Authorization:'Bearer '+token}:{})}})
  contexts.push(value);return value
}
async function call(ctx,path,body,status=200) {
  const response=await ctx[body===undefined?'get':'post']('/api'+path,body===undefined?{}:{data:body})
  const value=await response.json()
  assert.equal(response.status(),status,`${path}: status ${response.status()} (${value.error?.message||value.message||'resposta inesperada'})`)
  return {value,response}
}
const rpc=async(ctx,name,params={})=>(await call(ctx,'/rpc',{name,params})).value.data
const id=value=>typeof value==='string'?value:value?.id
try {
  const anonymous=await context(101),a=await context(102),b=await context(103),pa=await context(104),pb=await context(105)
  const catalog=(await call(anonymous,'/catalog')).value.data
  assert.equal(catalog.business.name,'Machado — unidade de testes','Use somente a API apontada ao banco descartável')
  await call(anonymous,'/register',undefined,405)
  await call(anonymous,'/register',{name:'Proprietário QA',business_name:'Machado QA',email:'invalido',password:'curta'},400)
  const ownerA={name:'Proprietário Jardim QA',business_name:'Machado Jardim QA '+tag,email:`unit.a.${tag}@example.invalid`,password:'QA-unidade-'+randomUUID()}
  const ownerB={name:'Proprietário Centro QA',business_name:'Machado Centro QA '+tag,email:`unit.b.${tag}@example.invalid`,password:'QA-unidade-'+randomUUID()}
  const createdA=(await call(anonymous,'/register',ownerA,201)).value.data
  const createdB=(await call(anonymous,'/register',ownerB,201)).value.data
  assert.notEqual(createdA.business.id,createdB.business.id)
  for(const value of[createdA,createdB]){assert.equal(value.recoveryCodes.length,3);assert.ok(value.recoveryCodes.every(code=>/^[a-f0-9]{48}$/.test(code)));assert.ok(!JSON.stringify(value).includes('password_hash'))}
  await call(anonymous,'/register',ownerA,409)
  await call(anonymous,'/register',{...ownerA,email:`spoof.${tag}@example.invalid`,tenant_id:createdA.business.id},400)
  const signA=await call(a,'/auth/sign-in/email',{email:ownerA.email,password:ownerA.password})
  const tokenA=signA.response.headers()['set-auth-token'];assert.ok(tokenA)
  await call(b,'/auth/sign-in/email',{email:ownerB.email,password:ownerB.password})
  checks.push('cadastro atômico de duas unidades, validação e códigos exclusivos')

  const proA={email:`barber.a.${tag}@example.invalid`,password:'QA-barbeiro-'+randomUUID()}
  const proB={email:`barber.b.${tag}@example.invalid`,password:'QA-barbeiro-'+randomUUID()}
  proA.id=id(await rpc(a,'save_professional_profile',{payload:{name:'Araújo Jardim QA',active:true,service_commission:50,product_commission:20,access:proA}}))
  proB.id=id(await rpc(b,'save_professional_profile',{payload:{name:'Machado Centro QA',active:true,service_commission:60,product_commission:20,access:proB}}))
  const serviceA=id(await rpc(a,'save_service_profile',{payload:{name:'Corte Jardim QA',price:4000,duration:40,active:true,commission_mode:'professional',commission:50}}))
  const serviceB=id(await rpc(b,'save_service_profile',{payload:{name:'Corte Centro QA',price:6000,duration:40,active:true,commission_mode:'professional',commission:50}}))
  const catalogA=(await call(a,'/catalog')).value.data,catalogB=(await call(b,'/catalog')).value.data
  assert.deepEqual(catalogA.services.map(row=>row.id),[serviceA]);assert.deepEqual(catalogB.services.map(row=>row.id),[serviceB])
  assert.deepEqual(catalogA.professionals.map(row=>row.id),[proA.id]);assert.deepEqual(catalogB.professionals.map(row=>row.id),[proB.id])
  const publicB=(await call(a,'/catalog?unit='+catalogB.business.unit_slug)).value.data
  assert.deepEqual(publicB.services.map(row=>row.id),[serviceB]);assert.ok(!Object.hasOwn(publicB.services[0],'default_commission_percent'))
  assert.ok(!Object.hasOwn(publicB.professionals[0],'phone'))
  await call(anonymous,'/catalog?unit=nao-existe-'+tag,undefined,404)
  checks.push('catálogos privados por unidade e público sem dados de comissão')

  const phone='45999990001'
  for(const ctx of[a,b])await rpc(ctx,'save_customer_profile',{payload:{name:'Cliente de validação QA',phone}})
  const snapshotA=await rpc(a,'office_snapshot'),snapshotB=await rpc(b,'office_snapshot')
  assert.equal(snapshotA.customers.length,1);assert.equal(snapshotB.customers.length,1)
  assert.notEqual(snapshotA.customers[0].id,snapshotB.customers[0].id)
  await rpc(a,'office_action',{action:'open_cash',payload:{amount:0}})
  await rpc(b,'office_action',{action:'open_cash',payload:{amount:0}})
  const sale=async(ctx,service,professional)=>{
    const command=id(await rpc(ctx,'open_manual_command',{customer_name:'Cliente de validação QA',customer_phone:phone}))
    await rpc(ctx,'add_service_to_command',{command_id:command,service_id:service,professional_id:professional})
    await rpc(ctx,'mark_command_ready',{command_id:command})
    await rpc(ctx,'office_action',{action:'receive',payload:{id:command,method:'pix'}})
    return command
  }
  await sale(a,serviceA,proA.id);await sale(b,serviceB,proB.id)
  const afterA=await rpc(a,'office_snapshot'),afterB=await rpc(b,'office_snapshot')
  assert.equal(afterA.payments.reduce((sum,row)=>sum+row.amount_cents,0),4000)
  assert.equal(afterB.payments.reduce((sum,row)=>sum+row.amount_cents,0),6000)
  assert.equal(afterA.commissions[0].commission_cents,2000);assert.equal(afterB.commissions[0].commission_cents,3600)
  checks.push('cliente com mesmo telefone, dois Caixas e recebimentos/comissões isolados')

  const goals={professional_id:proA.id,weekly_commission_goal_cents:20000,weekly_service_goal:20,weekly_customer_goal:15}
  assert.equal((await call(a,'/professional-goals',goals)).value.data.weekly_commission_goal_cents,20000)
  await call(b,'/professional-goals?professional_id='+proA.id,undefined,404)
  await call(b,'/professional-goals',goals,404)
  await call(pa,'/professional-auth/sign-in/email',{email:proA.email,password:proA.password})
  await call(pb,'/professional-auth/sign-in/email',{email:proB.email,password:proB.password})
  assert.equal((await call(pa,'/professional/access')).value.data.profile.business_name,ownerA.business_name)
  const preferences=(await call(pa,'/professional/preferences')).value.data
  assert.equal(preferences.weekly_commission_goal_cents,20000);assert.equal(preferences.goals_managed_by_admin,true)
  await call(pa,'/professional/preferences',{preferences:{visible_cards:['earned','pending'],show_goals:false}})
  assert.equal((await call(pa,'/professional/preferences')).value.data.weekly_commission_goal_cents,20000)
  await call(pa,'/professional/preferences',{preferences:{visible_cards:['earned'],show_goals:true,weekly_commission_goal_cents:1}},403)
  await call(pa,'/professional/access?professional_id='+proB.id,undefined,403)
  await call(pa,'/professional-goals',goals,401)
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})
  const cash=(await call(pa,`/professional/cash?from=${today}&to=${today}`)).value.data
  assert.equal(cash.earned,2000);assert.equal(cash.totalPending,2000);assert.equal(cash.entries.length,1)
  assert.ok(!Object.hasOwn(cash,'gross')&&!Object.hasOwn(cash,'payments'))
  checks.push('admin define metas; barbeiro acompanha/oculta e não altera nem vê outro profissional')

  const bearer=await context(106,tokenA)
  assert.equal((await rpc(bearer,'office_snapshot')).payments[0].amount_cents,4000)
  const backupA=(await call(a,'/backup')).value,backupB=(await call(b,'/backup')).value
  assert.equal(backupA.version,2);assert.deepEqual(backupA.tables.business_units.map(row=>row.id),[createdA.business.id])
  assert.ok(backupA.tables.auth_user.every(row=>row.tenant_id===createdA.business.id))
  assert.ok(backupB.tables.auth_user.every(row=>row.tenant_id===createdB.business.id))
  assert.equal(backupA.tables.payments.length,1);assert.equal(backupA.tables.recovery_codes.length,3)
  checks.push('sessão Bearer nativa e backup exportado somente da própria unidade')

  const nextPassword='QA-recuperada-'+randomUUID()
  await call(anonymous,'/recovery',{email:ownerA.email,code:createdA.recoveryCodes[0],password:nextPassword})
  await call(bearer,'/rpc',{name:'office_snapshot'},401)
  await call(anonymous,'/recovery',{email:ownerA.email,code:createdA.recoveryCodes[0],password:nextPassword},400)
  ownerA.password=nextPassword
  await call(a,'/auth/sign-in/email',{email:ownerA.email,password:ownerA.password})
  assert.equal((await rpc(b,'office_snapshot')).payments[0].amount_cents,6000)
  checks.push('recuperação de outra unidade, uso único e revogação sem afetar a unidade vizinha')
  await writeFile('.private/nov06-unit-api-fixtures.json',JSON.stringify({databaseName:sandbox.databaseName,ownerA:{...ownerA,...createdA.user,business_id:createdA.business.id,slug:catalogA.business.unit_slug},ownerB:{...ownerB,...createdB.user,business_id:createdB.business.id,slug:catalogB.business.unit_slug},proA,proB,serviceA,serviceB},null,2))
  await writeFile('.private/nov06-unit-backup-a.json',JSON.stringify(backupA))
  await writeFile('.private/nov06-unit-api-verification.json',JSON.stringify({date:new Date().toISOString(),base,databaseName:sandbox.databaseName,productionDataTouched:false,passed:true,checks},null,2))
  console.log('PASS API de unidades:',checks.length,'fluxos reais de cadastro/login, Caixa/comissão, metas, privacidade, backup e recuperação.')
} finally {await Promise.all(contexts.map(ctx=>ctx.dispose()))}

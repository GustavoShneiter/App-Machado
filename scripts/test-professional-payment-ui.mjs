/* global document, window, structuredClone */
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium,webkit} from '@playwright/test'
import {fixture} from './operations-fixture.mjs'
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5191',output=process.env.SCREENSHOT_DIR||'.private/screenshots/professional-payments'
await mkdir(output,{recursive:true})
for(const [engine,width,name] of [[chromium,390,'android'],[webkit,390,'iphone'],[chromium,1440,'desktop']]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'chrome'}:{})})
 const page=await browser.newPage({viewport:{width,height:892},locale:'pt-BR',timezoneId:'America/Sao_Paulo',reducedMotion:'reduce'}),errors=[],writes=[]
 const data=structuredClone(fixture);data.appointments=data.appointments.filter(a=>a.id==='a1');data.commands=[{...data.commands[0],status:'awaiting_payment',closed_at:null}];data.items=[data.items[0]];data.payments=[];data.packageSales=[];data.packageRedemptions=[]
 const catalog={services:[{id:'s1',name:'Corte de cabelo',price_cents:4000,duration_minutes:40,active:true},{id:'s2',name:'Barba expressa',price_cents:3000,duration_minutes:30,active:true}],professionals:[{id:'p1',name:'Araújo',active:true}],links:[],business:{name:'Barbearia Machado'}}
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),body=req.postData()?req.postDataJSON():{};let result={}
  if(url.pathname.includes('get-session'))return route.fulfill({json:{user:{id:'qa',email:'test@example.invalid'}}})
  if(url.pathname.endsWith('/catalog'))result=catalog
  else if(url.pathname.endsWith('/professional/access'))result={profile:{id:'p1',name:'Araújo',email:'test@example.invalid'}}
  else if(url.pathname.endsWith('/professional/snapshot'))result=data
  else if(url.pathname.endsWith('/rpc'))result=body.name==='can_access_admin'?true:data
  else if(url.pathname.endsWith('/professional/action')){
   writes.push(body)
   if(body.action==='edit_command_service'){data.items[0].description='Barba expressa';data.items[0].service_id='s2';data.items[0].unit_price_cents=body.payload.amount}
   if(body.action==='receive'){data.commands[0].status='closed';data.payments.push({id:'paid1',command_id:'cmd1',method:body.payload.method,amount_cents:3500,paid_at:new Date().toISOString()})}
  }
  await route.fulfill({json:{data:result,error:null}})
 })
 const capture=async label=>{
  await page.evaluate(()=>document.fonts.ready)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false)
  const nav=await page.locator('.pro-nav').boundingBox();assert(nav.x>=0&&nav.x+nav.width<=width+1,JSON.stringify(nav))
  const modal=page.getByRole('dialog');if(await modal.count()){const b=await modal.boundingBox();assert(b.x>=0&&b.y>=0&&b.y+b.height<=893,JSON.stringify(b))}
  await page.screenshot({path:`${output}/${name}-${label}.png`,animations:'disabled'})
 }
 try{
  await page.goto(base+'/profissional/atendimentos?comanda=cmd1');await page.getByRole('dialog').waitFor()
  assert.equal(await page.getByRole('button',{name:'Excluir comanda'}).count(),0)
  assert.equal(await page.getByRole('button',{name:'Nova comanda'}).count(),0)
  await page.getByRole('button',{name:'Editar serviço',exact:true}).click()
  const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Editar serviço realizado'})})
  await form.locator('select').selectOption('s2');await form.getByRole('spinbutton').fill('35')
  await capture('editar-servico');await form.getByRole('button',{name:'Salvar serviço'}).click();await form.waitFor({state:'detached'})
  assert.equal(writes[0].action,'edit_command_service');assert.equal(writes[0].payload.amount,3500)
  await page.getByRole('dialog').getByRole('button',{name:'Receber pagamento'}).click()
  await page.getByRole('heading',{name:'Registrar recebimento'}).waitFor();await capture('receber')
  await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'})
  assert.equal(writes[1].action,'receive');assert.equal(writes[1].payload.method,'pix')
  assert.equal(await page.getByRole('button',{name:'Receber',exact:true}).count(),0)
  await page.getByRole('button',{name:'Itens',exact:true}).click();await page.getByText('Pagamento registrado.',{exact:false}).waitFor();await capture('pago')
  if(!process.env.PROFESSIONAL_BUILD){await page.goto(base+'/admin/comandas');await page.getByRole('heading',{name:'Comandas',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Receber',exact:true}).count(),0)}
  assert.deepEqual(errors,[])
  console.log(`PASS ${name}: shared service/payment UI, no management actions, receipt -> paid in both editions, no overflow.`)
 }finally{await browser.close()}
}

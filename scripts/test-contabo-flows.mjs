/* global document, innerWidth */
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {randomUUID,createHash} from 'node:crypto'
import {request,chromium} from '@playwright/test'
const config=JSON.parse(await readFile('.private/migration/qa-private.json','utf8')),f=JSON.parse(await readFile('.private/migration/qa-fixtures.json','utf8')),base=config.base
assert.equal((await(await fetch(base+'/api/health')).json()).mode,'staging')
const contexts=[],checks=[],customerName='Cliente fictício migração '+randomUUID().slice(0,6)
async function ctx(){const c=await request.newContext({baseURL:base,extraHTTPHeaders:{Origin:base,'x-migration-test':config.testToken}});contexts.push(c);return c}
async function call(c,path,body,expected=200){const r=await c[body===undefined?'get':'post']('/api'+path,body===undefined?{}:{data:body});const v=await r.json();assert.equal(r.status(),expected,path+': '+(v.error?.message||v.message||''));return v.data??v}
const rpc=(c,name,params={})=>call(c,'/rpc',{name,params})
const admin=await ctx(),pro=await ctx(),publicClient=await ctx();let browser
try{
 await call(admin,'/auth/sign-in/email',{email:f.ownerA.email,password:f.ownerA.password});await call(pro,'/professional-auth/sign-in/email',{email:f.proA.email,password:f.proA.password})
 let slot,day
 for(let n=1;n<9;n++){day=new Date(Date.now()+n*86400000).toISOString().slice(0,10);slot=(await call(publicClient,'/rpc?unit='+f.ownerA.slug,{name:'public_booking_slots',params:{chosen_service:f.serviceA,booking_day:day,preferred_professional:f.proA.id}})).find(s=>s.available);if(slot)break}
 assert.ok(slot,'At least one available slot')
 const starts=day+'T'+slot.slot_time.slice(0,5)+':00-03:00'
 const booking={name:'create_public_appointment',params:{customer_name:customerName,customer_phone:'45999990002',chosen_service:f.serviceA,chosen_professional:f.proA.id,start_time:starts,terms_accepted:true}}
 const reservations=await Promise.all([publicClient.post('/api/rpc?unit='+f.ownerA.slug,{data:booking}),publicClient.post('/api/rpc?unit='+f.ownerA.slug,{data:booking})])
 assert.equal(reservations.filter(r=>r.status()===200).length,1,'Concurrent booking can succeed once only');assert.equal(reservations.filter(r=>r.status()!==200).length,1)
 let snap=await rpc(admin,'office_snapshot'),appointment=snap.appointments.find(a=>a.customer_name===customerName);assert.ok(appointment);assert.equal(appointment.professional_id,f.proA.id);assert.ok(appointment.service_name)
 const afterSlots=await call(publicClient,'/rpc?unit='+f.ownerA.slug,{name:'public_booking_slots',params:{chosen_service:f.serviceA,booking_day:day,preferred_professional:f.proA.id}});assert.equal(afterSlots.find(s=>s.slot_time===slot.slot_time).available,false)
 checks.push('Public reservation, customer/professional/service synchronized, concurrent collision rejected and slot disabled')
 await call(pro,'/professional/action',{action:'set_status',payload:{id:appointment.id,status:'completed'}})
 snap=await rpc(admin,'office_snapshot');const command=snap.commands.find(c=>c.appointment_id===appointment.id);assert.ok(command)
 const item=snap.items.find(i=>i.command_id===command.id);assert.ok(item)
 await call(pro,'/professional/action',{action:'edit_command_service',payload:{command_id:command.id,item_id:item.id,service_id:f.serviceA,amount:5000}})
 const receive={action:'receive',payload:{id:command.id,method:'pix',expected_total:5000}}
 const receipts=await Promise.all([call(pro,'/professional/action',receive),call(pro,'/professional/action',receive)])
 assert.equal(receipts.filter(r=>r.already_received).length,1)
 snap=await rpc(admin,'office_snapshot');assert.equal(snap.commands.find(c=>c.id===command.id).status,'closed');assert.equal(snap.payments.filter(p=>p.command_id===command.id).length,1);assert.equal(snap.payments.find(p=>p.command_id===command.id).amount_cents,5000)
 assert.equal(snap.commissions.find(e=>e.command_item_id===item.id).commission_cents,2500)
 await rpc(admin,'office_action',{action:'receive',payload:{id:command.id,method:'cash'}})
 assert.equal((await rpc(admin,'office_snapshot')).payments.filter(p=>p.command_id===command.id).length,1)
 checks.push('Professional service edit, exact commission, concurrent receipt once, immediately paid in management')
 const image=await readFile('public/professional-icon-192.png'),upload=await call(admin,'/upload',{folder:'products',base64:image.toString('base64'),mimeType:'image/png'})
 assert.ok(upload.url.startsWith(base+'/media/products/'));const download=await fetch(upload.url);assert.equal(download.status,200);assert.equal(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'),createHash('sha256').update(image).digest('hex'))
 for(const path of ['/.env','/server/db.mjs','/media/products/wrong.png'])assert.equal((await fetch(base+path)).status,404)
 const backupResponse=await admin.post('/api/backup',{data:{}});assert.ok([200,429].includes(backupResponse.status()));if(backupResponse.status()===429)assert.ok((await call(admin,'/system-status')).lastBackup);checks.push('Local photos preserve exact bytes; environment/source/private backup not publicly exposed; backup archival succeeds')
 const tag=randomUUID().slice(0,6);await mkdir('.private/migration/screenshots',{recursive:true})
 browser=await chromium.launch({headless:true,channel:'chrome'})
 for(const [kind,width] of [['admin',390],['profissional',390],['admin',1440]]){
  const c=await browser.newContext({viewport:{width,height:900},locale:'pt-BR',timezoneId:'America/Sao_Paulo',extraHTTPHeaders:{'x-migration-test':config.testToken}}),page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(25000)
  await page.goto(base+'/'+kind)
  await page.getByLabel(kind==='admin'?'E-mail':'E-mail de acesso',{exact:true}).fill(kind==='admin'?f.ownerA.email:f.proA.email);await page.getByLabel('Senha',{exact:true}).fill(kind==='admin'?f.ownerA.password:f.proA.password)
  const login=page.waitForResponse(r=>r.url().includes('sign-in/email'));await page.getByRole('button',{name:'Entrar',exact:true}).click();assert.equal((await login).status(),200);await page.locator(kind==='admin'&&width>900?'.sidebar':kind==='admin'?'.mobile-nav':'.pro-nav').waitFor()
  for(const section of ['inicio','agenda','caixa','relatorios','menu']){
   await page.goto(base+'/'+kind+'/'+(kind==='admin'&&section==='menu'?'configuracoes':section));await page.waitForLoadState('networkidle');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.screenshot({path:`.private/migration/screenshots/${kind}-${width}-${section}-${tag}.png`})
  }
  await c.close()
 }
 checks.push('Management mobile/desktop and professional mobile: login and five main sections render without runtime errors or horizontal overflow')
 await writeFile('.private/migration/qa-flow-verification.json',JSON.stringify({passed:true,date:new Date().toISOString(),checks},null,2));console.log('PASS staging:',checks)
}finally{if(browser)await browser.close();await Promise.all(contexts.map(c=>c.dispose()))}

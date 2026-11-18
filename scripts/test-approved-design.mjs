/* global document, window */
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium,webkit} from '@playwright/test'
import {fixture} from './operations-fixture.mjs'
import {defaultConfig} from '../shared/agent-config.mjs'
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5191'
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())
const data=JSON.parse(JSON.stringify(fixture).replaceAll('2026-09-18',today).replaceAll('2026-09-17',today))
data.appointments.push({...data.appointments[0],id:'a4',status:'scheduled',starts_at:today+'T19:40:00Z',ends_at:today+'T20:20:00Z',customer_name:'Rafael Costa'})
data.appointments.push({...data.appointments[1],id:'a5',status:'confirmed',starts_at:today+'T20:20:00Z',ends_at:today+'T21:00:00Z',customer_name:'Lucas Souza'})
data.items[0].commission_value=40
const professionals=[{id:'p1',name:'Araújo',active:true},{id:'p2',name:'Machado',active:true}]
const catalog={services:[{id:'s1',name:'Corte de cabelo',price_cents:4000,duration_minutes:40,active:true}],professionals,links:professionals.map(p=>({service_id:'s1',professional_id:p.id})),business:{name:'Barbearia Machado'}}
const preferences={visible_cards:['earned','pending','paid','services','customers'],show_goals:true,weekly_commission_goal_cents:50000,weekly_service_goal:30,weekly_customer_goal:20}
const results=[],output='.private/screenshots/redesign-2026-11-18'
await mkdir(output,{recursive:true})
for(const [engine,width,name] of [[chromium,390,'android'],[webkit,390,'iphone'],[chromium,360,'small'],[chromium,768,'tablet'],[chromium,1440,'desktop']]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'chrome'}:{})}),context=await browser.newContext({viewport:{width,height:892},locale:'pt-BR',timezoneId:'America/Sao_Paulo'}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 const writes=[]
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),body=req.postData()?req.postDataJSON():{};let result={}
  if(url.pathname.includes('get-session'))return route.fulfill({json:{user:{id:'qa',email:'test@example.invalid'}}})
  if(req.method()==='POST')writes.push({path:url.pathname,body})
  if(url.pathname.endsWith('/rpc'))result=body.name==='can_access_admin'?true:data
  else if(url.pathname.endsWith('/catalog'))result=url.pathname.includes('/professional/')?{...catalog,professionals:[professionals[0]]}:catalog
  else if(url.pathname.endsWith('/professional/access'))result={profile:{id:'p1',name:'Araújo',email:'teste@example.invalid',photo_url:null,business_name:'Barbearia Machado'}}
  else if(url.pathname.endsWith('/professional/snapshot'))result={...data,appointments:data.appointments.filter(a=>a.professional_id==='p1'),commissions:[]}
  else if(url.pathname.endsWith('/professional/preferences'))result=preferences
  else if(url.pathname.endsWith('/professional/cash'))result={from:url.searchParams.get('from'),to:url.searchParams.get('to'),totalPending:1600,earned:1600,pending:1600,paid:0,services:1,customers:1,entries:[{...data.commissions[0],occurred_at:today+'T12:00:00Z',description:'Corte de cabelo',quantity:1,customer_name:'Rafael Costa',type:'service',commission_percent:40}],preferences}
  else if(url.pathname.endsWith('/agent/settings'))result={...defaultConfig(),revision:1}
  else if(url.pathname.endsWith('/agent/status'))result={global_enabled:false,owner:true,runtime:null,integrations:[]}
  else if(url.pathname.endsWith('/agent/activity'))result={items:[]}
  return route.fulfill({json:{data:result,error:null}})
 })
 async function capture(label){
  await page.evaluate(()=>document.fonts.ready)
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)
  assert.equal(overflow,false,`${name}/${label}: horizontal overflow`)
  assert.deepEqual(errors,[],`${name}/${label}: runtime errors`)
  await page.screenshot({path:`${output}/${name}-${label}.png`,animations:'disabled',fullPage:false})
 }
 try{
  await page.goto(base+'/admin');await page.getByRole('heading',{name:'Próximos horários',exact:true}).waitFor()
  assert.match(await page.locator('.approved-balance>strong').innerText(),/110,00/);await capture('inicio')
  if(width<=900){const links=page.locator('.mobile-nav a');assert.equal(await links.nth(2).innerText(),'Início');assert.match(await links.nth(2).getAttribute('class'),/active/)}
  await page.goto(base+'/admin/agenda');await page.locator('.agenda-list-row').first().waitFor();await capture('agenda')
  await page.locator('.agenda-list-row').first().click();let modal=page.getByRole('dialog');await modal.waitFor();
  await capture('atendimento');const bounds=await modal.boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.y+bounds.height<=892.5,JSON.stringify(bounds));await modal.getByRole('button',{name:'Fechar',exact:true}).click()
  await page.getByRole('button',{name:'Filtro',exact:true}).click();await capture('filtro-agenda');await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click()
  await page.getByRole('button',{name:'Grade de horários',exact:true}).click();assert.equal(await page.locator('.agenda-slot').count(),26)
  await page.goto(base+'/admin/caixa');await page.getByRole('navigation',{name:'Visões do Caixa'}).waitFor();await capture('caixa')
  await page.getByRole('button',{name:'Extrato',exact:true}).click();await page.getByLabel('Buscar no extrato').fill('Material');assert.equal(await page.locator('.ledger-list .approved-money-row').count(),1);await page.getByLabel('Buscar no extrato').fill('');await capture('extrato')
  await page.getByRole('button',{name:'Repasses',exact:true}).click();await page.getByRole('button',{name:'Registrar repasse',exact:true}).waitFor();await capture('repasses')
  await page.getByRole('button',{name:'Registrar repasse',exact:true}).click();await page.getByRole('dialog',{name:'Registrar repasse'}).waitFor();await capture('repasse-dialog');await page.getByRole('dialog').getByRole('button',{name:'Fechar',exact:true}).click()
  await page.getByRole('button',{name:'Hoje',exact:true}).click();await page.getByRole('button',{name:'Receber',exact:true}).click();await page.getByRole('dialog',{name:'Receber de clientes'}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Receber',exact:true}).click();await page.getByRole('dialog',{name:'Confirmar pagamento'}).waitFor();await capture('receber');await page.getByRole('dialog',{name:'Confirmar pagamento'}).getByRole('button',{name:'Fechar',exact:true}).click();await page.getByRole('dialog',{name:'Receber de clientes'}).getByRole('button',{name:'Fechar',exact:true}).click()
  await page.goto(base+'/admin/relatorios');await page.getByRole('heading',{name:'Relatórios',exact:true}).waitFor();await capture('relatorios');await page.getByRole('button',{name:'Resultado',exact:true}).click();await capture('resultado')
  await page.goto(base+'/admin/configuracoes');await page.getByRole('heading',{name:'Menu',exact:true}).waitFor();await capture('menu')
  for(const [path,label] of [['clientes','Clientes'],['servicos','Serviços'],['produtos','Produtos e estoque'],['profissionais','Profissionais']]){
   await page.goto(base+'/admin/'+path);await page.getByRole('heading',{name:label,exact:true}).first().waitFor();await capture(path)
   if(path==='clientes'||path==='servicos'||path==='produtos'){await page.getByRole('button',{name:path==='clientes'?'Novo cliente':path==='servicos'?'Novo serviço':'Novo produto',exact:true}).first().click();await page.getByRole('dialog').waitFor();await capture(path+'-form');const box=await page.getByRole('dialog').boundingBox();assert(box.y>=0&&box.y+box.height<=892.5);await page.getByRole('dialog').getByRole('button',{name:'Fechar',exact:true}).click()}
  }
  for(const [path,label] of [['inicio','Meu dia'],['agenda','Minha Agenda'],['caixa','Meu Caixa'],['relatorios','Meu relatório'],['menu','Meu Menu']]){await page.goto(base+'/profissional/'+path);await page.getByRole('heading',{name:label,exact:true}).first().waitFor();await capture('pro-'+path);assert.equal(await page.locator('.pro-nav a').nth(2).innerText(),'Início');assert.equal(await page.locator('.agenda-professionals').count(),0)}
  assert(writes.every(w=>w.path.endsWith('/rpc')), 'Read-only design check must not mutate API state')
  results.push({name,width,status:'pass',runtimeErrors:errors.length})
 }finally{await browser.close()}
}
await writeFile(output+'/verification.json',JSON.stringify({fixture:true,productionWrites:false,results},null,2))
console.log('PASS approved UI: mobile/desktop/iPhone, centered home, real views, filters, sheets, professional permissions and no horizontal overflow.')

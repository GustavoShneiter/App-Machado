/* global document,window,getComputedStyle */
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium,webkit} from '@playwright/test'
import {fixture} from './operations-fixture.mjs'
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5191',output=process.env.SCREENSHOT_DIR||'.private/screenshots/alinhamentos-2026-11-18'
await mkdir(output,{recursive:true})
for(const [engine,width,label] of [[chromium,360,'small'],[chromium,390,'android'],[webkit,390,'iphone'],[chromium,1440,'desktop']]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'chrome'}:{})})
 const page=await browser.newPage({viewport:{width,height:892},locale:'pt-BR',timezoneId:'America/Sao_Paulo',reducedMotion:'reduce'}),errors=[]
 const preferences={visible_cards:['earned','pending','paid','services','customers'],show_goals:true,weekly_commission_goal_cents:0,weekly_service_goal:0,weekly_customer_goal:10}
 const catalog={services:[{id:'s1',name:'Corte',active:true,price_cents:4000,duration_minutes:40}],professionals:['Araújo','Machado','Carlos','Rodrigo','Paulo','José'].map((name,i)=>({id:'p'+(i+1),name,active:true})),links:[],business:{name:'Barbearia Machado'}}
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),body=route.request().postData()?route.request().postDataJSON():{};let data={}
  if(url.pathname.includes('get-session'))return route.fulfill({json:{user:{id:'qa',email:'qa@example.invalid'}}})
  if(url.pathname.endsWith('/rpc'))data=body.name==='can_access_admin'?true:fixture
  else if(url.pathname.endsWith('/catalog'))data=url.pathname.includes('/professional/')?{...catalog,professionals:[catalog.professionals[0]]}:catalog
  else if(url.pathname.endsWith('/professional/access'))data={profile:{id:'p1',name:'Gustavo Araújo',email:'qa@example.invalid',photo_url:'/professional-icon-192.png'}}
  else if(url.pathname.endsWith('/professional/snapshot'))data=fixture
  else if(url.pathname.endsWith('/professional/preferences'))data=preferences
  else if(url.pathname.endsWith('/professional/cash'))data={from:url.searchParams.get('from'),to:url.searchParams.get('to'),totalPending:1600,earned:1600,pending:1600,paid:0,services:1,customers:1,entries:[],preferences}
  await route.fulfill({json:{data,error:null}})
 })
 page.on('pageerror',e=>errors.push(e.message))
 const shot=async name=>{await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false);await page.screenshot({path:`${output}/${label}-${name}.png`,animations:'disabled'})}
 const middle=b=>b.x+b.width/2
 try{
  await page.goto(base+'/profissional/caixa');await page.getByRole('heading',{name:'Meu Caixa',exact:true}).waitFor()
  const identity=await page.locator('.pro-header-identity').boundingBox(),header=await page.locator('.topbar').boundingBox(),photo=await page.locator('.pro-header-avatar').boundingBox(),text=await page.locator('.pro-header-identity>div').boundingBox()
  assert(Math.abs(middle(identity)-middle(header))<2);assert(text.y>=photo.y&&text.y+text.height<=photo.y+photo.height)
  await shot('perfil');await page.getByRole('button',{name:'Personalizar meu Caixa'}).click();await page.locator('.pro-assigned-goals').waitFor()
  const values=await page.locator('.pro-assigned-goals dd').allTextContents();assert.deepEqual(values,['Não definida','Não definido','10'])
  for(const row of await page.locator('.pro-assigned-goals>div').all()){const dt=await row.locator('dt').boundingBox(),dd=await row.locator('dd').boundingBox();assert(dd.x>dt.x+dt.width);assert(Math.abs(dt.y+dt.height/2-dd.y-dd.height/2)<2)}
  await shot('metas');await page.getByRole('button',{name:'Fechar',exact:true}).click()
  await page.goto(base+'/profissional/menu');await page.getByRole('link',{name:'Versão web'}).waitFor()
  const link=page.getByRole('link',{name:'Versão web'}),icon=await link.locator('.pro-menu-icon').boundingBox(),copy=await link.locator('strong').boundingBox();assert(copy.x>icon.x+icon.width);assert(Math.abs(copy.y+copy.height/2-icon.y-icon.height/2)<2);await shot('menu-profissional')
  if(!process.env.PROFESSIONAL_BUILD){
  await page.goto(base+'/admin/agenda');await page.locator('.agenda-professionals button').first().waitFor()
  const group=await page.locator('.agenda-professionals').boundingBox(),buttons=await page.locator('.agenda-professionals button').all(),rows=new Map()
  for(const button of buttons){const b=await button.boundingBox(),key=Math.round(b.y);rows.set(key,[...(rows.get(key)||[]),b])}
  for(const row of rows.values()){const left=Math.min(...row.map(b=>b.x)),right=Math.max(...row.map(b=>b.x+b.width));assert(Math.abs((left+right)/2-middle(group))<2)}await shot('agenda')
  await page.goto(base+'/admin/caixa');await page.locator('.finance-main-amount').waitFor()
  const balance=await page.locator('.finance-main-amount').boundingBox(),eye=await page.getByRole('button',{name:'Ocultar valores',exact:true}).boundingBox(),date=await page.locator('.finance-main-amount>p').boundingBox(),amount=await page.locator('.finance-main-amount>strong').boundingBox();assert(Math.abs(middle(eye)-middle(balance))<2);assert(date.y>=amount.y+amount.height);assert.equal(await page.locator('.finance-main-amount').evaluate(e=>getComputedStyle(e).textAlign),'center');await shot('caixa')
  await page.getByRole('button',{name:'Ocultar valores',exact:true}).click();assert.match(await page.locator('.finance-main-amount>strong').innerText(),/••••/)
  await page.goto(base+'/admin/pacotes');await page.getByRole('button',{name:'Novo pacote',exact:true}).waitFor();const sale=await page.getByRole('button',{name:'Vender',exact:true}).boundingBox(),add=await page.getByRole('button',{name:'Novo pacote',exact:true}).boundingBox();assert(Math.abs(sale.width-add.width)<1);assert.equal(sale.height,add.height);await shot('pacotes')
  await page.goto(base+'/admin/configuracoes');const agent=page.locator('.menu-shortcuts a[href="/admin/agente"]');await agent.waitFor();assert.equal(await agent.locator('svg').count(),2);await shot('menu-gestao')
  }
  assert.deepEqual(errors,[]);console.log('PASS '+label+': centered profile/agenda/cash, goals, web link, equal package actions and WhatsApp menu row.')
 }finally{await browser.close()}
}

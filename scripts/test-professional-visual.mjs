/* global document, innerWidth */
import { chromium, webkit, devices } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { fixture } from './operations-fixture.mjs'

const base='http://127.0.0.1:5173',profile={id:'professional-visual',name:'Araújo',email:'araujo@machado.example',business_name:'Machado · Toledo Centro',active:true,photo_url:null}
const preferences={weekly_commission_goal_cents:30000,weekly_service_goal:15,weekly_customer_goal:15,visible_cards:['earned','pending','paid','services','customers'],show_goals:true,goals_managed_by_admin:true,goals_assigned_by:'Machado',goals_updated_at:'2026-11-06T12:00:00Z'}
const empty=Object.fromEntries(Object.keys(fixture).map(key=>[key,[]]))
let dataset='regular'
const dataFor=(from,to)=>{
 const descriptions=[dataset==='long'?'Corte de cabelo completo, barba e finalização com tratamento profissional individualizado':'Corte de cabelo','Corte de cabelo','Barba','Pomada modeladora','Corte de cabelo','Corte e barba','Corte de cabelo']
 const amounts=[dataset==='long'?123446589:2000,2000,1500,700,2000,2000,2000],names=[dataset==='long'?'Cliente de validação com nome e sobrenomes extensos para leitura no celular':'Rafael Almeida','João Lima','Bruno Santos','Rafael Almeida','Mateus Silva','André Costa','Lucas Pereira']
 const entries=descriptions.map((description,index)=>({id:'entry-'+index,commission_cents:amounts[index],status:index<2?'paid':'pending',created_at:from+'T12:00:00-03:00',paid_at:index<2?from+'T15:00:00-03:00':null,description,type:index===3?'product':'service',quantity:1,customer_name:names[index],occurred_at:from+'T'+String(9+index).padStart(2,'0')+':00:00-03:00'}))
 if(dataset==='zero')return {from,to,earned:0,pending:0,paid:0,totalPending:0,services:0,customers:0,preferences,entries:[]}
 return {from,to,earned:entries.reduce((s,e)=>s+e.commission_cents,0),pending:entries.filter(e=>e.status==='pending').reduce((s,e)=>s+e.commission_cents,0),paid:entries.filter(e=>e.status==='paid').reduce((s,e)=>s+e.commission_cents,0),totalPending:14500,services:6,customers:6,preferences,entries}
}
async function capture(page,path,fullPage=false){
 await page.locator('.pro-loading').waitFor({state:'hidden'});await page.evaluate(()=>document.fonts.ready)
 await page.screenshot({path,fullPage,animations:'disabled'})
}
async function checkDonut(dialog){
 const geometry=await dialog.locator('.report-donut-drawing').evaluate(node=>{
  const drawing=node.getBoundingClientRect(),cx=drawing.x+drawing.width/2,cy=drawing.y+drawing.height/2,innerRadius=drawing.width*69.5/200
  return {innerRadius,text:[...node.querySelectorAll('.report-donut-total span,.report-donut-total strong')].map(element=>{const b=element.getBoundingClientRect();return {value:element.textContent,maxRadius:Math.max(...[[b.left,b.top],[b.right,b.top],[b.left,b.bottom],[b.right,b.bottom]].map(([x,y])=>Math.hypot(x-cx,y-cy)))}})}
 })
 for(const text of geometry.text)assert.ok(text.maxRadius<=geometry.innerRadius-1,`Texto ${text.value} invade a faixa da rosca (${text.maxRadius}/${geometry.innerRadius})`)
}
await mkdir('.private/screenshots',{recursive:true})
const results=[]
for(const test of [{name:'compact',engine:chromium,options:{viewport:{width:320,height:740}}},{name:'android',engine:chromium,options:{viewport:{width:390,height:844}}},{name:'tablet',engine:chromium,options:{viewport:{width:768,height:1024}}},{name:'iphone',engine:webkit,options:{...devices['iPhone 13']}},{name:'pc',engine:chromium,options:{viewport:{width:1440,height:1000}}}]) {
 dataset='regular'
 const browser=await test.engine.launch(),context=await browser.newContext({...test.options,locale:'pt-BR',timezoneId:'America/Sao_Paulo'}),page=await context.newPage(),errors=[]
 page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());let data=null
  if(url.pathname==='/api/professional/access')data={profile,administrative:false,choices:[profile]}
  else if(url.pathname==='/api/professional/catalog')data={business:{name:profile.business_name},professionals:[{id:profile.id,name:profile.name,active:true}],services:[],links:[]}
  else if(url.pathname==='/api/professional/snapshot')data=empty
  else if(url.pathname==='/api/professional/cash')data=dataFor(url.searchParams.get('from'),url.searchParams.get('to'))
  else if(url.pathname==='/api/professional/preferences'){
   if(request.method()==='POST'){const input=request.postDataJSON();assert.deepEqual(Object.keys(input.preferences).sort(),['show_goals','visible_cards']);Object.assign(preferences,input.preferences)}data=preferences
  }
  await route.fulfill({json:{data,error:null}})
 })
 try {
  await page.goto(base+'/profissional/caixa');await page.locator('.pro-wallet-balance strong').waitFor();await page.locator('.pro-cash-content[aria-busy=false]').waitFor({state:'attached'});await page.waitForTimeout(1100)
  assert.equal(await page.locator('.pro-wallet-stat').count(),5);assert.equal(await page.locator('.pro-commission-row').count(),3);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  await capture(page,'.private/screenshots/nov06-refined-professional-cash-'+test.name+'.png',true);if(test.name==='pc'){const font=await readFile('public/fonts/space-grotesk-variable.ttf');let html=await page.content();html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replaceAll('/fonts/space-grotesk-variable.ttf','data:font/ttf;base64,'+font.toString('base64'));await writeFile('.private/nov06-refined-professional-wallet-render.html',html)}
  await page.locator('.pro-results-disclosure>summary').click();assert.equal(await page.locator('.pro-results-disclosure').getAttribute('open'),'');await page.getByRole('button',{name:'Ver relatório',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Meu relatório',exact:true});await dialog.waitFor();assert.equal(await dialog.locator('.report-donut').count(),1);assert.match(await dialog.innerText(),/122,00/);assert.match(await dialog.innerText(),/Serviços/);assert.match(await dialog.innerText(),/Produtos/)
  await page.waitForTimeout(450);await capture(page,'.private/screenshots/nov06-refined-professional-report-'+test.name+'.png');await checkDonut(dialog)
  await dialog.getByRole('button',{name:'Período',exact:true}).click();await page.getByRole('dialog',{name:'Escolher período',exact:true}).getByRole('button',{name:'Semana passada',exact:true}).click();await dialog.waitFor();await dialog.getByRole('button',{name:'Fechar',exact:true}).click()
  await page.getByRole('button',{name:'Ver meu progresso',exact:true}).click();dialog=page.getByRole('dialog',{name:'Meu progresso da semana'});await dialog.waitFor();assert.equal(await dialog.getByRole('button',{name:'Ajustar minhas metas',exact:true}).count(),0);await dialog.getByRole('button',{name:'Fechar',exact:true}).click()
  await page.getByRole('button',{name:'Ver todas',exact:false}).click();dialog=page.getByRole('dialog',{name:'Extrato de comissões',exact:true});assert.equal(await dialog.locator('.pro-commission-row').count(),7);await dialog.locator('.pro-commission-row').first().click();await page.getByRole('dialog',{name:'Detalhes da comissão'}).getByRole('button',{name:'Concluir'}).click();await dialog.getByRole('button',{name:'Fechar',exact:true}).click()
  const ledger=page.locator('.pro-commission-ledger')
  await ledger.getByRole('button',{name:'A receber',exact:true}).click();assert.equal(await ledger.locator('.pro-commission-row').count(),3);assert.ok((await ledger.locator('.pro-entry-amount small').allTextContents()).every(value=>value==='A receber'))
  await ledger.getByRole('button',{name:'Ver todas',exact:false}).click();dialog=page.getByRole('dialog',{name:'Extrato de comissões',exact:true});assert.equal(await dialog.locator('.pro-commission-row').count(),5);assert.ok((await dialog.locator('.pro-entry-amount small').allTextContents()).every(value=>value==='A receber'));await dialog.getByRole('button',{name:'Fechar',exact:true}).click()
  await ledger.getByRole('button',{name:'Recebidas',exact:true}).click();assert.equal(await ledger.locator('.pro-commission-row').count(),2);assert.ok((await ledger.locator('.pro-entry-amount small').allTextContents()).every(value=>value==='Recebida'));assert.equal(await ledger.getByRole('button',{name:'Ver todas',exact:false}).count(),0)
  await ledger.getByRole('button',{name:'Todas',exact:true}).click()
  await page.getByRole('button',{name:'Personalizar meu Caixa'}).click();dialog=page.getByRole('dialog',{name:'Personalizar meu Caixa'});assert.equal(await dialog.locator('input[type=number]').count(),0);await dialog.getByRole('switch',{name:'Mostrar metas no Meu Caixa'}).uncheck();await dialog.getByRole('button',{name:'Salvar preferências'}).click();assert.equal(preferences.weekly_commission_goal_cents,30000);await page.locator('.pro-goal-journey').waitFor({state:'hidden'})
  await page.getByRole('link',{name:'Menu',exact:true}).click();await page.getByText('Metas ocultas no Meu Caixa',{exact:true}).waitFor();const link=page.getByRole('link',{name:'Versão web',exact:false});assert.equal(await link.getAttribute('href'),'https://barbearia-machado-rose.vercel.app/profissional');await link.click({trial:true});assert.match(await page.locator('.pro-profile-hero').innerText(),/Toledo Centro/)
  await page.locator('.pro-menu-layout').waitFor();await page.waitForTimeout(450);await capture(page,'.private/screenshots/nov06-refined-professional-menu-'+test.name+'.png',true)
  await page.getByRole('button',{name:'Minhas metas da semana',exact:false}).click();dialog=page.getByRole('dialog',{name:'Personalizar meu Caixa'});await dialog.getByRole('switch',{name:'Mostrar metas no Meu Caixa'}).check();await dialog.getByRole('button',{name:'Salvar preferências'}).click()
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('link',{name:'Meu Caixa',exact:true}).click();await page.getByRole('progressbar',{name:'Meta de comissão',exact:true}).waitFor();assert.equal(await page.locator('.pro-primary-goal .pro-goal-bar>span').evaluate(el=>el.getAnimations().length),0)
  dataset='zero';await page.goto(base+'/profissional/caixa');await page.locator('.pro-wallet-balance strong').waitFor();await page.getByText('Nenhuma comissão neste filtro.',{exact:true}).waitFor();assert.match(await page.locator('.pro-wallet-balance strong').innerText(),/0,00/);assert.equal(await page.locator('.pro-commission-row').count(),0)
  await page.locator('.pro-results-disclosure>summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.pro-results-disclosure').getAttribute('open'),'');assert.ok((await page.locator('.pro-wallet-stat strong').allTextContents()).every(value=>value==='0'||/0,00/.test(value)))
  await page.getByRole('button',{name:'Ver relatório',exact:true}).click();dialog=page.getByRole('dialog',{name:'Meu relatório',exact:true});await dialog.getByText('Ainda não há valores neste período.',{exact:true}).waitFor();assert.equal(await dialog.locator('.report-donut-segment').count(),0);await checkDonut(dialog);await capture(page,'.private/screenshots/nov06-refined-professional-zero-'+test.name+'.png');await dialog.getByRole('button',{name:'Fechar',exact:true}).click()
  dataset='long';await page.goto(base+'/profissional/caixa');await page.getByRole('button',{name:/Corte de cabelo completo, barba e finalização/}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  assert.equal(await ledger.locator('.pro-commission-row').first().evaluate(node=>node.querySelector('.pro-entry-description').getBoundingClientRect().right<=node.querySelector('.pro-entry-amount').getBoundingClientRect().left),true,'Descrição longa não sobrepõe valor')
  await page.locator('.pro-results-disclosure>summary').click();await page.getByRole('button',{name:'Ver relatório',exact:true}).click();dialog=page.getByRole('dialog',{name:'Meu relatório',exact:true});assert.match(await dialog.locator('.report-donut-total strong').innerText(),/1\.234\.567,89/);await checkDonut(dialog);await capture(page,'.private/screenshots/nov06-refined-professional-long-report-'+test.name+'.png')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);results.push({name:test.name,status:'passed',filters:true,zeroValues:true,longDescriptions:true,largeDonutTotal:true,stableScreenshots:true});console.log('PASS '+test.name+': Caixa, relatórios, filtros, metas, ocultação, link web, zeros, textos longos, rosca e movimento reduzido.')
 } catch(error) {await page.screenshot({path:'.private/screenshots/nov06-refined-professional-failure-'+test.name+'.png'});throw error}finally{await browser.close()}
}
await writeFile('.private/nov06-refined-professional-wallet-verification.json',JSON.stringify({date:new Date().toISOString(),fixture:'Somente interceptação de navegador, sem alteração de contas ou dados reais.',results},null,2))

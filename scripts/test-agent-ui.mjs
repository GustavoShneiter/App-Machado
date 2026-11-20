import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { defaultConfig } from '../shared/agent-config.mjs'
import { fixture } from './operations-fixture.mjs'
await mkdir('.private/screenshots',{recursive:true})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try {
 for(const width of [390,768,1440]) {
  const page=await browser.newPage({viewport:{width,height:900},locale:'pt-BR'}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  let config={...defaultConfig(),revision:1}
  await page.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),body=req.postData()?req.postDataJSON():{};let data
   if(url.pathname.includes('get-session'))return route.fulfill({json:{user:{id:'qa',email:'qa@example.invalid'}}})
   if(url.pathname.endsWith('/rpc'))data=body.name==='can_access_admin'?true:fixture
   else if(url.pathname.endsWith('/catalog'))data={services:[],professionals:[],links:[],business:{name:'Machado'}}
   else if(url.pathname.endsWith('/agent/settings')){if(req.method()==='POST'){const {expected_revision,...input}=body;config={...input,revision:expected_revision+1}}data=config}
   else if(url.pathname.endsWith('/agent/status'))data={global_enabled:false,owner:true,runtime:null,integrations:[]}
   else if(url.pathname.endsWith('/agent/activity'))data={items:[]}
   else data={}
   return route.fulfill({json:{data,error:null}})
  })
  await page.goto('http://127.0.0.1:5195/admin/agente')
  await page.getByRole('heading',{name:'Integração pausada',exact:true}).waitFor()
  const choose=async name=>width<=700? page.getByLabel('Configurações',{exact:true}).selectOption({label:name}):page.getByRole('button',{name,exact:true}).click()
  for(const name of ['Visão geral','Atendimento','Confirmações','Lembretes','Aniversário e retorno','Textos','Atividade']) {
   await choose(name)
   assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth>globalThis.innerWidth+1),false,`${width} ${name}: overflow`)
  }
  await choose('Confirmações')
  await page.getByRole('switch',{name:'Confirmar novos agendamentos'}).check()
  await page.getByLabel('Enviar após quantos minutos? (0 = imediatamente)').fill('10')
  await page.getByRole('button',{name:'Salvar configurações',exact:true}).click()
  await page.getByText('Configurações salvas. Envios em andamento podem concluir com a configuração anterior.').waitFor()
  assert.equal(config.confirmation_delay_minutes,10)
  await choose('Aniversário e retorno')
  await page.getByLabel('Dias desde o último atendimento',{exact:true}).fill('20')
  await page.getByRole('button',{name:'Salvar configurações',exact:true}).click()
  await page.getByText('Configurações salvas. Envios em andamento podem concluir com a configuração anterior.').waitFor()
  assert.equal(config.reactivation_days,20)
  await page.screenshot({path:'.private/screenshots/agent-return-'+width+'.png',fullPage:true})
  await choose('Textos')
  await page.getByLabel('Texto (').count().catch(()=>0)
  await page.locator('.agent-content textarea').fill('Olá, {cliente}! Seu horário é {hora}.')
  assert.match(await page.locator('.agent-preview').innerText(),/João.*15:00/)
  await page.screenshot({path:`.private/screenshots/agent-${width}.png`,fullPage:true})
  await choose('Visão geral')
  await page.screenshot({path:'.private/screenshots/agent-overview-'+width+'.png',fullPage:true})
  assert.deepEqual(errors,[])
  await page.close()
 }
 console.log('PASS: 390/768/1440px, seven sections, save delay and template preview; no runtime errors or horizontal overflow.')
}finally{await browser.close()}

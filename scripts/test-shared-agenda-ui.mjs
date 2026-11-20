import {chromium} from '@playwright/test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {fixture} from './operations-fixture.mjs'
const data=globalThis.structuredClone(fixture),today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())
data.appointments=[{...data.appointments[0],id:'qa-first',professional_id:'p1',starts_at:today+'T06:00:00-03:00',ends_at:today+'T06:40:00-03:00',customer_name:'Bruno',service_name:'Corte',status:'confirmed'}, {...data.appointments[0],id:'qa-second',professional_id:'p1',starts_at:today+'T06:00:00-03:00',ends_at:today+'T06:30:00-03:00',customer_name:'Rafael',service_name:'Barba',status:'scheduled',is_additional_service:true}]
data.blocks=[];data.recurringBlocks=[]
const browser=await chromium.launch({headless:true,channel:'chrome'})
await mkdir('.private/screenshots/shared-agenda',{recursive:true})
try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900},timezoneId:'America/Sao_Paulo'}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url()),body=route.request().postData()?route.request().postDataJSON():{};let value={}
   if(url.pathname.includes('get-session'))return route.fulfill({json:{user:{id:'qa',email:'qa@example.invalid'}}})
   if(url.pathname.endsWith('/rpc'))value=body.name==='can_access_admin'?true:data
   else if(url.pathname.endsWith('/catalog'))value={services:[{id:'s1',name:'Corte',price_cents:4000,duration_minutes:40,active:true}],professionals:[{id:'p1',name:'Araújo',active:true}],links:[],business:{name:'Machado'}}
   else if(url.pathname.endsWith('/professional/access'))value={profile:{id:'p1',name:'Araújo',business_name:'Machado'}}
   else if(url.pathname.endsWith('/professional/snapshot'))value=data
   else if(url.pathname.endsWith('/professional/preferences'))value={visible_cards:[],show_goals:false}
   return route.fulfill({json:{data:value,error:null}})
  })
  for(const edition of ['admin','profissional']){
   await page.goto('http://127.0.0.1:5195/'+edition+'/agenda')
   await page.getByRole('button',{name:/Grade de/}).click();
   const events=page.locator('.agenda-event:not(.blocked)');await events.first().waitFor()
   assert.equal(await events.count(),2)
   const first=await events.nth(0).boundingBox(),second=await events.nth(1).boundingBox()
   assert(first.x+first.width<=second.x+1,'Overlapping appointments render in separate lanes')
   assert.match(await events.nth(1).innerText(),/Barba.*Rafael/)
   await page.screenshot({path:'.private/screenshots/shared-agenda/'+edition+'-'+width+'.png',fullPage:true})
   assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth>globalThis.innerWidth+1),false)
   assert.deepEqual(errors,[])
  }
  await page.close()
 }
 console.log('PASS: management/professional agenda, mobile/desktop, simultaneous services in separate lanes, no overflow or runtime errors.')
}finally{await browser.close()}

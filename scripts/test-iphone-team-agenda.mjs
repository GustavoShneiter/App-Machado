import {webkit} from '@playwright/test'
import assert from 'node:assert/strict'
import {fixture} from './operations-fixture.mjs'
const browser=await webkit.launch({headless:true})
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/Sao_Paulo'})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 const pros=['Araújo','Machado','Gustavo'].map((name,i)=>({id:'p'+(i+1),name,active:true}))
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,body=req.postData()?req.postDataJSON():{}
  if(path.includes('get-session'))return route.fulfill({json:{user:{id:'qa',email:'qa@example.invalid'}}})
  let data={}
  if(path.endsWith('/catalog'))data={services:[{id:'s1',name:'Corte',price_cents:4000,duration_minutes:30,active:true}],professionals:pros,links:pros.map(p=>({professional_id:p.id,service_id:'s1'})),business:{name:'Machado'}}
  else if(path.endsWith('/rpc')){
   if(body.name==='can_access_admin')data=true
   else{
    data=globalThis.structuredClone(fixture)
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())
    data.appointments[0].starts_at=`${today}T13:00:00-03:00`;data.appointments[0].ends_at=`${today}T13:30:00-03:00`
   }
  }
  await route.fulfill({json:{data,error:null}})
 })
 await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:5196/admin/agenda')
 await page.getByRole('heading',{name:'Agenda',exact:true}).waitFor()
 await page.getByRole('button',{name:'Selecionar profissionais',exact:true}).click()
 await page.getByRole('button',{name:'Selecionar todos',exact:true}).click()
 await page.getByRole('button',{name:'Ver agendas',exact:true}).click()
 await page.getByRole('button',{name:'Grade de horários',exact:true}).click()
 assert.equal(await page.locator('.agenda-professional-column').count(),3)
 const planIcon=page.locator('.agenda-event .agenda-plan-indicator')
 assert.equal(await planIcon.count(),1,'Package appointment shows its gift indicator')
 const iconBox=await planIcon.boundingBox(),eventBox=await planIcon.locator('xpath=ancestor::button').boundingBox()
 assert(iconBox&&eventBox&&iconBox.x+iconBox.width>=eventBox.x+eventBox.width-28&&iconBox.y<=eventBox.y+6,'Package gift stays at the event top-right corner')
 const board=page.locator('.agenda-board-scroll')
 const dimensions=await board.evaluate(el=>({width:el.clientWidth,total:el.scrollWidth,height:el.clientHeight,inner:el.scrollHeight}))
 assert(dimensions.total>dimensions.width,'Multiple professionals scroll horizontally')
 assert.equal(dimensions.height,dimensions.inner,'Vertical agenda follows page scroll, avoiding nested iOS scroll')
 await board.evaluate(el=>{el.scrollLeft=el.scrollWidth})
 assert(await board.evaluate(el=>el.scrollLeft>0),'All professional columns remain reachable')
 assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth>globalThis.innerWidth),false)
 assert.deepEqual(errors,[])
 await planIcon.scrollIntoViewIfNeeded()
 await page.screenshot({path:'.private/screenshots/iphone-team-agenda.png'})
 console.log('PASS WebKit iPhone: three professionals, horizontal access, page vertical scrolling, no overflow or runtime errors')
}finally{await browser.close()}

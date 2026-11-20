import {chromium} from '@playwright/test'
import assert from 'node:assert/strict'
import {fixture} from './operations-fixture.mjs'
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 let actor='A',holdNext=false,release,releaseObserved,heldStarted
 const held=new Promise(resolve=>{heldStarted=resolve}),finished=new Promise(resolve=>{releaseObserved=resolve})
 const dataFor=unit=>{const data=globalThis.structuredClone(fixture);data.customers.find(c=>c.id==='c2').name='Cliente exclusivo '+unit;data.appointments.find(a=>a.id==='a2').customer_name='Cliente exclusivo '+unit;return data}
 await context.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),body=request.postData()?request.postDataJSON():{},requestActor=actor;let value={}
  if(url.pathname.includes('get-session'))return route.fulfill({json:{user:{id:'owner-'+actor,email:actor.toLowerCase()+'@example.invalid'}}})
  if(url.pathname.endsWith('/auth/sign-in/email')){actor=body.email.startsWith('b')?'B':'A';return route.fulfill({json:{user:{id:'owner-'+actor,email:body.email}}})}
  if(url.pathname.endsWith('/rpc')&&body.name==='office_snapshot'&&holdNext){holdNext=false;await new Promise(resolve=>{release=resolve;heldStarted()});await route.fulfill({json:{data:dataFor(requestActor),error:null}});releaseObserved();return}
  if(url.pathname.endsWith('/rpc'))value=body.name==='can_access_admin'?true:dataFor(actor)
  else if(url.pathname.endsWith('/catalog'))value={services:[],professionals:[{id:'p2',name:'Barbeiro '+actor,active:true}],links:[],business:{name:'Machado '+actor}}
  else if(url.pathname.endsWith('/sheets/automatic/status'))value={owner:true,available:true,needs_authorization:false,has_workbook:true,year:2026}
  return route.fulfill({json:{data:value,error:null}})
 })
 await page.goto('http://127.0.0.1:5195/admin/caixa')
 await page.getByRole('button',{name:'Receber',exact:true}).click()
 await page.getByText('Cliente exclusivo A',{exact:true}).waitFor()
 holdNext=true;await page.evaluate(()=>globalThis.window.dispatchEvent(new globalThis.Event('operations:changed')));await held
 // Another tab changes account while an old-unit response is still in flight.
 const other=await context.newPage();await other.goto('http://127.0.0.1:5195/privacidade');actor='B'
 await other.evaluate(()=>globalThis.localStorage.setItem('machado-native-session-v2-changed','qa-account-change'))
 await page.getByLabel('E-mail',{exact:true}).fill('b@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('qa-password-long')
 await page.getByRole('button',{name:'Entrar',exact:true}).click()
 await page.getByRole('button',{name:'Receber',exact:true}).click();await page.getByText('Cliente exclusivo B',{exact:true}).waitFor()
 release();await finished
 assert.equal(await page.getByText('Cliente exclusivo A',{exact:true}).count(),0,'Late old-unit response is discarded')
 assert.equal(await page.getByText('Cliente exclusivo B',{exact:true}).count(),1,'Only the newly authenticated unit remains visible')
 assert.deepEqual(errors,[])
 console.log('PASS: account change closes previous-unit dialogs, reauthenticates, clears data and rejects a delayed previous-unit response.')
}finally{await browser.close()}

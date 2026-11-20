import {chromium} from '@playwright/test'
import assert from 'node:assert/strict'
import {fixture} from './operations-fixture.mjs'
import {mkdir} from 'node:fs/promises'
await mkdir('.private/screenshots/receipt-units',{recursive:true})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),body=req.postData()?req.postDataJSON():{};let data={}
   if(url.pathname.includes('get-session'))return route.fulfill({json:{user:{id:'unit-owner-a',email:'unit-a@example.invalid'}}})
   if(url.pathname.endsWith('/rpc'))data=body.name==='can_access_admin'?true:fixture
   else if(url.pathname.endsWith('/catalog'))data={services:[],professionals:[],links:[],business:{name:'Machado Unidade A'}}
   else if(url.pathname.endsWith('/sheets/settings'))data={owner:true,connections:[],connection:null,catalog:[]}
   else if(url.pathname.endsWith('/sheets/automatic/status'))data={owner:true,available:true,google_email:null,needs_authorization:true,has_workbook:false,year:2026}
   else if(url.pathname.endsWith('/sheets/automatic/authorize')){assert.equal(req.headers()['x-machado-account'],'unit-owner-a');data={url:'https://script.google.com/macros/s/qa-installer/exec?setup=qa-unit-a'}}
   return route.fulfill({json:{data,error:null}})
  })
  await page.goto('http://127.0.0.1:5195/admin/relatorios')
  await page.getByRole('button',{name:/Planilha de caixa/}).click()
  await page.getByRole('button',{name:'Conectar minha conta Google',exact:true}).click()
  const link=page.getByRole('link',{name:'Autorizar e criar planilha',exact:true});await link.waitFor()
  assert.match(await link.getAttribute('href'),/qa-unit-a$/)
  assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth>globalThis.innerWidth+1),false)
  await page.screenshot({path:'.private/screenshots/receipt-units/google-setup-'+width+'.png',fullPage:true,animations:'disabled'})
  assert.deepEqual(errors,[]);await page.close()
 }
 console.log('PASS: new-unit Google setup is explicit, owner-scoped and legible at mobile/desktop widths; no overflow or runtime errors.')
}finally{await browser.close()}

import {chromium} from '@playwright/test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {fixture} from './operations-fixture.mjs'
const browser=await chromium.launch({headless:true,channel:'chrome'})
await mkdir('.private/screenshots/receipt-units',{recursive:true})
try{
 for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900},locale:'pt-BR'}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  const data=globalThis.structuredClone(fixture)
  data.customers.find(c=>c.id==='c2').name='Cliente de novo teste com sobrenome comprido'
  data.appointments.find(a=>a.id==='a2').customer_name='Cliente de novo teste com sobrenome comprido'
  await page.route('**/api/**',async route=>{
   const request=route.request(),url=new URL(request.url()),body=request.postData()?request.postDataJSON():{};let value={}
   if(url.pathname.includes('get-session'))return route.fulfill({json:{user:{id:'qa',email:'qa@example.invalid'}}})
   if(url.pathname.endsWith('/rpc'))value=body.name==='can_access_admin'?true:data
   else if(url.pathname.endsWith('/sheets/automatic/status'))value={owner:true,available:true,needs_authorization:false,has_workbook:true,year:2026}
   else if(url.pathname.endsWith('/catalog'))value={services:[],professionals:[{id:'p2',name:'Gustavo',active:true}],links:[],business:{name:'Machado'}}
   return route.fulfill({json:{data:value,error:null}})
  })
  await page.goto('http://127.0.0.1:5195/admin/caixa')
  await page.getByRole('button',{name:'Receber',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Receber de clientes'});await dialog.waitFor()
  const name=dialog.locator('.money-copy strong'),action=dialog.getByRole('button',{name:'Receber',exact:true})
  const textBox=await name.boundingBox(),buttonBox=await action.boundingBox()
  assert(textBox.width>=90,'Client text retains a readable width')
  assert(textBox.height<130,'Client name does not collapse to a vertical letter column')
  assert(buttonBox.width>=90&&buttonBox.height>=44)
  assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth>globalThis.innerWidth+1),false)
  await page.screenshot({path:'.private/screenshots/receipt-units/receive-'+width+'.png',fullPage:true,animations:'disabled'})
  assert.deepEqual(errors,[])
  await page.close()
 }
 console.log('PASS: pending receipts at 320/390/768/1440px, long names readable, action width/touch targets, no overflow or runtime errors.')
}finally{await browser.close()}

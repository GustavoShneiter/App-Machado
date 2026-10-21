import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {transaction,pool} from '../server/db.mjs'

const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const account=JSON.parse(await readFile('.private/qa-account.json','utf8'))
const tag=`QA Ajustes ${Date.now()}`
const names={professional:`${tag} profissional`,service:`${tag} corte`,product:`${tag} pomada`,customer:`${tag} cliente`}
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:390,height:844}})
const errors=[];page.on('pageerror',error=>errors.push(error.message))
let token
async function rpc(name,params={}){
  const response=await fetch(`${base}/api/rpc`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`,origin:new URL(base).origin},body:JSON.stringify({name,params})})
  const result=await response.json();assert.equal(response.status,200,result.error?.message);return result.data
}
try{
  const login=await fetch(`${base}/api/auth/sign-in/email`,{method:'POST',headers:{'content-type':'application/json',origin:new URL(base).origin},body:JSON.stringify({email:account.email,password:account.password})})
  assert.equal(login.status,200);token=login.headers.get('set-auth-token');assert.ok(token)
  const professional=(await rpc('save_professional_profile',{payload:{name:names.professional,active:true}})).id
  await page.goto(`${base}/admin`)
  await page.getByLabel('E-mail',{exact:true}).fill(account.email)
  await page.getByLabel('Senha',{exact:true}).fill(account.password)
  await page.getByRole('button',{name:'Entrar',exact:true}).click()
  await page.getByRole('heading',{name:'Visão geral',exact:true}).waitFor()

  await page.goto(`${base}/admin/servicos`)
  await page.getByRole('button',{name:'Novo serviço',exact:true}).click()
  let dialog=page.getByRole('dialog')
  await dialog.getByLabel('Nome',{exact:true}).fill(names.service)
  await dialog.getByLabel('Preço (R$)',{exact:true}).fill('40')
  await dialog.getByLabel('Percentual padrão (%)',{exact:true}).fill('50')
  await dialog.getByLabel(`${names.professional} (%)`,{exact:true}).fill('60')
  await dialog.getByRole('button',{name:'Salvar serviço',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  let catalog=await (await page.request.get(`${base}/api/catalog`)).json()
  const service=catalog.data.services.find(row=>row.name===names.service)
  assert.ok(service);assert.equal(Number(service.default_commission_percent),50)
  assert.equal(Number(catalog.data.links.find(row=>row.service_id===service.id && row.professional_id===professional).commission_percent),60)
  await page.getByRole('button',{name:`Editar ${names.service}`,exact:true}).click()
  assert.equal(await page.getByRole('dialog').getByLabel(`${names.professional} (%)`,{exact:true}).inputValue(),'60')
  await page.getByRole('dialog').getByRole('button',{name:'Fechar',exact:true}).click()

  await page.goto(`${base}/admin/produtos`)
  await page.getByRole('button',{name:'Novo produto',exact:true}).click()
  dialog=page.getByRole('dialog')
  await dialog.getByLabel('Nome',{exact:true}).fill(names.product)
  await dialog.getByLabel('Venda (R$)',{exact:true}).fill('35')
  await dialog.getByLabel('Percentual padrão (%)',{exact:true}).fill('20')
  await dialog.getByLabel(`${names.professional} (%)`,{exact:true}).fill('30')
  await dialog.getByRole('button',{name:'Salvar produto',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  let snapshot=await rpc('office_snapshot')
  const product=snapshot.products.find(row=>row.name===names.product)
  assert.ok(product);assert.equal(Number(product.commission_percent),20);assert.equal(product.commissions[professional],30)
  await rpc('office_action',{action:'adjust_stock',payload:{id:product.id,delta:10,notes:tag}})
  const command=(await rpc('open_manual_command',{customer_name:names.customer,customer_phone:'4500000630'})).id
  await rpc('add_service_to_command',{command_id:command,service_id:service.id,professional_id:professional})
  await rpc('add_product_to_command',{command_id:command,product_id:product.id,item_quantity:2,professional_id:professional})
  await rpc('mark_command_ready',{command_id:command})
  snapshot=await rpc('office_snapshot')
  const items=snapshot.items.filter(item=>item.command_id===command)
  assert.equal(items.reduce((sum,item)=>sum+item.commission_cents,0),4500)
  await page.goto(`${base}/admin/caixa`)
  const ready=page.locator('.ready-receipts .record-row').filter({hasText:names.customer})
  await ready.waitFor()
  assert.ok((await ready.innerText()).includes('60%'));assert.ok((await ready.innerText()).includes('30%'))
  assert.match(await ready.innerText(),/Barbearia: R\$\s*65,00/)
  await page.getByRole('button',{name:/Valores a repassar/}).click()
  const payout=page.locator('.payout-row').filter({hasText:names.professional})
  assert.match(await payout.innerText(),/45,00/)
  await page.screenshot({path:'.private/screenshots/caixa-comissoes-verificadas.png',fullPage:true})

  await page.goto(`${base}/admin/clientes`)
  await page.getByRole('button',{name:`Editar ${names.customer}`,exact:true}).click()
  page.once('dialog',async confirmation=>{assert.ok(confirmation.message().includes('definitivamente'));await confirmation.accept()})
  await page.getByRole('dialog').getByRole('button',{name:'Excluir cliente',exact:true}).click()
  await page.getByRole('dialog').waitFor({state:'hidden'})
  snapshot=await rpc('office_snapshot')
  assert.ok(!snapshot.customers.some(row=>row.name===names.customer))
  assert.ok(!snapshot.commands.some(row=>row.id===command))
  assert.ok(!snapshot.commissions.some(row=>items.some(item=>item.id===row.command_item_id)))
  assert.deepEqual(errors,[])
  console.log('PASS navegador → API → Neon: comissão por serviço/produto salva e reaberta, quantidade, valores no Caixa e exclusão definitiva do cliente e seus registros.')
}catch(error){await page.screenshot({path:'.private/screenshots/falha-ajustes.png',fullPage:true});throw error}
finally{
  await browser.close()
  await transaction(account.id,async client=>{
    for(const [table,name,fn,arg] of [['customers',names.customer,'delete_customer_record','customer_id'],['services',names.service,'delete_service_record','service_id'],['products',names.product,'delete_product_record','product_id'],['professionals',names.professional,'delete_professional_record','professional_id']]){
      const found=(await client.query(`select id from public.${table} where name=$1`,[name])).rows
      for(const row of found)await client.query(`select public.${fn}(${arg} => $1)`,[row.id])
    }
  })
  await pool.end()
}

import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
const browser=await chromium.launch({headless:true})
try{
 for(const viewport of [{width:360,height:640},{width:390,height:360},{width:1280,height:900}]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:5188/__qa')
  for(const kind of ['Criar encaixe','Bloquear agenda']){
   await page.locator('.mobile-create').click()
   await page.getByRole('dialog').getByRole('button',{name:kind,exact:true}).click()
   const dialog=page.getByRole('dialog',{name:kind,exact:true})
   if(kind==='Criar encaixe')await dialog.getByLabel('Horário do encaixe').fill('09:15')
   if(kind==='Bloquear agenda'){
    await dialog.getByLabel('Período',{exact:true}).selectOption('week')
    const a=await dialog.getByLabel('Início do bloqueio').inputValue(),b=await dialog.getByLabel('Fim do bloqueio').inputValue()
    assert.equal((new Date(b)-new Date(a))/86400000,7)
    await dialog.getByLabel('Tipo de bloqueio').selectOption('recurring')
    await dialog.getByLabel('Repetir por',{exact:true}).selectOption('always')
    assert.equal(await dialog.getByLabel('Último dia da recorrência').count(),0)
   }
   await page.waitForTimeout(250)
   const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1)
   const save=dialog.getByRole('button',{name:kind==='Criar encaixe'?'Salvar agendamento':'Salvar bloqueio',exact:true})
   await save.scrollIntoViewIfNeeded();await save.click({trial:true})
   assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false)
   await dialog.getByRole('button',{name:'Fechar',exact:true}).click()
   console.log(`PASS ${kind}: ${viewport.width}x${viewport.height}, cabeçalho e botão acessíveis, sem estouro horizontal.`)
  }
  assert.deepEqual(errors,[]);await page.close()
 }
}finally{await browser.close()}

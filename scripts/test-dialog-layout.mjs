import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'

const browser=await chromium.launch({headless:true})
await mkdir('.private/screenshots',{recursive:true})
try{
  for(const viewport of [{width:390,height:844},{width:360,height:640},{width:390,height:360},{width:1280,height:900}]){
    const page=await browser.newPage({viewport})
    const errors=[];page.on('pageerror',error=>errors.push(error.message))
    for(const [section,newButton,title,submit] of [
      ['Clientes','Novo cliente','Novo cliente','Salvar cliente'],
      ['Serviços','Novo serviço','Novo serviço','Salvar serviço'],
      ['Produtos e estoque','Novo produto','Produto','Salvar produto'],
      ['Profissionais','Novo profissional','Novo profissional','Salvar profissional'],
      ['Pacotes','Novo pacote','Novo pacote','Salvar pacote'],
    ]){
      await page.goto('http://127.0.0.1:5188/__qa')
      if(section==='Clientes') await page.getByRole('link',{name:'Clientes',exact:true}).last().click()
      else{
        if(viewport.width>900 && section!=='Pacotes') await page.locator('.sidebar').getByRole('link',{name:section==='Produtos e estoque'?'Produtos':section,exact:true}).click()
        else {
          await page.getByRole('link',{name:viewport.width>900?'Configurações':'Menu',exact:true}).last().click()
          // Menu cards include a descriptive subtitle.
          await page.locator('.menu-shortcuts a').filter({hasText:section}).click()
        }
      }
      await page.getByRole('button',{name:newButton,exact:true}).click()
      const dialog=page.getByRole('dialog',{name:title,exact:true})
      await dialog.waitFor()
      await page.waitForTimeout(260)
      const box=await dialog.boundingBox()
      assert.ok(box.y>=0 && box.x>=0 && box.y+box.height<=viewport.height+1 && box.x+box.width<=viewport.width+1,`${title}: caixa fora da tela ${JSON.stringify(box)}`)
      assert.equal(await dialog.evaluate(element=>globalThis.document.body.contains(element) && element.closest('.section-transition')===null),true)
      const close=dialog.getByRole('button',{name:'Fechar',exact:true})
      await close.click({trial:true})
      const save=dialog.getByRole('button',{name:submit,exact:true})
      await save.scrollIntoViewIfNeeded()
      await save.click({trial:true})
      const visible=await save.boundingBox()
      assert.ok(visible.y+visible.height<=viewport.height+1,`${title}: botão escondido`)
      await save.click()
      assert.ok(await dialog.getByRole('alert').count()>0,`${title}: erro de validação não apareceu`)
      assert.equal(await dialog.evaluate(element=>element.scrollWidth>element.clientWidth+1),false,`${title}: rolagem horizontal`)
      if(section==='Serviços'){
        await dialog.getByLabel('Nome',{exact:true}).fill('Corte QA')
        await dialog.getByLabel('Percentual padrão (%)',{exact:true}).fill('50')
        await dialog.getByLabel('Araújo (%)',{exact:true}).fill('60')
        await dialog.getByLabel('Machado (%)',{exact:true}).fill('0')
        assert.equal(await dialog.getByLabel('Araújo (%)',{exact:true}).inputValue(),'60')
        assert.equal(await dialog.getByLabel('Machado (%)',{exact:true}).inputValue(),'0')
      }
      await page.screenshot({path:`.private/screenshots/dialog-${section.split(' ')[0]}-${viewport.width}x${viewport.height}.png`})
      await close.click()
      assert.equal(await page.getByRole('dialog').count(),0)
      console.log(`PASS formulário ${section}: ${viewport.width}x${viewport.height}, campos e botões acessíveis, validação dentro da tela.`)
    }
    assert.deepEqual(errors,[])
    await page.close()
  }
}finally{await browser.close()}

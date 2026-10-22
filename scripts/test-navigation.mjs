import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'

const browser=await chromium.launch({headless:true})
await mkdir('.private/screenshots',{recursive:true})
try{
  const page=await browser.newPage({viewport:{width:390,height:844}})
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  for(const count of [2,5,9]){
    await page.goto(`http://127.0.0.1:5188/__qa?professionals=${count}`)
    const professionals=page.locator('.agenda-professionals')
    await professionals.locator('button').last().waitFor()
    assert.equal(await professionals.locator('button').count(),count)
    const alignment=await professionals.evaluate(element=>{
      const container=element.getBoundingClientRect()
      const rows=new Map()
      for(const button of element.querySelectorAll('button')){
        const box=button.getBoundingClientRect();const key=Math.round(box.y)
        const row=rows.get(key)??[];row.push({x:box.x,right:box.right});rows.set(key,row)
        const photo=button.querySelector('img,span').getBoundingClientRect()
        const name=button.querySelector('small').getBoundingClientRect()
        if(Math.abs(photo.x+photo.width/2-name.x-name.width/2)>1)return false
      }
      return [...rows.values()].every(row=>Math.abs((Math.min(...row.map(box=>box.x))+Math.max(...row.map(box=>box.right)))/2-container.x-container.width/2)<2)
    })
    assert.equal(alignment,true,`Grupo desalinhado com ${count} profissionais`)
    assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth>globalThis.innerWidth),false)
    await page.screenshot({animations:'disabled',path:`.private/screenshots/agenda-119-ajustada-${count}-profissionais.png`,fullPage:true})
    console.log(`PASS Agenda: ${count} profissionais, fotos e nomes centralizados em todas as linhas.`)
  }
  await page.goto('http://127.0.0.1:5188/__qa')
  const nav=page.getByRole('navigation',{name:'Navegação principal'})
  await nav.waitFor()
  assert.equal(await nav.locator('.mobile-nav-agenda').count(),0)
  const durations=await nav.locator('.mobile-nav-highlight').evaluate(element=>globalThis.getComputedStyle(element).transitionDuration)
  assert.ok(durations.includes('0.42s'))
  for(const name of ['Caixa','Comandas','Agenda','Clientes','Menu']){
    await nav.getByRole('link',{name,exact:true}).click()
    await page.waitForTimeout(460)
    assert.equal(await nav.locator('a.active').count(),1)
    assert.equal(await nav.locator('a.active').innerText(),name)
    const active=await nav.locator('a.active').boundingBox()
    const background=await nav.locator('.mobile-nav-highlight').boundingBox()
    assert.ok(Math.abs(active.x-background.x)<2 && Math.abs(active.width-background.width)<2,`Fundo fora do item ${name}`)
    const icon=await nav.locator('a.active svg').evaluate(element=>({background:globalThis.getComputedStyle(element).backgroundColor,width:element.getBoundingClientRect().width}))
    assert.equal(icon.width,22)
    assert.equal(icon.background,'rgba(0, 0, 0, 0)')
    await page.screenshot({animations:'disabled',path:`.private/screenshots/nav-119-ajustada-${name.toLowerCase()}.png`,fullPage:true})
  }
  await page.emulateMedia({reducedMotion:'reduce'})
  assert.ok(parseFloat(await nav.locator('.mobile-nav-highlight').evaluate(element=>globalThis.getComputedStyle(element).transitionDuration))<=0.001)
  assert.deepEqual(errors,[])
  console.log('PASS navegação: cinco seções, fundo dourado acompanhando o item ativo, Agenda com ícone normal e movimento reduzido respeitado.')
}finally{await browser.close()}

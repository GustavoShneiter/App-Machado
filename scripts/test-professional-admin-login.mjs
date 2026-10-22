/* global document, window */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile,writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { pool,transaction } from '../server/db.mjs'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173'
const owner=JSON.parse(await readFile('.private/qa-account.json','utf8'))
const browser=await chromium.launch(),contexts=[],created=[]
const tag=randomUUID().slice(0,8)
const makeContext=async()=>{const value=await browser.newContext({viewport:{width:390,height:844}});contexts.push(value);return value}
try {
  const admin=await makeContext()
  const signed=await admin.request.post(base+'/api/auth/sign-in/email',{data:{email:owner.email,password:owner.password},headers:{Origin:new URL(base).origin,'x-forwarded-for':'198.51.100.71'}})
  assert.equal(signed.status(),200)
  const page=await admin.newPage()
  await page.goto(base+'/admin/profissionais')
  for(const name of ['Um','Dois']) {
    const email=`qa.ui.${name.toLowerCase()}.${tag}@example.invalid`,password='QA-definida-'+randomUUID()
    await page.getByRole('button',{name:'Novo profissional',exact:true}).click()
    let dialog=page.getByRole('dialog',{name:'Novo profissional',exact:true})
    await dialog.getByLabel('Nome',{exact:true}).fill(`QA Login ${name} ${tag}`)
    await dialog.getByLabel('Ativo no agendamento',{exact:true}).uncheck()
    await dialog.getByLabel('E-mail de login',{exact:true}).fill(email)
    await dialog.getByLabel('Senha de login',{exact:true}).fill(password)
    await dialog.getByLabel('Confirmar senha de login',{exact:true}).fill(password)
    const [response]=await Promise.all([page.waitForResponse(res=>res.url().endsWith('/api/rpc')&&res.request().postDataJSON()?.name==='save_professional_profile'),dialog.getByRole('button',{name:'Salvar profissional',exact:true}).click()])
    const result=await response.json()
    if(result.data?.id)created.push({id:result.data.id,name:`QA Login ${name} ${tag}`,email,password})
    assert.equal(response.status(),200)
    dialog=page.getByRole('dialog',{name:'Acesso profissional criado',exact:true});await dialog.waitFor()
    assert.equal(await dialog.getByLabel('E-mail de login',{exact:true}).inputValue(),email)
    assert.equal(await dialog.getByLabel('Senha definida',{exact:true}).inputValue(),password)
    assert.equal(await dialog.getByLabel('Site dos profissionais · Android e iPhone',{exact:true}).inputValue(),'https://barbearia-machado-rose.vercel.app/profissional')
    await dialog.getByRole('button',{name:'Fechar',exact:true}).click()
  }
  const first=created[0],row=page.locator('.profile-row').filter({hasText:first.name})
  await row.getByRole('button',{name:'Editar',exact:true}).click()
  let dialog=page.getByRole('dialog',{name:'Editar profissional',exact:true})
  await dialog.getByLabel('E-mail de login',{exact:true}).waitFor()
  assert.equal(await dialog.getByLabel('E-mail de login',{exact:true}).inputValue(),first.email)
  assert.equal(await dialog.getByLabel('Nova senha',{exact:true}).inputValue(),'')
  first.email=`qa.ui.editado.${tag}@example.invalid`;first.password='QA-alterada-'+randomUUID()
  await dialog.getByLabel('E-mail de login',{exact:true}).fill(first.email)
  await dialog.getByLabel('Nova senha',{exact:true}).fill(first.password)
  await dialog.getByLabel('Confirmar senha de login',{exact:true}).fill(first.password)
  await dialog.getByRole('button',{name:'Salvar acesso',exact:true}).click()
  const confirmation=page.getByRole('dialog',{name:'Acesso atualizado',exact:true});await confirmation.waitFor()
  assert.equal(await confirmation.getByLabel('E-mail de login',{exact:true}).inputValue(),first.email)
  await confirmation.getByRole('button',{name:'Fechar',exact:true}).click()
  assert.equal(await dialog.getByLabel('Nova senha',{exact:true}).inputValue(),'')
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))
  await page.screenshot({path:'.private/screenshots/admin-professional-login-edit.png',fullPage:true})
  await dialog.getByRole('button',{name:'Fechar',exact:true}).click()
  await transaction(owner.id,async client=>{for(const pro of created)await client.query('update professionals set active=true where id=$1',[pro.id])})
  for(const pro of created) {
    const context=await makeContext(),ownPage=await context.newPage()
    await ownPage.goto(base+'/profissional')
    await ownPage.getByLabel('E-mail de acesso',{exact:true}).fill(pro.email)
    await ownPage.getByLabel('Senha',{exact:true}).fill(pro.password)
    await ownPage.getByRole('button',{name:'Entrar',exact:true}).click()
    await ownPage.getByRole('heading',{name:'Minha Agenda',exact:true}).waitFor()
    assert.equal(new URL(ownPage.url()).pathname,'/profissional/agenda')
    assert.ok((await ownPage.locator('.pro-header-identity').innerText()).includes(pro.name))
    await ownPage.getByRole('button',{name:'Minha conta',exact:true}).click()
    const accountDialog=ownPage.getByRole('dialog',{name:'Minha conta profissional',exact:true})
    assert.equal(await accountDialog.getByLabel('E-mail de acesso',{exact:true}).inputValue(),pro.email)
    const access=await context.request.get(base+'/api/professional/catalog')
    assert.deepEqual((await access.json()).data.professionals.map(p=>p.id),[pro.id])
    await accountDialog.getByRole('button',{name:'Sair da conta',exact:true}).click()
    await ownPage.getByRole('heading',{name:'Entre na sua conta',exact:true}).waitFor()
  }
  await writeFile('.private/professional-admin-ui-verification.json',JSON.stringify({date:new Date().toISOString(),base,status:'passed',checks:['create-admin-chosen-login','edit-email-password-in-app','common-site-two-logins','own-account-email','own-catalog-only','logout','compact-dialog']},null,2))
  console.log('PASS UI: administrador cria dois logins, edita e-mail e senha; ambos entram no mesmo site e veem somente a própria conta. Saída da conta conferida.')
} finally {
  await transaction(owner.id,async client=>{for(const pro of created)await client.query('select delete_professional_record($1)',[pro.id])})
  for(const context of contexts)await context.close()
  await browser.close();await pool.end()
}

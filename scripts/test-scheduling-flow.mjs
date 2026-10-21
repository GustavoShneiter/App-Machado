import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {transaction,pool} from '../server/db.mjs'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173'
const account=JSON.parse(await readFile('.private/qa-account.json','utf8'))
const tag=`QA Nova Agenda ${Date.now()}`
const names={professional:tag+' barbeiro',service:tag+' serviço',customer:tag+' cliente',fit:tag+' encaixe',product:tag+' produto'}
const date=new Date();date.setDate(date.getDate()+2)
const day=date.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})
const isoDay=((new Date(day+'T12:00:00Z').getUTCDay()+6)%7)+1
const weekdayLabels=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844}})
const errors=[];page.on('pageerror',e=>errors.push(e.message))
let token
async function rpc(name,params={}){
 const response=await fetch(base+'/api/rpc',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`,origin:new URL(base).origin},body:JSON.stringify({name,params})})
 const result=await response.json();assert.equal(response.status,200,result.error?.message);return result.data
}
try{
 await mkdir('.private/screenshots',{recursive:true})
 const login=await fetch(base+'/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json',origin:new URL(base).origin},body:JSON.stringify({email:account.email,password:account.password})})
 assert.equal(login.status,200);token=login.headers.get('set-auth-token');assert.ok(token)
 const professional=(await rpc('save_professional_profile',{payload:{name:names.professional}})).id
 const service=(await rpc('save_service_profile',{payload:{name:names.service,price:5000,duration:40,commission_mode:'professional'}})).id
 await page.goto(base+'/admin');await page.getByLabel('E-mail',{exact:true}).fill(account.email);await page.getByLabel('Senha',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('heading',{name:'Visão geral',exact:true}).waitFor()
 await page.goto(base+'/admin/profissionais')
 await page.locator('.profile-row').filter({hasText:names.professional}).getByRole('button',{name:'Editar',exact:true}).click()
 let dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Configurar comissões'}).click()
 await dialog.getByLabel('Comissão em serviços (%)').fill('70');await dialog.getByLabel('Comissão em produtos (%)').fill('25');await dialog.getByRole('button',{name:'Salvar profissional'}).click();await dialog.waitFor({state:'hidden'})
 const catalog=await(await page.request.get(base+'/api/catalog')).json(),pro=catalog.data.professionals.find(row=>row.id===professional)
 assert.equal(Number(pro.default_commission_percent),70);assert.equal(Number(pro.default_product_commission_percent),25)

 await page.goto(base+'/admin/agenda');await page.locator('.agenda-professionals button').filter({hasText:names.professional}).click();await page.getByLabel('Data da agenda').fill(day)
 const times=await page.locator('.agenda-time-axis time').allTextContents();assert.deepEqual(times.slice(0,3),['06:00','06:40','07:20']);assert.equal(times.at(-1),'23:00')
 await page.locator('.mobile-create').click();dialog=page.getByRole('dialog',{name:'Opções da Agenda'});await dialog.getByRole('button',{name:'Bloquear agenda',exact:true}).click()
 dialog=page.getByRole('dialog',{name:'Bloquear agenda',exact:true});await dialog.getByLabel('Tipo de bloqueio').selectOption('recurring')
 assert.equal(await dialog.getByLabel('Profissional',{exact:true}).inputValue(),professional)
 assert.equal(await dialog.getByLabel('A partir de').inputValue(),day)
 await dialog.getByLabel(weekdayLabels[isoDay-1],{exact:true}).check();await dialog.getByLabel('Das',{exact:true}).fill('07:00');await dialog.getByLabel('Até',{exact:true}).fill('08:00')
 await dialog.getByLabel('Motivo (opcional)').fill(tag+' pausa');await dialog.getByRole('button',{name:'Salvar bloqueio'}).click();await dialog.waitFor({state:'hidden'})
 let snap=await rpc('office_snapshot');assert.ok(snap.recurringBlocks.some(rule=>rule.professional_id===professional))
 const slots=await rpc('public_booking_slots',{chosen_service:service,booking_day:day,preferred_professional:professional});assert.equal(slots.find(slot=>slot.slot_time.startsWith('07:20')).available,false);assert.equal(slots.find(slot=>slot.slot_time.startsWith('08:00')).available,true)
 await page.getByRole('button',{name:'Abrir opções às 08:40',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Criar encaixe',exact:true}).click()
 dialog=page.getByRole('dialog',{name:'Criar encaixe',exact:true});await dialog.getByLabel('Cliente',{exact:true}).fill(names.fit);await dialog.getByLabel('WhatsApp',{exact:true}).fill('4500000713');await dialog.getByLabel('Serviço',{exact:true}).selectOption(service);await dialog.getByLabel('Horário do encaixe').fill('08:45');await dialog.getByLabel('Duração do encaixe (minutos)').fill('15');await dialog.getByRole('button',{name:'Salvar agendamento'}).click();await dialog.waitFor({state:'hidden'})
 snap=await rpc('office_snapshot');const fit=snap.appointments.find(row=>row.customer_name===names.fit);assert.ok(fit?.is_fit_in);assert.equal((new Date(fit.ends_at)-new Date(fit.starts_at))/60000,15)
 const command=snap.commands.find(row=>row.appointment_id===fit.id);assert.equal(snap.items.find(item=>item.command_id===command.id).commission_cents,3500)
 await page.getByRole('button',{name:'Bloqueios',exact:true}).click();dialog=page.getByRole('dialog',{name:'Bloqueios da agenda'});assert.ok((await dialog.innerText()).includes(tag+' pausa'));await dialog.getByRole('button',{name:'Fechar',exact:true}).click()
 await page.screenshot({path:'.private/screenshots/agenda-40-encaixe-bloqueio.png',fullPage:true,animations:'disabled'})

 // Existing /agendar links must show the entrance before the booking flow.
 await page.goto(base+'/agendar');await page.getByRole('heading',{name:'Como podemos te atender?'}).waitFor();assert.ok((await page.getByRole('link',{name:/WhatsApp Fale/}).getAttribute('href')).startsWith('https://wa.me/55'))
 await page.getByRole('link',{name:/Agendamento Reserve/}).click();await page.getByRole('heading',{name:'Escolha seu serviço'}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Continuar',exact:true}).count(),0)
 await page.locator('.service-options button').filter({hasText:names.service}).click();await page.getByRole('heading',{name:'Preferência de profissional'}).waitFor();await page.locator('.professional-card').filter({hasText:names.professional}).click();await page.getByRole('heading',{name:'Escolha o horário'}).waitFor()
 await page.getByLabel('Escolha uma data').fill(day,{force:true});await page.locator('.slots button:not([disabled])').first().waitFor()
 await page.locator('.slots button').filter({hasText:'08:00'}).click();await page.getByRole('heading',{name:'Agora, seus dados'}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Continuar',exact:true}).count(),0)
 await page.getByLabel('Nome completo').fill(names.customer);await page.getByLabel('WhatsApp',{exact:true}).fill('4500000714');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirmar agendamento',exact:true}).click();await page.getByRole('heading',{name:'Até breve!'}).waitFor()
 snap=await rpc('office_snapshot');assert.ok(snap.appointments.some(a=>a.customer_name===names.customer&&a.professional_id===professional))
 assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth>globalThis.innerWidth),false);assert.deepEqual(errors,[])
 console.log('PASS navegador/API/banco: comissão no perfil, menu pelo + e espaço vago, grade 40 minutos, recorrência, encaixe e reserva pública com avanço automático e landing de entrada.')
}catch(error){await page.screenshot({path:'.private/screenshots/falha-nova-agenda.png',fullPage:true});throw error}
finally{
 await browser.close()
 await transaction(account.id,async client=>{
   for(const name of [names.customer,names.fit])for(const row of (await client.query('select id from customers where name=$1',[name])).rows)await client.query('select delete_customer_record($1)',[row.id])
   for(const row of (await client.query('select id from professionals where name=$1',[names.professional])).rows)await client.query('select delete_professional_record($1)',[row.id])
   for(const row of (await client.query('select id from services where name=$1',[names.service])).rows)await client.query('select delete_service_record($1)',[row.id])
 })
 await pool.end()
}

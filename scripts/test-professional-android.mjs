import assert from 'node:assert/strict'
import { readFile,writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
const adb=process.env.ADB_PATH||'C:/Users/gusta/AppData/Local/Android/Sdk/platform-tools/adb.exe'
const device=process.env.ANDROID_DEVICE||'emulator-5554'
const app='com.barbeariamachado.profissional'
const apk='../entrega/Profissionais/Machado-Profissional-v1.0.0.apk'
const run=(args,binary=false)=>{const result=spawnSync(adb,['-s',device,...args],{encoding:binary?undefined:'utf8',timeout:30000,maxBuffer:12*1024*1024});assert.equal(result.status,0,'Falha ao operar o Android de teste.');return result.stdout}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
function tree(){run(['shell','uiautomator','dump','/sdcard/machado-professional-qa.xml']);return run(['shell','cat','/sdcard/machado-professional-qa.xml'])}
async function waitFor(value){const values=Array.isArray(value)?value:[value];for(let i=0;i<12;i++){try{const xml=tree();if(values.some(text=>xml.includes(text)))return xml}catch{/* Wait for the WebView to settle before reading accessibility. */}await delay(1000)}throw new Error('Android não apresentou a tela esperada: '+values.join(' / '))}
function tap(node){const b=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert.ok(b);run(['shell','input','tap',String(Math.floor((+b[1]+ +b[3])/2)),String(Math.floor((+b[2]+ +b[4])/2))])}
function button(xml,text){const node=(xml.match(/<node\b[^>]*>/g)||[]).find(value=>value.includes(`text="${text}"`)||value.includes(`content-desc="${text}"`));assert.ok(node,'Botão esperado no Android: '+text);tap(node)}
run(['install','-r',apk]);run(['shell','am','force-stop',app]);if(process.argv.includes('--fresh'))run(['shell','pm','clear',app]);run(['shell','am','start','-n',`${app}/com.barbeariamachado.gestao.MainActivity`])
let xml=await waitFor(['E-mail de acesso','Minha Agenda'])
if(process.argv.includes('--launch-only')){
 assert.ok(xml.includes('E-mail de acesso'));assert.ok(xml.includes('Entrar'));assert.ok(!xml.includes('Comandas'))
 await writeFile('.private/screenshots/professional-android-login.png',run(['exec-out','screencap','-p'],true))
 console.log('PASS APK profissional: instalado com pacote e nome próprios, abre login individual sem acesso automático administrativo.')
}else{
 const account=JSON.parse(await readFile('.private/professional-delivery.json','utf8')).find(value=>value.password)
 if(xml.includes('Entrar')){
  const fields=(xml.match(/<node\b[^>]*>/g)||[]).filter(node=>node.includes('class="android.widget.EditText"'))
  assert.equal(fields.length,2)
  tap(fields[0]);run(['shell','input','text',account.email]);run(['shell','input','keyevent','61']);run(['shell','input','text',account.password]);run(['shell','input','keyevent','4'])
  button(tree(),'Entrar');xml=await waitFor('Minha Agenda')
 }
 assert.ok(xml.includes('Meu Caixa'));assert.ok(xml.includes(account.name));assert.ok(!xml.includes('Comandas'))
 button(xml,'Meu Caixa');await waitFor('Meu saldo a receber')
 await writeFile('.private/screenshots/professional-android-caixa.png',run(['exec-out','screencap','-p'],true))
 run(['shell','input','keyevent','4']);await waitFor('06:40')
 run(['shell','am','force-stop',app]);run(['shell','am','start','-n',`${app}/com.barbeariamachado.gestao.MainActivity`]);xml=await waitFor('Minha Agenda');assert.ok(!xml.includes('E-mail de acesso'))
 await writeFile('.private/professional-android-verification.json',JSON.stringify({date:new Date().toISOString(),device,applicationId:app,login:'individual',productionApi:true,twoSections:true,ownProfile:true,cash:true,androidBack:true,persistedSession:true},null,2))
 console.log('PASS APK profissional em Android: login individual na API publicada, duas seções, próprio perfil, Caixa só de comissões, botão voltar e sessão ao reabrir.')
}

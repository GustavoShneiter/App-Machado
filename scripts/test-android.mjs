import assert from 'node:assert/strict'
import { readFile,writeFile,mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { pool } from '../server/db.mjs'

const adb='C:/Users/gusta/AppData/Local/Android/Sdk/platform-tools/adb.exe'
const account=JSON.parse(await readFile('.private/native-access.json','utf8'))
const application='com.barbeariamachado.gestao'
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
function run(args,binary=false){const result=spawnSync(adb,['-s','emulator-5554',...args],{encoding:binary?undefined:'utf8',timeout:20000,maxBuffer:10*1024*1024});if(result.status!==0)throw new Error('Falha no teste Android: '+args.slice(0,2).join(' '));return result.stdout}
function tap(node){const match=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert.ok(match);run(['shell','input','tap',String(Math.floor((+match[1]+ +match[3])/2)),String(Math.floor((+match[2]+ +match[4])/2))])}
function tree(){run(['shell','uiautomator','dump','/sdcard/machado-qa.xml']);return run(['shell','cat','/sdcard/machado-qa.xml'])}
async function waitTree(text){for(let i=0;i<12;i++){try{const xml=tree();if(xml.includes(text))return xml}catch{/* Aguarda o WebView ficar estável. */}await delay(1500)}throw new Error('Tela Android não apresentou: '+text)}
const apk=process.env.TEST_APK || 'android/app/build/outputs/apk/release/app-release.apk'
try {
  await mkdir('.private/screenshots',{recursive:true})
  run(['install','-r',apk])
  run(['shell','am','start','-n',`${application}/.MainActivity`])
  let xml=await waitTree('Filtros')
  assert.ok(!xml.includes('Entrar no painel'))
  console.log('PASS atualização: APK abre o painel sem formulário de login.')
  const before=new Set((await pool.query('select id from auth_session where "userId"=$1',[account.id])).rows.map(row=>row.id))
  run(['shell','pm','clear',application])
  run(['shell','am','start','-n',`${application}/.MainActivity`])
  xml=await waitTree('Filtros')
  assert.ok(!xml.includes('Entrar no painel'))
  const fresh=(await pool.query('select id from auth_session where "userId"=$1',[account.id])).rows.filter(row=>!before.has(row.id))
  assert.equal(fresh.length,1,'Primeira abertura deve criar exatamente uma sessão automática.')
  await writeFile('.private/screenshots/app-android-v1.20.png',run(['exec-out','screencap','-p'],true))
  console.log('PASS primeira abertura: dados locais vazios, sessão administrativa criada automaticamente no backend publicado.')
  run(['shell','am','force-stop',application]);run(['shell','am','start','-n',`${application}/.MainActivity`])
  await waitTree('Filtros')
  console.log('PASS sessão preservada após encerrar e abrir novamente.')
  await pool.query('update auth_session set "expiresAt"=now()-interval \'1 hour\' where id=$1 and "userId"=$2',[fresh[0].id,account.id])
  run(['shell','am','force-stop',application]);run(['shell','am','start','-n',`${application}/.MainActivity`])
  xml=await waitTree('Filtros')
  assert.ok(!xml.includes('Entrar no painel'))
  console.log('PASS sessão expirada: acesso renovado automaticamente, sem solicitar senha.')
  run(['shell','svc','wifi','disable']);run(['shell','svc','data','disable'])
  run(['shell','am','force-stop',application]);run(['shell','am','start','-n',`${application}/.MainActivity`])
  xml=await waitTree('Tentar novamente')
  assert.ok(!xml.includes('Entrar no painel'))
  run(['shell','svc','wifi','enable']);run(['shell','svc','data','enable'])
  await delay(3000)
  const retry=(tree().match(/<node\b[^>]*>/g)??[]).find(node=>/text="Tentar novamente"/.test(node))
  assert.ok(retry);tap(retry)
  await waitTree('Filtros')
  console.log('PASS sem internet: mensagem e botão de tentar novamente; painel abre após reconectar.')
  await writeFile('.private/android-verification.json',JSON.stringify({date:new Date().toISOString(),version:'1.20',release:true,update:true,automaticFirstAccess:true,persistedSession:true,expiredSessionRecovered:true,offlineRetry:true,backend:'Vercel/Neon'},null,2))
} finally {
  run(['shell','svc','wifi','enable']);run(['shell','svc','data','enable'])
  await pool.end()
}

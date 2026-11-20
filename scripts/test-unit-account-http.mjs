import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import pg from 'pg'
import {pool} from '../server/db.mjs'
const suffix=randomBytes(6).toString('hex'),name='machado_qa_http_'+suffix
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;url.searchParams.delete('sslmode')
let temporary,child,created=false;const directory=await mkdtemp(join(tmpdir(),'machado-http-'))
try{
 await pool.query('create database "'+name+'"');created=true
 temporary=new pg.Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true,...(process.env.DATABASE_SSL_CA_FILE?{ca:await readFile(process.env.DATABASE_SSL_CA_FILE,'utf8')}:{})}})
 for(const file of (await readdir('database')).filter(f=>/^\d{3}_.*\.sql$/.test(f)).sort())await temporary.query(await readFile('database/'+file,'utf8'))
 const port='5197',base='http://127.0.0.1:'+port
 child=spawn(process.execPath,['server/serve.mjs'],{env:{...process.env,DATABASE_URL:url.toString(),AUTH_BASE_URL:base,PUBLIC_SITE_URL:base,PORT:port,APP_MODE:'test',DATA_DIRECTORY:directory,NODE_ENV:'development',BETTER_AUTH_SECRET:randomBytes(48).toString('hex')}})
 let logs='';child.stdout.on('data',bytes=>{logs+=bytes});child.stderr.on('data',bytes=>{logs+=bytes})
 await new Promise((resolve,reject)=>{const start=Date.now(),timer=globalThis.setInterval(()=>{if(logs.includes('Machado application ready.')){globalThis.clearInterval(timer);resolve()}else if(Date.now()-start>15000||child.exitCode!==null){globalThis.clearInterval(timer);reject(Error('Disposable API did not start'))}},100)})
 const call=async(path,body,headers={})=>{const response=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:base,...headers},...(body?{body:JSON.stringify(body)}:{})});return {response,value:await response.json()}}
 const accounts=[]
 for(const label of ['A','B']){
  const email='qa.'+suffix+'.'+label.toLowerCase()+'@example.invalid',password='Unit-'+randomBytes(12).toString('hex')
  const registered=await call('/register',{name:'Owner '+label,business_name:'Machado '+label,email,password});assert.equal(registered.response.status,201)
  const signed=await call('/auth/sign-in/email',{email,password});assert.equal(signed.response.status,200)
  const cookie=signed.response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
  assert(cookie)
  accounts.push({id:signed.value.user.id,headers:{Cookie:cookie,'X-Machado-Account':signed.value.user.id}})
 }
 const [a,b]=accounts
 const rpc=(account,name,params={})=>call('/rpc',{name,params},account.headers)
 assert.equal((await rpc(a,'can_access_admin')).value.data,true);assert.equal((await rpc(b,'can_access_admin')).value.data,true)
 const save=await rpc(a,'save_customer_profile',{payload:{name:'Somente unidade A',phone:'45999990000'}});assert.equal(save.response.status,200)
 const invalid=await call('/rpc',{name:'save_customer_profile',params:{payload:{name:'Não pode salvar em B',phone:'45999990001'}}},{...b.headers,'X-Machado-Account':a.id})
 assert.equal(invalid.response.status,409);assert.equal(invalid.value.error.code,'account_changed')
 const snapshotA=await rpc(a,'office_snapshot'),snapshotB=await rpc(b,'office_snapshot')
 assert.equal(snapshotA.value.data.customers.length,1);assert.equal(snapshotB.value.data.customers.length,0,'Stale account cannot write into the newly signed-in unit')
 const sheetA=await call('/sheets/settings',null,a.headers),sheetB=await call('/sheets/settings',null,b.headers)
 assert.deepEqual(sheetA.value.data.connections,[]);assert.deepEqual(sheetB.value.data.connections,[])
 const setupA=await call('/sheets/automatic/status',null,a.headers);assert.equal(setupA.value.data.needs_authorization,true)
 const configB=await call('/agent/settings',null,b.headers);assert.equal(configB.value.data.assistant_enabled,false)
 console.log('PASS: real HTTP registration and logins, separate customer/sheet/agent state, and stale account header denied before writing into another unit.')
}finally{
 if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,5000)})}
 await temporary?.end()
 if(created)await pool.query('drop database "'+name+'" with(force)')
 await pool.end();assert(directory.startsWith(join(tmpdir(),'machado-http-')));await rm(directory,{recursive:true,force:true})
}

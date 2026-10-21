import assert from 'node:assert/strict'
import { readFile,writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'

const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:3000'
const account=JSON.parse(await readFile('.private/qa-account.json','utf8'))
async function request(path,{method='GET',body,token,origin}={}) {
  const headers={}
  if(body)headers['content-type']='application/json'
  if(token)headers.authorization=`Bearer ${token}`
  headers.origin=origin ?? new URL(base).origin
  const response=await fetch(`${base}/api${path}`,{method,headers,body:body?JSON.stringify(body):undefined})
  const data=await response.json()
  return {response,data}
}
const health=await request('/health');assert.equal(health.data.database,'neon')
const catalog=await request('/catalog');assert.equal(catalog.data.data.services.length,11);assert.equal(catalog.data.data.professionals.length,2)
assert.ok(catalog.data.data.professionals.every(row=>!Object.hasOwn(row,'phone')&&!Object.hasOwn(row,'default_commission_percent')))
assert.ok(catalog.data.data.links.every(row=>!Object.hasOwn(row,'commission_percent')))
assert.equal((await request('/rpc',{method:'POST',body:{name:'office_snapshot'}})).response.status,401)
assert.equal((await request('/rpc',{method:'POST',body:{name:'require_office'}})).response.status,400)
assert.equal((await request('/catalog',{origin:'https://example.invalid'})).response.status,403)
assert.equal((await request('/backup')).response.status,401)
assert.equal((await request('/backup-daily')).response.status,401)
let login=await request('/auth/sign-in/email',{method:'POST',body:{email:account.email,password:account.password}})
assert.equal(login.response.status,200,JSON.stringify(login.data))
let token=login.response.headers.get('set-auth-token');assert.ok(token)
const session=await request('/auth/get-session',{token});assert.equal(session.data.user.id,account.id)
const snapshot=await request('/rpc',{method:'POST',token,origin:'https://localhost',body:{name:'office_snapshot'}})
assert.equal(snapshot.response.status,200);assert.ok(Array.isArray(snapshot.data.data.appointments))
assert.equal(snapshot.response.headers.get('access-control-allow-origin'),'https://localhost')
const backup=await request('/backup',{token});assert.equal(backup.data.format,'machado-backup');assert.ok(backup.data.tables.services.length===11)
await writeFile('.private/verified-backup.json',JSON.stringify(backup.data))
const invalidImage=await request('/upload',{method:'POST',token,body:{folder:'products',mimeType:'image/png',base64:Buffer.from('invalid').toString('base64')}})
assert.equal(invalidImage.response.status,400)
if(process.env.TEST_RECOVERY==='1'){
  const password=randomBytes(24).toString('base64url')
  const recovery=await request('/recovery',{method:'POST',body:{email:account.email,code:account.recoveryCode,password}})
  assert.equal(recovery.response.status,200,JSON.stringify(recovery.data))
  assert.equal((await request('/rpc',{method:'POST',token,body:{name:'office_snapshot'}})).response.status,401)
  assert.equal((await request('/recovery',{method:'POST',body:{email:account.email,code:account.recoveryCode,password}})).response.status,400)
  account.password=password
  await writeFile('.private/qa-account.json',JSON.stringify(account))
  login=await request('/auth/sign-in/email',{method:'POST',body:{email:account.email,password}})
  assert.equal(login.response.status,200);token=login.response.headers.get('set-auth-token')
}
assert.equal((await request('/auth/sign-out',{method:'POST',token,body:{}})).response.status,200)
assert.equal((await request('/rpc',{method:'POST',token,body:{name:'office_snapshot'}})).response.status,401)
console.log('PASS API: catálogo público sem dados privados, autenticação, sessão Android, permissões, backup, upload inválido e logout'+(process.env.TEST_RECOVERY==='1'?', recuperação única e revogação de sessões.':'.'))

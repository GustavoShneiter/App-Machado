import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto'
import {sheetCatalog} from './spreadsheets.mjs'
const fail=(message,status=400)=>Object.assign(new Error(message),{status})
const hash=value=>createHash('sha256').update(value).digest('hex')
const secret=()=>randomBytes(48).toString('base64url')
const yearNow=()=>Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'America/Sao_Paulo'}).format(new Date()))
export function canonicalGoogleEmail(email){const [name,domain]=String(email).trim().toLowerCase().split('@');return ['gmail.com','googlemail.com'].includes(domain)?name.split('+')[0].replaceAll('.','')+'@gmail.com':name+'@'+domain}
function seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(hash(process.env.BETTER_AUTH_SECRET),'hex'),iv);return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64url')}
function unseal(value){const data=Buffer.from(value,'base64url'),cipher=createDecipheriv('aes-256-gcm',Buffer.from(hash(process.env.BETTER_AUTH_SECRET),'hex'),data.subarray(0,12));cipher.setAuthTag(data.subarray(-16));return Buffer.concat([cipher.update(data.subarray(12,-16)),cipher.final()]).toString('utf8')}
export async function ensureAnnualWorkbook(client,user){
 if(user.role!=='owner')return
 const year=yearNow()
 await client.query('insert into spreadsheet_creation_jobs(year,created_by) select $1,$2 where not exists(select 1 from spreadsheet_connections where year=$1) on conflict(tenant_id,year) do nothing',[year,user.id])
}
export function installerUrl(){const value=process.env.GOOGLE_SHEETS_WEBAPP_URL;if(!value)return null;try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='script.google.com'&&/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)?url.href:null}catch{return null}}
export async function automationAdmin(client,route,body,user){
 await client.query('select require_office()')
 const installation=(await client.query('select google_email from spreadsheet_installations')).rows[0]
 const current=(await client.query('select spreadsheet_id from spreadsheet_connections where year=$1',[yearNow()])).rows[0]
 if(route==='status')return {owner:user.role==='owner',available:Boolean(installerUrl()),google_email:installation?.google_email??null,needs_authorization:!installation&&!current,has_workbook:Boolean(current),year:yearNow()}
 if(user.role!=='owner')throw fail('Somente o proprietário conecta a conta Google.',403)
 if(route!=='authorize')throw fail('Operação inválida.',405)
 const link=installerUrl();if(!link)throw fail('A conexão Google está sendo preparada. As planilhas atuais continuam funcionando.',503)
 await ensureAnnualWorkbook(client,user)
 const grant=secret()
 await client.query("insert into spreadsheet_authorizations(created_by,grant_hash,expires_at) values($1,$2,now()+interval '20 minutes') on conflict(tenant_id) do update set created_by=excluded.created_by,grant_hash=excluded.grant_hash,expires_at=excluded.expires_at,used_at=null",[user.id,hash(grant)])
 const ownerEmail=(await client.query('select email from auth_user where id=$1',[user.id])).rows[0]?.email
 return {url:link+'?setup='+encodeURIComponent(grant)+(ownerEmail?'&authuser='+encodeURIComponent(canonicalGoogleEmail(ownerEmail)):'')}
}
export async function verifyGoogleAccount(token,fetcher=fetch){
 if(typeof token!=='string'||token.length<20||token.length>4096)throw fail('Autorize sua conta Google novamente.',401)
 let response;try{response=await fetcher('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+token},signal:globalThis.AbortSignal.timeout(15000)})}catch{throw fail('Não foi possível confirmar a conta Google. Tente novamente.',503)}
 if(!response.ok)throw fail('A autorização Google expirou. Conecte novamente.',401)
 const profile=await response.json();if(profile.email_verified!==true||typeof profile.email!=='string')throw fail('Use uma conta Google com e-mail verificado.',403)
 return profile.email.toLowerCase()
}
export async function automationExternal(req,res,{pool,transaction,readBody,send,googleAccount=verifyGoogleAccount,googleDocument},route){
 if(req.method!=='POST')throw fail('Método inválido.',405)
 const body=await readBody(req,12000)
 if(route==='claim'){
  if(typeof body.grant!=='string'||!/^[A-Za-z0-9_-]{64}$/.test(body.grant))throw fail('Conexão expirada. Abra novamente pelo app.',401)
  const googleEmail=await googleAccount(body.google_token)
  const grant=(await pool.query('select a.tenant_id,a.created_by,u.email from spreadsheet_authorizations a join auth_user u on u.id=a.created_by::text where grant_hash=$1 and used_at is null and expires_at>now()',[hash(body.grant)])).rows[0]
  if(!grant)throw fail('Conexão expirada. Abra novamente pelo app.',401)
  if(canonicalGoogleEmail(googleEmail)!==canonicalGoogleEmail(grant.email))throw fail('Escolha no Google o mesmo Gmail usado para entrar nesta unidade.',403)
  const installationToken=secret()
  const result=await transaction(grant.created_by,async client=>{
   const claimed=await client.query('update spreadsheet_authorizations set used_at=now() where grant_hash=$1 and used_at is null and expires_at>now() returning tenant_id',[hash(body.grant)])
   if(!claimed.rowCount)throw fail('Este link já foi utilizado. Abra a conexão pelo app novamente.',409)
   await client.query('insert into spreadsheet_installations(created_by,google_email,token_hash) values($1,$2,$3) on conflict(tenant_id) do update set created_by=excluded.created_by,google_email=excluded.google_email,token_hash=excluded.token_hash,connected_at=now()',[grant.created_by,googleEmail,hash(installationToken)])
   await ensureAnnualWorkbook(client,{id:grant.created_by,role:'owner'})
   return {unit_id:grant.tenant_id,token:installationToken,business_name:(await client.query('select name from business_settings')).rows[0].name}
  })
  send(res,200,{data:result});return
 }
 const token=/^Bearer ([A-Za-z0-9_-]{64})$/.exec(req.headers.authorization??'')?.[1]
 const installation=token?(await pool.query('select tenant_id,created_by,google_email from spreadsheet_installations where token_hash=$1',[hash(token)])).rows[0]:null
 if(!installation)throw fail('Conexão Google revogada ou inválida.',401)
 const result=await transaction(installation.created_by,async client=>{
  await client.query('select require_office()')
  if(!(await client.query('select 1 from spreadsheet_installations where token_hash=$1 for share',[hash(token)])).rowCount)throw fail('Conexão revogada.',401)
  await ensureAnnualWorkbook(client,{id:installation.created_by,role:'owner'})
  if(route==='jobs'){
   const jobs=(await client.query('select j.year from spreadsheet_creation_jobs j where completed_at is null and not exists(select 1 from spreadsheet_connections c where c.year=j.year) order by year')).rows
   const linked=(await client.query('select j.year,j.spreadsheet_id,j.credential_cipher from spreadsheet_creation_jobs j join spreadsheet_connections c on c.year=j.year and c.spreadsheet_id=j.spreadsheet_id where j.completed_at is not null')).rows.map(row=>({year:row.year,spreadsheetId:row.spreadsheet_id,token:unseal(row.credential_cipher)}))
   return {linked,unit_id:installation.tenant_id,business_name:(await client.query('select name from business_settings')).rows[0].name,catalog:await sheetCatalog(client),jobs}
  }
  if(route!=='complete')throw fail('Operação inválida.',405)
  const year=Number(body.year),id=body.spreadsheet_id
  if(!Number.isInteger(year)||year<2020||year>2100||typeof id!=='string'||!/^[A-Za-z0-9_-]{20,150}$/.test(id))throw fail('Planilha inválida.')
  const googleEmail=await googleAccount(body.google_token)
  if(canonicalGoogleEmail(googleEmail)!==canonicalGoogleEmail(installation.google_email))throw fail('A conta Google é diferente da autorizada.',403)
  if(googleDocument)await googleDocument(id,body.google_token)
  else{
   const check=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+id+'?fields=spreadsheetId',{headers:{Authorization:'Bearer '+body.google_token},signal:globalThis.AbortSignal.timeout(15000)})
   if(!check.ok||(await check.json()).spreadsheetId!==id)throw fail('A planilha não está acessível nesta conta Google.',403)
  }
  const job=(await client.query('select * from spreadsheet_creation_jobs where year=$1 for update',[year])).rows[0]
  if(!job)throw fail('Esta unidade não solicitou essa planilha.',404)
  if(job.completed_at){if(job.spreadsheet_id!==id)throw fail('O ano já tem outra planilha.',409);return {spreadsheetId:id,token:unseal(job.credential_cipher)}}
  if((await client.query('select 1 from spreadsheet_connections where year=$1',[year])).rowCount)throw fail('O ano já tem uma planilha. Use a conexão existente.',409)
  const feedToken=secret()
  try{await client.query("insert into spreadsheet_connections(spreadsheet_id,year,starts_on,created_by,token_hash,baseline,sync_mode) values($1,$2,make_date($2,1,1),$3,$4,'[]','live')",[id,year,installation.created_by,hash(feedToken)])}catch(error){if(error.code==='23505')throw fail('Esta planilha já pertence a uma conexão. Use uma planilha exclusiva.',409);throw error}
  await client.query('update spreadsheet_creation_jobs set spreadsheet_id=$1,credential_cipher=$2,completed_at=now() where year=$3',[id,seal(feedToken),year])
  return {spreadsheetId:id,token:feedToken}
 })
 send(res,200,{data:result})
}

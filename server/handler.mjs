import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { fromNodeHeaders } from 'better-auth/node'
import { hashPassword } from 'better-auth/crypto'
import { put } from '@vercel/blob'
import { getAuth, getProfessionalAuth, origins } from './auth.mjs'
import { pool, transaction } from './db.mjs'
import { createBackup, archiveBackup } from './backups.mjs'
import { ensureProfessionalAccess, professionalDirectory, professionalFor, professionalCatalog, professionalSnapshot, professionalCash, professionalPreferences, readProfessionalPreferences, professionalAction } from './professionals.mjs'
import { saveProfessionalPhoto } from './professional-photo.mjs'

const publicRpcs = new Set(['public_booking_slots','public_available_slots','create_public_appointment'])
const rpcArguments = {
  public_booking_slots: ['chosen_service','booking_day','preferred_professional'], public_available_slots: ['chosen_service','booking_day','preferred_professional'],
  create_public_appointment: ['customer_name','customer_phone','chosen_service','chosen_professional','start_time','terms_accepted'],
  office_action: ['action','payload'], office_snapshot: [], can_access_admin: [],
  complete_appointment: ['appointment_id'], open_manual_command: ['customer_name','customer_phone'],
  add_service_to_command: ['command_id','service_id','professional_id'], add_product_to_command: ['command_id','product_id','item_quantity','professional_id'],
  remove_command_item: ['command_item_id'], mark_command_ready: ['command_id'], set_command_adjustments: ['command_id','discount_cents','surcharge_cents'],
  save_customer_profile: ['payload'], save_business_settings: ['payload'], save_service_package: ['payload'], save_service_profile: ['payload'], save_professional_profile: ['payload'], save_product_profile: ['payload'],
  sell_service_package: ['package_id','customer_id','payment_method'], redeem_package_service: ['package_sale_id','service_id'], close_package_command: ['command_id'],
  create_schedule_block: ['professional_id','starts_at','ends_at','reason'], delete_schedule_block: ['block_id'],
  create_recurring_schedule_block: ['payload'], delete_recurring_schedule_block: ['block_id'],
  remove_agenda_appointment: ['appointment_id'],
  delete_command_record: ['command_id'], delete_appointment_record: ['appointment_id'], delete_customer_record: ['customer_id'], delete_professional_record: ['professional_id'], delete_product_record: ['product_id'], delete_service_record: ['service_id'], reset_operational_data: ['confirmation'],
}

const fail = (message,status=400) => Object.assign(new Error(message),{status})
function sameSecret(a,b) { if (!a || !b) return false; const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y) }
async function rateLimit(req,category,max,seconds=60) {
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
  const key = createHash('sha256').update(`${process.env.BETTER_AUTH_SECRET}:${category}:${ip}`).digest('hex')
  const bucket = new Date(Math.floor(Date.now()/(seconds*1000))*seconds*1000)
  const result = await pool.query('insert into request_limits(key,bucket,requests) values($1,$2,1) on conflict(key) do update set requests=case when request_limits.bucket=excluded.bucket then request_limits.requests+1 else 1 end,bucket=excluded.bucket returning requests',[key,bucket])
  if (result.rows[0].requests>max) throw fail('Muitas tentativas. Aguarde alguns minutos.',429)
}
async function readBody(req,maxBytes=1024*1024) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (Buffer.byteLength(JSON.stringify(req.body))>maxBytes) throw fail('Arquivo muito grande.',413)
    return req.body
  }
  if (typeof req.body==='string') { if (Buffer.byteLength(req.body)>maxBytes) throw fail('Requisição muito grande.',413); return JSON.parse(req.body) }
  const chunks=[]; let length=0
  for await (const chunk of req) { length+=chunk.length; if(length>maxBytes) throw fail('Requisição muito grande.',413); chunks.push(chunk) }
  return length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}
async function sessionFor(req,professional=false) {
  const session=await (professional?getProfessionalAuth():getAuth()).api.getSession({headers:fromNodeHeaders(req.headers)})
  if (!session) return null
  const profile=await pool.query('select id,role from profiles where id=$1::uuid and active',[session.user.id])
  return profile.rows[0] ? { ...session, profile:profile.rows[0] } : null
}
async function officeSession(req,owner=false) {
  const session=await sessionFor(req)
  if(!session || !(owner ? ['owner'] : ['owner','admin']).includes(session.profile.role)) throw fail('Acesso administrativo necessário.',401)
  return session
}
function send(res,status,data) { res.statusCode=status; res.setHeader('Content-Type','application/json; charset=utf-8'); res.end(JSON.stringify(data)) }

export default async function handler(req,res) {
  const requestId=randomUUID()
  res.setHeader('Cache-Control','no-store')
  res.setHeader('X-Request-Id',requestId)
  const origin=req.headers.origin
  if(origin && origins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin',origin); res.setHeader('Access-Control-Allow-Credentials','true'); res.setHeader('Vary','Origin')
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, Idempotency-Key'); res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS'); res.setHeader('Access-Control-Expose-Headers','set-auth-token, X-Request-Id')
  }
  if(req.method==='OPTIONS') { res.statusCode=origin && !origins.includes(origin)?403:204; res.end(); return }
  try {
    if(origin && !origins.includes(origin)) throw fail('Origem não permitida.',403)
    const base=process.env.AUTH_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000')
    const url=new URL(req.url,base)
    const routedPath=url.searchParams.get('route')
    if(routedPath){url.pathname=`/api/${routedPath}`;url.searchParams.delete('route')}
    const path=url.pathname.replace(/\/$/,'')
    if(path.startsWith('/api/auth/')||path.startsWith('/api/professional-auth/')) {
      const body=['GET','HEAD'].includes(req.method)?undefined:JSON.stringify(await readBody(req))
      const auth=path.startsWith('/api/professional-auth/')?getProfessionalAuth():getAuth()
      const response=await auth.handler(new Request(url,{method:req.method,headers:fromNodeHeaders(req.headers),body}))
      response.headers.forEach((value,key)=>{if(key!=='set-cookie')res.setHeader(key,value)})
      const cookies=response.headers.getSetCookie(); if(cookies.length)res.setHeader('Set-Cookie',cookies)
      res.statusCode=response.status; res.end(Buffer.from(await response.arrayBuffer())); return
    }
    if(path==='/api/health' && req.method==='GET') { await pool.query('select 1'); send(res,200,{status:'ok',version:'1.19.6',professionalVersion:'1.1.0',backend:'vercel',database:'neon'}); return }
    if(path==='/api/professional/manifest'&&req.method==='GET') {
      send(res,200,{id:'/profissional/',name:'Machado Profissional',short_name:'Machado Pro',lang:'pt-BR',start_url:'/profissional/agenda',scope:'/profissional/',display:'standalone',background_color:'#f4f7f5',theme_color:'#177245',icons:[{src:'/professional-icon-192.png',sizes:'192x192',type:'image/png'},{src:'/professional-icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]}); return
    }
    if(path==='/api/professional-accounts'&&req.method==='GET') {
      const session=await officeSession(req)
      const data=await transaction(session.user.id,client=>professionalDirectory(client,url.searchParams.get('professional_id')),{readOnly:true})
      send(res,200,{data});return
    }
    if(path==='/api/professional-accounts'&&req.method==='POST') {
      const session=await officeSession(req);await rateLimit(req,'professional-accounts',15)
      const {professional_id,reset=false,email,password}=await readBody(req)
      const data=await transaction(session.user.id,async client=>{
        const access=await ensureProfessionalAccess(client,professional_id,{reset:reset===true,email,password})
        await client.query("insert into audit_logs(actor_profile_id,operation,entity_type,result) values($1,$2,'professional_access','success')",[session.user.id,reset?'reset_professional_access':'create_professional_access'])
        return access
      })
      send(res,200,{data});return
    }
    if(path.startsWith('/api/professional/')) {
      const session=await sessionFor(req,true)
      const body=req.method==='POST'?await readBody(req,path==='/api/professional/photo'?5*1024*1024:1024*1024):{}
      const requestedId=req.method==='POST'?body.professional_id:url.searchParams.get('professional_id')
      const known=['access','catalog','snapshot','cash','action','preferences','photo'].some(route=>path==='/api/professional/'+route)
      if(!known)throw fail('Página não encontrada.',404)
      const allowedMethods=path==='/api/professional/preferences'?['GET','POST']:['/api/professional/action','/api/professional/photo'].includes(path)?['POST']:['GET']
      if(!allowedMethods.includes(req.method))throw fail('Operação inválida.',405)
      if(req.method==='POST')await rateLimit(req,'professional-action',90)
      if(path==='/api/professional/photo')await rateLimit(req,'professional-photo',10,300)
      const data=await transaction(session?.user.id,async client=>{
        const access=await professionalFor(client,session,requestedId)
        const id=access.profile.id
        if(path==='/api/professional/access')return access
        if(path==='/api/professional/catalog')return professionalCatalog(client,id)
        if(path==='/api/professional/snapshot')return professionalSnapshot(client,id)
        if(path==='/api/professional/cash')return professionalCash(client,id,url.searchParams.get('from'),url.searchParams.get('to'))
        let result
        if(path==='/api/professional/preferences'&&req.method==='GET')return readProfessionalPreferences(client,id)
        if(path==='/api/professional/preferences')result=await professionalPreferences(client,id,body.preferences??{})
        else if(path==='/api/professional/photo')result=await saveProfessionalPhoto(client,id,body)
        else result=await professionalAction(client,id,body.action,body.payload??{})
        await client.query("insert into audit_logs(actor_profile_id,operation,entity_type,request_summary,result) values($1,$2,'professional',jsonb_build_object('professional_id',$3::text),'success')",[session.user.id,path.endsWith('/preferences')?'professional:preferences':path.endsWith('/photo')?'professional:photo':`professional:${String(body.action).slice(0,60)}`,id])
        return result
      },{readOnly:req.method==='GET'})
      send(res,200,{data,error:null});return
    }
    if(path==='/api/catalog' && req.method==='GET') {
      const session=await sessionFor(req)
      const data=await transaction(session?.user.id,async client=>{
        if(session && ['owner','admin'].includes(session.profile.role)) return {
          services:(await client.query('select * from services order by name')).rows,
          professionals:(await client.query('select * from professionals order by name')).rows,
          links:(await client.query('select professional_id,service_id,commission_percent from professional_services')).rows,
          business:(await client.query('select * from business_settings where id=true')).rows[0],
        }
        return (await client.query('select public_catalog() as value')).rows[0].value
      })
      send(res,200,{data,error:null}); return
    }
    if(path==='/api/rpc' && req.method==='POST') {
      const {name,params={}}=await readBody(req)
      if(!Object.hasOwn(rpcArguments,name) || !params || typeof params!=='object' || Array.isArray(params)) throw fail('Operação inválida.')
      const allowed=rpcArguments[name]
      if(Object.keys(params).some(key=>!allowed.includes(key))) throw fail('Parâmetros inválidos.')
      let session=null
      if(name==='can_access_admin') session=await sessionFor(req)
      else if(!publicRpcs.has(name)) session=await officeSession(req)
      else await rateLimit(req,name,name==='create_public_appointment'?6:180)
      if(name==='can_access_admin' && !session) {send(res,200,{data:false,error:null}); return}
      const data=await transaction(session?.user.id,async client=>{
        const keys=allowed.filter(key=>Object.hasOwn(params,key))
        const args=keys.map((key,index)=>`"${key}" => $${index+1}`).join(',')
        const tableResult=name==='public_booking_slots'||name==='public_available_slots'
        const statement=tableResult?`select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) as value from public."${name}"(${args}) x`:`select public."${name}"(${args}) as value`
        let result=(await client.query(statement,keys.map(key=>params[key]))).rows[0]?.value
        if(result?.id&&(name==='save_professional_profile'||(name==='office_action'&&params.action==='save_professional'))) {
          const credentials=params.payload?.access
          if(credentials!==undefined&&(!credentials||typeof credentials!=='object'||Array.isArray(credentials)))throw fail('Dados de acesso inválidos.')
          const access=await ensureProfessionalAccess(client,result.id,credentials===undefined?{}:{email:credentials.email,password:credentials.password})
          if(access)result={...result,access}
        }
        if(session && name!=='office_snapshot' && name!=='can_access_admin') await client.query("insert into audit_logs(actor_profile_id,operation,entity_type,result) values($1,$2,'operation','success')",[session.user.id,name==='office_action'?`office_action:${String(params.action).slice(0,70)}`:name])
        return result
      })
      send(res,200,{data,error:null});return
    }
    if(path==='/api/recovery' && req.method==='POST') {
      await rateLimit(req,'recovery',5,900)
      const {email,code,password}=await readBody(req)
      if(typeof email!=='string'||typeof code!=='string'||!/^([a-f0-9]{48})$/i.test(code.trim())||typeof password!=='string'||password.length<12||password.length>128) throw fail('Confira o e-mail, o código e a senha de pelo menos 12 caracteres.')
      const digest=createHash('sha256').update(code.trim().toLowerCase()).digest('hex')
      const passwordHash=await hashPassword(password)
      await transaction(null,async client=>{
        const result=await client.query('select r.id,r.user_id from recovery_codes r join auth_user u on u.id=r.user_id join profiles p on p.id::text=u.id where lower(u.email)=lower($1) and r.code_hash=$2 and r.used_at is null and p.active and p.role=\'owner\' for update of r',[email.trim(),digest])
        if(!result.rows.length) throw fail('Código inválido, utilizado ou conta indisponível.')
        const row=result.rows[0]
        await client.query('update auth_account set password=$1,"updatedAt"=now() where "userId"=$2 and "providerId"=\'credential\'',[passwordHash,row.user_id])
        await client.query('update recovery_codes set used_at=now() where id=$1',[row.id])
        await client.query('delete from auth_session where "userId"=$1',[row.user_id])
        await client.query("insert into audit_logs(actor_profile_id,operation,entity_type,result) values($1,'recover_access','account','success')",[row.user_id])
      })
      send(res,200,{ok:true});return
    }
    if(path==='/api/upload' && req.method==='POST') {
      await officeSession(req); await rateLimit(req,'upload',20)
      const {folder,base64,mimeType}=await readBody(req,6*1024*1024)
      const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}
      if(!['professionals','products'].includes(folder)||!Object.hasOwn(extensions,mimeType)||typeof base64!=='string') throw fail('Escolha uma foto JPEG, PNG ou WebP.')
      const buffer=Buffer.from(base64,'base64')
      if(!buffer.length||buffer.length>3*1024*1024) throw fail('A foto deve ter até 3 MB.')
      const magic=buffer.subarray(0,12)
      const valid=mimeType==='image/jpeg'?magic[0]===255&&magic[1]===216:mimeType==='image/png'?magic.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):magic.subarray(0,4).toString()==='RIFF'&&magic.subarray(8,12).toString()==='WEBP'
      if(!valid)throw fail('O conteúdo não corresponde a uma imagem válida.')
      const file=await put(`${folder}/${randomUUID()}.${extensions[mimeType]}`,buffer,{access:'public',contentType:mimeType,token:process.env.BLOB_READ_WRITE_TOKEN})
      send(res,200,{url:file.url});return
    }
    if(path==='/api/backup' && req.method==='GET') {await officeSession(req,true);send(res,200,await createBackup());return}
    if(path==='/api/backup' && req.method==='POST') {await officeSession(req,true);await rateLimit(req,'backup',3,300);send(res,200,await archiveBackup());return}
    if(path==='/api/backup-daily' && req.method==='GET') {
      if(!sameSecret(req.headers.authorization,`Bearer ${process.env.CRON_SECRET||''}`)||!process.env.CRON_SECRET) throw fail('Acesso negado.',401)
      const result=await archiveBackup(); await pool.query("delete from request_limits where bucket<now()-interval '2 days'");send(res,200,result);return
    }
    if(path==='/api/system-status' && req.method==='GET') {
      await officeSession(req)
      send(res,200,{version:'1.19.6',professionalVersion:'1.1.0',backend:'Vercel',database:'Neon',lastBackup:(await pool.query('select created_at,bytes,sha256 from backup_runs order by created_at desc limit 1')).rows[0]??null});return
    }
    throw fail('Página não encontrada.',404)
  } catch(error) {
    const dbCode=String(error.code||'')
    const status=error.status || (dbCode==='42501'?403:dbCode==='23P01'||dbCode==='23505'?409:dbCode.startsWith('22')||dbCode==='P0001'?400:503)
    const message=error.status?error.message:dbCode==='23P01'?'Esse horário acabou de ser reservado. Escolha outro.':dbCode==='23505'?'Esse registro já existe. Atualize a tela.':status===400?String(error.message).slice(0,250):status===403?'Você não tem permissão para esta operação.':'Não foi possível concluir. Confira sua conexão e tente novamente.'
    if(status>=500) console.error(JSON.stringify({requestId,route:req.url?.split('?')[0],code:dbCode||'internal_error'}))
    send(res,status,{error:{message,code:dbCode||'request_error',requestId}})
  }
}

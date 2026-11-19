import {createHash,randomBytes} from 'node:crypto'
import {readFile} from 'node:fs/promises'

const fail=(message,status=400)=>Object.assign(new Error(message),{status})
const hash=value=>createHash('sha256').update(value).digest('hex')
const day=value=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10)
export function sheetId(value){
 const match=String(value??'').match(/^(?:https:\/\/docs\.google\.com\/spreadsheets\/d\/)?([a-zA-Z0-9_-]{20,100})(?:\/.*)?$/)
 if(!match)throw fail('Informe o link da planilha Google da sua conta.')
 return match[1]
}
export function subtractBaseline(current,baseline){
 const previous=new Map(baseline.map(row=>[row.date+'|'+row.key,row]))
 const next=new Map(current.map(row=>[row.date+'|'+row.key,row]))
 return [...new Set([...previous.keys(),...next.keys()])].map(key=>{
  const a=next.get(key),b=previous.get(key)
  return {...(a??b),quantity:Number(a?.quantity??0)-Number(b?.quantity??0),amount:Number(a?.amount??0)-Number(b?.amount??0)}
 }).filter(row=>row.quantity!==0||row.amount!==0)
}
export async function sheetSnapshot(client,year,from){
 const end=(year+1)+'-01-01'
 const items=(await client.query(`select to_char(coalesce(a.starts_at,c.closed_at,c.created_at) at time zone 'America/Sao_Paulo','YYYY-MM-DD') date,
  case when i.type='product' then 'products' else 'service:'||i.service_id::text end key,
  sum(i.quantity)::int quantity,sum(i.unit_price_cents::bigint*i.quantity)::bigint amount,min(i.description) name
  from command_items i join commands c on c.id=i.command_id left join appointments a on a.id=c.appointment_id
  where c.status in ('awaiting_payment','closed') and (a.id is null or a.status='completed')
    and not exists(select 1 from package_redemptions r where r.command_item_id=i.id)
    and (coalesce(a.starts_at,c.closed_at,c.created_at) at time zone 'America/Sao_Paulo')::date >=$1::date
    and (coalesce(a.starts_at,c.closed_at,c.created_at) at time zone 'America/Sao_Paulo')::date <$2::date
  group by 1,2`,[from,end])).rows
 const adjustments=(await client.query(`select to_char(coalesce(a.starts_at,c.closed_at,c.created_at) at time zone 'America/Sao_Paulo','YYYY-MM-DD') date,
  sum(c.discount_cents)::bigint discount,sum(c.surcharge_cents)::bigint tip
  from commands c left join appointments a on a.id=c.appointment_id where c.status in ('awaiting_payment','closed')
  and (a.id is null or a.status='completed')
  and (coalesce(a.starts_at,c.closed_at,c.created_at) at time zone 'America/Sao_Paulo')::date >=$1::date
  and (coalesce(a.starts_at,c.closed_at,c.created_at) at time zone 'America/Sao_Paulo')::date <$2::date group by 1`,[from,end])).rows
 const packages=(await client.query(`select to_char(sold_at at time zone 'America/Sao_Paulo','YYYY-MM-DD') date,
  'package:'||package_id::text key,count(*)::int quantity,sum(amount_cents)::bigint amount,
  min((select name from service_packages where id=package_sales.package_id)) name from package_sales
  where status<>'cancelled' and (sold_at at time zone 'America/Sao_Paulo')::date >=$1::date
  and (sold_at at time zone 'America/Sao_Paulo')::date <$2::date group by 1,2`,[from,end])).rows
 const payouts=(await client.query(`select to_char(paid_at at time zone 'America/Sao_Paulo','YYYY-MM-DD') date,
  'commission:'||professional_id::text key,0 quantity,sum(commission_cents)::bigint amount from commission_entries
  where status='paid' and paid_at is not null and reversed_at is null
  and (paid_at at time zone 'America/Sao_Paulo')::date >=$1::date
  and (paid_at at time zone 'America/Sao_Paulo')::date <$2::date group by 1,2`,[from,end])).rows
 return [...items,...packages,...payouts,...adjustments.flatMap(row=>[
  {date:row.date,key:'discounts',quantity:0,amount:row.discount},
  {date:row.date,key:'tips',quantity:0,amount:row.tip}
 ])].map(row=>({...row,quantity:Number(row.quantity),amount:Number(row.amount)}))
}
export async function sheetCatalog(client){
 return (await client.query(`select 'service:'||id::text key,name,price_cents price from services
  union all select 'package:'||id::text,name,price_cents from service_packages
  union all select 'commission:'||id::text,name,0 from professionals order by name`)).rows
}
function publicConnection(row){
 if(!row)return null
 return {spreadsheet_id:row.spreadsheet_id,url:'https://docs.google.com/spreadsheets/d/'+row.spreadsheet_id+'/edit',
  year:row.year,starts_on:day(row.starts_on),enabled:row.enabled,revision:row.revision,mappings:row.mappings,
  connected_at:row.connected_at,last_sync_at:row.last_sync_at,status:row.last_status}
}
async function connector(base,id,token){
 return (await readFile(new URL('./sheets-connector.gs',import.meta.url),'utf8')).replace('/*MACHADO_CONNECTION*/',JSON.stringify({base,spreadsheetId:id,token}))
}
export async function spreadsheetAdmin(client,route,method,body,user,base){
 await client.query('select require_office()')
 if(method==='GET')return {connection:publicConnection((await client.query('select * from spreadsheet_connections')).rows[0]),catalog:await sheetCatalog(client),owner:user.role==='owner'}
 if(user.role!=='owner')throw fail('Somente o proprietário configura a integração.',403)
 const existing=(await client.query('select * from spreadsheet_connections for update')).rows[0]
 if(route==='connect'){
  if(existing)throw fail('A conexão já existe. Use as configurações para ajustar ou pausar.',409)
  const id=sheetId(body.spreadsheet_url),year=Number(body.year)
  const starts=body.starts_on??new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())
  if(!Number.isInteger(year)||year<2020||year>2100||typeof starts!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(starts)||starts.slice(0,4)!==String(year)||!Number.isFinite(Date.parse(starts+'T12:00:00Z'))||new Date(starts+'T12:00:00Z').toISOString().slice(0,10)!==starts)throw fail('Confira o ano e a data inicial.')
  const token=randomBytes(48).toString('base64url')
  await client.query('insert into spreadsheet_connections(spreadsheet_id,year,starts_on,created_by,token_hash,baseline) values($1,$2,$3,$4,$5,$6)',[id,year,starts,user.id,hash(token),JSON.stringify(await sheetSnapshot(client,year,starts))])
  return {script:await connector(base,id,token)}
 }
 if(!existing)throw fail('Configure a planilha primeiro.',404)
 if(body.revision!==existing.revision)throw fail('As configurações mudaram. Reabra a janela para atualizar.',409)
 if(route==='credentials'){
  const token=randomBytes(48).toString('base64url')
  await client.query('update spreadsheet_connections set token_hash=$1,revision=revision+1',[hash(token)])
  return {script:await connector(base,existing.spreadsheet_id,token)}
 }
 if(route==='resume'){
  const cell=body.cell
  if(!cell||!Number.isSafeInteger(cell.sheet_id)||!/^([A-Z]{1,3}[1-9][0-9]{0,4})$/.test(cell.a1)||!(existing.last_status?.manual_cells??[]).some(c=>c.sheet_id===cell.sheet_id&&c.a1===cell.a1))throw fail('Escolha um campo manual da lista atual.')
  await client.query("update spreadsheet_connections set resume_cells=case when resume_cells @> $1::jsonb then resume_cells else resume_cells||$1::jsonb end,revision=revision+1",[JSON.stringify([cell])])
  return {saved:true}
 }
 if(route!=='settings'||typeof body.enabled!=='boolean'||!body.mappings||typeof body.mappings!=='object'||Array.isArray(body.mappings))throw fail('Configuração inválida.')
 const keys=new Set((await sheetCatalog(client)).map(row=>row.key))
 if(Object.keys(body.mappings).length>500||Object.entries(body.mappings).some(([key,value])=>!keys.has(key)||typeof value!=='string'||value.length>100||/[\n\r\t]/.test(value)))throw fail('Vínculo de serviço ou plano inválido.')
 await client.query('update spreadsheet_connections set enabled=$1,mappings=$2,revision=revision+1',[body.enabled,body.mappings])
 return publicConnection((await client.query('select * from spreadsheet_connections')).rows[0])
}
export async function spreadsheetExternal(req,res,{pool,transaction,readBody,send},route){
 const authorization=req.headers.authorization??''
 if(!/^Bearer [A-Za-z0-9_-]{64}$/.test(authorization))throw fail('Credencial inválida.',401)
 const record=(await pool.query('select tenant_id,created_by from spreadsheet_connections where token_hash=$1',[hash(authorization.slice(7))])).rows[0]
 if(!record)throw fail('Conexão revogada ou inválida.',401)
 const value=await transaction(record.created_by,async client=>{
  await client.query('select require_office()')
  const cfg=(await client.query('select * from spreadsheet_connections where tenant_id=$1',[record.tenant_id])).rows[0]
  if(!cfg)throw fail('Conexão indisponível.',401)
  if(route==='feed'&&req.method==='GET'){
   const catalog=await sheetCatalog(client)
   for(const row of cfg.baseline)if(row.name&&!catalog.some(item=>item.key===row.key)&&/^(service|package):/.test(row.key))catalog.push({key:row.key,name:row.name,price:0})
   return {version:1,spreadsheet_id:cfg.spreadsheet_id,enabled:cfg.enabled,year:cfg.year,starts_on:day(cfg.starts_on),mappings:cfg.mappings,resume_cells:cfg.resume_cells,catalog,rows:cfg.enabled?subtractBaseline(await sheetSnapshot(client,cfg.year,cfg.starts_on),cfg.baseline):[],generated_at:new Date().toISOString()}
  }
  if(route==='ack'&&req.method==='POST'){
   const body=await readBody(req,64000)
   if(body.spreadsheet_id!==cfg.spreadsheet_id)throw fail('Planilha diferente da conexão.',403)
   if(!Array.isArray(body.manual_cells)||body.manual_cells.length>500||body.manual_cells.some(c=>!Number.isInteger(c.sheet_id)||typeof c.a1!=='string'||!/^([A-Z]{1,3}[1-9][0-9]{0,4})$/.test(c.a1)||typeof c.sheet!=='string'||c.sheet.length>100))throw fail('Estado da sincronização inválido.')
   const status={manual_cells:body.manual_cells,bindings:Math.max(0,Math.min(Number(body.bindings)||0,100000)),error:typeof body.error==='string'?body.error.slice(0,500):null,headers:Array.isArray(body.headers)?body.headers.filter(h=>typeof h==='string'&&h.length<=100).slice(0,200):[]}
   await client.query('update spreadsheet_connections set last_sync_at=case when $1::boolean then now() else last_sync_at end,last_status=$2',[!status.error,status])
   if(!status.error&&Array.isArray(body.resumed))for(const cell of body.resumed.slice(0,500))await client.query("update spreadsheet_connections set resume_cells=(select coalesce(jsonb_agg(v),'[]'::jsonb) from jsonb_array_elements(resume_cells) v where v<>$1::jsonb)",[JSON.stringify(cell)])
   return {recorded:true}
  }
  throw fail('Operação inválida.',405)
 },{readOnly:route==='feed'})
 send(res,200,{data:value})
}

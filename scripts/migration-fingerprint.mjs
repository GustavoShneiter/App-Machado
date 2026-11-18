import {createHash} from 'node:crypto'
export async function fingerprint(client) {
 await client.query("set local timezone='UTC'")
 const tables=(await client.query("select schemaname,tablename from pg_tables where schemaname in('public','auth') order by schemaname,tablename")).rows
 const result={tables:{}}
 for(const {schemaname,tablename} of tables){
  const q=value=>'"'+value.replaceAll('"','""')+'"'
  result.tables[schemaname+'.'+tablename]=(await client.query(`select count(*)::int count,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text collate "C")::text,'[]')) hash from ${q(schemaname)}.${q(tablename)} t`)).rows[0]
 }
 const security=(await client.query("select n.nspname schema,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','auth') and p.prokind='f' and p.proname<>'machado_migration_write_guard' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)")).rows
 result.security=createHash('sha256').update(JSON.stringify(security)).digest('hex')
 result.policies=(await client.query("select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in('public','auth') order by schemaname,tablename,policyname")).rows
 return result
}

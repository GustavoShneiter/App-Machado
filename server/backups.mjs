import { createHash } from 'node:crypto'
import { put } from '@vercel/blob'
import { transaction, pool } from './db.mjs'

export const businessTables = ['profiles','services','professionals','professional_services','professional_products','business_settings','business_hours','customers','appointments','schedule_blocks','commands','command_items','payments','commission_entries','cash_sessions','cash_movements','products','stock_movements','service_packages','service_package_items','package_sales','package_sale_balances','package_redemptions','notifications','audit_logs']
businessTables.push('recurring_schedule_blocks','professional_preferences')
export const identityTables = ['auth_user','auth_account','recovery_codes']

export async function createBackup(userId) {
  return transaction(userId??null, async client => {
    const tables = {}
    for (const table of [...businessTables,...identityTables]) {
      const scope=userId&&table==='auth_user'?' where t.id in (select id::text from profiles)':userId&&table==='auth_account'?' where t."userId" in (select id::text from profiles)':''
      tables[table] = (await client.query(`select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) as rows from public."${table}" t${scope}`)).rows[0].rows
    }
    tables.business_units=(await client.query('select * from business_units order by created_at')).rows
    return { format: 'machado-backup', version: 2, schemaVersion: 12, createdAt: new Date().toISOString(), tables }
  }, { readOnly: true,internal:!userId })
}

export async function archiveBackup(userId) {
  const data = await createBackup(userId)
  const json = JSON.stringify(data)
  const digest = createHash('sha256').update(json).digest('hex')
  const tenantId=userId?data.tables.profiles.find(profile=>profile.id===userId)?.tenant_id:null
  if(userId&&!tenantId)throw new Error('Não foi possível identificar a unidade da cópia de segurança.')
  const pathname = `${tenantId?'units/'+tenantId:'daily'}/${new Date().toISOString().replaceAll(':','-')}.json`
  const file = await put(pathname, json, { access: 'private', contentType: 'application/json', token: process.env.BACKUP_READ_WRITE_TOKEN, addRandomSuffix: true })
  await pool.query('insert into backup_runs(pathname,sha256,bytes,tables_count,tenant_id) values($1,$2,$3,$4,$5)', [file.pathname,digest,Buffer.byteLength(json),Object.keys(data.tables).length,tenantId])
  return { createdAt: data.createdAt, sha256: digest, bytes: Buffer.byteLength(json), tables: Object.keys(data.tables).length }
}

import { createHash } from 'node:crypto'
import { put } from '@vercel/blob'
import { transaction, pool } from './db.mjs'

export const businessTables = ['profiles','services','professionals','professional_services','professional_products','business_settings','business_hours','customers','appointments','schedule_blocks','commands','command_items','payments','commission_entries','cash_sessions','cash_movements','products','stock_movements','service_packages','service_package_items','package_sales','package_sale_balances','package_redemptions','notifications','audit_logs']
export const identityTables = ['auth_user','auth_account']

export async function createBackup() {
  return transaction(null, async client => {
    const tables = {}
    for (const table of [...businessTables,...identityTables]) {
      tables[table] = (await client.query(`select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) as rows from public."${table}" t`)).rows[0].rows
    }
    return { format: 'machado-backup', version: 1, schemaVersion: 4, createdAt: new Date().toISOString(), tables }
  }, { readOnly: true })
}

export async function archiveBackup() {
  const data = await createBackup()
  const json = JSON.stringify(data)
  const digest = createHash('sha256').update(json).digest('hex')
  const pathname = `daily/${new Date().toISOString().replaceAll(':','-')}.json`
  const file = await put(pathname, json, { access: 'private', contentType: 'application/json', token: process.env.BACKUP_READ_WRITE_TOKEN, addRandomSuffix: true })
  await pool.query('insert into backup_runs(pathname,sha256,bytes,tables_count) values($1,$2,$3,$4)', [file.pathname,digest,Buffer.byteLength(json),Object.keys(data.tables).length])
  return { createdAt: data.createdAt, sha256: digest, bytes: Buffer.byteLength(json), tables: Object.keys(data.tables).length }
}

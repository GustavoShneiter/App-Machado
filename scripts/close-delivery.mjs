import assert from 'node:assert/strict'
import { readFile,writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pool } from '../server/db.mjs'
import { createBackup } from '../server/backups.mjs'

const source=JSON.parse(await readFile('.private/source-data.json','utf8'))
const users=(await pool.query('select id,password from auth_account where "providerId"=\'credential\' and "userId"=$1',[source.auth_users[0].id])).rows
assert.equal(users.length,1);assert.equal(users[0].password,source.auth_users[0].password_hash)
const counts={}
for(const table of ['customers','appointments','commands','payments','cash_sessions','commission_entries','package_sales']){
  const n=Number((await pool.query(`select count(*) as n from "${table}"`)).rows[0].n)
  counts[table]=n;assert.equal(n,source[table].length,`Dados de teste restantes em ${table}`)
}
assert.equal(Number((await pool.query('select count(*) as n from profiles')).rows[0].n),1)
const response=await fetch('https://barbearia-machado-rose.vercel.app/api/backup-daily',{headers:{Authorization:`Bearer ${process.env.CRON_SECRET}`}})
assert.equal(response.status,200)
const archive=await response.json()
const backup=await createBackup()
const text=JSON.stringify(backup,null,2)
await writeFile('.private/backup-final.json',text)
await writeFile('.private/final-verification.json',JSON.stringify({date:new Date().toISOString(),site:'https://barbearia-machado-rose.vercel.app',database:'Neon',login:'Better Auth / Vercel',passwordPreserved:true,counts,automaticBackupEndpoint:archive,localBackupSha256:createHash('sha256').update(text).digest('hex')},null,2))
console.log('PASS entrega: conta original e senha preservadas, operação sem dados de QA, backup final criado e endpoint diário de produção verificado.')
await pool.end()

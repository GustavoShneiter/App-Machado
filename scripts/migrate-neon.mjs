import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import pg from 'pg'
import { getMigrations } from 'better-auth/db/migration'
import { authOptions } from '../server/auth.mjs'
import { pool } from '../server/db.mjs'

const url = new URL(process.env.DATABASE_URL_UNPOOLED)
if (url.hostname.includes('-pooler')) throw new Error('A migração exige conexão direta.')
url.searchParams.delete('sslmode')
const client = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: true }, statement_timeout: 120000 })
await client.connect()
try {
  const exists = await client.query("select to_regclass('public.profiles') as present")
  if (exists.rows[0].present) throw new Error('Banco já inicializado; esta importação não sobrescreve dados.')
  const source = JSON.parse(await readFile('.private/source-data.json', 'utf8'))
  const schema = JSON.parse(await readFile('.private/source-schema.json', 'utf8'))
  await client.query('begin')
  await client.query(await readFile('database/001_initial.sql', 'utf8'))
  await client.query('set constraints all deferred')
  for (const user of source.auth_users) await client.query('insert into auth.users(id,email) values($1,$2)', [user.id, user.email])
  // Os gatilhos ficam desativados somente nesta transação para importar o estado exato.
  for (const table of schema.tables) await client.query(`alter table public."${table.name}" disable trigger user`)
  for (const table of schema.tables) {
    const rows = source[table.name]
    if (rows.length) await client.query(`insert into public."${table.name}" select * from jsonb_populate_recordset(null::public."${table.name}",$1::jsonb)`, [JSON.stringify(rows)])
  }
  await client.query('set constraints all immediate')
  for (const table of schema.tables) await client.query(`alter table public."${table.name}" enable trigger user`)
  await client.query("update public.business_settings set phone='4588186553',city='Toledo',state='PR',website='https://barbearia-machado-rose.vercel.app' where id=true")
  await client.query('commit')
  const migrations = await getMigrations(authOptions)
  await writeFile('database/002_auth.sql', await migrations.compileMigrations())
  await migrations.runMigrations()
  await client.query('begin')
  await client.query(await readFile('database/003_readiness.sql', 'utf8'))
  await client.query(await readFile('database/004_agenda.sql', 'utf8'))
  await client.query(await readFile('database/005_service_commissions.sql', 'utf8'))
  await client.query(await readFile('database/006_item_commissions_and_deletions.sql', 'utf8'))
  const codes = []
  for (const user of source.auth_users) {
    const profile = source.profiles.find(row => row.id === user.id)
    await client.query('insert into auth_user(id,name,email,"emailVerified","createdAt","updatedAt") values($1,$2,$3,$4,$5,now())', [user.id, profile?.name ?? user.email.split('@')[0], user.email, user.email_verified, user.created_at])
    await client.query('insert into auth_account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values($1,$2,\'credential\',$2,$3,now(),now())', [randomUUID(), user.id, user.password_hash])
    if (profile?.role === 'owner') {
      for (let i = 0; i < 8; i++) {
        const code = randomBytes(24).toString('hex')
        await client.query('insert into recovery_codes(user_id,code_hash) values($1,$2)', [user.id, createHash('sha256').update(code).digest('hex')])
        codes.push(code)
      }
    }
  }
  await client.query('commit')
  await mkdir('.private', { recursive: true })
  await writeFile('.private/CODIGOS-RECUPERACAO.txt', 'MACHADO GESTÃO — guardar fora do celular e não compartilhar.\nCada código permite redefinir a senha do proprietário uma única vez.\nAcesse o site > Painel > Esqueci minha senha.\n\n' + codes.join('\n'))
  const counts = {}
  for (const table of schema.tables) counts[table.name] = Number((await client.query(`select count(*) as n from public."${table.name}"`)).rows[0].n)
  for (const [name, expected] of Object.entries(source)) {
    if (name !== 'auth_users' && counts[name] !== expected.length) throw new Error(`Divergência de contagem em ${name}`)
  }
  await writeFile('.private/migration-verification.json', JSON.stringify({ date: new Date().toISOString(), counts, users: source.auth_users.length, source: 'Supabase', target: 'Neon / Vercel', verified: true }, null, 2))
  console.log('Migração verificada:', schema.tables.length, 'tabelas e', source.auth_users.length, 'conta. Senha existente preservada. Códigos de recuperação salvos em arquivo privado.')
} catch (error) {
  await client.query('rollback').catch(() => {})
  throw error
} finally { await client.end(); await pool.end() }

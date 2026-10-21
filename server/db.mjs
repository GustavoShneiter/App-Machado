import pg from 'pg'
import { attachDatabasePool } from '@vercel/functions'

const connection = process.env.DATABASE_URL
if (!connection) throw new Error('DATABASE_URL não configurada no servidor.')
const url = new URL(connection)
url.searchParams.delete('sslmode')
export const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: true }, max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 15000, statement_timeout: 20000 })
if (process.env.VERCEL) attachDatabasePool(pool)

export async function transaction(userId, work, options = {}) {
  const client = await pool.connect()
  try {
    await client.query(options.readOnly ? 'begin isolation level repeatable read read only' : 'begin')
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [userId ?? ''])
    const result = await work(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally { client.release() }
}

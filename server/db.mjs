import pg from 'pg'
import { attachDatabasePool } from '@vercel/functions'

const connection = process.env.DATABASE_URL
if (!connection) throw new Error('DATABASE_URL não configurada no servidor.')
const url = new URL(connection)
url.searchParams.delete('sslmode')
export const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: true }, max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 15000, statement_timeout: 20000 })
if (process.env.VERCEL) attachDatabasePool(pool)

const fail = (message, status) => Object.assign(new Error(message), { status })
const isUuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)

// Resolve with the privileged server connection, BEFORE changing to the runtime
// role. The caller's identity is supplied by the verified Better Auth session.
export async function resolveBusinessUnit(client, userId, businessSlug) {
  let actorUnit
  if (userId != null) {
    if (!isUuid(userId)) throw fail('Entre novamente para continuar.', 401)
    actorUnit = (await client.query('select b.id,b.slug,b.name,b.is_primary from profiles p join business_units b on b.id=p.tenant_id where p.id=$1::uuid and p.active and b.active', [userId])).rows[0]
    if (!actorUnit) throw fail('Seu acesso está inativo ou indisponível.', 401)
  }
  if (businessSlug !== undefined && businessSlug !== null) {
    if (typeof businessSlug !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(businessSlug)) throw fail('Unidade não encontrada.', 404)
    const unit = (await client.query('select id,slug,name,is_primary from business_units where slug=$1 and active', [businessSlug])).rows[0]
    if (!unit) throw fail('Unidade não encontrada.', 404)
    if (actorUnit && actorUnit.id !== unit.id) throw fail('Sua conta não tem acesso a esta unidade.', 403)
    return unit
  }
  if (actorUnit) return actorUnit
  const primary = (await client.query('select id,slug,name,is_primary from business_units where is_primary and active')).rows[0]
  if (!primary) throw fail('A unidade está indisponível.', 503)
  return primary
}

export async function transaction(userId, work, options = {}) {
  const client = await pool.connect()
  try {
    await client.query(options.readOnly ? 'begin isolation level repeatable read read only' : 'begin')
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [userId ?? ''])
    if (options.internal === true) {
      // Reserved for server-owned provisioning and global backup jobs. Request
      // bodies must NEVER be forwarded as options to this function.
      await client.query("select set_config('request.business_id','',true)")
    } else {
      const unit = await resolveBusinessUnit(client, userId, options.businessSlug)
      await client.query("select set_config('request.business_id',$1,true)", [unit.id])
      await client.query('set local role machado_runtime')
    }
    const result = await work(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally { client.release() }
}

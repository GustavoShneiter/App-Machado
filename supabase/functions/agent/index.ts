import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, '0')).join('')

async function authorize(request: Request) {
  const raw = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!raw) return null
  const { data } = await supabase.from('agent_integrations').select('id,name,rate_limit_per_minute').eq('token_hash', await hash(raw)).eq('active', true).maybeSingle()
  return data
}
async function audit(integration: string | null, operation: string, result: string, requestSummary: Record<string, unknown> = {}, errorCode?: string) {
  await supabase.from('audit_logs').insert({ integration_id: integration, operation, result, request_summary: requestSummary, error_code: errorCode })
}
async function rateLimited(integration: { id: string; rate_limit_per_minute: number }) {
  const bucket = new Date(); bucket.setSeconds(0, 0)
  const { data: existing } = await supabase.from('agent_rate_buckets').select('request_count').eq('integration_id', integration.id).eq('bucket_start', bucket.toISOString()).maybeSingle()
  const count = (existing?.request_count ?? 0) + 1
  if (count > integration.rate_limit_per_minute) return true
  await supabase.from('agent_rate_buckets').upsert({ integration_id: integration.id, bucket_start: bucket.toISOString(), request_count: count })
  return false
}

Deno.serve(async (request) => {
  const path = new URL(request.url).pathname.replace(/^\/agent/, '') || '/'
  const operation = `${request.method} ${path}`
  const integration = await authorize(request)
  if (!integration) { await audit(null, operation, 'denied', {}, 'unauthorized'); return json({ error: 'unauthorized' }, 401) }
  if (await rateLimited(integration)) { await audit(integration.name, operation, 'denied', {}, 'rate_limited'); return json({ error: 'rate_limited' }, 429) }
  try {
    if (request.method === 'GET' && path === '/services') {
      const { data, error } = await supabase.from('services').select('id,name,description,price_cents,duration_minutes').eq('active', true).order('name'); if (error) throw error
      await audit(integration.name, operation, 'ok'); return json({ data })
    }
    if (request.method === 'GET' && path === '/professionals') {
      const { data, error } = await supabase.from('professionals').select('id,name,specialties').eq('active', true).order('name'); if (error) throw error
      await audit(integration.name, operation, 'ok'); return json({ data })
    }
    if (request.method === 'GET' && path === '/customers') {
      const phone = new URL(request.url).searchParams.get('phone')?.replace(/\D/g, '')
      if (!phone) return json({ error: 'phone_required' }, 400)
      const { data, error } = await supabase.from('customers').select('id,name,phone').eq('phone', phone).maybeSingle(); if (error) throw error
      await audit(integration.name, operation, 'ok', { phone_suffix: phone.slice(-4) }); return json({ data })
    }
    if (request.method === 'PUT' && path === '/customers') {
      const body = await request.json(); const phone = String(body.phone ?? '').replace(/\D/g, ''); const name = String(body.name ?? '').trim()
      if (phone.length < 10 || name.length < 2) return json({ error: 'invalid_customer' }, 400)
      const { data, error } = await supabase.from('customers').upsert({ phone, name }, { onConflict: 'phone' }).select('id,name,phone').single(); if (error) throw error
      await audit(integration.name, operation, 'ok', { phone_suffix: phone.slice(-4) }); return json({ data }, 200)
    }
    if (request.method === 'POST' && path === '/appointments') {
      const body = await request.json(); const phone = String(body.customer?.phone ?? '').replace(/\D/g, '')
      if (!body.customer?.name || phone.length < 10 || !body.service_id || !body.professional_id || !body.starts_at) return json({ error: 'invalid_appointment' }, 400)
      const { data, error } = await supabase.rpc('create_public_appointment', { customer_name: body.customer.name, customer_phone: phone, chosen_service: body.service_id, chosen_professional: body.professional_id, start_time: body.starts_at, terms_accepted: true })
      if (error) { const conflict = error.message.includes('conflicting key'); await audit(integration.name, operation, 'error', { phone_suffix: phone.slice(-4) }, conflict ? 'conflict' : 'invalid'); return json({ error: conflict ? 'slot_unavailable' : 'invalid_appointment' }, conflict ? 409 : 400) }
      await audit(integration.name, operation, 'ok', { appointment_id: data, phone_suffix: phone.slice(-4) }); return json({ id: data, status: 'scheduled' }, 201)
    }
    await audit(integration.name, operation, 'denied', {}, 'operation_not_allowed')
    return json({ error: 'operation_not_allowed' }, 403)
  } catch (error) {
    console.error(error); await audit(integration.name, operation, 'error', {}, 'internal_error'); return json({ error: 'internal_error' }, 500)
  }
})

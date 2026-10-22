import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const base = process.env.TEST_BASE_URL || 'https://barbearia-machado-rose.vercel.app'
const origin = 'capacitor://localhost'
const account = JSON.parse(await readFile('.private/native-access.json', 'utf8'))
let token
try {
  const preflight = await fetch(base + '/api/rpc', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } })
  assert.ok([200, 204].includes(preflight.status)); assert.equal(preflight.headers.get('access-control-allow-origin'), origin)
  const login = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password, rememberMe: true }) })
  assert.equal(login.status, 200, 'Não foi possível validar o acesso nativo iOS.')
  assert.equal(login.headers.get('access-control-allow-origin'), origin)
  assert.match(login.headers.get('access-control-expose-headers') || '', /set-auth-token/i)
  token = login.headers.get('set-auth-token'); assert.ok(token)
  const headers = { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  const session = await fetch(base + '/api/auth/get-session', { headers }); assert.equal(session.status, 200)
  const current = await session.json(); assert.equal(current.user.id, account.id)
  for (const name of ['can_access_admin', 'office_snapshot']) {
    const response = await fetch(base + '/api/rpc', { method: 'POST', headers, body: JSON.stringify({ name, params: {} }) })
    assert.equal(response.status, 200)
    const result = await response.json(); assert.equal(result.error, null)
    if (name === 'can_access_admin') assert.equal(result.data, true)
    else assert.ok(Array.isArray(result.data.appointments) && Array.isArray(result.data.customers))
  }
  console.log('PASS API iOS: origem capacitor://localhost, preflight, acesso automático, token acessível, sessão e leitura da Agenda no Neon.')
} finally {
  if (token) {
    const logout = await fetch(base + '/api/auth/sign-out', { method: 'POST', headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' })
    assert.equal(logout.status, 200)
  }
}

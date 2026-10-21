/* eslint-disable @typescript-eslint/no-explicit-any */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { publicSiteUrl, fetchWithTimeout } from './runtime'

export type ApiError = { message: string; status?: number; code?: string }
type Session = { user: { id: string; email: string } }
type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY'
const listeners = new Set<(event: AuthEvent, session: Session | null) => void>()
const tokenKey = 'machado-native-session-v1'
export const apiOrigin = Capacitor.isNativePlatform() ? publicSiteUrl : ''
let cachedSession: Session | null = null
let checkedAt = 0
let sessionRequest: Promise<Session | null> | null = null
const managedAccess = registerPlugin<{ credentials(): Promise<{ email: string; password: string }> }>('ManagedAccess')

export async function apiRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  if (Capacitor.isNativePlatform()) {
    const token = localStorage.getItem(tokenKey)
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetchWithTimeout(`${apiOrigin}/api${path}`, { ...options, headers, credentials: Capacitor.isNativePlatform() ? 'omit' : 'same-origin' })
  if (Capacitor.isNativePlatform()) {
    const token = response.headers.get('set-auth-token')
    if (token) localStorage.setItem(tokenKey, token)
  }
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(typeof result.error === 'string' ? result.error : result.error?.message || result.message || 'Não foi possível concluir a operação.'), { status: response.status, code: result.error?.code || result.code })
  return result
}
const notify = (event: AuthEvent, session: Session | null) => { cachedSession = session; checkedAt = Date.now(); for (const listener of listeners) listener(event, session) }
async function getSession(force = false) {
  if (force || Date.now() - checkedAt > 15000) {
    sessionRequest ??= (async () => {
      let result = await apiRequest('/auth/get-session')
      if (!result?.user && Capacitor.isNativePlatform()) {
        const credentials = await managedAccess.credentials()
        result = await apiRequest('/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ ...credentials, rememberMe: true }) })
      }
      cachedSession = result?.user ? { user: result.user } : null
      checkedAt = Date.now()
      return cachedSession
    })().finally(() => { sessionRequest = null })
    await sessionRequest
  }
  return { data: { session: cachedSession }, error: null }
}
export const backend = {
  async rpc(name: string, params: Record<string, unknown> = {}): Promise<{ data: any; error: ApiError | null }> {
    try {
      if (name === 'catalog') return await apiRequest('/catalog')
      const request = () => apiRequest('/rpc', { method: 'POST', body: JSON.stringify({ name, params }) })
      try { return await request() }
      catch (error) {
        if (!Capacitor.isNativePlatform() || (error as ApiError).status !== 401) throw error
        await getSession(true)
        return await request()
      }
    } catch (error) { const cause = error as ApiError; return { data: null, error: cause.status ? cause : { message: 'Não foi possível conectar ao sistema. Confira a internet e tente novamente.' } } }
  },
  auth: {
    getSession,
    onAuthStateChange(callback: (event: AuthEvent, session: Session | null) => void) {
      listeners.add(callback)
      return { data: { subscription: { unsubscribe: () => { listeners.delete(callback) } } } }
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const result = await apiRequest('/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password, rememberMe: true }) })
        notify('SIGNED_IN', { user: result.user })
        return { data: result, error: null }
      } catch (error) { return { data: null, error: error as ApiError } }
    },
    async signOut() {
      try {
        await apiRequest('/auth/sign-out', { method: 'POST', body: '{}' })
        if (Capacitor.isNativePlatform()) localStorage.removeItem(tokenKey)
        notify('SIGNED_OUT', null)
        return { error: null }
      } catch (error) { return { error: error as ApiError } }
    },
  },
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Capacitor } from '@capacitor/core'
import { publicSiteUrl, fetchWithTimeout, publicUnitSlug } from './runtime'
import { isProfessionalExperience } from './appExperience'

export type ApiError = { message: string; status?: number; code?: string }
type Session = { user: { id: string; email: string } }
type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY'
const listeners = new Set<(event: AuthEvent, session: Session | null) => void>()
const tokenKey = isProfessionalExperience() ? 'machado-professional-session-v1' : 'machado-native-session-v2'
// Existing private APKs used a shared managed account. Require an individual
// login after updating; professional sessions and web cookies are untouched.
if (Capacitor.isNativePlatform() && !isProfessionalExperience()) localStorage.removeItem('machado-native-session-v1')
export const apiOrigin = Capacitor.isNativePlatform() ? publicSiteUrl : ''
let cachedSession: Session | null = null
let checkedAt = 0
let sessionRequest: Promise<Session | null> | null = null
let sessionRevision = 0

export type OfficeRegistration = {
  user: { id: string; name: string; email: string }
  business: { id: string; name: string }
  recoveryCodes: string[]
}

export async function apiRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const requestRevision = sessionRevision
  if (isProfessionalExperience() && path.startsWith('/auth/')) path = '/professional-auth/' + path.slice('/auth/'.length)
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  if (Capacitor.isNativePlatform()) {
    const token = localStorage.getItem(tokenKey)
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetchWithTimeout(`${apiOrigin}/api${path}`, { ...options, headers, credentials: Capacitor.isNativePlatform() ? 'omit' : 'same-origin' })
  if (Capacitor.isNativePlatform() && requestRevision === sessionRevision) {
    const token = response.headers.get('set-auth-token')
    if (token) localStorage.setItem(tokenKey, token)
  }
  const result = await response.json()
  if (response.status === 401 && requestRevision === sessionRevision && !path.startsWith('/auth/') && !path.startsWith('/professional-auth/')) {
    if (Capacitor.isNativePlatform()) localStorage.removeItem(tokenKey)
    notify('SIGNED_OUT', null)
    window.dispatchEvent(new Event(isProfessionalExperience() ? 'professional:session-expired' : 'office:session-expired'))
  }
  if (!response.ok) throw Object.assign(new Error(typeof result.error === 'string' ? result.error : result.error?.message || result.message || 'Não foi possível concluir a operação.'), { status: response.status, code: result.error?.code || result.code })
  return result
}
const notify = (event: AuthEvent, session: Session | null) => { sessionRevision++; cachedSession = session; checkedAt = Date.now(); for (const listener of listeners) listener(event, session) }
async function getSession(force = false) {
  if (force || Date.now() - checkedAt > 15000) {
    sessionRequest ??= (async () => {
      const revision = sessionRevision
      const result = await apiRequest('/auth/get-session')
      if (revision === sessionRevision) {
        const hadSession = Boolean(cachedSession)
        cachedSession = result?.user ? { user: result.user } : null
        checkedAt = Date.now()
        if (!cachedSession && Capacitor.isNativePlatform()) localStorage.removeItem(tokenKey)
        if (!cachedSession && hadSession) notify('SIGNED_OUT', null)
      }
      return cachedSession
    })().finally(() => { sessionRequest = null })
    await sessionRequest
  }
  return { data: { session: cachedSession }, error: null }
}
export const backend = {
  async rpc(name: string, params: Record<string, unknown> = {}): Promise<{ data: any; error: ApiError | null }> {
    try {
      const unit = publicUnitSlug()
      if (name === 'catalog') return await apiRequest('/catalog' + (unit ? '?unit=' + encodeURIComponent(unit) : ''))
      const publicRpc = ['public_booking_slots', 'public_available_slots', 'create_public_appointment'].includes(name)
      const request = () => apiRequest('/rpc' + (unit && publicRpc ? '?unit=' + encodeURIComponent(unit) : ''), { method: 'POST', body: JSON.stringify({ name, params }) })
      try { return await request() }
      catch (error) {
        if ((error as ApiError).status !== 401) throw error
        const session = await getSession(true)
        if (!session.data.session) throw error
        return await request()
      }
    } catch (error) { const cause = error as ApiError; return { data: null, error: cause.status ? cause : { message: 'Não foi possível conectar ao sistema. Confira a internet e tente novamente.' } } }
  },
  auth: {
    getSession,
    async registerOfficeAccount(input: { name: string; business_name: string; email: string; password: string }): Promise<{ data: OfficeRegistration | null; error: ApiError | null }> {
      try {
        const result = await apiRequest<{ data: OfficeRegistration }>('/register', { method: 'POST', body: JSON.stringify(input) })
        return { data: result.data, error: null }
      } catch (error) { const cause = error as ApiError; return { data: null, error: cause.status ? cause : { message: 'Não foi possível conectar ao sistema. Confira a internet e tente novamente.' } } }
    },
    onAuthStateChange(callback: (event: AuthEvent, session: Session | null) => void) {
      listeners.add(callback)
      return { data: { subscription: { unsubscribe: () => { listeners.delete(callback) } } } }
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const result = await apiRequest('/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password, rememberMe: true }) })
        notify('SIGNED_IN', { user: result.user })
        return { data: result, error: null }
      } catch (error) { const cause = error as ApiError; return { data: null, error: cause.status ? cause : { message: 'Não foi possível conectar ao sistema. Confira a internet e tente novamente.' } } }
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

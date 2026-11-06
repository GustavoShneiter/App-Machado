import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Copy } from 'lucide-react'
import { backend, type OfficeRegistration } from './dataClient'
import { AdminWebHelp } from './AdminWebApp'
import { isWebApp } from './appExperience'
import { copyText } from './deviceTools'
import './admin-access.css'

export function AdminAccess({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [registration, setRegistration] = useState<OfficeRegistration | null>(null)
  const [copied, setCopied] = useState(false)
  const [invalidField, setInvalidField] = useState('')
  const native = Capacitor.isNativePlatform()

  useEffect(() => {
    let alive = true, generation = 0
    const check = async (hasSession: boolean) => {
      const current = ++generation
      if (!hasSession) { if (alive) { setAllowed(false); setChecking(false) }; return }
      try {
        const result = await backend.rpc('can_access_admin')
        if (!alive || current !== generation) return
        setAllowed(!result.error && result.data === true)
        if (result.error) setError('Não foi possível verificar o acesso. Tente novamente.')
        else if (result.data !== true) setError('Esta conta não tem permissão para acessar o painel.')
      } catch {
        if (alive && current === generation) { setAllowed(false); setError('Não foi possível verificar o acesso. Tente novamente.') }
      } finally { if (alive && current === generation) setChecking(false) }
    }
    const { data } = backend.auth.onAuthStateChange((_event, session) => { window.setTimeout(() => { if (alive) void check(Boolean(session)) }, 0) })
    void backend.auth.getSession().then(result => check(Boolean(result.data.session))).catch(() => {
      if (alive) { setChecking(false); setError('Não foi possível verificar o acesso. Confira sua conexão e tente novamente.') }
    })
    return () => { alive = false; generation++; data.subscription.unsubscribe() }
  }, [attempt])

  const switchMode = (next: 'login' | 'register') => {
    if (submitting) return
    setMode(next); setError(''); setMessage(''); setPassword(''); setConfirmation(''); setInvalidField('')
  }
  const invalid = (form: HTMLFormElement, field: string, text: string) => {
    setInvalidField(field); setError(text)
    const control = form.elements.namedItem(field)
    if (control instanceof HTMLInputElement) control.focus()
  }
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    if (!navigator.onLine) { setError('Sem internet. Reconecte para entrar no painel.'); return }
    if (!validEmail.test(email.trim()) || email.trim().length > 254) { invalid(event.currentTarget as HTMLFormElement, 'email', 'Informe um e-mail válido.'); return }
    if (!password) { invalid(event.currentTarget as HTMLFormElement, 'password', 'Informe sua senha.'); return }
    setSubmitting(true); setError(''); setMessage(''); setInvalidField('')
    try {
      const result = await backend.auth.signInWithPassword({ email: email.trim(), password })
      if (result.error) setError([400, 401].includes(result.error.status ?? 0) ? 'E-mail ou senha inválidos.' : result.error.status === 429 ? 'Muitas tentativas. Aguarde um minuto para entrar.' : result.error.message || 'Não foi possível entrar. Tente novamente.')
      else setPassword('')
    } catch { setError('Não foi possível entrar. Confira sua conexão e tente novamente.') }
    finally { setSubmitting(false) }
  }
  const register = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    if (!navigator.onLine) { setError('Sem internet. Reconecte para criar sua conta.'); return }
    const form = event.currentTarget as HTMLFormElement
    if (name.trim().length < 2 || name.trim().length > 80) { invalid(form, 'name', 'Informe seu nome, com 2 a 80 caracteres.'); return }
    if (businessName.trim().length < 2 || businessName.trim().length > 120) { invalid(form, 'business_name', 'Informe o nome da unidade, com 2 a 120 caracteres.'); return }
    if (!validEmail.test(email.trim()) || email.trim().length > 254) { invalid(form, 'email', 'Informe um e-mail válido.'); return }
    if (password.length < 12 || password.length > 128) { invalid(form, 'password', 'Use uma senha com 12 a 128 caracteres.'); return }
    if (password !== confirmation) { invalid(form, 'confirmation', 'As senhas precisam ser iguais.'); return }
    setSubmitting(true); setError(''); setInvalidField('')
    try {
      const result = await backend.auth.registerOfficeAccount({ name: name.trim(), business_name: businessName.trim(), email: email.trim(), password })
      if (result.error || !result.data) { setError(result.error?.message || 'Não foi possível criar a conta. Tente novamente.'); return }
      setPassword(''); setConfirmation(''); setMode('login'); setEmail(result.data.user.email)
      setMessage('Conta criada. Entre com seu e-mail e senha para começar.')
      setRegistration(result.data); setCopied(false)
    } catch { setError('Não foi possível criar a conta. Confira sua conexão e tente novamente.') }
    finally { setSubmitting(false) }
  }

  if (allowed) return <>{children}</>
  if (checking) return <main className="auth-shell"><p role="status">{native || isWebApp() ? 'Abrindo Machado Gestão…' : 'Verificando acesso…'}</p></main>
  if (registration) return <main className="auth-shell access-shell"><section className="auth-card access-card access-recovery" aria-labelledby="registration-title">
    <span className="brand-mark">BM</span>
    <h1 id="registration-title">Sua unidade está pronta</h1>
    <p><strong>{registration.business.name}</strong> foi cadastrada. Agora guarde os códigos de recuperação da sua conta.</p>
    <div className="access-recovery-codes" aria-label="Códigos de recuperação">{registration.recoveryCodes.map((code, index) => <div key={code}><span>Código {index + 1}</span><code>{code}</code></div>)}</div>
    <p className="access-recovery-note">Cada código recupera seu acesso uma única vez. Guarde-os em um local seguro: eles não serão mostrados novamente.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="outline access-copy" onClick={async () => { try { await copyText(`Machado Gestão — ${registration.business.name}\nConta: ${registration.user.email}\n\nCódigos de recuperação (uso único):\n${registration.recoveryCodes.join('\n')}`); setCopied(true); setError('') } catch { setError('Não foi possível copiar. Anote os códigos antes de continuar.') } }}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Códigos copiados' : 'Copiar códigos'}</button>
    <button className="primary access-submit" onClick={() => { setRegistration(null); setError('') }}>Guardei os códigos. Entrar</button>
  </section></main>

  const creating = mode === 'register'
  return <main className="auth-shell access-shell"><div className="web-login access-layout">
    <form className="auth-card access-card" onSubmit={creating ? register : signIn} noValidate>
      {creating && <button type="button" className="access-back" onClick={() => switchMode('login')} disabled={submitting}><ArrowLeft size={16} />Voltar ao login</button>}
      <span className="brand-mark">BM</span>
      <h1>{creating ? 'Cadastrar unidade' : native || isWebApp() ? 'Machado Gestão' : 'Entrar no painel'}</h1>
      <p>{creating ? 'Crie a conta responsável por uma nova unidade da Machado. Os dados de cada unidade ficam separados.' : 'Entre com o e-mail e a senha da sua conta administrativa.'}</p>
      {creating && <>
        <label className="field"><span>Seu nome</span><input name="name" required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={event => setName(event.target.value)} disabled={submitting} aria-invalid={invalidField === 'name'} aria-describedby={invalidField === 'name' ? 'access-error' : undefined} /></label>
        <label className="field"><span>Nome da unidade</span><input name="business_name" required minLength={2} maxLength={120} autoComplete="organization" placeholder="Ex.: Machado — Centro" value={businessName} onChange={event => setBusinessName(event.target.value)} disabled={submitting} aria-invalid={invalidField === 'business_name'} aria-describedby={invalidField === 'business_name' ? 'access-error' : undefined} /></label>
      </>}
      <label className="field"><span>E-mail</span><input name="email" type="email" autoComplete={creating ? 'email' : 'username'} autoCapitalize="none" spellCheck={false} maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} disabled={submitting} aria-invalid={invalidField === 'email'} aria-describedby={invalidField === 'email' ? 'access-error' : undefined} /></label>
      <label className="field"><span>Senha</span><input name="password" type="password" autoComplete={creating ? 'new-password' : 'current-password'} minLength={creating ? 12 : undefined} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} disabled={submitting} aria-invalid={invalidField === 'password'} aria-describedby={invalidField === 'password' ? 'access-error' : undefined} /></label>
      {creating && <><label className="field"><span>Repita a senha</span><input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={submitting} aria-invalid={invalidField === 'confirmation'} aria-describedby={invalidField === 'confirmation' ? 'access-error' : undefined} /></label><p className="access-password-note">Use pelo menos 12 caracteres.</p></>}
      {error && <p className="form-error" role="alert" id="access-error">{error}</p>}
      {message && <p className="access-success" role="status">{message}</p>}
      <button className="primary access-submit" disabled={submitting}>{submitting ? creating ? 'Criando unidade…' : 'Entrando…' : creating ? 'Criar conta e unidade' : 'Entrar'}</button>
      {!creating && <>
        <div className="access-secondary"><Link to="/recuperar-acesso">Esqueci minha senha</Link><button type="button" onClick={() => switchMode('register')} disabled={submitting}>Cadastrar conta</button></div>
        {(isWebApp() || native) ? !native && <Link className="access-install" to="/instalar">Adicionar ao iPhone</Link> : <a className="access-install" href="/agendar">Agendamento público</a>}
        {error && <button type="button" className="access-recheck" onClick={() => { setChecking(true); setError(''); setAttempt(value => value + 1) }}>Verificar conexão novamente</button>}
      </>}
    </form>
    {!creating && <AdminWebHelp />}
  </div></main>
}

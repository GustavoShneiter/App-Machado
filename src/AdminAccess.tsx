import { useEffect, useState, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { Link } from 'react-router-dom'
import { backend } from './dataClient'
import { AdminWebHelp } from './AdminWebApp'
import { isWebApp } from './appExperience'

export function AdminAccess({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const native = Capacitor.isNativePlatform()
  useEffect(() => {
    const client = backend
    if (!client) { setError('Conexão indisponível.'); setChecking(false); return }
    let alive = true; let generation = 0
    const check = async (hasSession: boolean) => {
      const current = ++generation
      if (!hasSession) { if (alive) { setAllowed(false); setChecking(false) }; return }
      try {
        const result = await client.rpc('can_access_admin')
        if (!alive || current !== generation) return
        setAllowed(!result.error && result.data === true)
        if (result.error) setError('Não foi possível verificar o acesso. Atualize a página.')
        else if (result.data !== true) setError('Esta conta não tem permissão para acessar o painel.')
      } catch { if (alive && current === generation) { setAllowed(false); setError('Não foi possível verificar o acesso. Tente novamente.') } }
      finally { if (alive && current === generation) setChecking(false) }
    }
    // Consulta fora do callback de autenticação para evitar bloquear o cliente.
    const { data } = client.auth.onAuthStateChange((_event, session) => { window.setTimeout(() => { if (alive) void check(Boolean(session)) }, 0) })
    void client.auth.getSession().then(r => check(Boolean(r.data.session))).catch(() => {
      if (alive) { setChecking(false); setError('Não foi possível verificar o acesso. Confira sua conexão e tente novamente.') }
    })
    return () => { alive = false; generation++; data.subscription.unsubscribe() }
  }, [attempt])
  const signIn = async (event: React.FormEvent) => {
    event.preventDefault(); if (!backend) return
    if (!navigator.onLine) { setError('Sem internet. Reconecte para entrar no painel.'); return }
    setChecking(true); setError('')
    try {
      const result = await backend.auth.signInWithPassword({ email: email.trim(), password })
      if (result.error) { setError([400,401].includes(result.error.status ?? 0) ? 'E-mail ou senha inválidos.' : result.error.status===429 ? 'Muitas tentativas. Aguarde um minuto para entrar.' : 'Não foi possível entrar. Confira sua conexão e tente novamente.'); setChecking(false) }
    } catch { setError('Não foi possível entrar. Confira sua conexão e tente novamente.'); setChecking(false) }
  }
  if (allowed) return <>{children}</>
  if (checking) return <main className="auth-shell"><p role="status">{native || isWebApp() ? 'Abrindo a barbearia…' : 'Verificando acesso…'}</p></main>
  if (native) return <main className="auth-shell"><section className="auth-card"><span className="brand-mark">BM</span><h1>Não foi possível abrir o painel</h1><p role="alert">{error || 'O acesso deste aplicativo está indisponível. Entre em contato com o responsável pela barbearia.'}</p><button className="primary" onClick={() => { setChecking(true); setError(''); setAttempt(value => value + 1) }}>Tentar novamente</button></section></main>
  return <main className="auth-shell"><div className="web-login"><form className="auth-card" onSubmit={signIn}><span className="brand-mark">BM</span><h1>{isWebApp() ? 'Machado Gestão' : 'Entrar no painel'}</h1>{isWebApp() && <p>Entre uma vez para autorizar este aparelho.</p>}<label className="field"><span>E-mail</span><input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label><label className="field"><span>Senha</span><input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary">Entrar</button><Link to="/recuperar-acesso">Esqueci minha senha</Link>{isWebApp() ? <Link to="/instalar">Adicionar ao iPhone</Link> : <a href="/agendar">Agendamento público</a>}</form><AdminWebHelp /></div></main>
}

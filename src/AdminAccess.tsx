import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabaseClient'

export function AdminAccess({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const client = supabase
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
    void client.auth.getSession().then(r => check(Boolean(r.data.session)))
    return () => { alive = false; generation++; data.subscription.unsubscribe() }
  }, [])
  const signIn = async (event: React.FormEvent) => {
    event.preventDefault(); if (!supabase) return
    setChecking(true); setError('')
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (result.error) { setError('E-mail ou senha inválidos.'); setChecking(false) }
  }
  if (allowed) return <>{children}</>
  if (checking) return <main className="auth-shell"><p>Verificando acesso…</p></main>
  return <main className="auth-shell"><form className="auth-card" onSubmit={signIn}><span className="brand-mark">BM</span><h1>Entrar no painel</h1><label className="field"><span>E-mail</span><input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label><label className="field"><span>Senha</span><input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>{error && <p className="form-error">{error}</p>}<button className="primary">Entrar</button><a href="/agendar">Agendamento público</a></form></main>
}

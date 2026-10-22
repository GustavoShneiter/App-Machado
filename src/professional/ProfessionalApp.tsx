import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, Download, KeyRound, Plus, RefreshCw, Smartphone, WalletCards } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { apiRequest, backend } from '../dataClient'
import { CatalogProvider } from '../CatalogStore'
import { OperationsProvider, useOperations } from '../OperationsStore'
import { Agenda } from '../ManagementPages'
import { dismissTopLayer } from '../dismissibleLayers'
import { professionalApkUrl } from '../runtime'
import { ProfessionalCash } from './ProfessionalCash'
import { ProfessionalAccountModal } from './ProfessionalAccount'
import type { ProfessionalAccess } from './types'

export default function ProfessionalApp() {
  return <Routes>
    <Route path="/profissional/p/:legacyId/*" element={<LegacyAccess />} />
    <Route path="/profissional/instalar" element={<ProfessionalInstall />} />
    <Route path="/profissional/*" element={<ProfessionalGate />} />
    <Route path="*" element={<Navigate to="/profissional" replace />} />
  </Routes>
}
function LegacyAccess() {
  const { pathname } = useLocation()
  const section = pathname.endsWith('/instalar') ? 'instalar' : pathname.endsWith('/caixa') ? 'caixa' : 'agenda'
  return <Navigate to={'/profissional/' + section} replace />
}
function ProfessionalGate() {
  const [access, setAccess] = useState<ProfessionalAccess | null>(null)
  const [checking, setChecking] = useState(true), [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!access) return
    const expire = () => { setAccess(null); setChecking(false); setError('Sua sessão terminou. Entre novamente.') }
    window.addEventListener('professional:session-expired', expire)
    return () => window.removeEventListener('professional:session-expired', expire)
  }, [access])
  useEffect(() => {
    let alive = true
    setChecking(true); setAccess(null); setError('')
    void apiRequest<{ data: ProfessionalAccess }>('/professional/access')
      .then(result => { if (alive) setAccess(result.data) })
      .catch(cause => { if (alive && cause.status !== 401) setError(cause.message) })
      .finally(() => { if (alive) setChecking(false) })
    return () => { alive = false }
  }, [attempt])
  if (checking) return <main className="auth-shell professional-login"><p role="status">Abrindo Machado Profissional…</p></main>
  if (!access) return <main className="auth-shell professional-login"><div className="pro-login-wrap">
    <form className="auth-card" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setError(''); setBusy(true)
      try {
        const result = await backend.auth.signInWithPassword({ email: email.trim(), password })
        if (result.error) {
          setError([400, 401].includes(result.error.status ?? 0) ? 'E-mail ou senha inválidos.' : result.error.status === 429 ? 'Muitas tentativas. Aguarde um minuto.' : result.error.message)
          return
        }
        setPassword(''); setAttempt(value => value + 1)
      } finally { setBusy(false) }
    }}>
      <div className="pro-login-brand"><img className="pro-login-icon" src="/professional-icon-192.png" alt="" /><span><small>Barbearia Machado</small><strong>Área do profissional</strong></span></div>
      <h1>Entre na sua conta</h1><p>Consulte sua agenda, acompanhe suas comissões e suas metas.</p>
      <label className="field"><span>E-mail de acesso</span><input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label className="field"><span>Senha</span><input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      <p className="pro-login-help">Use o e-mail e a senha definidos pela administração da barbearia.</p>
    </form>
    {!Capacitor.isNativePlatform() && <div className="pro-install-links"><a href={professionalApkUrl}><Download size={17} /><span>Baixar para Android</span></a><Link to="/profissional/instalar"><Smartphone size={17} /><span>Instalar no iPhone</span></Link></div>}
    <p className="pro-login-footer">Esqueceu seu acesso? Peça à administração para definir uma nova senha.</p>
  </div></main>
  return <CatalogProvider professionalId={access.profile.id} key={access.profile.id}><OperationsProvider professionalId={access.profile.id}><ProfessionalLayout access={access} signedOut={() => setAttempt(value => value + 1)} /></OperationsProvider></CatalogProvider>
}
function ProfessionalLayout({ access, signedOut }: { access: ProfessionalAccess; signedOut: () => void }) {
  const { profile } = access
  const { busy, loading, error, refresh, clearError } = useOperations()
  const location = useLocation(), navigate = useNavigate()
  const cash = location.pathname.endsWith('/caixa')
  const [accountOpen, setAccountOpen] = useState(false)
  const locationRef = useRef(location); locationRef.current = location
  useEffect(() => { clearError() }, [location.pathname, clearError])
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let disposed = false
    let remove: (() => Promise<void>) | undefined
    void CapacitorApp.addListener('backButton', () => {
      if (dismissTopLayer()) return
      if (locationRef.current.pathname.endsWith('/caixa')) navigate('/profissional/agenda', { replace: true })
      else void CapacitorApp.exitApp()
    }).then(handle => { if (disposed) void handle.remove(); else remove = () => handle.remove() })
    return () => { disposed = true; if (remove) void remove() }
  }, [navigate])
  return <div className="app-shell professional-app">
    <main className="main">
      <header className="topbar"><div className="pro-header-identity"><span className="pro-header-avatar">{profile.photo_url ? <img src={profile.photo_url} alt="" /> : profile.name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('')}</span><div><span className="eyebrow">Machado Profissional</span><strong>{profile.name}</strong></div></div><div className="top-actions"><button className="icon-btn" aria-label="Atualizar meus dados" title="Atualizar" disabled={busy} onClick={() => void refresh()}><RefreshCw size={18} /></button><button className="icon-btn" aria-label="Minha conta" title="Minha conta" onClick={() => setAccountOpen(true)}><KeyRound size={18} /></button></div></header>
      {error && <div className="pro-load-error" role="alert">{error}<button className="outline small" onClick={() => void refresh()}>Tentar novamente</button></div>}
      {loading ? <p className="pro-loading" role="status">Carregando seus dados…</p> : <div className="section-transition" key={cash ? 'cash' : 'agenda'}><Routes><Route path="agenda" element={<Agenda professionalOnly />} /><Route path="caixa" element={<ProfessionalCash professionalId={profile.id} />} /><Route path="*" element={<Navigate to="/profissional/agenda" replace />} /></Routes></div>}
    </main>
    <nav className="mobile-nav mobile-nav-animated pro-nav" aria-label="Navegação do profissional" style={{ '--nav-index': cash ? 1 : 0, '--nav-visible': 1 } as CSSProperties}><span className="mobile-nav-highlight" aria-hidden="true" /><NavLink to="/profissional/agenda"><CalendarDays size={22} /><span>Minha Agenda</span></NavLink><NavLink to="/profissional/caixa"><WalletCards size={22} /><span>Meu Caixa</span></NavLink></nav>
    {!cash && <button className="mobile-create agenda-create-fab" aria-label="Novo agendamento, encaixe ou bloqueio" onClick={() => window.dispatchEvent(new Event('agenda:create'))}><Plus size={24} /></button>}
    {accountOpen && <ProfessionalAccountModal profile={profile} close={() => setAccountOpen(false)} signedOut={signedOut} />}
  </div>
}
function ProfessionalInstall() {
  return <main className="app-install-shell"><section className="app-install-card"><img src="/professional-icon-192.png" alt="" width="64" height="64" /><span className="eyebrow">Aplicativo da equipe</span><h1>Machado Profissional</h1><p>Todos usam o mesmo aplicativo. Entre com o e-mail e a senha definidos pela administração para abrir sua própria agenda e suas comissões.</p><a className="primary" href={professionalApkUrl}><Download size={17} />Baixar para Android</a><h2 className="pro-install-subtitle">No iPhone</h2><ol><li>Abra este site no <strong>Safari</strong>.</li><li>Toque em <strong>Compartilhar → Adicionar à Tela de Início</strong>.</li><li>Se aparecer, ative <strong>Abrir como App da Web</strong> e confirme em Adicionar.</li><li>Abra pelo ícone e entre com sua conta.</li></ol><Link className="outline" to="/profissional">Abrir sistema no navegador</Link><p className="app-install-note">É necessário ter internet. Para recuperar o acesso, fale com a administração.</p></section></main>
}

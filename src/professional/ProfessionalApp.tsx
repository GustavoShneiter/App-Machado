import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, KeyRound, LogOut, Plus, RefreshCw, Smartphone, WalletCards } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { apiRequest, backend } from '../dataClient'
import { CatalogProvider } from '../CatalogStore'
import { OperationsProvider, useOperations } from '../OperationsStore'
import { Agenda, Modal } from '../ManagementPages'
import { dismissTopLayer } from '../dismissibleLayers'
import { publicSiteUrl } from '../runtime'
import { ProfessionalCash } from './ProfessionalCash'
import type { ProfessionalAccess } from './types'

export default function ProfessionalApp() {
  return <Routes>
    <Route path="/profissional/p/:professionalId/instalar" element={<ProfessionalInstall />} />
    <Route path="/profissional/instalar" element={<ProfessionalInstall />} />
    <Route path="/profissional/p/:professionalId/*" element={<ProfessionalGate />} />
    <Route path="/profissional/*" element={<ProfessionalGate />} />
    <Route path="*" element={<Navigate to="/profissional" replace />} />
  </Routes>
}
function ProfessionalGate() {
  const { professionalId } = useParams()
  const [access, setAccess] = useState<ProfessionalAccess | null>(null)
  const [checking, setChecking] = useState(true), [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!access) return
    const expire = () => { setAccess(null); setChecking(false); setError('Sua sessão terminou. Entre novamente com seu acesso profissional.') }
    window.addEventListener('professional:session-expired', expire)
    return () => window.removeEventListener('professional:session-expired', expire)
  }, [access])
  useEffect(() => {
    let alive = true
    setChecking(true); setAccess(null); setError('')
    void apiRequest<{ data: ProfessionalAccess }>('/professional/access' + (professionalId ? '?professional_id=' + encodeURIComponent(professionalId) : '')).then(result => { if (alive) setAccess(result.data) }).catch(cause => { if (alive && cause.status !== 401) setError(cause.message) }).finally(() => { if (alive) setChecking(false) })
    return () => { alive = false }
  }, [professionalId, attempt])
  if (checking) return <main className="auth-shell"><p role="status">Abrindo Machado Profissional…</p></main>
  if (!access) return <main className="auth-shell professional-login"><form className="auth-card" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setError(''); setBusy(true)
    try {
      const result = await backend.auth.signInWithPassword({ email: email.trim(), password })
      if (result.error) { setError([400, 401].includes(result.error.status ?? 0) ? 'E-mail ou senha inválidos.' : result.error.status === 429 ? 'Muitas tentativas. Aguarde um minuto.' : result.error.message); return }
      setPassword(''); setAttempt(value => value + 1)
    } finally { setBusy(false) }
  }}>
    <img className="pro-login-icon" src="/professional-icon-192.png" alt="" /><span className="eyebrow">Barbearia Machado</span><h1>Machado Profissional</h1><p>Sua agenda e suas comissões em um só lugar.</p>
    <label className="field"><span>E-mail de acesso</span><input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
    <label className="field"><span>Senha</span><input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
    <p className="form-hint">Use o acesso fornecido pela barbearia. Para recuperar a senha, peça uma nova à administração.</p>
    {!Capacitor.isNativePlatform() && <Link to={professionalId ? `/profissional/p/${professionalId}/instalar` : '/profissional/instalar'}>Adicionar ao iPhone</Link>}
    {professionalId && error && <Link to="/profissional">Abrir meu próprio acesso</Link>}
  </form></main>
  return <CatalogProvider professionalId={access.profile.id} key={access.profile.id}><OperationsProvider professionalId={access.profile.id}><ProfessionalLayout access={access} signedOut={() => setAttempt(value => value + 1)} /></OperationsProvider></CatalogProvider>
}
function ProfessionalLayout({ access, signedOut }: { access: ProfessionalAccess; signedOut: () => void }) {
  const { profile, administrative, choices } = access
  const { busy, loading, error, refreshed, refresh, clearError } = useOperations()
  const location = useLocation(), navigate = useNavigate()
  const base = '/profissional/p/' + profile.id
  const cash = location.pathname.endsWith('/caixa')
  const [accountOpen, setAccountOpen] = useState(false), [signingOut, setSigningOut] = useState(false)
  const [accountError, setAccountError] = useState('')
  const locationRef = useRef(location); locationRef.current = location
  useEffect(() => {
    document.title = `Machado Profissional · ${profile.name}`
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', '/api/professional/manifest?profile=' + profile.id)
    document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', '/professional-icon-192.png')
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', profile.name)
  }, [profile.id, profile.name])
  useEffect(() => { clearError() }, [location.pathname, clearError])
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let disposed = false
    let remove: (() => Promise<void>) | undefined
    void CapacitorApp.addListener('backButton', () => {
      if (dismissTopLayer()) return
      if (locationRef.current.pathname.endsWith('/caixa')) navigate(base + '/agenda', { replace: true })
      else void CapacitorApp.exitApp()
    }).then(handle => { if (disposed) void handle.remove(); else remove = () => handle.remove() })
    return () => { disposed = true; if (remove) void remove() }
  }, [base, navigate])
  return <div className="app-shell professional-app">
    <main className="main">
      <header className="topbar"><div className="pro-header-identity"><span className="eyebrow">Machado Profissional</span><strong>{profile.name}</strong><small>{refreshed ? `Atualizado às ${refreshed}` : 'Carregando…'}</small></div><div className="top-actions"><button className="icon-btn" aria-label="Atualizar meus dados" title="Atualizar" disabled={busy} onClick={() => void refresh()}><RefreshCw size={19} /></button><button className="icon-btn" aria-label="Minha conta" title="Minha conta" onClick={() => setAccountOpen(true)}><KeyRound size={19} /></button></div></header>
      {administrative && <div className="pro-preview"><span>Visualização administrativa</span><label><span className="sr-only">Profissional visualizado</span><select aria-label="Profissional visualizado" value={profile.id} onChange={event => navigate('/profissional/p/' + event.target.value + (cash ? '/caixa' : '/agenda'))}>{choices.map(pro => <option key={pro.id} value={pro.id}>{pro.name}</option>)}</select></label><a href="/admin/profissionais">Voltar à gestão</a></div>}
      {error && <div className="pro-load-error" role="alert">{error}<button className="outline small" onClick={() => void refresh()}>Tentar novamente</button></div>}
      {loading ? <p className="pro-loading" role="status">Carregando sua agenda…</p> : <div className="section-transition" key={cash ? 'cash' : 'agenda'}><Routes><Route path="agenda" element={<Agenda professionalOnly />} /><Route path="caixa" element={<ProfessionalCash professionalId={profile.id} />} /><Route path="*" element={<Navigate to={base + '/agenda'} replace />} /></Routes></div>}
    </main>
    <nav className="mobile-nav mobile-nav-animated pro-nav" aria-label="Navegação do profissional" style={{ '--nav-index': cash ? 1 : 0, '--nav-visible': 1 } as CSSProperties}><span className="mobile-nav-highlight" aria-hidden="true" /><NavLink to={base + '/agenda'}><CalendarDays size={22} /><span>Minha Agenda</span></NavLink><NavLink to={base + '/caixa'}><WalletCards size={22} /><span>Meu Caixa</span></NavLink></nav>
    {!cash && <button className="mobile-create agenda-create-fab" aria-label="Novo agendamento, encaixe ou bloqueio" onClick={() => window.dispatchEvent(new Event('agenda:create'))}><Plus size={24} /></button>}
    {accountOpen && <Modal title="Minha conta profissional" close={() => setAccountOpen(false)}><div className="pro-account"><strong>{profile.name}</strong><p>Agenda e comissões exclusivas deste perfil.</p>{!administrative && <PasswordChange />}{!Capacitor.isNativePlatform() && <a className="outline" href={publicSiteUrl + base + '/instalar'}><Smartphone size={16} />Adicionar ao iPhone</a>}{accountError && <p className="form-error" role="alert">{accountError}</p>}{!administrative && <button className="outline" disabled={signingOut} onClick={async () => { setSigningOut(true); setAccountError(''); const result = await backend.auth.signOut(); setSigningOut(false); if (!result.error) signedOut(); else setAccountError('Não foi possível sair. Confira sua conexão e tente novamente.') }}><LogOut size={16} />{signingOut ? 'Saindo…' : 'Sair da conta'}</button>}</div></Modal>}
  </div>
}
function PasswordChange() {
  const [open, setOpen] = useState(false), [current, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  if (!open) return <button className="outline" onClick={() => setOpen(true)}>Alterar minha senha</button>
  return <form className="pro-password" onSubmit={async event => { event.preventDefault(); if (busy) return; setError(''); setMessage(''); if (password !== confirm) { setError('A confirmação da senha está diferente.'); return } setBusy(true); try { await apiRequest('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: password, revokeOtherSessions: true }) }); setCurrent(''); setPassword(''); setConfirm(''); setMessage('Senha alterada. Use a nova senha no próximo acesso.') } catch { setError('Não foi possível alterar. Confira a senha atual e tente novamente.') } finally { setBusy(false) } }}><label className="field"><span>Senha atual</span><input type="password" autoComplete="current-password" required value={current} onChange={event => setCurrent(event.target.value)} /></label><label className="field"><span>Nova senha (pelo menos 12 caracteres)</span><input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label><label className="field"><span>Confirmar nova senha</span><input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={event => setConfirm(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}<button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button></form>
}
function ProfessionalInstall() {
  const { professionalId } = useParams()
  const base = professionalId ? '/profissional/p/' + professionalId : '/profissional'
  useEffect(() => {
    document.title = 'Instalar Machado Profissional'
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', professionalId ? '/api/professional/manifest?profile=' + professionalId : '/professional.webmanifest')
    document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', '/professional-icon-192.png')
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', 'Machado Pro')
  }, [professionalId])
  return <main className="app-install-shell"><section className="app-install-card"><img src="/professional-icon-192.png" alt="" width="76" height="76" /><span className="eyebrow">Aplicativo do profissional</span><h1>Machado Profissional</h1><p>A mesma agenda da barbearia, com seu acesso e suas comissões.</p><ol><li>Abra o link do seu perfil no <strong>Safari do iPhone</strong>.</li><li>Toque em <strong>Compartilhar → Adicionar à Tela de Início</strong>.</li><li>Se aparecer, ative <strong>Abrir como App da Web</strong> e confirme em Adicionar.</li><li>Abra pelo ícone e entre com o e-mail e a senha fornecidos pela barbearia.</li></ol><Link className="primary" to={base + '/agenda'}>Abrir meu aplicativo</Link><p className="app-install-note">Precisa de internet. Cada profissional acessa somente sua própria conta. Você pode alterar sua senha em Minha conta.</p></section></main>
}

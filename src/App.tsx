import { useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { CalendarDays, LayoutDashboard, Menu, Package, Scissors, Users, WalletCards, Settings, X } from 'lucide-react'
import { CatalogProvider } from './CatalogStore'
import { ServicesV2, ProfessionalsV2 } from './OperationalPages'
import { PublicBookingV2 } from './PublicBooking'
import { AdminAccess } from './AdminAccess'
import { OperationsProvider, useOperations } from './OperationsStore'
import { Dashboard, Agenda, Customers, CashManagement, Reports, Products, AppointmentModal, Modal, Page } from './ManagementPages'
import { supabase } from './supabaseClient'

const navItems = [
  { to: '/admin', label: 'Início', icon: LayoutDashboard },
  { to: '/admin/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/admin/clientes', label: 'Clientes', icon: Users },
  { to: '/admin/caixa', label: 'Caixa', icon: WalletCards },
  { to: '/admin/relatorios', label: 'Relatórios', icon: LayoutDashboard },
  { to: '/admin/produtos', label: 'Produtos', icon: Package },
  { to: '/admin/servicos', label: 'Serviços', icon: Scissors },
  { to: '/admin/profissionais', label: 'Profissionais', icon: Users },
  { to: '/admin/configuracoes', label: 'Configurações', icon: Settings },
]
export function AdminLayout() {
  const [sidebar, setSidebar] = useState(false)
  const [newAppointment, setNewAppointment] = useState(false)
  const { loading, error, busy, refreshed, refresh } = useOperations()
  return <div className="app-shell">
    <aside className={`sidebar ${sidebar ? 'open' : ''}`}><div className="brand"><span className="brand-mark">BM</span><span><strong>Barbearia</strong><small>Machado</small></span><button className="icon-btn close-menu" onClick={() => setSidebar(false)}><X /></button></div>
      <nav>{navItems.map(item => <NavLink key={item.to} to={item.to} end={item.to==='/admin'} onClick={() => setSidebar(false)}><item.icon size={19} /><span>{item.label}</span></NavLink>)}</nav>
      <button className="outline" onClick={() => void supabase?.auth.signOut()}>Sair da conta</button>
    </aside>
    {sidebar && <div className="scrim" onClick={() => setSidebar(false)} />}
    <main className="main"><header className="topbar"><button className="icon-btn menu-trigger" aria-label="Abrir menu" onClick={() => setSidebar(true)}><Menu /></button><div><p className="eyebrow">Barbearia Machado</p><small>{refreshed ? `Atualizado às ${refreshed}` : 'Carregando dados…'}</small></div><div className="top-actions"><button className="outline small" disabled={busy} onClick={() => void refresh()}>Atualizar</button><button className="primary compact" onClick={() => setNewAppointment(true)}>Novo agendamento</button></div></header>
      {error && <div className="operation-error" role="alert">{error}</div>}
      {loading ? <div className="empty">Carregando registros da barbearia…</div> : <Routes>
        <Route index element={<Dashboard />} />
        <Route path="agenda" element={<Agenda onNew={() => setNewAppointment(true)} />} />
        <Route path="clientes" element={<Customers />} />
        <Route path="comandas" element={<Navigate to="/admin/caixa" replace />} />
        <Route path="caixa" element={<CashManagement />} />
        <Route path="relatorios" element={<Reports />} />
        <Route path="produtos" element={<Products />} />
        <Route path="servicos" element={<ServicesV2 />} />
        <Route path="profissionais" element={<ProfessionalsV2 />} />
        <Route path="configuracoes" element={<SettingsPage />} />
        <Route path="comissoes" element={<Navigate to="/admin/caixa" replace />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>}
    </main>
    {newAppointment && <AppointmentModal close={() => setNewAppointment(false)} />}
  </div>
}
function SettingsPage() {
  const [copied, setCopied] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const { run, busy, error } = useOperations()
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return <Page title="Configurações" text="Acessos e controles da barbearia."><section className="panel operation-panel"><h3>Link para a bio do Instagram</h3><p>O cliente agenda sem fazer login.</p><div className="copy-field"><code>{origin}/agendar</code><button onClick={async () => { try { await navigator.clipboard.writeText(origin+'/agendar'); setCopied(true) } catch { setCopied(false) } }}>{copied ? 'Copiado' : 'Copiar'}</button><a href="/agendar" target="_blank" rel="noreferrer">Abrir</a></div><h3>Acesso administrativo</h3><p>Somente contas administrativas autorizadas acessam o painel.</p><button className="outline" onClick={() => void supabase?.auth.signOut()}>Sair da conta</button></section>
    <section className="panel operation-panel danger-zone"><h3>Zerar dados operacionais</h3><p>Use somente para começar uma operação do zero ou remover testes. Apaga permanentemente agenda, clientes, comandas, pagamentos, caixa, repasses e relatórios. Serviços, profissionais, produtos e estoque permanecem.</p><button className="danger" disabled={busy} onClick={() => { setConfirmation(''); setResetOpen(true) }}>Zerar agenda, caixa e relatórios</button></section>
    {resetOpen && <Modal title="Zerar dados operacionais" close={() => setResetOpen(false)}><p><strong>Atenção:</strong> esta ação remove permanentemente todos os clientes e registros operacionais. Não há como desfazer.</p><p>Para confirmar, digite exatamente: <strong>ZERAR OPERAÇÃO</strong></p><form onSubmit={async e => { e.preventDefault(); if (await run('reset_operational_data', { confirmation })) { setResetOpen(false); setConfirmation('') } }}><label className="field"><span>Confirmação</span><input autoFocus required value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder="ZERAR OPERAÇÃO" /></label>{error && <p className="form-error">{error}</p>}<button className="danger" disabled={busy || confirmation !== 'ZERAR OPERAÇÃO'}>{busy ? 'Zerando…' : 'Apagar dados operacionais'}</button></form></Modal>}
  </Page>
}
function Privacy() {
  return <main className="public-shell"><article className="privacy"><h1>Privacidade</h1><p>Usamos nome e telefone para identificar seu agendamento, entrar em contato e manter o histórico de atendimento. Solicite correção ou exclusão dos seus dados diretamente à barbearia.</p><a href="/agendar">Voltar ao agendamento</a></article></main>
}
export default function App() {
  const startRoute = Capacitor.isNativePlatform() ? '/admin' : '/agendar'
  return <CatalogProvider><Routes><Route path="/agendar" element={<PublicBookingV2 />} /><Route path="/privacidade" element={<Privacy />} /><Route path="/admin/*" element={<AdminAccess><OperationsProvider><AdminLayout /></OperationsProvider></AdminAccess>} /><Route path="*" element={<Navigate to={startRoute} replace />} /></Routes></CatalogProvider>
}

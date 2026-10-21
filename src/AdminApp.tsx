import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Gift,
  LayoutDashboard,
  Menu,
  Package,
  Scissors,
  Users,
  WalletCards,
  Settings,
  X,
  ClipboardList,
  Plus,
} from "lucide-react";
import { bookingSiteUrl, appVersion } from "./runtime";
import { ServicesV2, ProfessionalsV2 } from "./OperationalPages";
import { AdminAccess } from "./AdminAccess";
import { OperationsProvider, useOperations } from "./OperationsStore";
import {
  Dashboard,
  Agenda,
  Customers,
  CashManagement,
  Reports,
  Products,
  Orders,
  Modal,
  Page,
} from "./ManagementPages";
import { CompanySettings, Packages } from "./BusinessPages";
import { backend } from "./dataClient";
import { dismissTopLayer, registerDismissibleLayer } from "./dismissibleLayers";
import { BackupPanel } from './BackupPanel';
import { AgendaCreateModal } from './AgendaScheduling';

const navItems = [
  { to: "/admin", label: "Início", icon: LayoutDashboard },
  { to: "/admin/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/admin/clientes", label: "Clientes", icon: Users },
  { to: "/admin/caixa", label: "Caixa", icon: WalletCards },
  { to: "/admin/comandas", label: "Comandas", icon: ClipboardList },
  { to: "/admin/relatorios", label: "Relatórios", icon: LayoutDashboard },
  { to: "/admin/produtos", label: "Produtos", icon: Package },
  { to: "/admin/servicos", label: "Serviços", icon: Scissors },
  { to: "/admin/profissionais", label: "Profissionais", icon: Users },
  { to: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

const mobileSections = [
  { to: '/admin/caixa', label: 'Caixa', icon: WalletCards },
  { to: '/admin/comandas', label: 'Comandas', icon: ClipboardList },
  { to: '/admin/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/admin/clientes', label: 'Clientes', icon: Users },
  { to: '/admin/configuracoes', label: 'Menu', icon: Menu },
];

export function AdminLayout() {
  const [sidebar, setSidebar] = useState(false);
  const [newAppointment, setNewAppointment] = useState(false);
  const [newManualCommand, setNewManualCommand] = useState(false);
  const [newCustomer, setNewCustomer] = useState(false);
  const [newCashEntry, setNewCashEntry] = useState(false);
  const location = useLocation();
  const sectionIndex = mobileSections.findIndex(item => location.pathname === item.to || location.pathname.startsWith(item.to + '/'));
  const activeSection = sectionIndex >= 0 ? sectionIndex : location.pathname === '/admin' ? -1 : 4;
  const { loading, error, busy, refreshed, refresh, clearError } =
    useOperations();
  const isCommands = location.pathname.endsWith("/comandas");
  const isClients = location.pathname.endsWith("/clientes");
  const isCash = location.pathname.endsWith("/caixa");
  const isAgenda =
    location.pathname.endsWith("/agenda") || location.pathname === "/admin";
  const showCreate = isCommands || isClients || isCash || isAgenda;
  const showTopCreate = showCreate && !isAgenda;
  const createLabel = isCommands
    ? "Nova comanda"
    : isClients
      ? "Novo cliente"
      : isCash
        ? "Novo lançamento"
        : "Novo agendamento";
  const openCreate = () => {
    if (isCommands) setNewManualCommand(true);
    else if (isClients) setNewCustomer(true);
    else if (isCash) setNewCashEntry(true);
    else if (location.pathname.endsWith('/agenda')) window.dispatchEvent(new Event('agenda:create'));
    else setNewAppointment(true);
  };
  useEffect(() => {
    if (!sidebar) return;
    return registerDismissibleLayer(() => setSidebar(false));
  }, [sidebar]);
  useEffect(() => {
    clearError();
  }, [location.pathname, clearError]);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">BM</span>
          <span>
            <strong>Barbearia</strong>
            <small>Machado</small>
          </span>
          <button
            className="icon-btn close-menu"
            onClick={() => setSidebar(false)}
          >
            <X />
          </button>
        </div>
        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/admin"}
              onClick={() => setSidebar(false)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        {!Capacitor.isNativePlatform() && <button
          className="outline"
          onClick={() => void backend?.auth.signOut()}
        >
          Sair da conta
        </button>}
      </aside>
      {sidebar && <div className="scrim" onClick={() => setSidebar(false)} />}
      <main className="main">
        <header className="topbar">
          <button
            className="icon-btn menu-trigger"
            aria-label="Abrir menu"
            onClick={() => setSidebar(true)}
          >
            <Menu />
          </button>
          <div>
            <p className="eyebrow">Barbearia Machado</p>
            <small>
              {refreshed ? `Atualizado às ${refreshed}` : "Carregando dados…"}
            </small>
          </div>
          <div className="top-actions">
            <button
              className="outline small"
              disabled={busy}
              onClick={() => void refresh()}
            >
              Atualizar
            </button>
            {showTopCreate && (
              <button className="primary compact" onClick={openCreate}>
                {createLabel}
              </button>
            )}
          </div>
        </header>
        {error && (
          <div className="operation-error" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <div className="empty">Carregando registros da barbearia…</div>
        ) : (
          <div className="section-transition" key={location.pathname}><Routes>
            <Route index element={<Dashboard />} />
            <Route path="agenda" element={<Agenda />} />
            <Route
              path="clientes"
              element={
                <Customers
                  requestedNew={newCustomer}
                  onRequestedNewHandled={() => setNewCustomer(false)}
                />
              }
            />
            <Route
              path="comandas"
              element={
                <Orders
                  requestedNew={newManualCommand}
                  onRequestedNewHandled={() => setNewManualCommand(false)}
                />
              }
            />
            <Route
              path="caixa"
              element={
                <CashManagement
                  requestedNew={newCashEntry}
                  onRequestedNewHandled={() => setNewCashEntry(false)}
                />
              }
            />
            <Route path="relatorios" element={<Reports />} />
            <Route path="produtos" element={<Products />} />
            <Route path="servicos" element={<ServicesV2 />} />
            <Route path="profissionais" element={<ProfessionalsV2 />} />
            <Route path="pacotes" element={<Packages />} />
            <Route path="empresa" element={<CompanySettings />} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route
              path="comissoes"
              element={<Navigate to="/admin/caixa" replace />}
            />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes></div>
        )}
      </main>
      <nav className="mobile-nav mobile-nav-animated" aria-label="Navegação principal" style={{ '--nav-index': Math.max(activeSection, 0), '--nav-visible': activeSection < 0 ? 0 : 1 } as CSSProperties}>
        <span className="mobile-nav-highlight" aria-hidden="true" />
        {mobileSections.map((item, index) => <NavLink key={item.to} to={item.to} className={activeSection === index ? 'active' : ''}><item.icon size={22} /><span>{item.label}</span></NavLink>)}
      </nav>
      {showCreate && (
        <button
          className="mobile-create"
          aria-label={createLabel}
          onClick={openCreate}
        >
          <Plus size={24} />
        </button>
      )}
      {newAppointment && (
        <AgendaCreateModal close={() => setNewAppointment(false)} />
      )}
    </div>
  );
}

function NativeBackHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    let removeListener: (() => Promise<void>) | undefined;
    void CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (dismissTopLayer()) return;

      if (locationRef.current.pathname !== "/admin") {
        if (canGoBack) navigate(-1);
        else navigate("/admin", { replace: true });
        return;
      }

      void CapacitorApp.exitApp();
    }).then((handle) => {
      if (disposed) void handle.remove();
      else removeListener = () => handle.remove();
    });

    return () => {
      disposed = true;
      if (removeListener) void removeListener();
    };
  }, [navigate]);

  return null;
}
function SettingsPage() {
  const [copied, setCopied] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const { run, busy, error } = useOperations();
  const origin = bookingSiteUrl;
  return (
    <Page
      title="Menu"
      text="Cadastros, configurações e controles da barbearia."
    >
      <section className="menu-shortcuts" aria-label="Cadastros e gestão">
        <Link to="/admin/produtos">
          <Package />
          <span>
            <strong>Produtos e estoque</strong>
            <small>Cadastre produtos e ajuste as quantidades.</small>
          </span>
          <ArrowRight />
        </Link>
        <Link to="/admin/servicos">
          <Scissors />
          <span>
            <strong>Serviços</strong>
            <small>Organize os serviços disponíveis no agendamento.</small>
          </span>
          <ArrowRight />
        </Link>
        <Link to="/admin/profissionais">
          <Users />
          <span>
            <strong>Profissionais</strong>
            <small>Equipe e disponibilidade no agendamento.</small>
          </span>
          <ArrowRight />
        </Link>
        <Link to="/admin/pacotes">
          <Gift />
          <span>
            <strong>Pacotes</strong>
            <small>Cadastre, venda e acompanhe sessões.</small>
          </span>
          <ArrowRight />
        </Link>
        <Link to="/admin/empresa">
          <Building2 />
          <span>
            <strong>Empresa</strong>
            <small>Dados e canais da Machado.</small>
          </span>
          <ArrowRight />
        </Link>
        <Link to="/admin/relatorios">
          <LayoutDashboard />
          <span>
            <strong>Relatórios</strong>
            <small>Veja os resultados da operação.</small>
          </span>
          <ArrowRight />
        </Link>
      </section>
      <section className="panel operation-panel">
        <h3>Link para a bio do Instagram</h3>
        <p>
          O cliente escolhe entre falar no WhatsApp ou fazer o agendamento
          online.
        </p>
        <div className="copy-field">
          <code>{origin}/</code>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(origin + "/");
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copiado" : "Copiar"}
          </button>
          <a href={origin + "/"} target="_blank" rel="noreferrer">
            Abrir
          </a>
        </div>
        <h3>Acesso administrativo</h3>
        <p>{Capacitor.isNativePlatform() ? 'Este aplicativo abre automaticamente a gestão da barbearia.' : 'Somente contas administrativas autorizadas acessam o painel.'}</p><p>Versão {appVersion}</p>
        {!Capacitor.isNativePlatform() && <><Link className="outline" to="/recuperar-acesso">Alterar senha</Link><button
          className="outline"
          onClick={() => void backend?.auth.signOut()}
        >
          Sair da conta
        </button></>}
      </section>
      {Capacitor.isNativePlatform() ? <section className="panel operation-panel"><h3>Administração do proprietário</h3><p>As cópias de segurança continuam automáticas. Para exportar cópias ou reiniciar a operação, acesse o painel do proprietário no navegador.</p><a className="outline" href={`${origin}/admin`} target="_blank" rel="noreferrer">Abrir painel no navegador</a></section> : <><BackupPanel />
      <section className="panel operation-panel danger-zone">
        <h3>Zerar dados operacionais</h3>
        <p>
          Use somente para começar uma operação do zero ou remover testes. Apaga
          permanentemente agenda, clientes, comandas, vendas de pacotes,
          pagamentos, caixa, repasses e relatórios. Cadastros de serviços,
          profissionais, pacotes, produtos e estoque permanecem.
        </p>
        <button
          className="danger"
          disabled={busy}
          onClick={() => {
            setConfirmation("");
            setResetOpen(true);
          }}
        >
          Zerar agenda, caixa e relatórios
        </button>
      </section></>}
      {!Capacitor.isNativePlatform() && resetOpen && (
        <Modal
          title="Zerar dados operacionais"
          close={() => setResetOpen(false)}
        >
          <p>
            <strong>Atenção:</strong> esta ação remove permanentemente todos os
            clientes e registros operacionais. Não há como desfazer.
          </p>
          <p>
            Para confirmar, digite exatamente: <strong>ZERAR OPERAÇÃO</strong>
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run("reset_operational_data", { confirmation })) {
                setResetOpen(false);
                setConfirmation("");
              }
            }}
          >
            <label className="field">
              <span>Confirmação</span>
              <input
                autoFocus
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="ZERAR OPERAÇÃO"
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button
              className="danger"
              disabled={busy || confirmation !== "ZERAR OPERAÇÃO"}
            >
              {busy ? "Zerando…" : "Apagar dados operacionais"}
            </button>
          </form>
        </Modal>
      )}
    </Page>
  );
}

export default function AdminApp() { return <AdminAccess><NativeBackHandler /><OperationsProvider><AdminLayout /></OperationsProvider></AdminAccess> }

import { ArrowRight, CalendarDays, MessageCircle } from "lucide-react"
import { whatsappUrl } from "./runtime"
import { useCatalog } from './CatalogStore'
export function PublicLanding() {
  const { business } = useCatalog()
  return (
    <main className="landing-shell">
      <div className="landing-backdrop" />
      <header className="landing-header">
        <img src="/logo-machado.png" alt="Barbearia Machado" />
      </header>
      <section className="landing-content" aria-labelledby="landing-title">
        <p className="eyebrow">Barbearia Machado</p>
        <h1 id="landing-title">Como podemos te atender?</h1>
        <p className="landing-copy">
          Escolha uma opção para falar com a gente ou reservar seu próximo
          horário.
        </p>
        <nav className="landing-actions" aria-label="Canais de atendimento">
          <a
            className="landing-action whatsapp"
            href={whatsappUrl(business?.phone || "4588186553")!}
            target="_blank"
            rel="noreferrer"
          >
            <span className="landing-icon">
              <MessageCircle aria-hidden="true" />
            </span>
            <span>
              <strong>WhatsApp</strong>
              <small>Fale com a nossa equipe</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </a>
          <a className="landing-action appointment" href="/agendar/horarios">
            <span className="landing-icon">
              <CalendarDays aria-hidden="true" />
            </span>
            <span>
              <strong>Agendamento</strong>
              <small>Reserve seu horário online</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </a>
        </nav>
      </section>
      <footer className="landing-footer">
        © 2026 Barbearia Machado · <a href="/privacidade">Privacidade</a>
      </footer>
    </main>
  );
}
export function Privacy() {
  const { business } = useCatalog()
  return (
    <main className="public-shell">
      <article className="privacy">
        <h1>Privacidade</h1>
        <p>Atualizada em 20 de outubro de 2026.</p>
        <p>A {business?.name || 'Barbearia Machado'}, em Toledo, Paraná, é responsável pelos dados dos clientes utilizados neste sistema.</p>
        <h2>Dados e uso</h2>
        <p>Nome e telefone são solicitados para registrar o agendamento, identificar o cliente e permitir contato sobre o atendimento. O painel também mantém histórico de serviços, compras e pagamentos para a operação e os registros da barbearia.</p>
        <h2>Acesso e armazenamento</h2>
        <p>O painel é restrito a contas autorizadas. O sistema utiliza hospedagem Vercel, banco PostgreSQL fornecido pela Neon e armazenamento de fotos e cópias de segurança na Vercel. A conexão utiliza HTTPS.</p>
        <h2>Histórico e cópias de segurança</h2>
        <p>Os dados são mantidos enquanto necessários ao atendimento, à gestão do histórico e às obrigações aplicáveis. Cópias de segurança são protegidas e utilizadas para recuperar o sistema em caso de falha. Solicitações de exclusão são avaliadas pelo responsável pela barbearia, considerando registros que precisam ser preservados.</p>
        <h2>Contato e solicitações</h2>
        <p>Para consultar, corrigir ou solicitar a exclusão de dados, entre em contato com a barbearia pelo <a href={whatsappUrl(business?.phone || '4588186553')!} target="_blank" rel="noreferrer">WhatsApp</a>. Não enviamos dados de clientes para publicidade por meio deste agendamento.</p>
        <h2>Sessão de acesso</h2>
        <p>O sistema utiliza armazenamento de sessão necessário para manter o administrador conectado. O agendamento público não exige criação de conta.</p>
        <a href="/">Voltar ao início</a>
      </article>
    </main>
  );
}

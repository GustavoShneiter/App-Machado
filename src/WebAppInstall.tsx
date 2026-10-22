import { Link } from 'react-router-dom'
import { isWebApp, webAppBase } from './appExperience'

export function WebAppInstall() {
  return <main className="app-install"><section>
    <img src="/admin-icon-192.png" alt="" width="76" height="76" />
    <p className="eyebrow">Barbearia Machado</p>
    <h1>Seu aplicativo no iPhone</h1>
    <p>Agenda, Caixa, Comandas, Clientes e Menu com a interface do aplicativo Android.</p>
    <ol><li>Abra este link no <strong>Safari</strong>.</li><li>Toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</li><li>Se aparecer, ative <strong>Abrir como App da Web</strong> e toque em <strong>Adicionar</strong>.</li></ol>
    <p className="app-install-note">Abra pelo ícone Machado Gestão. No primeiro acesso, entre com sua conta administrativa. O sistema precisa de internet.</p>
    {isWebApp() ? <Link className="primary" to="/admin">Abrir Machado Gestão</Link> : <a className="primary" href={`${webAppBase}/admin`}>Abrir Machado Gestão</a>}
  </section></main>
}

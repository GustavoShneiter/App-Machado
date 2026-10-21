import { Component, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return <main className="auth-shell"><section className="auth-card" role="alert">
        <span className="brand-mark">BM</span>
        <h1>Não foi possível abrir esta tela</h1>
        <p>Ocorreu um erro ao carregar a página. Tente abri-la novamente.</p>
        <button className="primary wide" onClick={() => window.location.reload()}>Tentar novamente</button>
        <a href={Capacitor.isNativePlatform() ? '/admin' : '/agendar'}>{Capacitor.isNativePlatform() ? 'Voltar ao painel' : 'Ir para agendamento'}</a>
      </section></main>
    }
    return this.props.children
  }
}

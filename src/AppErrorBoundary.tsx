import { Component, type ReactNode } from 'react'

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
        <a href="/agendar">Ir para agendamento</a>
      </section></main>
    }
    return this.props.children
  }
}

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { publicSiteUrl } from './runtime'
import { isWebApp, isProfessionalExperience } from './appExperience'

export function WebAppMetadata() {
  const { pathname } = useLocation()
  useEffect(() => {
    const app = isWebApp()
    if (isProfessionalExperience()) {
      document.querySelector('link[rel="manifest"]')?.setAttribute('href', '/professional.webmanifest')
      document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', '/professional-icon-192.png')
      document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', 'Machado Pro')
      document.title = 'Machado Profissional'
      return
    }
    const admin = app || pathname.startsWith('/admin') || pathname === '/recuperar-acesso'
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', app ? '/app.webmanifest' : admin ? '/admin.webmanifest' : '/manifest.webmanifest')
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', admin ? 'Machado Gestão' : 'Barbearia Machado')
    document.title = admin ? 'Machado Gestão' : 'Barbearia Machado'
  }, [pathname])
  return null
}

export function AdminWebHelp() {
  if (Capacitor.isNativePlatform() || isWebApp()) return null
  return <section className="web-access-help" aria-label="Acesso no PC e iPhone">
    <h3>PC e iPhone</h3>
    <a href={`${publicSiteUrl}/admin`}>{publicSiteUrl}/admin</a>
    <details><summary>Adicionar ao iPhone</summary><p>No Safari, toque em Compartilhar → Adicionar à Tela de Início. Ative Abrir como App da Web, se disponível.</p></details>
    <details><summary>Usar no computador</summary><p>Abra o link e entre com seu e-mail e senha. Requer internet.</p></details>
  </section>
}

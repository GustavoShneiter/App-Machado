import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { publicSiteUrl } from './runtime'
import { isWebApp } from './appExperience'
import { webAppMetadata } from '../shared/web-app-metadata.mjs'

export function WebAppMetadata() {
  const { pathname } = useLocation()
  useEffect(() => {
    const meta = webAppMetadata(window.location.pathname, import.meta.env.VITE_APP_EDITION === 'professional')
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', meta.manifest)
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', meta.appleTitle)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', meta.theme)
    document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', meta.appleIcon)
    document.querySelector('link[rel="icon"]')?.setAttribute('href', meta.icon)
    document.title = meta.title
  }, [pathname])
  return null
}

export function AdminWebHelp() {
  if (Capacitor.isNativePlatform() || isWebApp()) return null
  return <section className="web-access-help" aria-label="Acesso no PC e iPhone">
    <h3>PC e iPhone</h3>
    <a href={`${publicSiteUrl}/app/admin`}>{publicSiteUrl}/app/admin</a>
    <details><summary>Adicionar ao iPhone</summary><p>No Safari, toque em Compartilhar → Adicionar à Tela de Início. Ative Abrir como App da Web, se disponível.</p></details>
    <details><summary>Usar no computador</summary><p>Abra o link e entre com seu e-mail e senha. Requer internet.</p></details>
  </section>
}

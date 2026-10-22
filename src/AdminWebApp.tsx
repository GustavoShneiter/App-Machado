import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { publicSiteUrl } from './runtime'

export function WebAppMetadata() {
  const { pathname } = useLocation()
  useEffect(() => {
    const admin = pathname.startsWith('/admin') || pathname === '/recuperar-acesso'
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', admin ? '/admin.webmanifest' : '/manifest.webmanifest')
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', admin ? 'Machado Gestão' : 'Barbearia Machado')
    document.title = admin ? 'Machado Gestão' : 'Barbearia Machado'
  }, [pathname])
  return null
}

export function AdminWebHelp() {
  if (Capacitor.isNativePlatform()) return null
  return <section className="web-access-help" aria-label="Acesso no PC e iPhone">
    <h3>Gestão no PC e no iPhone</h3>
    <p>Use o mesmo painel e os mesmos dados da barbearia.</p>
    <a href={`${publicSiteUrl}/admin`}>{publicSiteUrl}/admin</a>
    <details><summary>Adicionar ao iPhone</summary><p>Abra este link no Safari, toque em Compartilhar e em Adicionar à Tela de Início. Se aparecer, ative Abrir como App da Web e confirme em Adicionar.</p><p>Entre com sua conta administrativa. O painel precisa de internet para consultar e salvar os dados.</p></details>
    <details><summary>Usar no computador</summary><p>Abra o link no navegador e entre com sua conta administrativa. Você também pode salvar o link nos favoritos para abrir o painel rapidamente.</p></details>
  </section>
}

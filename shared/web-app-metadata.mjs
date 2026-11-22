// Home Screen installation must see the correct entry before React loads.
export function webAppMetadata(pathname, professionalEdition = false) {
  const path = String(pathname).split(/[?#]/, 1)[0]
  if (professionalEdition || /^\/profissional(?:\/|$)/.test(path)) return {
    title: 'Machado Profissional', appleTitle: 'Machado Pro', theme: '#ffffff',
    manifest: '/professional.webmanifest', appleIcon: '/professional-apple-touch-icon.png', icon: '/professional-icon-192.png',
  }
  const app = /^\/app(?:\/|$)/.test(path)
  if (app || /^\/admin(?:\/|$)/.test(path) || path === '/recuperar-acesso') return {
    title: 'Machado Gestão', appleTitle: 'Machado Gestão', theme: '#ffffff',
    manifest: app ? '/app.webmanifest' : '/admin.webmanifest', appleIcon: '/admin-apple-touch-icon.png', icon: '/admin-icon-192.png',
  }
  return {
    title: 'Barbearia Machado', appleTitle: 'Barbearia Machado', theme: '#121212',
    manifest: '/manifest.webmanifest', appleIcon: '/apple-touch-icon.png', icon: '/icon.svg',
  }
}

export function applyWebAppMetadata(html, pathname, professionalEdition = false) {
  const meta = webAppMetadata(pathname, professionalEdition)
  return html.replace(/<title>[^<]*<\/title>/, `<title>${meta.title}</title>`)
    .replace(/(<meta\s+name="apple-mobile-web-app-title"\s+content=")[^"]*/, '$1' + meta.appleTitle)
    .replace(/(<meta\s+name="theme-color"\s+content=")[^"]*/, '$1' + meta.theme)
    .replace(/(<link\s+rel="manifest"\s+href=")[^"]*/, '$1' + meta.manifest)
    .replace(/(<link\s+rel="apple-touch-icon"\s+href=")[^"]*/, '$1' + meta.appleIcon)
    .replace(/(<link\s+rel="icon"\s+href=")[^"]*/, '$1' + meta.icon)
}

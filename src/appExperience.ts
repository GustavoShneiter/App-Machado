import { Capacitor } from '@capacitor/core'

export const webAppBase = '/app'
export function isProfessionalExperience() {
  return import.meta.env.VITE_APP_EDITION === 'professional' || (typeof window !== 'undefined' && (window.location.pathname === '/profissional' || window.location.pathname.startsWith('/profissional/')))
}
export function isWebAppPath(pathname: string) {
  return pathname === webAppBase || pathname.startsWith(webAppBase + '/')
}
export function isWebApp() {
  return typeof window !== 'undefined' && isWebAppPath(window.location.pathname)
}
export function isAppExperience() {
  return Capacitor.isNativePlatform() || isWebApp()
}

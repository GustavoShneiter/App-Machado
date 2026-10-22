import { Capacitor } from '@capacitor/core'

export const webAppBase = '/app'
export function isWebAppPath(pathname: string) {
  return pathname === webAppBase || pathname.startsWith(webAppBase + '/')
}
export function isWebApp() {
  return typeof window !== 'undefined' && isWebAppPath(window.location.pathname)
}
export function isAppExperience() {
  return Capacitor.isNativePlatform() || isWebApp()
}

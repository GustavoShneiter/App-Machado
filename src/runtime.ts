import { Capacitor } from '@capacitor/core'

export const appVersion = '1.20.0'
export const publicSiteUrl = 'https://barbearia-machado-rose.vercel.app'
export const bookingSiteUrl = Capacitor.isNativePlatform() || typeof window === 'undefined' ? publicSiteUrl : window.location.origin

export function whatsappUrl(phone: string | null | undefined) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  const number = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits
  return /^55\d{10,11}$/.test(number) ? `https://wa.me/${number}` : null
}

export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController()
  const abort = () => controller.abort(init?.signal?.reason)
  if (init?.signal?.aborted) abort()
  else init?.signal?.addEventListener('abort', abort, { once: true })
  const timer = window.setTimeout(() => controller.abort(), 20000)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
    init?.signal?.removeEventListener('abort', abort)
  }
}

import { Capacitor, registerPlugin } from '@capacitor/core'

export const iPhoneTools = registerPlugin<{
  preparePhoto(options: { base64: string }): Promise<{ base64: string; mimeType: string }>
  copyText(options: { text: string }): Promise<void>
}>('MachadoDevice')

export const isNativeIPhone = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'

export async function copyText(text: string) {
  if (isNativeIPhone()) await iPhoneTools.copyText({ text })
  else await navigator.clipboard.writeText(text)
}

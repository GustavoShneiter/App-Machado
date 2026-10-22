import { apiRequest } from './dataClient'
import { iPhoneTools, isNativeIPhone } from './deviceTools'

export async function uploadCatalogPhoto(file: File, folder: 'professionals' | 'products') {
  const nativeIPhone = isNativeIPhone()
  if (nativeIPhone ? !file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name) : !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Escolha uma foto JPEG, PNG ou WebP.')
  const maxMB = nativeIPhone ? 25 : 3
  if (file.size > maxMB * 1024 * 1024) throw new Error(`A foto deve ter no máximo ${maxMB} MB.`)
  const base64 = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file) })
  const image = nativeIPhone ? await iPhoneTools.preparePhoto({ base64 }) : { base64, mimeType: file.type }
  const result = await apiRequest<{url:string}>('/upload',{method:'POST',body:JSON.stringify({folder,...image})})
  return result.url
}

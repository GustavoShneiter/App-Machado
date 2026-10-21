import { apiRequest } from './dataClient'

export async function uploadCatalogPhoto(file: File, folder: 'professionals' | 'products') {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Escolha uma foto JPEG, PNG ou WebP.')
  if (file.size > 3 * 1024 * 1024) throw new Error('A foto deve ter no máximo 3 MB.')
  const base64 = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file) })
  const result = await apiRequest<{url:string}>('/upload',{method:'POST',body:JSON.stringify({folder,base64,mimeType:file.type})})
  return result.url
}

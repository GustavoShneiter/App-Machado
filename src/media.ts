import { supabase } from './supabaseClient'

export async function uploadCatalogPhoto(file: File, folder: 'professionals' | 'products') {
  if (!supabase) throw new Error('Conexão indisponível.')
  if (!file.type.startsWith('image/')) throw new Error('Escolha uma imagem válida.')
  if (file.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.')
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${folder}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from('machado-media').upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false })
  if (error) throw error
  return supabase.storage.from('machado-media').getPublicUrl(path).data.publicUrl
}

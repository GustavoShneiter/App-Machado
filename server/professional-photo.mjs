import { randomUUID } from 'node:crypto'
import { put,del } from '@vercel/blob'

const fail=message=>Object.assign(new Error(message),{status:400})
export async function saveProfessionalPhoto(client,id,payload) {
  if(payload.remove===true) {
    if(payload.base64!==undefined)throw fail('Escolha enviar ou remover a foto.')
    await client.query('update professionals set photo_url=null where id=$1',[id])
    return {photo_url:null}
  }
  const {base64,mimeType}=payload,extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}
  if(!Object.hasOwn(extensions,mimeType)||typeof base64!=='string'||!base64.length||!/^[a-zA-Z0-9+/]*={0,2}$/.test(base64))throw fail('Escolha uma foto JPEG, PNG ou WebP.')
  const buffer=Buffer.from(base64,'base64')
  if(!buffer.length||buffer.length>3*1024*1024)throw fail('A foto deve ter no máximo 3 MB.')
  const magic=buffer.subarray(0,12)
  const valid=mimeType==='image/jpeg'?magic[0]===255&&magic[1]===216:mimeType==='image/png'?magic.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):magic.subarray(0,4).toString()==='RIFF'&&magic.subarray(8,12).toString()==='WEBP'
  if(!valid)throw fail('O conteúdo não corresponde a uma imagem válida.')
  const file=await put(`professionals/${id}/${randomUUID()}.${extensions[mimeType]}`,buffer,{access:'public',contentType:mimeType,token:process.env.BLOB_READ_WRITE_TOKEN})
  try { await client.query('update professionals set photo_url=$2 where id=$1',[id,file.url]) }
  catch(error) {await del(file.url,{token:process.env.BLOB_READ_WRITE_TOKEN}).catch(()=>{});throw error}
  return {photo_url:file.url}
}

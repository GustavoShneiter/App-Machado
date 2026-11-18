import {randomUUID,createHash} from 'node:crypto'
import {mkdir,writeFile,unlink} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {put,del} from '@vercel/blob'

export const localStorage=process.env.STORAGE_PROVIDER==='filesystem'
export const dataDirectory=resolve(process.env.DATA_DIRECTORY||'/var/lib/machado')
export async function savePhoto(folder,buffer,mimeType) {
 if(!['professionals','products'].includes(folder))throw new Error('Pasta de foto inválida.')
 const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mimeType]
 if(!extension)throw new Error('Formato de imagem inválido.')
 if(!localStorage)return put(`${folder}/${randomUUID()}.${extension}`,buffer,{access:'public',contentType:mimeType,token:process.env.BLOB_READ_WRITE_TOKEN})
 const name=randomUUID()+'.'+extension,directory=join(dataDirectory,'media',folder)
 await mkdir(directory,{recursive:true});await writeFile(join(directory,name),buffer,{flag:'wx',mode:0o640})
 return {url:new URL(`/media/${folder}/${name}`,process.env.AUTH_BASE_URL).href}
}
export async function removePhoto(url) {
 if(!localStorage)return del(url,{token:process.env.BLOB_READ_WRITE_TOKEN})
 const path=new URL(url).pathname
 if(!/^\/media\/(professionals|products)\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(path))return
 await unlink(join(dataDirectory,path.slice(1))).catch(error=>{if(error.code!=='ENOENT')throw error})
}
export async function saveBackup(pathname,json) {
 if(!localStorage)return put(pathname,json,{access:'private',contentType:'application/json',token:process.env.BACKUP_READ_WRITE_TOKEN,addRandomSuffix:true})
 const name=createHash('sha256').update(pathname+randomUUID()).digest('hex')+'.json'
 await mkdir(join(dataDirectory,'backups'),{recursive:true,mode:0o700})
 await writeFile(join(dataDirectory,'backups',name),json,{flag:'wx',mode:0o600})
 return {pathname:'filesystem:'+name}
}

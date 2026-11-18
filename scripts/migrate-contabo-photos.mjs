import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {pool} from '../server/db.mjs'
import {savePhoto,localStorage} from '../server/file-storage.mjs'
assert(localStorage);assert.equal(new URL(process.env.DATABASE_URL).pathname,'/machado')
const report=[]
try{
 for(const table of ['professionals','products']){
  const rows=(await pool.query(`select id,photo_url from ${table} where photo_url is not null`)).rows
  for(const row of rows){
   const url=new URL(row.photo_url)
   if(url.origin===new URL(process.env.AUTH_BASE_URL).origin)continue
   assert.equal(url.protocol,'https:');assert(url.hostname.endsWith('.public.blob.vercel-storage.com'),'Only existing trusted Blob photos may be imported')
   const response=await fetch(url,{redirect:'error',signal:globalThis.AbortSignal.timeout(20000)});assert(response.ok)
   const mime=response.headers.get('content-type')?.split(';')[0];assert(['image/png','image/jpeg','image/webp'].includes(mime))
   const data=Buffer.from(await response.arrayBuffer());assert(data.length>0&&data.length<=3*1024*1024)
   const file=await savePhoto(table,data,mime)
   await pool.query(`update ${table} set photo_url=$1 where id=$2 and photo_url=$3`,[file.url,row.id,row.photo_url])
   const copy=await fetch(file.url);assert(copy.ok)
   const hash=value=>createHash('sha256').update(value).digest('hex')
   assert.equal(hash(Buffer.from(await copy.arrayBuffer())),hash(data))
   report.push({table,id:row.id,old:row.photo_url,url:file.url,sha256:hash(data)})
  }
 }
 await writeFile('/tmp/photo-migration.json',JSON.stringify(report))
 console.log('Existing photos migrated and byte-verified:',report.length)
}finally{await pool.end()}

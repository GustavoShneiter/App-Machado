import {createServer} from 'node:http'
import {createReadStream} from 'node:fs'
import {stat,readFile} from 'node:fs/promises'
import {resolve,extname,join,sep} from 'node:path'
import {timingSafeEqual} from 'node:crypto'
import handler from './handler.mjs'
import {pool} from './db.mjs'
import {dataDirectory} from './file-storage.mjs'
import {applyWebAppMetadata} from '../shared/web-app-metadata.mjs'

const staticRoot=resolve('dist'),types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2'}
function migrationAuthorized(req){const wanted=process.env.MIGRATION_TEST_TOKEN,value=req.headers['x-migration-test'];if(typeof value!=='string'||!wanted)return false;const a=Buffer.from(value),b=Buffer.from(wanted);return a.length===b.length&&timingSafeEqual(a,b)}
const server=createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()')
 try{
  const url=new URL(req.url,'http://localhost')
  if(url.pathname.startsWith('/api/')){
   if(process.env.APP_MODE==='staging'&&!migrationAuthorized(req)&&!['/api/health','/api/catalog'].includes(url.pathname)){
    res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':'60'});res.end(JSON.stringify({error:{message:'Instalação em homologação. Continue usando o endereço atual.'}}));return
   }
   await handler(req,res);return
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
  const pathname=decodeURIComponent(url.pathname)
  if(pathname.split('/').some(part=>part.startsWith('.')||part.includes('\\'))){res.writeHead(404);res.end();return}
  let path
  if(pathname.startsWith('/media/')){
   if(!/^\/media\/(professionals|products)\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(pathname)){res.writeHead(404);res.end();return}
   path=join(dataDirectory,pathname.slice(1))
  }else{
   path=resolve(staticRoot,'.'+pathname)
   if(!path.startsWith(staticRoot+sep)&&path!==staticRoot){res.writeHead(404);res.end();return}
  }
  let info=await stat(path).catch(()=>null)
  if(!info?.isFile()){
   if(pathname.startsWith('/media/')||extname(pathname)){res.writeHead(404);res.end();return}
   path=join(staticRoot,'index.html');info=await stat(path)
  }
  if(path.endsWith('index.html')){
   const html=applyWebAppMetadata(await readFile(path,'utf8'),pathname)
   res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Length',Buffer.byteLength(html));res.setHeader('Cache-Control','no-cache')
   res.end(req.method==='HEAD'?undefined:html);return
  }
  res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream')
  res.setHeader('Content-Length',info.size);res.setHeader('Cache-Control',extname(path)==='.webmanifest'?'no-cache':pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'public, max-age=300')
  if(req.method==='HEAD'){res.end();return}createReadStream(path).on('error',()=>res.destroy()).pipe(res)
 }catch{if(!res.headersSent)res.writeHead(500);res.end()}
})
server.requestTimeout=30000;server.headersTimeout=15000
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Machado application ready.'))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
 server.close(()=>{void pool.end().finally(()=>process.exit(0))})
})

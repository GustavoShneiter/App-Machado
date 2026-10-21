import { createServer } from 'node:http'
import handler from '../server/handler.mjs'

createServer((req,res)=>{void handler(req,res)}).listen(3000,'127.0.0.1',()=>console.log('API Machado: http://127.0.0.1:3000'))

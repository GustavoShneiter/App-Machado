import { mkdir,readFile,writeFile } from 'node:fs/promises'
import { pool,transaction } from '../server/db.mjs'
import { ensureProfessionalAccess } from '../server/professionals.mjs'

await mkdir('.private',{recursive:true})
const target='.private/professional-delivery.json'
let saved=[]
try { saved=JSON.parse(await readFile(target,'utf8')) } catch(error) { if(error.code!=='ENOENT')throw error }
try {
  const result=await transaction(null,async client=>{
    const rows=(await client.query('select id,name from professionals order by name')).rows
    const accounts=[]
    for(const row of rows){
      const created=await ensureProfessionalAccess(client,row.id)
      const existing=saved.find(account=>account.id===row.id)
      if(created?.password)accounts.push(created)
      else if(existing)accounts.push({...existing,name:row.name})
      else accounts.push({id:row.id,name:row.name,link:`/profissional/p/${row.id}/agenda`,passwordNotExported:true})
    }
    return accounts
  })
  await writeFile(target,JSON.stringify(result,null,2))
  console.log(`Acessos individuais conferidos: ${result.length}. Dados de entrega salvos somente em arquivo privado; nenhuma senha impressa.`)
} finally { await pool.end() }

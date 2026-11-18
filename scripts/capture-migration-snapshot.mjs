import {writeFile,mkdir,access,unlink} from 'node:fs/promises'
import {pool} from '../server/db.mjs'
import {fingerprint} from './migration-fingerprint.mjs'
await mkdir('.private/migration',{recursive:true})
const c=await pool.connect()
try{
 await c.query('begin isolation level repeatable read read only')
 const snapshot=(await c.query('select pg_export_snapshot() id')).rows[0].id
 await writeFile('.private/migration/source-fingerprint.json',JSON.stringify(await fingerprint(c),null,2))
 await writeFile('.private/migration/snapshot-id',snapshot)
 console.log('Consistent source snapshot ready; waiting for dump. No data values displayed.')
 const release='.private/migration/release-snapshot'
 const deadline=Date.now()+600000
 while(Date.now()<deadline){
  try{await access(release);await unlink(release);break}catch(e){if(e.code!=='ENOENT')throw e}
  await new Promise(resolve=>setTimeout(resolve,1000))
 }
 await c.query('rollback')
}finally{c.release();await pool.end()}

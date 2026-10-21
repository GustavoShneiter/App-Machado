import {randomBytes,randomUUID} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {hashPassword,verifyPassword} from 'better-auth/crypto'
import {transaction,pool} from '../server/db.mjs'

// Executar somente para a distribuição privada. O site não recebe esta credencial.
await mkdir('.private',{recursive:true})
let account
try {account=JSON.parse(await readFile('.private/native-access.json','utf8'))}
catch(error){
  if(error.code!=='ENOENT')throw error
  account={id:randomUUID(),email:'aplicativo.machado@example.invalid',password:randomBytes(48).toString('base64url')}
  await writeFile('.private/native-access.json',JSON.stringify(account,null,2),{flag:'wx'})
}
try {
  await transaction(null,async client=>{
    const existing=await client.query('select a.password,p.active,p.role from auth_user u join profiles p on p.id::text=u.id join auth_account a on a."userId"=u.id and a."providerId"=\'credential\' where u.id=$1 and u.email=$2',[account.id,account.email])
    if(existing.rows.length){
      const row=existing.rows[0]
      if(!row.active || row.role!=='admin' || !await verifyPassword({hash:row.password,password:account.password}))throw new Error('Acesso do aplicativo revogado ou alterado. Configure uma nova distribuição.')
      return
    }
    await client.query('insert into auth.users(id,email) values($1,$2)',[account.id,account.email])
    await client.query("insert into profiles(id,name,role) values($1,'Aplicativo da barbearia','admin')",[account.id])
    await client.query('insert into auth_user(id,name,email,"emailVerified","createdAt","updatedAt") values($1,$2,$3,true,now(),now())',[account.id,'Aplicativo da barbearia',account.email])
    await client.query('insert into auth_account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),account.id,await hashPassword(account.password)])
  })
  await writeFile('android/native-access.properties',`email=${account.email}\npassword=${account.password}\n`)
  console.log('Acesso administrativo do APK configurado. Credencial mantida em arquivos privados; nenhuma alteração no login do site.')
} finally {await pool.end()}

import { randomBytes,randomUUID,createHash } from 'node:crypto'
import { readFile,writeFile } from 'node:fs/promises'
import { hashPassword } from 'better-auth/crypto'
import { transaction,pool } from '../server/db.mjs'

if(process.argv.includes('--remove')){
  const data=JSON.parse(await readFile('.private/qa-account.json','utf8'))
  await transaction(null,async client=>{
    await client.query('delete from recovery_codes where user_id=$1',[data.id])
    await client.query('delete from auth_session where "userId"=$1',[data.id])
    await client.query('delete from auth_account where "userId"=$1',[data.id])
    await client.query('delete from audit_logs where actor_profile_id=$1',[data.id])
    await client.query('delete from profiles where id=$1',[data.id])
    await client.query('delete from auth_user where id=$1',[data.id])
    await client.query('delete from auth.users where id=$1',[data.id])
  })
  console.log('Conta temporária de QA removida.')
}else{
  const data={id:randomUUID(),email:`qa-${Date.now()}@example.invalid`,password:randomBytes(24).toString('base64url'),recoveryCode:randomBytes(24).toString('hex')}
  await transaction(null,async client=>{
    await client.query('insert into auth.users(id,email) values($1,$2)',[data.id,data.email])
    await client.query("insert into profiles(id,name,role) values($1,'QA temporário','owner')",[data.id])
    await client.query('insert into auth_user(id,name,email,"emailVerified","createdAt","updatedAt") values($1,\'QA temporário\',$2,true,now(),now())',[data.id,data.email])
    await client.query('insert into auth_account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),data.id,await hashPassword(data.password)])
    await client.query('insert into recovery_codes(user_id,code_hash) values($1,$2)',[data.id,createHash('sha256').update(data.recoveryCode).digest('hex')])
  })
  await writeFile('.private/qa-account.json',JSON.stringify(data))
  console.log('Conta temporária de QA criada; credenciais salvas somente em arquivo privado.')
}
await pool.end()

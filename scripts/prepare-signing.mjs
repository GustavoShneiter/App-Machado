import { readFile,writeFile,access } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const keystore='.private/machado-release.jks'
let signing
try { await access(keystore); signing=JSON.parse(await readFile('.private/signing.json','utf8')) }
catch {
  signing={alias:'machado-release',password:randomBytes(36).toString('base64url')}
  const tool='C:/Program Files/Android/Android Studio/jbr/bin/keytool.exe'
  const result=spawnSync(tool,['-genkeypair','-noprompt','-keystore',keystore,'-storetype','PKCS12','-alias',signing.alias,'-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Machado Gestao, O=Barbearia Machado, L=Toledo, ST=Parana, C=BR','-storepass:env','MACHADO_SIGNING_PASSWORD','-keypass:env','MACHADO_SIGNING_PASSWORD'],{env:{...process.env,MACHADO_SIGNING_PASSWORD:signing.password},encoding:'utf8'})
  if(result.status!==0)throw new Error('Não foi possível gerar a chave de assinatura.')
  await writeFile('.private/signing.json',JSON.stringify(signing,null,2))
}
await writeFile('android/keystore.properties',`storeFile=../.private/machado-release.jks\nstorePassword=${signing.password}\nkeyAlias=${signing.alias}\nkeyPassword=${signing.password}\n`)
console.log('Chave de release preparada; dados de assinatura mantidos em arquivos privados.')

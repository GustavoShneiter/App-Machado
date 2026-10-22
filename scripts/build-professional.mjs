import { spawnSync } from 'node:child_process'
import { readFile,writeFile,mkdir,copyFile,readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const env={...process.env,VITE_APP_EDITION:'professional',MACHADO_APP_EDITION:'professional'}
const metadata=JSON.parse(await readFile('apps/profissional/app.json','utf8'))
function run(command,args,options={}) {
  const result=spawnSync(command,args,{env,stdio:'inherit',...options})
  if(result.status!==0)throw new Error('A compilação profissional não foi concluída.')
}
run(process.execPath,['node_modules/typescript/bin/tsc','-b'])
run(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir','dist-professional'])
if(!process.argv.includes('--android')){console.log('Build web profissional criado em dist-professional.');process.exit(0)}
const configPath='android/app/src/main/assets/capacitor.config.json'
const original=await readFile(configPath)
try {
  run(process.execPath,['node_modules/@capacitor/cli/bin/capacitor','sync','android'])
  await copyFile('public/professional-icon-512.png','android/app/src/main/res/drawable/professional_icon.png')
  const javaHome=process.env.JAVA_HOME||'C:/Program Files/Android/Android Studio/jbr'
  let native
  try { native=JSON.parse(await readFile('.private/native-access.json','utf8')) } catch(error) { if(error.code!=='ENOENT')throw error }
  const walk=async path=>{for(const item of await readdir(path,{withFileTypes:true})){const name=path+'/'+item.name;if(item.isDirectory())await walk(name);else if(native)assert.ok(!(await readFile(name)).includes(Buffer.from(native.password)),'Credencial administrativa no app profissional.')}}
  await walk('dist-professional')
  run('cmd.exe',['/d','/c','gradlew.bat','assembleRelease','-PmachadoProfessional=true','--console=plain'],{cwd:'android',env:{...env,JAVA_HOME:javaHome}})
  const output='android/app/build/outputs/apk/release/app-release.apk'
  const data=await readFile(output)
  const delivery='../entrega/Profissionais'
  await mkdir(delivery,{recursive:true})
  await copyFile(output,delivery+`/Machado-Profissional-v${metadata.version}.apk`)
  await writeFile('.private/professional-apk-verification.json',JSON.stringify({version:metadata.version,applicationId:metadata.applicationId,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),administrativeCredentials:false,login:'individual'},null,2))
  console.log('APK profissional assinado entregue em entrega/Profissionais. Login individual; sem acesso administrativo embutido.')
} finally {
  await writeFile(configPath,original)
  // Restore admin assets after packaging so normal Android/iOS sync remains administrative.
  run(process.execPath,['node_modules/@capacitor/cli/bin/capacitor','copy','android'],{env:{...process.env,MACHADO_APP_EDITION:'admin',VITE_APP_EDITION:'admin'}})
}

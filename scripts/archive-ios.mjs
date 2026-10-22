import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import plist from 'plist'

if (process.platform !== 'darwin') throw new Error('A compilação e assinatura para iPhone precisam ser executadas em um Mac com Xcode 26 ou mais recente. O projeto pode ser preparado no Windows com npm run ios:prepare-access e npm run ios:sync.')
const team = process.env.APPLE_TEAM_ID
if (!team || !/^[A-Z0-9]{10}$/.test(team)) throw new Error('Defina APPLE_TEAM_ID com o identificador da equipe Apple Developer escolhida no Xcode. Não é senha nem chave privada.')
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`A etapa ${command} não foi concluída.`)
}
run('npm', ['run', 'ios:prepare-access'])
run('npm', ['run', 'ios:sync'])
const access = plist.parse(await readFile('ios/App/App/ManagedAccess.private.plist', 'utf8'))
if (access.verificationOnly || !access.email || !access.password) throw new Error('A compilação de verificação não pode ser distribuída.')
run('xcodebuild', ['-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Release', '-destination', 'generic/platform=iOS', '-archivePath', resolve('ios/App/output/Machado-Gestao.xcarchive'), '-allowProvisioningUpdates', `DEVELOPMENT_TEAM=${team}`, 'archive'])
console.log('Arquivo de distribuição criado em ios/App/output/Machado-Gestao.xcarchive. Abra no Organizer do Xcode para validar e enviar ao TestFlight.')

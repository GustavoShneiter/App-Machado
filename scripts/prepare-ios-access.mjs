import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import plist from 'plist'

const target = 'ios/App/App/ManagedAccess.private.plist'
if (process.argv.includes('--ci')) {
  await writeFile(target, plist.build({ email: 'compilacao-sem-acesso@example.invalid', password: randomBytes(32).toString('base64url'), verificationOnly: true }), { mode: 0o600 })
  console.log('iOS: configuração sem acesso criada exclusivamente para verificar a compilação.')
} else {
  let account
  try { account = JSON.parse(await readFile('.private/native-access.json', 'utf8')) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    try { account = plist.parse(await readFile(target, 'utf8')) }
    catch { throw new Error('O acesso privado do iPhone ainda não foi configurado. Use o pacote privado da entrega ou configure .private/native-access.json localmente, sem enviar credenciais ao GitHub.') }
  }
  if (account.verificationOnly === true || !account.email || typeof account.password !== 'string' || account.password.length < 12) throw new Error('Configure o acesso privado real antes de preparar a distribuição para iPhone.')
  await writeFile(target, plist.build({ email: account.email, password: account.password, verificationOnly: false }), { mode: 0o600 })
  console.log('iOS: acesso automático configurado em recurso privado, fora do site e do GitHub.')
}

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { authOptions } from './auth.mjs'
import { transaction } from './db.mjs'

const fail = (message, status = 400) => Object.assign(new Error(message), { status })
const cleanName = value => value.trim().replace(/\s+/g, ' ').normalize('NFC')
const registrationSchema = z.object({
  name: z.string().transform(cleanName).pipe(z.string().min(2).max(80)),
  business_name: z.string().transform(cleanName).pipe(z.string().min(2).max(120)),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(authOptions.emailAndPassword.minPasswordLength).max(authOptions.emailAndPassword.maxPasswordLength),
}).strict()

function checkedProvisionResult(result, id) {
  if (!result || result.id !== id || typeof result.business_id !== 'string') throw fail('Não foi possível concluir seu cadastro. Tente novamente.', 503)
  return result
}

export function validateOfficeRegistration(body) {
  const parsed = registrationSchema.safeParse(body)
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0]
    throw fail(field === 'email' ? 'Informe um e-mail válido.'
      : field === 'password' ? 'Use uma senha com 12 a 128 caracteres.'
        : field === 'name' ? 'Informe seu nome, com 2 a 80 caracteres.'
          : field === 'business_name' ? 'Informe o nome da unidade, com 2 a 120 caracteres.'
            : 'Confira os dados do cadastro.')
  }
  return parsed.data
}

// The provisioner must create the identity and the isolated workspace in ONE
// transaction. Generic Better Auth sign-up stays disabled for both editions.
export function createOfficeRegistration({ provision, hash = authOptions.emailAndPassword.password.hash, makeId = randomUUID, makeRecoveryCodes = () => Array.from({ length: 3 }, () => randomBytes(24).toString('hex')) }) {
  return async body => {
    const input = validateOfficeRegistration(body)
    const passwordHash = await hash(input.password)
    const id = makeId(), accountId = makeId()
    const recoveryCodes = makeRecoveryCodes()
    if (recoveryCodes.length !== 3 || !recoveryCodes.every(code => typeof code === 'string' && /^[a-f0-9]{48}$/i.test(code)) || new Set(recoveryCodes).size !== 3) throw fail('Não foi possível preparar a recuperação da conta. Tente novamente.', 503)
    let result
    try {
      result = await provision({ id, account_id: accountId, name: input.name, business_name: input.business_name, email: input.email, password_hash: passwordHash, recovery_codes: recoveryCodes.map(code => ({ code_hash: createHash('sha256').update(code).digest('hex') })) })
    } catch (error) {
      if (String(error.code) === '23505') throw fail('Este e-mail já tem uma conta. Entre ou recupere seu acesso.', 409)
      throw error
    }
    checkedProvisionResult(result, id)
    return {
      user: { id, name: input.name, email: input.email },
      business: { id: result.business_id, name: input.business_name },
      recoveryCodes,
    }
  }
}

export const registerOfficeAccount = createOfficeRegistration({
  provision: payload => transaction(null, async client => checkedProvisionResult((await client.query('select provision_workspace_owner($1::jsonb) as value', [payload])).rows[0]?.value, payload.id), { internal: true }),
})

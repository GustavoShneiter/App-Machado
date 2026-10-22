import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { compare } from 'bcryptjs'
import { pool } from './db.mjs'

export const origins = ['https://barbearia-machado-rose.vercel.app', 'https://barbearia-machado-machado14.vercel.app', 'https://localhost', 'capacitor://localhost']
if (process.env.VERCEL_URL) origins.push(`https://${process.env.VERCEL_URL}`)
if (!process.env.VERCEL) origins.push('http://localhost:5173', 'http://127.0.0.1:5173', 'http://127.0.0.1:5188', 'http://127.0.0.1:3000')

export const authOptions = {
  appName: 'Machado Gestão',
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.AUTH_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000'),
  database: pool,
  trustedOrigins: origins,
  emailAndPassword: {
    enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    password: { hash: hashPassword, verify: ({ hash, password }) => /^\$2[aby]\$/.test(hash) ? compare(password, hash) : verifyPassword({ hash, password }) },
  },
  user: { modelName: 'auth_user' },
  account: { modelName: 'auth_account' },
  verification: { modelName: 'auth_verification' },
  session: { modelName: 'auth_session', expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 12 },
  rateLimit: { enabled: true, storage: 'database', modelName: 'auth_rate_limit', window: 60, max: 60, customRules: { '/sign-in/email': { window: 60, max: 5 } } },
  advanced: { ipAddress: { ipAddressHeaders: ['x-vercel-forwarded-for', 'x-forwarded-for'] } },
  plugins: [bearer({ requireSignature: true })],
}
let instance
export function getAuth() { return instance ??= betterAuth(authOptions) }
let professionalInstance
export function getProfessionalAuth() {
  return professionalInstance ??= betterAuth({
    ...authOptions,
    appName: 'Machado Profissional',
    basePath: '/api/professional-auth',
    advanced: { ...authOptions.advanced, cookiePrefix: 'machado-professional' },
  })
}

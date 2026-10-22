import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Copy, Eye, EyeOff, KeyRound } from 'lucide-react'
import { apiRequest } from '../dataClient'
import { copyText } from '../deviceTools'
import { Modal } from '../ManagementPages'
import { publicSiteUrl } from '../runtime'
import type { ProfessionalAccount, ProfessionalCredential } from './types'

export const professionalPortal = publicSiteUrl + '/profissional'
export function LoginFields({ email, password, confirm, change, existing = false }: {
  email: string; password: string; confirm: string; change: (values: { email?: string; password?: string; confirm?: string }) => void; existing?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return <div className="professional-login-fields">
    <label className="field"><span>E-mail de login</span><input type="email" autoComplete="off" required maxLength={254} value={email} placeholder="nome@exemplo.com" onChange={event => change({ email: event.target.value })} /></label>
    <label className="field"><span>{existing ? 'Nova senha' : 'Senha de login'}</span><span className="pro-password-input"><input type={visible ? 'text' : 'password'} autoComplete="new-password" required={!existing} minLength={12} maxLength={128} value={password} placeholder={existing ? 'Deixe vazia para manter a atual' : 'Pelo menos 12 caracteres'} onChange={event => change({ password: event.target.value })} /><button type="button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
    {(!existing || password) && <label className="field"><span>Confirmar senha de login</span><input type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={event => change({ confirm: event.target.value })} /></label>}
    <small className="pro-access-hint">Você define o acesso. Todos os profissionais usam o mesmo site e aplicativo.</small>
  </div>
}
export function CredentialModal({ access, close }: { access: ProfessionalCredential; close: () => void }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState('')
  return <Modal title={access.reset ? 'Acesso atualizado' : 'Acesso profissional criado'} close={close}><div className="professional-credentials"><span className="pro-success-icon"><CheckCircle2 size={24} /></span><strong>{access.name}</strong><p>O profissional já pode entrar com os dados definidos por você.</p>
    <label className="field"><span>E-mail de login</span><input readOnly value={access.email} /></label>
    {access.password && <label className="field"><span>Senha definida</span><input readOnly type="password" value={access.password} /></label>}
    <label className="field"><span>Site dos profissionais · Android e iPhone</span><input readOnly value={professionalPortal} /></label>
    <p>A senha é protegida e não poderá ser consultada depois. Você pode definir uma nova a qualquer momento neste cadastro.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary" onClick={async () => { try { await copyText(`Machado Profissional\nSite: ${professionalPortal}\nE-mail: ${access.email}\n${access.password ? 'Senha: ' + access.password : 'Senha atual mantida.'}\nNo iPhone: Safari → Compartilhar → Adicionar à Tela de Início.`); setCopied(true); setError('') } catch { setError('Não foi possível copiar. Tente novamente.') } }}>{<Copy size={16} />}{copied ? 'Acesso copiado' : 'Copiar acesso para o profissional'}</button>
  </div></Modal>
}
export function ProfessionalAccessPanel({ professionalId }: { professionalId: string }) {
  const [account, setAccount] = useState<ProfessionalAccount | null>(null)
  const [access, setAccess] = useState<ProfessionalCredential | null>(null)
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('')
  const fields = useRef<HTMLFieldSetElement>(null)
  useEffect(() => {
    let alive = true
    void apiRequest<{ data: ProfessionalAccount[] }>('/professional-accounts?professional_id=' + encodeURIComponent(professionalId)).then(result => {
      if (!alive) return
      const found = result.data[0] ?? null; setAccount(found); setEmail(found?.email ?? '')
    }).catch(cause => { if (alive) setError(cause.message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [professionalId])
  const administrative = account && ['admin', 'owner'].includes(account.role ?? '')
  return <section className="professional-access-row" aria-label="Acesso ao aplicativo profissional"><div className="pro-access-title"><KeyRound size={17} /><strong>Login do profissional</strong></div>
    {loading ? <p role="status">Carregando acesso…</p> : administrative ? <p>Este perfil está vinculado à administração. Use o cadastro de um profissional para definir um login da equipe.</p> : <>
      {account && (!account.active || !account.account_active) && <p className="pro-access-inactive">O acesso fica bloqueado enquanto o profissional estiver inativo.</p>}
      <fieldset ref={fields} className="pro-access-fields" disabled={busy}><LoginFields email={email} password={password} confirm={confirm} existing={Boolean(account?.email)} change={values => { setMessage(''); if (values.email !== undefined) setEmail(values.email); if (values.password !== undefined) { setPassword(values.password); if (!values.password) setConfirm('') } if (values.confirm !== undefined) setConfirm(values.confirm) }} /></fieldset>
      <div className="row-actions"><button type="button" className="primary compact" disabled={busy || !email.trim()} onClick={async () => {
        const inputs = Array.from(fields.current?.querySelectorAll('input') ?? [])
        const invalid = inputs.find(input => !input.checkValidity()); if (invalid) { invalid.reportValidity(); return }
        if (password && password !== confirm) { setError('A confirmação da senha está diferente.'); return }
        setBusy(true); setError(''); setMessage('')
        try {
          const result = await apiRequest<{ data: ProfessionalCredential }>('/professional-accounts', { method: 'POST', body: JSON.stringify({ professional_id: professionalId, email: email.trim(), ...(password ? { password } : {}) }) })
          setEmail(result.data.email); setPassword(''); setConfirm(''); setAccount(previous => previous ? { ...previous, email: result.data.email } : previous)
          if (result.data.password) setAccess(result.data)
          else setMessage('E-mail de login salvo. A senha atual foi mantida.')
        } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
      }}>{busy ? 'Salvando…' : 'Salvar acesso'}</button><a className="outline" href={professionalPortal} target="_blank" rel="noreferrer">Abrir site dos profissionais</a></div>
    </>}
    {message && <p className="pro-access-success" role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {access && <CredentialModal access={access} close={() => setAccess(null)} />}
  </section>
}

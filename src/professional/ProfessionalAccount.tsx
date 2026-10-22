import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { LogOut, Smartphone } from 'lucide-react'
import { apiRequest, backend } from '../dataClient'
import { Modal } from '../ManagementPages'
import type { ProfessionalIdentity } from './types'

export function ProfessionalAccountModal({ profile, close, signedOut }: { profile: ProfessionalIdentity; close: () => void; signedOut: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <Modal title="Minha conta profissional" close={close}><div className="pro-account">
    <div className="pro-account-heading"><strong>{profile.name}</strong><span>Conta profissional</span></div>
    <label className="field"><span>E-mail de acesso</span><input readOnly type="email" value={profile.email ?? ''} /></label>
    <p>Este login dá acesso somente à sua agenda e às suas comissões. Para mudar o e-mail, fale com a administração.</p>
    <PasswordChange />
    {!Capacitor.isNativePlatform() && <Link className="outline" to="/profissional/instalar" onClick={close}><Smartphone size={16} />Instalar no celular</Link>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="outline" disabled={busy} onClick={async () => { setBusy(true); setError(''); const result = await backend.auth.signOut(); setBusy(false); if (result.error) setError('Não foi possível sair. Tente novamente.'); else signedOut() }}><LogOut size={16} />{busy ? 'Saindo…' : 'Sair da conta'}</button>
  </div></Modal>
}
function PasswordChange() {
  const [open, setOpen] = useState(false), [current, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  if (!open) return <button className="outline" onClick={() => setOpen(true)}>Alterar minha senha</button>
  return <form className="pro-password" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setError(''); setMessage('')
    if (password !== confirm) { setError('A confirmação da senha está diferente.'); return }
    setBusy(true)
    try {
      await apiRequest('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: password, revokeOtherSessions: true }) })
      setCurrent(''); setPassword(''); setConfirm(''); setMessage('Senha alterada. Use a nova senha no próximo acesso.')
    } catch { setError('Não foi possível alterar. Confira a senha atual e tente novamente.') }
    finally { setBusy(false) }
  }}><label className="field"><span>Senha atual</span><input type="password" autoComplete="current-password" required value={current} onChange={event => setCurrent(event.target.value)} /></label><label className="field"><span>Nova senha (pelo menos 12 caracteres)</span><input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label><label className="field"><span>Confirmar nova senha</span><input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={event => setConfirm(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}<button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button></form>
}

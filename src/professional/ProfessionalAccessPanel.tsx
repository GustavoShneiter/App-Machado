import { useEffect, useState } from 'react'
import { apiRequest } from '../dataClient'
import { copyText } from '../deviceTools'
import { Modal } from '../ManagementPages'
import { publicSiteUrl } from '../runtime'
import type { ProfessionalAccount, ProfessionalCredential } from './types'

export function CredentialModal({ access, close }: { access: ProfessionalCredential; close: () => void }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState('')
  const link = publicSiteUrl + access.link
  return <Modal title={access.reset ? 'Nova senha do profissional' : 'Acesso profissional criado'} close={close}><div className="professional-credentials"><strong>{access.name}</strong><p>Guarde ou copie os dados agora. A senha não fica disponível para consulta depois de fechar esta janela.</p>
    <label className="field"><span>E-mail de acesso</span><input readOnly value={access.email} /></label>
    <label className="field"><span>Senha</span><input readOnly value={access.password} /></label>
    <label className="field"><span>Link pessoal · web e iPhone</span><input readOnly value={link} /></label>
    <p>O e-mail é um identificador de login, sem caixa de mensagens. O profissional pode trocar a senha em Minha conta. O aplicativo Android profissional usa este mesmo acesso.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary" onClick={async () => { try { await copyText(`Machado Profissional — ${access.name}\nLink: ${link}\nE-mail: ${access.email}\nSenha: ${access.password}\nNo iPhone: abra no Safari e adicione à Tela de Início.`); setCopied(true); setError('') } catch { setError('Não foi possível copiar. Selecione os dados nos campos acima.') } }}>{copied ? 'Dados copiados' : 'Copiar dados de acesso'}</button>
  </div></Modal>
}
export function ProfessionalAccessPanel({ professionalId }: { professionalId: string }) {
  const [account, setAccount] = useState<ProfessionalAccount | null>(null)
  const [access, setAccess] = useState<ProfessionalCredential | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [reload, setReload] = useState(0)
  useEffect(() => {
    let alive = true
    void apiRequest<{ data: ProfessionalAccount[] }>('/professional-accounts').then(result => { if (alive) setAccount(result.data.find(row => row.id === professionalId) ?? null) }).catch(cause => { if (alive) setError(cause.message) })
    return () => { alive = false }
  }, [professionalId, reload])
  return <section className="professional-access-row" aria-label="Acesso ao aplicativo profissional"><strong>Acesso ao aplicativo profissional</strong>
    {account?.email ? <p>{account.email}{!account.active || !account.account_active ? ' · acesso inativo' : ''}</p> : <p>Conta individual com Minha Agenda e Meu Caixa.</p>}
    <p><a href={publicSiteUrl + '/profissional/p/' + professionalId + '/agenda'} target="_blank" rel="noreferrer">Abrir link pessoal do profissional</a></p>
    <div className="row-actions"><button type="button" className="outline" disabled={busy || account?.role === 'admin' || account?.role === 'owner'} onClick={async () => {
      if (account?.email && !window.confirm('Gerar uma nova senha e encerrar as sessões deste profissional? A senha atual deixará de funcionar.')) return
      setBusy(true); setError('')
      try {
        const result = await apiRequest<{ data: ProfessionalCredential | null }>('/professional-accounts', { method: 'POST', body: JSON.stringify({ professional_id: professionalId, reset: Boolean(account?.email) }) })
        if (result.data?.password) setAccess(result.data)
        else setError('Este profissional já tem acesso. Atualize a tela ou gere uma nova senha.')
        setReload(value => value + 1)
      } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
    }}>{busy ? 'Gerando…' : account?.email ? 'Gerar nova senha' : 'Gerar acesso'}</button></div>
    {account && ['admin', 'owner'].includes(account.role ?? '') && <p>Perfil vinculado à administração. O acesso administrativo foi preservado.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {access && <CredentialModal access={access} close={() => setAccess(null)} />}
  </section>
}

import { useCallback, useEffect, useState } from 'react'
import { Camera, ChevronRight, Eye, EyeOff, KeyRound, Settings2, Target, Trash2, UserRound } from 'lucide-react'
import { apiRequest } from '../dataClient'
import { Modal, Page } from '../ManagementPages'
import { PreferencesModal } from './ProfessionalPreferences'
import { ProfessionalFeedback } from './ProfessionalFeedback'
import type { Preferences, ProfessionalIdentity } from './types'

export function ProfessionalMenu({ profile, photoUpdated, account }: { profile: ProfessionalIdentity; photoUpdated: (url: string | null) => void; account: () => void }) {
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [error, setError] = useState(''), [photoOpen, setPhotoOpen] = useState(false), [settings, setSettings] = useState<'goals' | 'cards' | null>(null)
  const [reload, setReload] = useState(0), [message, setMessage] = useState('')
  const closeMessage = useCallback(() => setMessage(''), [])
  useEffect(() => { let alive = true; setError(''); void apiRequest<{ data: Preferences }>('/professional/preferences').then(result => { if (alive) setPreferences(result.data) }).catch(cause => { if (alive) setError(cause.message) }); return () => { alive = false } }, [profile.id, reload])
  return <Page title="Meu Menu" text="Seu perfil, do seu jeito.">
    <section className="pro-profile-hero"><div className="pro-profile-avatar">{profile.photo_url ? <img src={profile.photo_url} alt={`Foto de ${profile.name}`} /> : <UserRound size={38} />}<button aria-label="Editar minha foto" onClick={() => setPhotoOpen(true)}><Camera size={16} /></button></div><h3>{profile.name}</h3><span>Profissional · Barbearia Machado</span><button className="pro-profile-email" onClick={account}>{profile.email}<ChevronRight size={14} /></button></section>
    <section className="pro-menu-group"><h3>Meu perfil</h3><button onClick={() => setPhotoOpen(true)}><span className="pro-menu-icon"><Camera size={20} /></span><span><strong>Foto de perfil</strong><small>Atualize a foto que identifica você.</small></span><ChevronRight size={17} /></button><button onClick={account}><span className="pro-menu-icon"><KeyRound size={20} /></span><span><strong>Minha conta e segurança</strong><small>Confira seu e-mail, altere a senha ou saia.</small></span><ChevronRight size={17} /></button></section>
    <section className="pro-menu-group"><h3>Meu Caixa</h3><button disabled={!preferences} onClick={() => setSettings('goals')}><span className="pro-menu-icon warm"><Target size={20} /></span><span><strong>Minhas metas da semana</strong><small>Defina, oculte ou remova suas metas.</small></span><ChevronRight size={17} /></button><button disabled={!preferences} onClick={() => setSettings('cards')}><span className="pro-menu-icon"><Settings2 size={20} /></span><span><strong>Meus indicadores</strong><small>Escolha os números que aparecem no Caixa.</small></span><ChevronRight size={17} /></button>{preferences && <div className="pro-menu-goal-status">{preferences.show_goals === false ? <EyeOff size={15} /> : <Eye size={15} />}Metas {preferences.show_goals === false ? 'ocultas' : 'visíveis'} no Meu Caixa</div>}</section>
    {error && <div className="form-error" role="alert">{error}<button className="outline small" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></div>}
    <p className="pro-menu-footer">Um espaço para acompanhar seu trabalho e cuidar do seu perfil.</p>
    {photoOpen && <PhotoModal profile={profile} close={() => setPhotoOpen(false)} saved={url => { photoUpdated(url); setPhotoOpen(false); setMessage(url ? 'Sua foto de perfil foi atualizada.' : 'Foto de perfil removida.') }} />}
    {settings && preferences && <PreferencesModal professionalId={profile.id} preferences={preferences} tab={settings} close={() => setSettings(null)} saved={value => { setPreferences(value); setSettings(null); setMessage('Seu Caixa ficou do seu jeito. Preferências salvas.') }} />}
    <ProfessionalFeedback message={message} close={closeMessage} />
  </Page>
}
function PhotoModal({ profile, close, saved }: { profile: ProfessionalIdentity; close: () => void; saved: (url: string | null) => void }) {
  const [image, setImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null)
  const [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false), [error, setError] = useState(''), [remove, setRemove] = useState(false)
  async function save() {
    if (busy || preparing) return
    setBusy(true); setError('')
    try { const result = await apiRequest<{ data: { photo_url: string | null } }>('/professional/photo', { method: 'POST', body: JSON.stringify({ professional_id: profile.id, ...(remove ? { remove: true } : image ? { base64: image.base64, mimeType: image.mimeType } : {}) }) }); saved(result.data.photo_url) }
    catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  return <Modal title="Minha foto de perfil" close={close}><div className="pro-photo-editor"><div className="pro-photo-preview">{!remove && (image?.preview || profile.photo_url) ? <img src={image?.preview || profile.photo_url || ''} alt="Prévia da sua foto" /> : <UserRound size={48} />}</div><p>{remove ? 'Sua foto será removida. Você poderá escolher outra depois.' : 'Escolha uma foto em que seu rosto apareça bem. A prévia mostra o enquadramento.'}</p><label className="pro-photo-picker"><Camera size={18} /><span>{preparing ? 'Preparando foto…' : 'Escolher uma foto'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={busy || preparing} aria-label="Escolher foto de perfil" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setPreparing(true); setError(''); try { setImage(await preparePhoto(file)); setRemove(false) } catch (cause) { setError((cause as Error).message) } finally { setPreparing(false) } }} /></label>{profile.photo_url && <button className="pro-remove-goals" disabled={busy || preparing} onClick={() => { setRemove(value => !value); setImage(null) }}><Trash2 size={15} />{remove ? 'Manter foto atual' : 'Remover minha foto'}</button>}{error && <p className="form-error" role="alert">{error}</p>}<button className="primary pro-dialog-save" disabled={busy || preparing || (!image && !remove)} onClick={() => void save()}>{busy ? 'Salvando…' : remove ? 'Confirmar remoção da foto' : 'Salvar minha foto'}</button></div></Modal>
}
async function preparePhoto(file: File) {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) throw new Error('Escolha um arquivo de imagem.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Escolha uma foto com até 10 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Não foi possível abrir essa foto. Tente uma imagem JPEG, PNG ou WebP.')); image.src = url })
    const size = Math.min(image.naturalWidth, image.naturalHeight), canvas = document.createElement('canvas')
    canvas.width = canvas.height = Math.min(size, 800)
    const context = canvas.getContext('2d'); if (!context) throw new Error('Não foi possível preparar a foto.')
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, canvas.width, canvas.height)
    const preview = canvas.toDataURL('image/jpeg', .85)
    return { preview, base64: preview.split(',')[1], mimeType: 'image/jpeg' }
  } finally { URL.revokeObjectURL(url) }
}

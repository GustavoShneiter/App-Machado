import { useState } from 'react'
import { Check, CheckCircle2, Eye, EyeOff, Scissors, Target, Trash2, Users, WalletCards } from 'lucide-react'
import { apiRequest } from '../dataClient'
import { Modal } from '../ManagementPages'
import type { Preferences } from './types'

export const indicators = [
  { id: 'earned', title: 'Comissão no período', icon: WalletCards },
  { id: 'pending', title: 'A receber no período', icon: WalletCards },
  { id: 'paid', title: 'Já recebida no período', icon: CheckCircle2 },
  { id: 'services', title: 'Serviços realizados', icon: Scissors },
  { id: 'customers', title: 'Clientes atendidos', icon: Users },
]
export function PreferencesModal({ professionalId, preferences, close, saved, tab = 'goals' }: { professionalId: string; preferences: Preferences; close: () => void; saved: (preferences: Preferences) => void; tab?: 'goals' | 'cards' }) {
  const [draft, setDraft] = useState<Preferences>({ ...preferences, show_goals: preferences.show_goals !== false })
  const [section, setSection] = useState(tab)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function save(value: Preferences) {
    if (busy) return
    setBusy(true); setError('')
    try { const result = await apiRequest<{ data: Preferences }>('/professional/preferences', { method: 'POST', body: JSON.stringify({ professional_id: professionalId, preferences: value }) }); saved(result.data) }
    catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  return <Modal title="Personalizar meu Caixa" close={close}><div className="pro-preferences">
    <div className="pro-dialog-tabs" role="tablist" aria-label="Personalização do Caixa"><button role="tab" aria-selected={section === 'goals'} onClick={() => setSection('goals')}><Target size={16} />Minhas metas</button><button role="tab" aria-selected={section === 'cards'} onClick={() => setSection('cards')}><WalletCards size={16} />Indicadores</button></div>
    {confirmRemove ? <div className="pro-confirm-remove"><span className="pro-dialog-symbol"><Trash2 size={24} /></span><h3>Remover minhas metas?</h3><p>As metas de comissão, serviços e clientes serão zeradas e sairão do Meu Caixa. Seus atendimentos e comissões continuam registrados.</p>{error && <p role="alert" className="form-error">{error}</p>}<button className="danger-button" disabled={busy} onClick={() => void save({ ...preferences, weekly_commission_goal_cents: 0, weekly_service_goal: 0, weekly_customer_goal: 0, show_goals: false })}>{busy ? 'Removendo…' : 'Confirmar remoção das metas'}</button><button className="outline" disabled={busy} onClick={() => setConfirmRemove(false)}>Manter minhas metas</button></div> : <form onSubmit={event => { event.preventDefault(); void save(draft) }}>
      <fieldset disabled={busy} className="pro-settings-fields">
        {section === 'goals' ? <>
          <p className="pro-dialog-intro">Uma semana de cada vez. Defina objetivos que façam sentido para você.</p>
          <label className="pro-visibility-setting"><span className="pro-setting-icon">{draft.show_goals ? <Eye size={19} /> : <EyeOff size={19} />}</span><span><strong>Mostrar metas no Meu Caixa</strong><small>Você pode ocultar sem perder os valores.</small></span><input type="checkbox" role="switch" checked={draft.show_goals} onChange={event => setDraft({ ...draft, show_goals: event.target.checked })} /></label>
          <div className="pro-goal-input"><span><WalletCards size={18} />Comissão da semana</span><label className="field"><span className="sr-only">Meta semanal de comissão (R$)</span><input aria-label="Meta semanal de comissão (R$)" type="number" inputMode="decimal" min="0" max="1000000" step="0.01" required value={draft.weekly_commission_goal_cents / 100} onChange={event => setDraft({ ...draft, weekly_commission_goal_cents: Math.round(Number(event.target.value) * 100) })} /><small>em reais</small></label></div>
          <div className="pro-goal-input"><span><Scissors size={18} />Serviços na semana</span><label className="field"><span className="sr-only">Meta de serviços por semana</span><input aria-label="Meta de serviços por semana" type="number" inputMode="numeric" min="0" max="10000" step="1" required value={draft.weekly_service_goal} onChange={event => setDraft({ ...draft, weekly_service_goal: Number(event.target.value) })} /><small>serviços</small></label></div>
          <div className="pro-goal-input"><span><Users size={18} />Clientes na semana</span><label className="field"><span className="sr-only">Meta de clientes por semana</span><input aria-label="Meta de clientes por semana" type="number" inputMode="numeric" min="0" max="10000" step="1" required value={draft.weekly_customer_goal} onChange={event => setDraft({ ...draft, weekly_customer_goal: Number(event.target.value) })} /><small>pessoas distintas</small></label></div>
          <p className="pro-setting-note">Use zero para desativar uma meta específica. A semana vai de segunda a domingo.</p>
          <button className="pro-remove-goals" type="button" onClick={() => setConfirmRemove(true)}><Trash2 size={15} />Remover todas as minhas metas</button>
        </> : <><p className="pro-dialog-intro">Escolha os números que deseja acompanhar. Estas opções ficam salvas no seu perfil.</p><fieldset className="pro-card-options"><legend>Indicadores que quero ver</legend>{indicators.map(item => <label className="pro-card-choice" key={item.id}><item.icon size={18} /><span>{item.title}</span><input type="checkbox" checked={draft.visible_cards.includes(item.id)} onChange={event => setDraft({ ...draft, visible_cards: event.target.checked ? [...draft.visible_cards, item.id] : draft.visible_cards.filter(value => value !== item.id) })} /></label>)}</fieldset>{!draft.visible_cards.length && <p className="form-hint">Escolha pelo menos um indicador.</p>}</>}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}<button className="primary pro-dialog-save" disabled={busy || !draft.visible_cards.length}><Check size={17} />{busy ? 'Salvando…' : 'Salvar preferências'}</button>
    </form>}
  </div></Modal>
}

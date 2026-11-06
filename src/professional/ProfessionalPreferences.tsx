import { useState } from 'react'
import { Check, CheckCircle2, Eye, EyeOff, Scissors, Target, Users, WalletCards } from 'lucide-react'
import { apiRequest } from '../dataClient'
import { Modal } from '../ManagementPages'
import { money } from '../operations'
import type { Preferences } from './types'

export const indicators = [
  { id: 'earned', title: 'Comissão gerada', icon: WalletCards },
  { id: 'pending', title: 'Ainda a receber', icon: WalletCards },
  { id: 'paid', title: 'Comissão já repassada', icon: CheckCircle2 },
  { id: 'services', title: 'Serviços realizados', icon: Scissors },
  { id: 'customers', title: 'Clientes atendidos', icon: Users },
]

export function PreferencesModal({ professionalId, preferences, close, saved, tab = 'goals' }: { professionalId: string; preferences: Preferences; close: () => void; saved: (preferences: Preferences) => void; tab?: 'goals' | 'cards' }) {
  const [draft, setDraft] = useState<Preferences>({ ...preferences, show_goals: preferences.show_goals !== false })
  const [section, setSection] = useState(tab)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function save() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await apiRequest<{ data: Preferences }>('/professional/preferences', {
        method: 'POST', body: JSON.stringify({ professional_id: professionalId, preferences: { show_goals: draft.show_goals, visible_cards: draft.visible_cards } }),
      })
      saved(result.data)
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  return <Modal title="Personalizar meu Caixa" close={close}><div className="pro-preferences pro-wallet-preferences">
    <div className="pro-dialog-tabs" role="tablist" aria-label="Personalização do Caixa"><button role="tab" aria-selected={section === 'goals'} onClick={() => setSection('goals')}><Target size={16} />Minhas metas</button><button role="tab" aria-selected={section === 'cards'} onClick={() => setSection('cards')}><WalletCards size={16} />Indicadores</button></div>
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <fieldset disabled={busy} className="pro-settings-fields">
        {section === 'goals' ? <>
          <p className="pro-dialog-intro">As metas são definidas pela administração da sua unidade. Aqui você escolhe como acompanhá-las.</p>
          <label className="pro-visibility-setting"><span className="pro-setting-icon">{draft.show_goals ? <Eye size={19} /> : <EyeOff size={19} />}</span><span><strong>Mostrar metas no Meu Caixa</strong><small>Ocultar a visualização mantém as metas atribuídas.</small></span><input type="checkbox" role="switch" checked={draft.show_goals} onChange={event => setDraft({ ...draft, show_goals: event.target.checked })} /></label>
          <dl className="pro-assigned-goals" aria-label="Metas definidas pela administração">
            <div><dt>Comissão por semana</dt><dd>{preferences.weekly_commission_goal_cents > 0 ? money(preferences.weekly_commission_goal_cents) : 'Não definida'}</dd></div>
            <div><dt>Serviços por semana</dt><dd>{preferences.weekly_service_goal > 0 ? preferences.weekly_service_goal : 'Não definida'}</dd></div>
            <div><dt>Clientes por semana</dt><dd>{preferences.weekly_customer_goal > 0 ? preferences.weekly_customer_goal : 'Não definida'}</dd></div>
          </dl>
          <p className="pro-setting-note">Para solicitar uma mudança nos valores, converse com a administração. A semana vai de segunda a domingo.</p>
        </> : <><p className="pro-dialog-intro">Escolha os números do seu resumo. As comissões continuam disponíveis no extrato.</p><fieldset className="pro-card-options"><legend>Indicadores que quero ver</legend>{indicators.map(item => <label className="pro-card-choice" key={item.id}><item.icon size={18} /><span>{item.title}</span><input type="checkbox" checked={draft.visible_cards.includes(item.id)} onChange={event => setDraft({ ...draft, visible_cards: event.target.checked ? [...draft.visible_cards, item.id] : draft.visible_cards.filter(value => value !== item.id) })} /></label>)}</fieldset>{!draft.visible_cards.length && <p className="form-hint">Escolha pelo menos um indicador.</p>}</>}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}<button className="primary pro-dialog-save" disabled={busy || !draft.visible_cards.length}><Check size={17} />{busy ? 'Salvando…' : 'Salvar preferências'}</button>
    </form>
  </div></Modal>
}

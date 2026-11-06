import { useEffect, useState } from 'react'
import { Target } from 'lucide-react'
import { apiRequest } from '../dataClient'
import { Modal } from '../ManagementPages'
import { money } from '../operations'
import { weekRange, shortDate } from '../professional/periods'
import './reports.css'

export type ManagedProfessionalGoals = {
  professional_id: string; professional_name: string; weekly_commission_goal_cents: number; weekly_service_goal: number; weekly_customer_goal: number
  goals_managed_by_admin: true; goals_assigned_by: string | null; goals_updated_at: string | null
}

function useGoals(professionalId: string, reload = 0) {
  const [value, setValue] = useState<ManagedProfessionalGoals | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    setValue(null); setError(''); setLoading(true)
    void apiRequest<{ data: ManagedProfessionalGoals }>('/professional-goals?professional_id=' + encodeURIComponent(professionalId)).then(result => { if (alive) setValue(result.data) }).catch(cause => { if (alive) setError((cause as Error).message || 'Não foi possível carregar as metas.') }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [professionalId, reload])
  return { value, error, loading }
}

export function AdminProfessionalGoals({ professionalId }: { professionalId: string }) {
  const [open, setOpen] = useState(false), [reload, setReload] = useState(0), [message, setMessage] = useState('')
  const { value, error, loading } = useGoals(professionalId, reload)
  const configured = value && (value.weekly_commission_goal_cents > 0 || value.weekly_service_goal > 0 || value.weekly_customer_goal > 0)
  return <section className="admin-professional-goals" aria-label="Metas do profissional">
    <div><h3><Target size={17} />Metas da semana</h3><button type="button" aria-haspopup="dialog" onClick={() => { setMessage(''); setOpen(true) }}>{configured ? 'Editar metas' : 'Definir metas'}</button></div>
    <p>A administração define os objetivos. O profissional acompanha os resultados no próprio painel.</p>
    {loading ? <p role="status">Carregando metas…</p> : error ? <p className="report-editor-error" role="alert">{error} <button type="button" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></p> : configured ? <div className="admin-goal-summary">
      <div><small>Comissão</small><strong>{value.weekly_commission_goal_cents > 0 ? money(value.weekly_commission_goal_cents) : 'Sem meta'}</strong><span>por semana</span></div>
      <div><small>Serviços</small><strong>{value.weekly_service_goal > 0 ? value.weekly_service_goal : 'Sem meta'}</strong><span>por semana</span></div>
      <div><small>Clientes</small><strong>{value.weekly_customer_goal > 0 ? value.weekly_customer_goal : 'Sem meta'}</strong><span>pessoas distintas</span></div>
    </div> : <p>Nenhuma meta definida para este profissional.</p>}
    {message && <p className="admin-goal-success" role="status">{message}</p>}
    {open && <ProfessionalGoalEditor professionalId={professionalId} close={() => setOpen(false)} saved={() => { setOpen(false); setReload(value => value + 1); setMessage('Metas salvas. O profissional já pode acompanhar no painel dele.') }} />}
  </section>
}

export function ProfessionalGoalEditor({ professionalId, close, saved }: { professionalId: string; close: () => void; saved?: (value: ManagedProfessionalGoals) => void }) {
  const [reload, setReload] = useState(0), { value, error: loadError, loading } = useGoals(professionalId, reload)
  return <Modal title="Metas do profissional" close={close}>
    <div className="report-goal-editor">
      {loading ? <p className="report-editor-description" role="status">Carregando as metas deste profissional…</p> : loadError ? <div className="report-editor-error" role="alert">{loadError}<div className="report-editor-footer"><button className="outline" type="button" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></div></div> : value && <GoalForm key={professionalId + ':' + reload} value={value} close={close} saved={saved} />}
    </div>
  </Modal>
}

function GoalForm({ value, close, saved }: { value: ManagedProfessionalGoals; close: () => void; saved?: (value: ManagedProfessionalGoals) => void }) {
  const [commission, setCommission] = useState(String(value.weekly_commission_goal_cents / 100)), [services, setServices] = useState(String(value.weekly_service_goal)), [customers, setCustomers] = useState(String(value.weekly_customer_goal))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const range = weekRange()
  async function save() {
    if (busy) return
    const payload = { professional_id: value.professional_id, weekly_commission_goal_cents: Math.round(Number(commission) * 100), weekly_service_goal: Number(services), weekly_customer_goal: Number(customers) }
    if (!commission || !services || !customers || !Number.isInteger(payload.weekly_commission_goal_cents) || payload.weekly_commission_goal_cents < 0 || payload.weekly_commission_goal_cents > 100000000 || !Number.isInteger(payload.weekly_service_goal) || payload.weekly_service_goal < 0 || payload.weekly_service_goal > 10000 || !Number.isInteger(payload.weekly_customer_goal) || payload.weekly_customer_goal < 0 || payload.weekly_customer_goal > 10000) { setError('Informe valores válidos. Use zero nos objetivos que não quiser acompanhar.'); return }
    setBusy(true); setError('')
    try {
      const result = await apiRequest<{ data: ManagedProfessionalGoals }>('/professional-goals', { method: 'POST', body: JSON.stringify(payload) })
      if (saved) saved(result.data)
      else close()
    } catch (cause) { setError((cause as Error).message || 'Não foi possível salvar as metas. Tente novamente.') }
    finally { setBusy(false) }
  }
  return <form onSubmit={event => { event.preventDefault(); event.stopPropagation(); void save() }}>
    <p className="report-editor-description"><strong>{value.professional_name}</strong> verá estes objetivos no próprio painel. Só a administração pode alterar os valores.</p>
    <p className="report-goal-week">Semana atual: {shortDate(range.from)} a {shortDate(range.to)}. As metas valem a cada semana, de segunda a domingo.</p>
    <div className="report-goal-fields">
      <label className="field"><span>Meta de comissão por semana (R$)</span><input aria-label="Meta de comissão por semana (R$)" type="number" inputMode="decimal" min="0" max="1000000" step="0.01" required disabled={busy} value={commission} onChange={event => setCommission(event.target.value)} /><small>É a comissão do profissional, não o faturamento da barbearia.</small></label>
      <label className="field"><span>Meta de serviços por semana</span><input aria-label="Meta de serviços por semana" type="number" inputMode="numeric" min="0" max="10000" step="1" required disabled={busy} value={services} onChange={event => setServices(event.target.value)} /></label>
      <label className="field"><span>Meta de clientes por semana</span><input aria-label="Meta de clientes por semana" type="number" inputMode="numeric" min="0" max="10000" step="1" required disabled={busy} value={customers} onChange={event => setCustomers(event.target.value)} /><small>Cada cliente conta uma vez na semana, mesmo com vários atendimentos.</small></label>
    </div>
    <p className="report-editor-description" style={{ marginTop: 17, marginBottom: 0 }}>Use zero para retirar uma meta. Isso não apaga atendimentos ou comissões.</p>
    {error && <p className="report-editor-error" role="alert">{error}</p>}
    <div className="report-editor-footer"><button type="button" className="outline" disabled={busy} onClick={close}>Cancelar</button><button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar metas'}</button></div>
  </form>
}

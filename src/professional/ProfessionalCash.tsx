import { useEffect, useRef, useState } from 'react'
import { Settings2, Target, TrendingUp, WalletCards, Scissors, Users, CheckCircle2 } from 'lucide-react'
import { apiRequest } from '../dataClient'
import { Modal, Page } from '../ManagementPages'
import { useOperations } from '../OperationsStore'
import { dateTime, money } from '../operations'
import type { Preferences, ProfessionalCashData } from './types'
import { estimatedServices, progress, remaining, shortDate, weekRange } from './periods'

const indicators = [
  { id: 'earned', title: 'Minha comissão no período', icon: TrendingUp },
  { id: 'pending', title: 'Destas, a receber', icon: WalletCards },
  { id: 'paid', title: 'Destas, já repassadas', icon: CheckCircle2 },
  { id: 'services', title: 'Serviços realizados', icon: Scissors },
  { id: 'customers', title: 'Clientes atendidos', icon: Users },
]
export function ProfessionalCash({ professionalId }: { professionalId: string }) {
  const { refreshed } = useOperations()
  const [period, setPeriod] = useState('current')
  const [custom, setCustom] = useState(weekRange())
  const [selected, setSelected] = useState<ProfessionalCashData | null>(null)
  const [weeks, setWeeks] = useState<ProfessionalCashData[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState(false)
  const [reload, setReload] = useState(0)
  const [entryFilter, setEntryFilter] = useState('all')
  const request = useRef(0)
  const range = period === 'custom' ? custom : weekRange(period === 'previous' ? -1 : period === 'older' ? -2 : 0)
  useEffect(() => {
    const version = ++request.current
    setError(''); setLoading(true)
    const load = (from: string, to: string) => apiRequest<{ data: ProfessionalCashData }>('/professional/cash?' + new URLSearchParams({ professional_id: professionalId, from, to }))
    const periods = [0, -1, -2].map(offset => weekRange(offset))
    const ranges = [range, ...periods]
    const requests = new Map<string, ReturnType<typeof load>>()
    for (const value of ranges) {
      const key = value.from + ':' + value.to
      if (!requests.has(key)) requests.set(key, load(value.from, value.to))
    }
    void Promise.all(ranges.map(value => requests.get(value.from + ':' + value.to)!)).then(values => {
      if (version !== request.current) return
      setSelected(values[0].data); setWeeks(values.slice(1).map(value => value.data))
    }).catch(cause => { if (version === request.current) { setSelected(null); setError(cause.message || 'Não foi possível carregar suas comissões.') } }).finally(() => { if (version === request.current) setLoading(false) })
    return () => { request.current++ }
  }, [professionalId, range.from, range.to, refreshed, reload])
  const current = weeks[0], previous = weeks[1]
  const prefs = current?.preferences
  const serviceEntries = (current?.services ? current : previous)?.entries.filter(entry => entry.type === 'service') ?? []
  const serviceTotal = serviceEntries.reduce((sum, entry) => sum + entry.commission_cents, 0)
  const serviceCount = (current?.services ? current : previous)?.services ?? 0
  const missing = prefs && current ? remaining(prefs.weekly_commission_goal_cents, current.earned) : 0
  const estimate = estimatedServices(missing, serviceTotal, serviceCount)
  const visibleEntries = selected?.entries.filter(entry => entryFilter === 'all' || entry.status === entryFilter) ?? []
  return <Page title="Meu Caixa" text="Suas comissões, seus resultados e suas metas." action={<button className="outline small" onClick={() => setSettings(true)} disabled={!prefs}><Settings2 size={16} />Personalizar</button>}>
    <section className="pro-period panel" aria-label="Período das comissões">
      <div className="pro-period-buttons">{[{ id: 'current', label: 'Esta semana' }, { id: 'previous', label: 'Semana passada' }, { id: 'older', label: 'Semana retrasada' }, { id: 'custom', label: 'Escolher período' }].map(item => <button key={item.id} className={period === item.id ? 'selected' : ''} aria-pressed={period === item.id} onClick={() => setPeriod(item.id)}>{item.label}</button>)}</div>
      {period === 'custom' && <div className="pro-date-fields"><label className="field"><span>De</span><input aria-label="Data inicial" type="date" value={custom.from} max={custom.to} onChange={event => setCustom({ ...custom, from: event.target.value })} /></label><label className="field"><span>Até</span><input aria-label="Data final" type="date" value={custom.to} min={custom.from} onChange={event => setCustom({ ...custom, to: event.target.value })} /></label></div>}
      <small>{shortDate(range.from)} a {shortDate(range.to)} · semanas de segunda a domingo</small>
    </section>
    {error && <p className="form-error" role="alert">{error}<button className="outline small" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></p>}
    {loading && !selected && !error && <p role="status">Carregando suas comissões…</p>}
    {selected && current && prefs && <>
      <section className="pro-receivable panel" aria-label="Comissão total a receber"><div><small>Meu saldo a receber · todos os períodos</small><strong>{money(selected.totalPending)}</strong><p>Comissões pendentes de repasse pela barbearia.</p></div><WalletCards aria-hidden="true" /></section>
      <section className="pro-metrics" aria-label="Meus indicadores">{indicators.filter(item => prefs.visible_cards.includes(item.id)).map(item => <article className="panel" key={item.id}><item.icon size={18} aria-hidden="true" /><span>{item.title}</span><strong>{['services', 'customers'].includes(item.id) ? selected[item.id as 'services' | 'customers'] : money(selected[item.id as 'earned' | 'pending' | 'paid'])}</strong></article>)}</section>
      <section className="panel pro-goals"><div className="pro-section-heading"><div><h3><Target size={18} />Minhas metas da semana</h3><p>{shortDate(current.from)} a {shortDate(current.to)}</p></div><button className="text-button" onClick={() => setSettings(true)}>Editar metas</button></div>
        {prefs.weekly_commission_goal_cents > 0 ? <><Goal label="Meta de comissão" goal={prefs.weekly_commission_goal_cents} actual={current.earned} monetary /><p className="pro-goal-tip">{missing === 0 ? 'Meta de comissão alcançada nesta semana.' : <>Faltam <strong>{money(missing)}</strong>{estimate !== null ? <> · cerca de <strong>{estimate} serviços</strong> pela sua média de comissão.</> : '. Conclua atendimentos para calcular uma estimativa de serviços.'}</>}</p>{estimate !== null && missing > 0 && <small>Estimativa por serviço; o resultado varia conforme o serviço e a comissão configurada.</small>}</> : <p className="pro-empty-goal">Defina quanto quer ganhar em comissões por semana para acompanhar o que falta.</p>}
        {prefs.weekly_service_goal > 0 && <Goal label="Serviços" goal={prefs.weekly_service_goal} actual={current.services} />}
        {prefs.weekly_customer_goal > 0 && <Goal label="Clientes distintos" goal={prefs.weekly_customer_goal} actual={current.customers} />}
        <div className="pro-previous-target"><strong>Superar a semana passada</strong><p>{previous?.earned > 0 ? current.earned > previous.earned ? 'Você já superou sua comissão da semana passada.' : <>Faltam <b>{money(previous.earned - current.earned + 1)}</b> para superar os {money(previous.earned)} da semana passada.</> : 'Ainda não há comissão na semana passada para comparar.'}</p></div>
      </section>
      <section className="panel pro-week-comparison"><h3>Seu histórico por semana</h3><div>{weeks.map((week, index) => <article key={week.from}><span>{['Esta semana', 'Semana passada', 'Semana retrasada'][index]}</span><small>{shortDate(week.from)}–{shortDate(week.to)}</small><strong>{money(week.earned)}</strong><p>{week.services} serviços · {week.customers} clientes</p></article>)}</div></section>
      <section className="panel pro-ledger"><div className="pro-section-heading"><div><h3>Extrato das minhas comissões</h3><p>Serviços e produtos do período selecionado.</p></div><label className="field"><span className="sr-only">Situação da comissão</span><select aria-label="Situação da comissão" value={entryFilter} onChange={event => setEntryFilter(event.target.value)}><option value="all">Todas</option><option value="pending">A receber</option><option value="paid">Repassadas</option></select></label></div>
        {visibleEntries.map(entry => <article key={entry.id}><div><strong>{entry.description}{entry.quantity > 1 ? ` × ${entry.quantity}` : ''}</strong><span>{entry.customer_name || 'Atendimento'} · {entry.type === 'product' ? 'Produto' : 'Serviço'}</span><small>{dateTime(entry.occurred_at)}</small>{entry.paid_at && <small>Repasse em {dateTime(entry.paid_at)}</small>}</div><div className="pro-entry-value"><strong>{money(entry.commission_cents)}</strong><span className={entry.status === 'paid' ? 'pro-status paid' : 'pro-status'}>{entry.status === 'paid' ? 'Repassada' : 'A receber'}</span></div></article>)}
        {!visibleEntries.length && <p className="empty">Nenhuma comissão neste período e situação.</p>}
      </section>
      <p className="pro-data-note">Os valores são suas comissões de serviços e produtos concluídos, conforme as regras da barbearia. A receber e repassadas mostram a situação atual dessas comissões. Clientes são pessoas distintas no período.</p>
    </>}
    {settings && prefs && <PreferencesModal professionalId={professionalId} preferences={prefs} close={() => setSettings(false)} saved={() => { setSettings(false); setReload(value => value + 1) }} />}
  </Page>
}
function Goal({ label, goal, actual, monetary = false }: { label: string; goal: number; actual: number; monetary?: boolean }) {
  const format = (value: number) => monetary ? money(value) : String(value)
  return <div className="pro-goal"><div><span>{label}</span><strong>{format(actual)} / {format(goal)}</strong></div><progress max="100" value={progress(goal, actual)} aria-label={label} /><small>{actual >= goal ? 'Meta alcançada' : `Faltam ${format(remaining(goal, actual))}`}</small></div>
}
function PreferencesModal({ professionalId, preferences, close, saved }: { professionalId: string; preferences: Preferences; close: () => void; saved: () => void }) {
  const [draft, setDraft] = useState(preferences)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <Modal title="Personalizar meu Caixa" close={close}><form onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await apiRequest('/professional/preferences', { method: 'POST', body: JSON.stringify({ professional_id: professionalId, preferences: draft }) }); saved() } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) } }}>
    <p className="form-hint">Estas metas e indicadores ficam salvos somente no seu perfil.</p>
    <label className="field"><span>Meta semanal de comissão (R$)</span><input type="number" min="0" max="1000000" step="0.01" required value={draft.weekly_commission_goal_cents / 100} onChange={event => setDraft({ ...draft, weekly_commission_goal_cents: Math.round(Number(event.target.value) * 100) })} /></label>
    <div className="form-grid"><label className="field"><span>Meta de serviços por semana</span><input type="number" required min="0" max="10000" step="1" value={draft.weekly_service_goal} onChange={event => setDraft({ ...draft, weekly_service_goal: Number(event.target.value) })} /></label><label className="field"><span>Meta de clientes por semana</span><input type="number" required min="0" max="10000" step="1" value={draft.weekly_customer_goal} onChange={event => setDraft({ ...draft, weekly_customer_goal: Number(event.target.value) })} /></label></div>
    <fieldset className="pro-card-options"><legend>Indicadores que quero ver</legend>{indicators.map(item => <label className="check" key={item.id}><input type="checkbox" checked={draft.visible_cards.includes(item.id)} onChange={event => setDraft({ ...draft, visible_cards: event.target.checked ? [...draft.visible_cards, item.id] : draft.visible_cards.filter(value => value !== item.id) })} />{item.title}</label>)}</fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}<button className="primary" disabled={busy || !draft.visible_cards.length}>{busy ? 'Salvando…' : 'Salvar preferências'}</button>
  </form></Modal>
}

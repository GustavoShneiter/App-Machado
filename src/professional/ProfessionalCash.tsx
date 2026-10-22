import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronDown, ChevronRight, CircleHelp, ReceiptText, Settings2, Sparkles, WalletCards } from 'lucide-react'
import { apiRequest } from '../dataClient'
import { Page } from '../ManagementPages'
import { useOperations } from '../OperationsStore'
import { money } from '../operations'
import type { Preferences, ProfessionalCashData, ProfessionalEntry } from './types'
import { shortDate, weekRange } from './periods'
import { indicators, PreferencesModal } from './ProfessionalPreferences'
import { GoalDetails, ProfessionalGoals } from './ProfessionalGoals'
import { ProfessionalFeedback } from './ProfessionalFeedback'
import { BalanceDialog, EntryDialog, PeriodModal, periods } from './ProfessionalCashDialogs'

export function ProfessionalCash({ professionalId }: { professionalId: string }) {
  const { refreshed } = useOperations()
  const [period, setPeriod] = useState('current'), [custom, setCustom] = useState(weekRange())
  const [selected, setSelected] = useState<ProfessionalCashData | null>(null), [weeks, setWeeks] = useState<ProfessionalCashData[]>([])
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [reload, setReload] = useState(0)
  const [popup, setPopup] = useState<'period' | 'settings' | 'progress' | 'balance' | null>(null)
  const [entry, setEntry] = useState<ProfessionalEntry | null>(null), [entryFilter, setEntryFilter] = useState('all'), [message, setMessage] = useState('')
  const closeMessage = useCallback(() => setMessage(''), [])
  const request = useRef(0), range = period === 'custom' ? custom : weekRange(period === 'previous' ? -1 : period === 'older' ? -2 : 0)
  useEffect(() => {
    const version = ++request.current
    setError(''); setLoading(true)
    const load = (from: string, to: string) => apiRequest<{ data: ProfessionalCashData }>('/professional/cash?' + new URLSearchParams({ professional_id: professionalId, from, to }))
    const ranges = [range, ...[0, -1, -2].map(offset => weekRange(offset))], requests = new Map<string, ReturnType<typeof load>>()
    for (const value of ranges) { const key = value.from + ':' + value.to; if (!requests.has(key)) requests.set(key, load(value.from, value.to)) }
    void Promise.all(ranges.map(value => requests.get(value.from + ':' + value.to)!)).then(values => {
      if (version !== request.current) return
      setSelected(values[0].data); setWeeks(values.slice(1).map(value => value.data))
    }).catch(cause => { if (version === request.current) { setSelected(null); setError(cause.message || 'Não foi possível carregar suas comissões.') } }).finally(() => { if (version === request.current) setLoading(false) })
    return () => { request.current++ }
  }, [professionalId, range.from, range.to, refreshed, reload])
  const current = weeks[0], prefs = current?.preferences
  const visibleEntries = selected?.entries.filter(item => entryFilter === 'all' || item.status === entryFilter) ?? []
  function saved(value: Preferences) {
    setWeeks(previous => previous.map(week => ({ ...week, preferences: value })))
    setSelected(previous => previous ? { ...previous, preferences: value } : previous)
    setPopup(null); setReload(value => value + 1); setMessage('Suas preferências foram salvas. Seu Caixa, do seu jeito.')
  }
  return <Page title="Meu Caixa" text="Seu trabalho, sua evolução." action={<button className="pro-customize" aria-label="Personalizar meu Caixa" onClick={() => setPopup('settings')} disabled={!prefs}><Settings2 size={18} /></button>}>
    {error && <div className="form-error" role="alert">{error}<button className="outline small" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></div>}
    {loading && !selected && !error && <div className="pro-cash-skeleton" role="status"><WalletCards size={25} /><span>Preparando seu resumo…</span></div>}
    {selected && current && prefs && <>
      <div className={'pro-overview' + (prefs.show_goals !== false ? ' with-goals' : '')}><section className="pro-balance-card" aria-label="Comissão total a receber"><div className="pro-balance-top"><span><WalletCards size={18} />Meu saldo a receber</span><button aria-label="Entender meu saldo" onClick={() => setPopup('balance')}><CircleHelp size={18} /></button></div><strong>{money(selected.totalPending)}</strong><span className="pro-balance-note"><span />Comissões aguardando repasse</span><div className="pro-balance-foot"><Sparkles size={14} />Cada atendimento faz parte da sua conquista.</div></section><ProfessionalGoals current={current} edit={() => setPopup('settings')} details={() => setPopup('progress')} /></div>
      <div className="pro-results-heading"><div><span className="pro-overline">MEUS RESULTADOS</span><h3>{periods.find(item => item.id === period)?.label}</h3><small>{shortDate(range.from)} a {shortDate(range.to)}</small></div><button className="pro-period-trigger" aria-label="Escolher período das comissões" onClick={() => setPopup('period')}><CalendarDays size={17} /><span>Período</span><ChevronDown size={14} /></button></div>
      {loading && <p className="pro-updating" role="status">Atualizando período…</p>}
      <div className="pro-cash-content" aria-busy={loading}>
        <section className="pro-results-grid" aria-label="Meus indicadores">{indicators.filter(item => prefs.visible_cards.includes(item.id)).map(item => <article className={'pro-result-card pro-result-' + item.id} key={item.id}><span className="pro-result-icon"><item.icon size={18} /></span><span>{item.title}</span><strong>{['services', 'customers'].includes(item.id) ? selected[item.id as 'services' | 'customers'] : money(selected[item.id as 'earned' | 'pending' | 'paid'])}</strong>{item.id === 'earned' && <small>Seu resultado no período selecionado</small>}</article>)}</section>
      </div>
      <div className="pro-cash-columns"><div className="pro-cash-main">
        <section className="pro-week-history" aria-label="Histórico semanal"><div className="pro-section-heading"><div><h3>Sua evolução</h3><p>Comissões de cada semana</p></div><ArrowUpRight size={20} /></div><div>{weeks.map((week, index) => <button aria-label={'Ver ' + periods[index].label.toLowerCase()} className={period === periods[index].id ? 'active' : ''} onClick={() => setPeriod(periods[index].id)} key={week.from}><span>{periods[index].label}</span><strong>{money(week.earned)}</strong><div className="pro-history-track" aria-hidden="true"><i style={{ transform: `scaleX(${week.earned / Math.max(...weeks.map(value => value.earned), 1)})` }} /></div><small>{week.services} serviços · {week.customers} clientes</small><time>{shortDate(week.from)}–{shortDate(week.to)}</time></button>)}</div></section>
      </div><section className="pro-commission-ledger"><div className="pro-section-heading"><div><h3>Minhas comissões</h3><p>{shortDate(range.from)} a {shortDate(range.to)}</p></div><ReceiptText size={20} /></div><div className="pro-ledger-filters" aria-label="Situação da comissão">{[{ id: 'all', label: 'Todas' }, { id: 'pending', label: 'A receber' }, { id: 'paid', label: 'Recebidas' }].map(filter => <button key={filter.id} aria-pressed={entryFilter === filter.id} onClick={() => setEntryFilter(filter.id)}>{filter.label}</button>)}</div><div className="pro-ledger-list" aria-busy={loading}>
        {visibleEntries.map(item => <button className="pro-commission-row" key={item.id} disabled={loading} onClick={() => setEntry(item)}><span className={'pro-entry-symbol ' + item.status}>{item.status === 'paid' ? <ArrowDownLeft size={18} /> : <WalletCards size={18} />}</span><span className="pro-entry-description"><strong>{item.description}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</strong><span>{item.customer_name || 'Atendimento'}</span><small>{new Date(item.occurred_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })} · {item.status === 'paid' ? 'Recebida' : 'A receber'}</small></span><span className="pro-entry-amount"><strong>{money(item.commission_cents)}</strong><ChevronRight size={15} /></span></button>)}
        {!visibleEntries.length && <div className="pro-empty-ledger"><ReceiptText size={27} /><strong>Ainda não há comissões por aqui.</strong><p>Seus resultados aparecerão conforme os atendimentos forem concluídos.</p></div>}
      </div><p className="pro-ledger-note">Toque em um lançamento para ver os detalhes.</p></section></div>
      <p className="pro-data-note">Seu Caixa mostra apenas suas comissões. Os repasses são realizados pela administração da barbearia.</p>
    </>}
    {popup === 'settings' && prefs && <PreferencesModal professionalId={professionalId} preferences={prefs} close={() => setPopup(null)} saved={saved} />}
    {popup === 'progress' && current && <GoalDetails current={current} previous={weeks[1]} close={() => setPopup(null)} edit={() => setPopup('settings')} />}
    {popup === 'balance' && <BalanceDialog close={() => setPopup(null)} />}
    {popup === 'period' && <PeriodModal period={period} custom={custom} close={() => setPopup(null)} choose={(id, value) => { setCustom(value); setPeriod(id); setPopup(null) }} />}
    {entry && <EntryDialog entry={entry} close={() => setEntry(null)} />}
    <ProfessionalFeedback message={message} close={closeMessage} />
  </Page>
}

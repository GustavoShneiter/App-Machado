import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { CalendarDays, ChevronDown, ChevronRight, CircleHelp, ReceiptText, Settings2 } from 'lucide-react'
import { apiRequest } from '../dataClient'
import { Modal } from '../ManagementPages'
import { useOperations } from '../OperationsStore'
import { money } from '../operations'
import type { Preferences, ProfessionalCashData, ProfessionalEntry } from './types'
import { shortDate, weekRange } from './periods'
import { indicators, PreferencesModal } from './ProfessionalPreferences'
import { GoalDetails, ProfessionalGoals } from './ProfessionalGoals'
import { ProfessionalFeedback } from './ProfessionalFeedback'
import { BalanceDialog, EntryDialog, PeriodModal, ProfessionalReportDialog, periods } from './ProfessionalCashDialogs'

const entryDay = (entry: ProfessionalEntry) => new Date(entry.occurred_at).toLocaleDateString('pt-BR', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo',
})

function CommissionList({ entries, loading, choose }: { entries: ProfessionalEntry[]; loading: boolean; choose: (entry: ProfessionalEntry) => void }) {
  let previousDay = ''
  return <div className="pro-ledger-list" aria-busy={loading}>
    {entries.map(item => {
      const day = entryDay(item), firstInDay = day !== previousDay
      previousDay = day
      return <div className="pro-ledger-day-entry" key={item.id}>
        {firstInDay && <h4 className="pro-ledger-day">{day}</h4>}
        <button className="pro-commission-row" disabled={loading} onClick={() => choose(item)}>
          <span className="pro-entry-description">
            <strong>{item.description}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</strong>
            <span>{item.customer_name || 'Atendimento'}{item.type === 'product' ? ' · Produto' : ''}</span>
          </span>
          <span className="pro-entry-amount"><strong>{money(item.commission_cents)}</strong><small>{item.status === 'paid' ? 'Recebida' : 'A receber'}</small></span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    })}
    {!entries.length && <div className="pro-empty-ledger"><ReceiptText size={24} /><strong>Nenhuma comissão neste filtro.</strong><p>As comissões aparecem depois do recebimento do atendimento no Caixa.</p></div>}
  </div>
}

export function ProfessionalCash({ professionalId }: { professionalId: string }) {
  const { refreshed, refreshVersion } = useOperations()
  const [period, setPeriod] = useState('current'), [custom, setCustom] = useState(weekRange())
  const [selected, setSelected] = useState<ProfessionalCashData | null>(null), [weeks, setWeeks] = useState<ProfessionalCashData[]>([])
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [reload, setReload] = useState(0)
  const [popup, setPopup] = useState<'period' | 'settings' | 'progress' | 'balance' | 'ledger' | 'report' | 'report-period' | null>(null)
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
  }, [professionalId, range.from, range.to, refreshed, refreshVersion, reload])
  const current = weeks[0], prefs = current?.preferences
  const visibleEntries = selected?.entries.filter(item => entryFilter === 'all' || item.status === entryFilter) ?? []
  const shownIndicators = indicators.filter(item => prefs?.visible_cards.includes(item.id))
  function saved(value: Preferences) {
    setWeeks(previous => previous.map(week => ({ ...week, preferences: value })))
    setSelected(previous => previous ? { ...previous, preferences: value } : previous)
    setPopup(null); setReload(value => value + 1); setMessage('Preferências do Caixa salvas.')
  }
  const ledgerFilters = <div className="pro-ledger-filters" aria-label="Situação da comissão">
    {[{ id: 'all', label: 'Todas' }, { id: 'pending', label: 'A receber' }, { id: 'paid', label: 'Recebidas' }].map(filter => <button key={filter.id} aria-pressed={entryFilter === filter.id} onClick={() => setEntryFilter(filter.id)}>{filter.label}</button>)}
  </div>
  return <section className="page pro-wallet">
    <header className="pro-wallet-heading"><h1>Meu Caixa</h1><button className="pro-customize" aria-label="Personalizar meu Caixa" onClick={() => setPopup('settings')} disabled={!prefs}><Settings2 size={19} /></button></header>
    {error && <div className="form-error" role="alert">{error}<button className="outline small" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></div>}
    {loading && !selected && !error && <div className="pro-cash-skeleton" role="status"><span>Preparando suas comissões…</span></div>}
    {selected && current && prefs && <>
      <div className={'pro-wallet-top' + (prefs.show_goals !== false ? ' with-goals' : '')}>
        <section className="pro-wallet-balance" aria-label="Comissão total a receber">
          <div className="pro-wallet-balance-label"><h2>Meu saldo a receber</h2><button aria-label="Entender meu saldo" onClick={() => setPopup('balance')}><CircleHelp size={18} /></button></div>
          <strong>{money(selected.totalPending)}</strong><p>Comissões aguardando repasse · todos os períodos</p>
        </section>
        <ProfessionalGoals current={current} edit={() => setPopup('settings')} details={() => setPopup('progress')} />
      </div>

      <section className="pro-wallet-period" aria-label="Resultados do período">
        <header className="pro-results-heading"><div><h2>Seu resultado</h2><p>Atendimentos de {shortDate(range.from)} a {shortDate(range.to)}</p></div><button className="pro-period-trigger" aria-label="Escolher período das comissões" onClick={() => setPopup('period')}><CalendarDays size={16} /><span>{periods.find(item => item.id === period)?.label}</span><ChevronDown size={15} /></button></header>
        {loading && <p className="pro-updating" role="status">Atualizando período…</p>}
        <div className="pro-cash-content" aria-busy={loading}>
          <section className="pro-results-grid" aria-label="Meus indicadores" style={{ '--indicator-count': shownIndicators.length } as CSSProperties}>
            {shownIndicators.map(item => <article className={'pro-wallet-stat pro-result-' + item.id} key={item.id}>
              <span>{item.title}</span><strong>{['services', 'customers'].includes(item.id) ? selected[item.id as 'services' | 'customers'] : money(selected[item.id as 'earned' | 'pending' | 'paid'])}</strong>
            </article>)}
          </section>
        </div>
      </section>

      <div className="pro-wallet-lower">
        <section className="pro-week-history" aria-label="Histórico semanal">
          <div className="pro-section-heading"><h2>Sua evolução</h2><button className="pro-wallet-text-action" onClick={() => setPopup('report')}>Ver relatório<ChevronRight size={15} /></button></div>
          <div className="pro-week-comparison-list">{weeks.map((week, index) => <button aria-label={'Ver ' + periods[index].label.toLowerCase()} aria-pressed={period === periods[index].id} className={period === periods[index].id ? 'active' : ''} onClick={() => setPeriod(periods[index].id)} key={week.from}>
            <span className="pro-week-name"><strong>{periods[index].label}</strong><time>{shortDate(week.from)} a {shortDate(week.to)}</time></span>
            <span className="pro-week-result"><strong>{money(week.earned)}</strong><small>{week.services} serviços · {week.customers} clientes</small></span>
            <span className="pro-history-track" aria-hidden="true"><i style={{ transform: `scaleX(${week.earned / Math.max(...weeks.map(value => value.earned), 1)})` }} /></span>
          </button>)}</div>
        </section>
        <section className="pro-commission-ledger">
          <div className="pro-section-heading"><h2>Minhas comissões</h2>{visibleEntries.length > 5 && <button className="pro-wallet-text-action" onClick={() => setPopup('ledger')}>Ver todas<ChevronRight size={15} /></button>}</div>
          {ledgerFilters}
          <CommissionList entries={visibleEntries.slice(0, 5)} loading={loading} choose={setEntry} />
          {visibleEntries.length > 5 && <button className="pro-wallet-show-all" onClick={() => setPopup('ledger')}>Ver extrato completo · {visibleEntries.length} lançamentos<ChevronRight size={16} /></button>}
        </section>
      </div>
    </>}
    {popup === 'settings' && prefs && <PreferencesModal professionalId={professionalId} preferences={prefs} close={() => setPopup(null)} saved={saved} />}
    {popup === 'progress' && current && <GoalDetails current={current} previous={weeks[1]} close={() => setPopup(null)} edit={() => setPopup('settings')} />}
    {popup === 'balance' && <BalanceDialog close={() => setPopup(null)} />}
    {(popup === 'report' || popup === 'report-period') && selected && <ProfessionalReportDialog selected={selected} weeks={weeks} loading={loading} close={() => setPopup(null)} period={() => setPopup('report-period')} />}
    {(popup === 'period' || popup === 'report-period') && <PeriodModal period={period} custom={custom} close={() => setPopup(popup === 'report-period' ? 'report' : null)} choose={(id, value) => { setCustom(value); setPeriod(id); setPopup(popup === 'report-period' ? 'report' : null) }} />}
    {popup === 'ledger' && <Modal title="Extrato de comissões" close={() => setPopup(null)}><div className="pro-wallet-full-ledger"><p>{shortDate(range.from)} a {shortDate(range.to)} · {visibleEntries.length} lançamentos</p>{ledgerFilters}<CommissionList entries={visibleEntries} loading={loading} choose={setEntry} /></div></Modal>}
    {entry && <EntryDialog entry={entry} close={() => setEntry(null)} />}
    <ProfessionalFeedback message={message} close={closeMessage} />
  </section>
}

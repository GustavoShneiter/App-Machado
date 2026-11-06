import { useState } from 'react'
import { ArrowDownLeft, CalendarDays, ChevronRight, WalletCards } from 'lucide-react'
import { Modal } from '../ManagementPages'
import { dateTime, money } from '../operations'
import { DonutChart } from '../reports/ReportCharts'
import type { ProfessionalCashData, ProfessionalEntry } from './types'
import { shortDate } from './periods'

export const periods = [{ id: 'current', label: 'Esta semana' }, { id: 'previous', label: 'Semana passada' }, { id: 'older', label: 'Semana retrasada' }, { id: 'custom', label: 'Escolher período' }]
export function BalanceDialog({ close }: { close: () => void }) {
  return <Modal title="Meu saldo a receber" close={close}><div className="pro-info-dialog"><span className="pro-dialog-symbol"><WalletCards size={25} /></span><h3>Comissões pendentes</h3><p>Todos os períodos · aguardando repasse.</p><button className="primary pro-dialog-save" onClick={close}>Entendi</button></div></Modal>
}
export function ProfessionalReportDialog({ selected, weeks, loading, close, period }: { selected: ProfessionalCashData; weeks: ProfessionalCashData[]; loading: boolean; close: () => void; period: () => void }) {
  const composition = [
    { id: 'services', label: 'Serviços', value: selected.entries.filter(entry => entry.type === 'service').reduce((sum, entry) => sum + entry.commission_cents, 0) },
    { id: 'products', label: 'Produtos', value: selected.entries.filter(entry => entry.type === 'product').reduce((sum, entry) => sum + entry.commission_cents, 0) },
  ]
  const highest = Math.max(...weeks.map(week => week.earned), 1)
  return <Modal title="Meu relatório" close={close}><div className="pro-wallet-report" aria-busy={loading}>
    <div className="pro-report-range"><p>Suas comissões · {shortDate(selected.from)} a {shortDate(selected.to)}</p><button className="outline" onClick={period}><CalendarDays size={16} />Período</button></div>
    {loading && <p className="pro-updating" role="status">Atualizando relatório…</p>}
    <section className="pro-report-section"><h3>Origem das comissões</h3><DonutChart segments={composition} label="Distribuição das suas comissões entre serviços e produtos" totalLabel="Comissões" formatValue={money} compact /></section>
    <section className="pro-report-section"><h3>Evolução semanal</h3><div className="pro-report-weeks">{weeks.map((week, index) => <div key={week.from}><div><span>{periods[index].label}<small>{shortDate(week.from)} a {shortDate(week.to)}</small></span><strong>{money(week.earned)}</strong></div><div className="pro-report-week-track" aria-hidden="true"><span style={{ width: `${week.earned / highest * 100}%` }} /></div></div>)}</div></section>
    <dl className="pro-report-activity"><div><dt>Serviços no período</dt><dd>{selected.services}</dd></div><div><dt>Clientes atendidos</dt><dd>{selected.customers}</dd></div></dl>

  </div></Modal>
}
export function EntryDialog({ entry, close }: { entry: ProfessionalEntry; close: () => void }) {
  return <Modal title="Detalhes da comissão" close={close}><div className="pro-info-dialog pro-entry-detail"><span className={'pro-entry-symbol ' + entry.status}>{entry.status === 'paid' ? <ArrowDownLeft size={24} /> : <WalletCards size={24} />}</span><strong>{money(entry.commission_cents)}</strong><span className={'pro-entry-state ' + entry.status}>{entry.status === 'paid' ? 'Comissão recebida' : 'Aguardando repasse'}</span><dl><div><dt>{entry.type === 'product' ? 'Produto' : 'Serviço'}</dt><dd>{entry.description}</dd></div><div><dt>Cliente</dt><dd>{entry.customer_name || 'Atendimento'}</dd></div><div><dt>Quantidade</dt><dd>{entry.quantity}</dd></div><div><dt>Atendimento</dt><dd>{dateTime(entry.occurred_at)}</dd></div>{entry.paid_at && <div><dt>Repasse</dt><dd>{dateTime(entry.paid_at)}</dd></div>}</dl><button className="primary pro-dialog-save" onClick={close}>Concluir</button></div></Modal>
}
export function PeriodModal({ period, custom, close, choose }: { period: string; custom: { from: string; to: string }; close: () => void; choose: (id: string, range: { from: string; to: string }) => void }) {
  const [draft, setDraft] = useState(custom), [id, setId] = useState(period)
  const maxDate = Number.isFinite(Date.parse(draft.from)) ? new Date(Date.parse(draft.from + 'T12:00:00Z') + 366 * 86400000).toISOString().slice(0, 10) : undefined
  return <Modal title="Escolher período" close={close}><form className="pro-period-dialog" onSubmit={event => { event.preventDefault(); choose(id, draft) }}><div className="pro-period-options">{periods.map(item => <button type="button" key={item.id} aria-pressed={id === item.id} onClick={() => { if (item.id !== 'custom') choose(item.id, draft); else setId('custom') }}><CalendarDays size={18} /><span>{item.id === 'custom' ? 'Personalizar datas' : item.label}</span><ChevronRight size={17} /></button>)}</div>{id === 'custom' && <><div className="pro-date-fields"><label className="field"><span>Data inicial</span><input type="date" required value={draft.from} max={draft.to} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label><label className="field"><span>Data final</span><input type="date" required value={draft.to} min={draft.from} max={maxDate} onChange={event => setDraft({ ...draft, to: event.target.value })} /></label></div><button className="primary pro-dialog-save">Ver resultados</button></>}</form></Modal>
}

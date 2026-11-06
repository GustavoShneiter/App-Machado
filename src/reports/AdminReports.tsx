import { useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, Download } from 'lucide-react'
import { useCatalog } from '../CatalogStore'
import { useOperations } from '../OperationsStore'
import { Modal } from '../ManagementPages'
import { dateTime, dayKey, exportCsv, labels, money } from '../operations'
import { shortDate, weekRange } from '../professional/periods'
import { buildManagementReport, validReportRange } from './metrics'
import { DonutChart, RevenueTrend } from './ReportCharts'
import { ProfessionalGoalEditor } from './AdminProfessionalGoals'
import './reports.css'

type Range = { from: string; to: string }
function periodOptions(today = dayKey()) {
  const now = new Date(today + 'T12:00:00Z'), year = now.getUTCFullYear(), month = now.getUTCMonth()
  const date = (value: Date) => value.toISOString().slice(0, 10)
  return [
    { id: 'today', label: 'Hoje', from: today, to: today },
    { id: 'week', label: 'Esta semana', ...weekRange(0, today) },
    { id: 'previous-week', label: 'Semana passada', ...weekRange(-1, today) },
    { id: 'month', label: 'Este mês', from: today.slice(0, 7) + '-01', to: today },
    { id: 'previous-month', label: 'Mês passado', from: date(new Date(Date.UTC(year, month - 1, 1, 12))), to: date(new Date(Date.UTC(year, month, 0, 12))) },
  ]
}
const amount = (value: number) => (value / 100).toFixed(2)

export function AdminReports() {
  const { data, loading } = useOperations(), { professionals, business } = useCatalog()
  const [range, setRange] = useState<Range>(() => ({ from: dayKey().slice(0, 7) + '-01', to: dayKey() })), [professional, setProfessional] = useState('')
  const [periodOpen, setPeriodOpen] = useState(false), [goalsFor, setGoalsFor] = useState<string | null>(null), [appointmentsOpen, setAppointmentsOpen] = useState(false), [teamExpanded, setTeamExpanded] = useState(false)
  const report = useMemo(() => buildManagementReport(data, professionals, range.from, range.to, professional), [data, professionals, range.from, range.to, professional])
  const selectedName = professionals.find(row => row.id === professional)?.nome ?? report.people[0]?.name ?? 'Profissional'
  const unit = data.business[0]?.name ?? business?.name ?? 'Unidade Machado'
  const title = professional ? selectedName : 'Geral da unidade'
  const preset = periodOptions().find(row => row.from === range.from && row.to === range.to)
  const initialLoading = loading && !data.commands.length && !data.appointments.length && !data.payments.length
  const chartParts = professional ? [{ id: 'commission', label: 'Comissão do profissional', value: report.earned }, { id: 'shop', label: 'Parte da unidade', value: report.shop }] : report.parts.map(row => ({ id: row.id, label: row.label, value: row.amount }))
  function exportReport() {
    exportCsv(`relatorio-${range.from}-${range.to}.csv`, [
      ['Relatório Machado', unit], ['Visão', title], ['De', range.from], ['Até', range.to], [],
      ['Faturamento (R$)', amount(report.gross)], ['Recebido no período (R$)', amount(report.received)], ['Comissão gerada (R$)', amount(report.earned)], ['A repassar do período (R$)', amount(report.pending)],
      [professional ? 'Parte da unidade (R$)' : 'Resultado após despesas (R$)', amount(report.result)], ...(!professional ? [['Despesas da unidade (R$)', amount(report.expenses)]] : []), [],
      ['Profissional', 'Serviços', 'Clientes distintos', 'Faturamento (R$)', 'Recebido (R$)', 'Comissão (R$)', 'A repassar (R$)'],
      ...report.people.map(row => [row.name, row.services, row.customers, amount(row.gross), amount(row.received), amount(row.earned), amount(row.pending)]), [],
      ['Composição do faturamento', 'Valor (R$)'], ...report.parts.map(row => [row.label, amount(row.amount)]), [],
      ['Cliente', 'Profissional', 'Serviço', 'Data', 'Situação', 'Valor previsto (R$)'],
      ...report.appointments.map(row => [row.customer_name, row.professional_name, row.service_name, dateTime(row.starts_at), labels[row.status] ?? row.status, amount(row.expected_price_cents)]),
    ])
  }
  return <section className="page machado-reports" aria-label="Relatórios da unidade">
    <header className="report-heading"><div><h1>Relatórios</h1><p>{unit} · {title}</p></div><button type="button" className="report-export" aria-label="Exportar relatório CSV" onClick={exportReport} disabled={initialLoading}><Download size={17} /><span>Exportar CSV</span></button></header>
    <div className="report-filterbar">
      <label className="report-professional-select"><span>Visualização</span><select aria-label="Profissional do relatório" value={professional} onChange={event => { setProfessional(event.target.value); setAppointmentsOpen(false) }}><option value="">Geral · toda a unidade</option>{professionals.map(row => <option key={row.id} value={row.id}>{row.nome}</option>)}</select></label>
      <button type="button" className="report-period-trigger" aria-label="Escolher período do relatório" aria-haspopup="dialog" onClick={() => setPeriodOpen(true)}><CalendarDays size={16} /><span>{shortDate(range.from)} a {shortDate(range.to)}</span><ChevronDown size={14} /></button>
    </div>
    {initialLoading && <p className="report-empty" role="status">Carregando os resultados da unidade…</p>}
    <section className="report-summary-strip" aria-label="Resumo financeiro do período" aria-busy={loading}>
      <div><span>Faturamento</span><strong>{initialLoading ? '—' : money(report.gross)}</strong><small>{preset?.label ?? 'Período selecionado'}</small></div>
      <div><span>Recebido</span><strong>{initialLoading ? '—' : money(report.received)}</strong><small>Pagamentos no período</small></div>
      <div><span>A repassar</span><strong>{initialLoading ? '—' : money(report.pending)}</strong><small>{money(report.earned)} em comissões geradas</small></div>
      <div><span>{professional ? 'Parte da unidade' : 'Resultado da unidade'}</span><strong>{initialLoading ? '—' : money(report.result)}</strong><small>{professional ? 'Antes das despesas gerais' : 'Após comissões e despesas'}</small></div>
    </section>
    <div className="report-charts-grid">
      <section className="report-chart-section" aria-label={professional ? 'Distribuição entre comissão e unidade' : 'Faturamento por profissional'}><div className="report-section-title"><div><h2>{professional ? 'Como o valor é dividido' : 'Faturamento por profissional'}</h2><p>{professional ? 'Comissão e parte da unidade no período.' : 'Participação de cada profissional e das vendas da unidade.'}</p></div></div><DonutChart segments={chartParts} label={professional ? 'Distribuição entre comissão e parte da unidade' : 'Participação no faturamento por profissional'} totalLabel="Faturamento" onSelect={!professional ? id => { if (professionals.some(row => row.id === id)) setProfessional(id) } : undefined} /><div className="report-detail-summary report-chart-activity"><div><small>Serviços</small><strong>{report.services}</strong></div><div><small>Clientes</small><strong>{report.customers}</strong></div><div><small>Agendamentos concluídos</small><strong>{report.completed}</strong></div></div></section>
      <section className="report-chart-section" aria-label="Evolução do faturamento"><div className="report-section-title"><div><h2>Evolução no período</h2><p>Faturamento por dia, com os mesmos filtros.</p></div></div><RevenueTrend points={report.timeline} /></section>
    </div>
    <section className="report-team-section" aria-label="Resultados dos profissionais">
      <div className="report-section-title"><div><h2>{professional ? 'Resultados do profissional' : 'Sua equipe no período'}</h2><p>Serviços, clientes e comissões de cada barbeiro.</p></div><span>{report.people.length} {report.people.length === 1 ? 'profissional' : 'profissionais'}</span></div>
      <div className="report-person-heading" aria-hidden="true"><span>Profissional</span><span>Faturamento</span><span>Recebido</span><span>Comissão</span><span>Metas</span></div>
      {(teamExpanded ? report.people : report.people.slice(0, 5)).map(row => <article className="report-person-row" key={row.id} aria-label={'Resultados de ' + row.name}>
        <div className="report-person-identity">{row.photo ? <img src={row.photo} alt="" /> : <span aria-hidden="true">{row.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</span>}<div><strong>{row.name}</strong><small>{row.services} {row.services === 1 ? 'serviço' : 'serviços'} · {row.customers} {row.customers === 1 ? 'cliente' : 'clientes'}</small></div></div>
        <div className="report-person-number report-person-gross"><strong>{money(row.gross)}</strong><small>{report.gross > 0 ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(row.gross / report.gross * 100) + '% do faturamento' : 'Sem faturamento'}</small></div>
        <div className="report-person-number report-person-received"><strong>{money(row.received)}</strong><small>recebido</small></div>
        <div className="report-person-number report-person-secondary"><strong>{money(row.earned)}</strong><span className="report-mobile-label"> de comissão</span><small>{money(row.pending)} a repassar</small></div>
        <button type="button" className="report-person-goals" aria-label={'Definir metas de ' + row.name} aria-haspopup="dialog" onClick={() => setGoalsFor(row.id)}>Metas</button>
      </article>)}
      {!report.people.length && <p className="report-empty">Cadastre os profissionais da unidade para acompanhar os resultados e definir suas metas.</p>}
      {report.people.length > 5 && <button type="button" className="report-detail-toggle" aria-expanded={teamExpanded} onClick={() => setTeamExpanded(value => !value)}><span>{teamExpanded ? 'Mostrar os 5 primeiros profissionais' : `Ver mais ${report.people.length - 5} profissionais`}</span><ChevronDown size={16} style={{ transform: teamExpanded ? 'rotate(180deg)' : undefined }} /></button>}
      <details className="report-context-note"><summary>Como os valores são calculados</summary><p>O faturamento considera comandas prontas ou pagas no dia do atendimento, ou da conclusão das comandas de balcão. Recebimentos seguem a data do pagamento; por isso os valores podem ser diferentes.</p><p>{professional ? 'Despesas e vendas de pacotes sem profissional não são atribuídas a este barbeiro.' : <>As vendas de pacotes entram uma vez. O uso das sessões não repete o valor vendido. Despesas da unidade neste período: <strong>{money(report.expenses)}</strong>.</>}</p></details>
    </section>
    <section className="report-activity-section" aria-label="Atividade no período">
      <button type="button" className="report-detail-toggle" aria-expanded={appointmentsOpen} onClick={() => setAppointmentsOpen(value => !value)}><span>{appointmentsOpen ? 'Ocultar agendamentos' : 'Ver agendamentos do período'} · {report.appointments.length}</span><ChevronDown size={16} style={{ transform: appointmentsOpen ? 'rotate(180deg)' : undefined }} /></button>
      {appointmentsOpen && <div className="report-appointment-list">{report.appointments.length ? [...report.appointments].sort((a, b) => b.starts_at.localeCompare(a.starts_at)).map(row => <article key={row.id} className="report-appointment-row"><div><strong>{row.customer_name}</strong><small>{row.service_name} · {row.professional_name}</small></div><div><time>{dateTime(row.starts_at)}</time><small>{labels[row.status] ?? row.status}</small></div></article>) : <p className="report-empty">Nenhum agendamento neste período.</p>}</div>}
    </section>
    {periodOpen && <ReportPeriodModal range={range} close={() => setPeriodOpen(false)} choose={value => { setRange(value); setPeriodOpen(false); setAppointmentsOpen(false) }} />}
    {goalsFor && <ProfessionalGoalEditor professionalId={goalsFor} close={() => setGoalsFor(null)} saved={() => setGoalsFor(null)} />}
  </section>
}

function ReportPeriodModal({ range, close, choose }: { range: Range; close: () => void; choose: (range: Range) => void }) {
  const [from, setFrom] = useState(range.from), [to, setTo] = useState(range.to), [error, setError] = useState('')
  return <Modal title="Período do relatório" close={close}><form className="report-period-editor" onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (!validReportRange(from, to)) { setError('Selecione datas válidas, com o início antes do fim e no máximo um ano.'); return } choose({ from, to }) }}>
    <div className="report-period-presets">{periodOptions().map(option => <button type="button" key={option.id} aria-pressed={range.from === option.from && range.to === option.to} onClick={() => choose({ from: option.from, to: option.to })}>{option.label} · {shortDate(option.from)}{option.from !== option.to ? ' a ' + shortDate(option.to) : ''}</button>)}</div>
    <p className="report-editor-description">Ou escolha um intervalo de até um ano.</p>
    <div className="report-period-fields"><label className="field"><span>Data inicial</span><input aria-label="Data inicial do relatório" type="date" required value={from} onChange={event => setFrom(event.target.value)} /></label><label className="field"><span>Data final</span><input aria-label="Data final do relatório" type="date" required min={from} value={to} onChange={event => setTo(event.target.value)} /></label></div>
    {error && <p className="report-editor-error" role="alert">{error}</p>}
    <div className="report-editor-footer"><button type="button" className="outline" onClick={close}>Cancelar</button><button className="primary">Aplicar período</button></div>
  </form></Modal>
}

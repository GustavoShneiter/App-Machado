import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, CalendarDays, ChevronDown, ChevronRight, Download, SlidersHorizontal, Users } from 'lucide-react'
import { useCatalog } from '../CatalogStore'
import { useOperations } from '../OperationsStore'
import { Modal } from '../ManagementPages'
import { dateTime, dayKey, exportCsv, labels, money } from '../operations'
import { shortDate, weekRange } from '../professional/periods'
import { buildManagementReport, validReportRange } from './metrics'
import { RevenueTrend } from './ReportCharts'
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
  const [range, setRange] = useState<Range>(() => weekRange()), [professional, setProfessional] = useState('')
  const [periodOpen, setPeriodOpen] = useState(false), [goalsFor, setGoalsFor] = useState<string | null>(null), [appointmentsOpen, setAppointmentsOpen] = useState(false), [teamExpanded, setTeamExpanded] = useState(false)
  const report = useMemo(() => buildManagementReport(data, professionals, range.from, range.to, professional), [data, professionals, range.from, range.to, professional])
  const selectedName = professionals.find(row => row.id === professional)?.nome ?? report.people[0]?.name ?? 'Profissional'
  const unit = data.business[0]?.name ?? business?.name ?? 'Unidade Machado'
  const title = professional ? selectedName : 'Geral da unidade'
  const preset = periodOptions().find(row => row.from === range.from && row.to === range.to)
  const initialLoading = loading && !data.commands.length && !data.appointments.length && !data.payments.length
  const [metric, setMetric] = useState('gross'), [filterOpen, setFilterOpen] = useState(false), [selectedDay, setSelectedDay] = useState('')
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
  const dayPoint = report.timeline.find(p=>p.date===selectedDay)
  return <section className="page machado-reports approved-reports" aria-label="Relatórios da unidade">
    <header className="report-heading"><h1>{metric==='result'?'Resultado':'Relatórios'}</h1><button type="button" className="text-action" aria-label="Exportar relatório CSV" onClick={exportReport} disabled={initialLoading}><Download size={18}/>CSV</button></header>
    <div className="approved-report-filterbar"><button className="text-action" aria-label="Escolher período do relatório" onClick={()=>setPeriodOpen(true)}><CalendarDays size={18}/>{shortDate(range.from)} a {shortDate(range.to)}<ChevronDown size={15}/></button><button className="approved-filter-button" onClick={()=>setFilterOpen(true)}><SlidersHorizontal size={16}/>{professional?selectedName:'Todos'}</button></div>
    <nav className="report-metric-tabs" aria-label="Métrica do relatório">{[['gross','Faturamento'],['received','Recebido'],['result','Resultado']].map(([id,label])=><button key={id} aria-pressed={metric===id} onClick={()=>setMetric(id)}>{label}</button>)}</nav>
    {initialLoading&&<p className="approved-empty" role="status">Carregando os resultados…</p>}
    <div className="approved-report-layout">
    <div>
    {metric!=='result'?<><section className="finance-main-amount report-active-amount"><h2 className="sr-only">{metric==='gross'?'Faturamento':'Recebido'} no período</h2><strong>{initialLoading?'—':money(metric==='gross'?report.gross:report.received)}</strong><p>{preset?.label??'Período selecionado'} · {professional?selectedName:'Toda a unidade'}</p></section>
    {metric==='gross'&&<section className="approved-daily-chart"><header><span>Faturamento por dia</span>{dayPoint&&<strong>{shortDate(dayPoint.date)} · {money(dayPoint.amount)}</strong>}</header>{report.timeline.length<=14?<><div className="daily-bars" aria-label="Faturamento diário">{report.timeline.map(point=><button key={point.date} aria-label={shortDate(point.date)+': '+money(point.amount)} aria-pressed={selectedDay===point.date} onClick={()=>setSelectedDay(point.date)}><span className="bar-column"><i style={{height:Math.abs(point.amount)/Math.max(...report.timeline.map(p=>Math.abs(p.amount)),1)*100+'%'}}/></span><small>{report.timeline.length<=7?new Date(point.date+'T12:00:00Z').toLocaleDateString('pt-BR',{weekday:'short',timeZone:'UTC'}).replace('.',''):shortDate(point.date)}</small></button>)}</div>{!report.gross&&<p className="form-note">Nenhum faturamento neste período.</p>}</>:<RevenueTrend points={report.timeline}/>}</section>}
    <button className="approved-result-preview" onClick={()=>setMetric('result')}><span><strong>{professional?'Parte da unidade':'Resultado da barbearia'}</strong><small>{professional?'Antes das despesas gerais':'Após comissões e despesas'}</small></span><b>{money(report.result)}</b><ChevronRight size={17}/></button></>:<section className="approved-result"><h2>Como o resultado é formado</h2><p>{professional?selectedName:'Toda a barbearia'} · {shortDate(range.from)} a {shortDate(range.to)}</p><div className="result-lines"><div><span className="tonal-icon mint"><ArrowDownToLine size={20}/></span><span><strong>Faturamento</strong><small>Atendimentos realizados e vendas</small></span><b>{money(report.gross)}</b></div><div><span className="tonal-icon lilac"><Users size={20}/></span><span><strong>Comissões geradas</strong><small>Parte dos profissionais</small></span><b>− {money(report.earned)}</b></div>{!professional&&<div><span className="tonal-icon rose"><ArrowUpFromLine size={20}/></span><span><strong>Despesas</strong><small>Registradas no período</small></span><b>− {money(report.expenses)}</b></div>}</div><div className="approved-balance"><h2>{professional?'Parte da unidade':'Resultado da barbearia'}</h2><strong>{money(report.result)}</strong><p>{professional?'Antes das despesas gerais':'Após comissões e despesas'}</p></div></section>}
    <details className="report-context-note"><summary>Como interpretar os valores</summary><p>Faturamento considera comandas prontas ou pagas na data do atendimento. Recebido segue a data de pagamento. Comissões geradas são descontadas uma vez; o repasse não é uma nova despesa. Pix e cartões não representam dinheiro na gaveta.</p><p>{professional?'Despesas gerais e pacotes sem profissional não são atribuídos a este barbeiro.':'Vendas de pacotes entram uma vez; uso de sessões não repete o valor vendido.'}</p></details>
    </div><div>
    <section className="report-team-section" aria-label="Resultados dos profissionais"><header className="approved-section-header"><h2>{professional?'Profissional':'Por profissional'}</h2><small>{report.services} serviços</small></header>
    {(teamExpanded?report.people:report.people.slice(0,5)).map(row=><article className="approved-report-person" key={row.id}><button className="report-person-open" aria-label={'Ver resultados de '+row.name} onClick={()=>{setProfessional(row.id);setFilterOpen(false)}}>{row.photo?<img src={row.photo} alt=""/>:<span className="letter-avatar mint">{row.name.slice(0,2).toUpperCase()}</span>}<span><strong>{row.name}</strong><small>{row.services} serviços · {row.customers} clientes</small></span><b>{money(metric==='received'?row.received:metric==='result'?row.gross-row.earned:row.gross)}</b><ChevronRight size={16}/></button><details><summary>Comissões e metas</summary><div className="report-person-extra"><span>Geradas <b>{money(row.earned)}</b></span><span>A repassar <b>{money(row.pending)}</b></span><button className="outline small" aria-label={'Definir metas de '+row.name} onClick={()=>setGoalsFor(row.id)}>Definir metas</button></div></details></article>)}
    {!report.people.length&&<p className="approved-empty">Nenhum profissional neste filtro.</p>}{report.people.length>5&&<button className="text-action" onClick={()=>setTeamExpanded(!teamExpanded)}>{teamExpanded?'Mostrar menos':'Ver toda a equipe'}</button>}
    <div className="report-small-facts"><span>Serviços<b>{report.services}</b></span><span>Clientes<b>{report.customers}</b></span><span>Concluídos<b>{report.completed}</b></span></div></section>
    <section className="report-activity-section"><button className="report-detail-toggle" aria-expanded={appointmentsOpen} onClick={()=>setAppointmentsOpen(!appointmentsOpen)}><span>Agendamentos do período · {report.appointments.length}</span><ChevronDown size={16}/></button>{appointmentsOpen&&<div className="report-appointment-list">{report.appointments.map(row=><article key={row.id} className="report-appointment-row"><div><strong>{row.customer_name}</strong><small>{row.professional_name} · {row.service_name}</small></div><div><time>{dateTime(row.starts_at)}</time><small>{labels[row.status]??row.status}</small></div></article>)}{!report.appointments.length&&<p className="approved-empty">Nenhum agendamento.</p>}</div>}</section>
    </div></div>
    {filterOpen&&<Modal title="Filtro dos relatórios" close={()=>setFilterOpen(false)}><label className="field"><span>Profissional</span><select aria-label="Profissional do relatório" value={professional} onChange={e=>setProfessional(e.target.value)}><option value="">Todos · toda a unidade</option>{professionals.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></label><button className="outline" onClick={()=>setPeriodOpen(true)}><CalendarDays size={18}/>Alterar período</button><button className="primary" onClick={()=>setFilterOpen(false)}>Aplicar filtros</button></Modal>}
    {periodOpen&&<ReportPeriodModal range={range} close={()=>setPeriodOpen(false)} choose={value=>{setRange(value);setPeriodOpen(false);setSelectedDay('')}}/>}
    {goalsFor&&<ProfessionalGoalEditor professionalId={goalsFor} close={()=>setGoalsFor(null)} saved={()=>setGoalsFor(null)}/>}
  </section>
}

function ReportPeriodModal({ range, close, choose }: { range: Range; close: () => void; choose: (range: Range) => void }) {
  const [from, setFrom] = useState(range.from), [to, setTo] = useState(range.to), [error, setError] = useState('')
  return <Modal title="Período do relatório" close={close}><form className="report-period-editor" onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (!validReportRange(from, to)) { setError('Selecione datas válidas, com o início antes do fim e no máximo um ano.'); return } choose({ from, to }) }}>
    <div className="report-period-presets">{periodOptions().map(option => <button type="button" key={option.id} aria-pressed={range.from === option.from && range.to === option.to} onClick={() => choose({ from: option.from, to: option.to })}>{option.label} · {shortDate(option.from)}{option.from !== option.to ? ' a ' + shortDate(option.to) : ''}</button>)}</div>
    <p className="report-editor-description">Período de até um ano.</p>
    <div className="report-period-fields"><label className="field"><span>Data inicial</span><input aria-label="Data inicial do relatório" type="date" required value={from} onChange={event => setFrom(event.target.value)} /></label><label className="field"><span>Data final</span><input aria-label="Data final do relatório" type="date" required min={from} value={to} onChange={event => setTo(event.target.value)} /></label></div>
    {error && <p className="report-editor-error" role="alert">{error}</p>}
    <div className="report-editor-footer"><button type="button" className="outline" onClick={close}>Cancelar</button><button className="primary">Aplicar período</button></div>
  </form></Modal>
}

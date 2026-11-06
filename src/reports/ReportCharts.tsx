import { useEffect, useId, useRef, useState } from 'react'
import { money } from '../operations'
import type { ReportPoint } from './metrics'
import './reports.css'

export type DonutSegment = { id: string; label: string; value: number }
const chartColors = ['#a6bf87', '#78985a', '#c9d5bc', '#858d80', '#51584c']
const percent = (value: number, total: number) => total > 0 ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value / total * 100) + '%' : '0%'

export function DonutChart({ segments, label, totalLabel = 'Total no período', formatValue = money, compact = false, onSelect }: {
  segments: DonutSegment[]; label: string; totalLabel?: string; formatValue?: (value: number) => string; compact?: boolean; onSelect?: (id: string) => void
}) {
  const id = useId(), values = segments.filter(row => Number.isFinite(row.value) && row.value !== 0).sort((a, b) => b.value - a.value)
  const total = values.reduce((sum, row) => sum + row.value, 0), signed = values.some(row => row.value < 0), totalText = formatValue(total)
  const displayed = values.length > 5 ? [...values.slice(0, 4), { id: '__other__', label: 'Outros', value: values.slice(4).reduce((sum, row) => sum + row.value, 0) }] : values
  let offset = 0
  const drawing = displayed.map((row, index) => { const share = total > 0 ? row.value / total * 100 : 0, start = offset; offset += share; return { ...row, color: chartColors[index], share, start } })
  return <figure className={'report-donut' + (compact ? ' report-donut-compact' : '')} aria-labelledby={id + '-label'}>
    <figcaption id={id + '-label'} className="sr-only">{label}</figcaption>
    <div className="report-donut-drawing">
      <svg viewBox="0 0 200 200" role="img" aria-labelledby={id + '-title'}>
        <title id={id + '-title'}>{`${label}: ${formatValue(total)}. ${values.map(row => row.label + ': ' + formatValue(row.value)).join('; ')}`}</title>
        <circle className="report-donut-track" cx="100" cy="100" r="76" fill="none" strokeWidth="13" />
        {!signed && drawing.map(row => <circle key={row.id} cx="100" cy="100" r="76" fill="none" stroke={row.color} strokeWidth="13" pathLength="100" strokeDasharray={`${Math.max(0, row.share - (drawing.length > 1 ? .65 : 0))} 100`} strokeDashoffset={-row.start} className="report-donut-segment" />)}
      </svg>
      <div className="report-donut-total"><span>{totalLabel}</span><strong style={{ fontSize: `clamp(11px, ${124 / Math.max(8, totalText.length)}cqi, 22px)` }}>{totalText}</strong></div>
    </div>
    <div className="report-donut-breakdown">
      {drawing.length ? <ul>{drawing.map(row => <li key={row.id}>
        {onSelect && row.id !== '__other__' ? <button type="button" className="report-legend-row" onClick={() => onSelect(row.id)}><span className="report-legend-mark" style={{ backgroundColor: row.color }} /><span>{row.label}<small>{signed ? row.value < 0 ? 'Ajuste negativo' : 'Valor positivo' : percent(row.value, total)}</small></span><strong>{formatValue(row.value)}</strong></button> : <div className="report-legend-row"><span className="report-legend-mark" style={{ backgroundColor: row.color }} /><span>{row.label}<small>{signed ? row.value < 0 ? 'Ajuste negativo' : 'Valor positivo' : percent(row.value, total)}</small></span><strong>{formatValue(row.value)}</strong></div>}
      </li>)}</ul> : <p className="report-chart-empty">Ainda não há valores neste período.</p>}
      {signed && <p className="report-chart-note">Os ajustes negativos estão na lista e não formam setores do gráfico.</p>}
      {values.length > 5 && <details className="report-chart-values"><summary>Ver discriminação completa</summary><ul>{values.map(row => <li key={row.id}><span>{row.label}</span><strong>{formatValue(row.value)}</strong></li>)}</ul></details>}
    </div>
  </figure>
}

function compactMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: Math.abs(value) >= 100000 ? 'compact' : 'standard', maximumFractionDigits: 0 }).format(value / 100)
}
function niceMaximum(value: number) {
  if (value <= 0) return 10000
  const magnitude = 10 ** Math.floor(Math.log10(value)), relative = value / magnitude
  return (relative < 1 ? 1 : relative < 2 ? 2 : relative < 4 ? 4 : relative < 5 ? 5 : 10) * magnitude
}
const shortDate = (date: string) => new Date(date + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })

export function RevenueTrend({ points, label = 'Faturamento ao longo do período' }: { points: ReportPoint[]; label?: string }) {
  const id = useId(), frame = useRef<HTMLElement>(null), [width, setWidth] = useState(560)
  useEffect(() => {
    const element = frame.current
    if (!element) return
    const measure = () => setWidth(Math.max(260, Math.round(element.getBoundingClientRect().width)))
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(element); window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [])
  const bucket = points.length > 62 ? 7 : 1, groups: { date: string; to: string; amount: number }[] = []
  for (let index = 0; index < points.length; index += bucket) { const rows = points.slice(index, index + bucket); groups.push({ date: rows[0].date, to: rows[rows.length - 1].date, amount: rows.reduce((sum, row) => sum + row.amount, 0) }) }
  const height = 210, left = width < 420 ? 60 : 76, right = width < 420 ? 10 : 20, top = 16, bottom = 164
  const positive = Math.max(0, ...groups.map(row => row.amount)), negative = Math.min(0, ...groups.map(row => row.amount))
  const max = niceMaximum(positive), min = negative < 0 ? -niceMaximum(-negative) : 0
  const x = (index: number) => left + (groups.length <= 1 ? .5 : index / (groups.length - 1)) * (width - left - right)
  const y = (amount: number) => bottom - (amount - min) / (max - min) * (bottom - top)
  const path = groups.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(row.amount).toFixed(2)}`).join(' ')
  const indices = [...new Set([0, Math.floor((groups.length - 1) / 3), Math.floor((groups.length - 1) * 2 / 3), groups.length - 1])].filter(index => index >= 0)
  const hasValues = groups.some(row => row.amount !== 0)
  return <figure className="report-trend" ref={frame} aria-labelledby={id + '-label'}>
    <figcaption id={id + '-label'} className="sr-only">{label}</figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={id + '-title'}>
      <title id={id + '-title'}>{`${label}. ${hasValues ? 'Os valores de cada dia estão disponíveis na tabela abaixo.' : 'Sem faturamento no período selecionado.'}`}</title>
      {(hasValues ? [0, 1, 2, 3, 4] : [0]).map(index => { const value = min + (max - min) * index / 4; return <g key={index}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="report-chart-grid" /><text x={left - 10} y={y(value) + 4} textAnchor="end">{compactMoney(value)}</text></g> })}
      {groups.length > 1 ? <path d={path} fill="none" className={'report-trend-line' + (!hasValues ? ' report-trend-zero' : '')} /> : groups.length === 1 && <circle cx={x(0)} cy={y(groups[0].amount)} r="3" className="report-trend-dot" />}
      {indices.map(index => <text key={index} x={x(index)} y={190} textAnchor={index === 0 ? 'start' : index === groups.length - 1 ? 'end' : 'middle'}>{shortDate(groups[index].date)}</text>)}
    </svg>
    {!hasValues && <p className="report-chart-note">Sem faturamento neste período.</p>}
    {bucket > 1 && <p className="report-chart-note">Cada ponto reúne até 7 dias.</p>}
    <details className="report-chart-values"><summary>Consultar valores por {bucket > 1 ? 'intervalo' : 'dia'}</summary><table><thead><tr><th>Data</th><th>Faturamento</th></tr></thead><tbody>{groups.map(row => <tr key={row.date}><td>{shortDate(row.date)}{row.to !== row.date ? ' a ' + shortDate(row.to) : ''}</td><td>{money(row.amount)}</td></tr>)}</tbody></table></details>
  </figure>
}

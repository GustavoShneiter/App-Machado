import { useEffect, useRef } from 'react'
import { ArrowUpRight, Check, Scissors, Settings2 } from 'lucide-react'
import { Modal } from '../ManagementPages'
import { money } from '../operations'
import type { ProfessionalCashData } from './types'
import { estimatedServices, progress, remaining, shortDate } from './periods'

export function GoalBar({ value, label, detail }: { value: number; label: string; detail: string }) {
  const fill = useRef<HTMLSpanElement>(null), previous = useRef(0)
  const safe = Math.min(100, Math.max(0, value))
  useEffect(() => {
    const start = previous.current
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { previous.current = safe; return }
    const animation = fill.current?.animate([{ transform: `scaleX(${start / 100})` }, { transform: `scaleX(${safe / 100})` }], { duration: 950, easing: 'cubic-bezier(.22,1,.36,1)' })
    if (animation) void animation.finished.then(() => { previous.current = safe }).catch(() => {})
    return () => animation?.cancel()
  }, [safe])
  return <div className="pro-goal-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(safe)} aria-valuetext={detail}><span ref={fill} style={{ transform: `scaleX(${safe / 100})` }} /></div>
}
function goals(data: ProfessionalCashData) {
  const p = data.preferences
  return [{ id: 'commission', title: 'Comissão', goal: p.weekly_commission_goal_cents, actual: data.earned, monetary: true }, { id: 'services', title: 'Serviços', goal: p.weekly_service_goal, actual: data.services, monetary: false }, { id: 'customers', title: 'Clientes', goal: p.weekly_customer_goal, actual: data.customers, monetary: false }].filter(item => item.goal > 0)
}
const format = (value: number, monetary: boolean) => monetary ? money(value) : String(value)

export function ProfessionalGoals({ current, edit, details }: { current: ProfessionalCashData; edit: () => void; details: () => void }) {
  const items = goals(current), main = items[0], allDone = items.length > 0 && items.every(item => item.actual >= item.goal)
  if (current.preferences.show_goals === false) return null
  return <section className={'pro-goal-journey pro-wallet-goals' + (allDone ? ' achieved' : '')} aria-label="Minhas metas da semana">
    <div className="pro-journey-heading"><div><h2>Metas da semana</h2><p>{shortDate(current.from)} a {shortDate(current.to)}</p></div><button aria-label="Opções de exibição das metas" onClick={edit}><Settings2 size={18} /></button></div>
    {main ? <>
      <div className="pro-primary-goal"><div><span>{main.title}</span><strong>{format(main.actual, main.monetary)} <small>de {format(main.goal, main.monetary)}</small></strong></div><GoalBar value={progress(main.goal, main.actual)} label={'Meta de ' + main.title.toLowerCase()} detail={`${format(main.actual, main.monetary)} de ${format(main.goal, main.monetary)}`} /><p>{main.actual >= main.goal ? <><Check size={14} />Meta alcançada.</> : <>Faltam <b>{format(remaining(main.goal, main.actual), main.monetary)}</b>{main.monetary ? ' em comissões' : main.id === 'services' ? ' serviços' : ' clientes'} · {Math.round(progress(main.goal, main.actual))}% concluídos</>}</p></div>
      {items.length > 1 && <div className="pro-secondary-goals">{items.slice(1).map(item => <div key={item.id}><span>{item.title}</span><strong>{item.actual} <small>/ {item.goal}</small></strong><GoalBar value={progress(item.goal, item.actual)} label={'Meta de ' + item.title.toLowerCase()} detail={`${item.actual} de ${item.goal}`} /></div>)}</div>}
      <div className="pro-wallet-goal-foot"><small>Definidas pela administração</small><button className="pro-goal-details" onClick={details}>Ver meu progresso<ArrowUpRight size={16} /></button></div>
    </> : <div className="pro-wallet-goal-empty"><p>A administração ainda não definiu suas metas.</p><button className="pro-wallet-text-action" onClick={edit}>Opções de visualização<ArrowUpRight size={16} /></button></div>}
  </section>
}

export function GoalDetails({ current, previous, close, edit }: { current: ProfessionalCashData; previous?: ProfessionalCashData; close: () => void; edit: () => void }) {
  const items = goals(current), serviceData = current.services > 0 ? current : previous
  const total = serviceData?.entries.filter(entry => entry.type === 'service').reduce((sum, entry) => sum + entry.commission_cents, 0) ?? 0
  const estimate = estimatedServices(remaining(current.preferences.weekly_commission_goal_cents, current.earned), total, serviceData?.services ?? 0)
  return <Modal title="Meu progresso da semana" close={close}><div className="pro-progress-detail pro-wallet-progress"><p className="pro-dialog-intro">{shortDate(current.from)} a {shortDate(current.to)} · metas definidas pela administração</p>
    {items.map(item => <article key={item.id}><div><span>{item.title}</span><strong>{Math.round(progress(item.goal, item.actual))}%</strong></div><GoalBar value={progress(item.goal, item.actual)} label={'Progresso de ' + item.title.toLowerCase()} detail={`${format(item.actual, item.monetary)} de ${format(item.goal, item.monetary)}`} /><strong>{format(item.actual, item.monetary)} <small>de {format(item.goal, item.monetary)}</small></strong><p>{item.actual >= item.goal ? 'Meta alcançada.' : `Faltam ${format(remaining(item.goal, item.actual), item.monetary)}${item.monetary ? ' em comissões.' : item.id === 'services' ? ' serviços.' : ' clientes distintos.'}`}</p></article>)}
    {!items.length && <p>A administração ainda não definiu metas para você.</p>}
    {estimate !== null && <div className="pro-goal-tip"><Scissors size={18} /><p>Pela média de comissão por serviço, faltam cerca de <strong>{estimate} serviços</strong> para sua meta de comissão.<small>Estimativa baseada nos seus atendimentos. O resultado varia conforme o serviço e a comissão configurada.</small></p></div>}
    {previous && previous.earned > 0 && <div className="pro-previous-target"><h3>Semana passada</h3><p>{money(previous.earned)} em comissões{current.earned > previous.earned ? '. Você já superou esse resultado.' : current.earned === previous.earned ? '. Você igualou esse resultado.' : ` · faltam ${money(previous.earned - current.earned)} para igualar.`}</p></div>}
    <button className="outline pro-dialog-save" onClick={edit}><Settings2 size={16} />Preferências de visualização</button>
  </div></Modal>
}

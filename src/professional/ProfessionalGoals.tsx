import { useEffect, useRef } from 'react'
import { ArrowUpRight, Check, Flag, Pencil, Scissors, Sparkles, Target, Trophy, Users, WalletCards } from 'lucide-react'
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
  return [{ id: 'commission', title: 'Comissão', goal: p.weekly_commission_goal_cents, actual: data.earned, monetary: true, icon: WalletCards }, { id: 'services', title: 'Serviços', goal: p.weekly_service_goal, actual: data.services, monetary: false, icon: Scissors }, { id: 'customers', title: 'Clientes', goal: p.weekly_customer_goal, actual: data.customers, monetary: false, icon: Users }].filter(item => item.goal > 0)
}
const format = (value: number, monetary: boolean) => monetary ? money(value) : String(value)
export function ProfessionalGoals({ current, edit, details }: { current: ProfessionalCashData; edit: () => void; details: () => void }) {
  const items = goals(current), main = items[0], allDone = items.length > 0 && items.every(item => item.actual >= item.goal)
  if (current.preferences.show_goals === false) return null
  return <section className={'pro-goal-journey' + (allDone ? ' achieved' : '')} aria-label="Minhas metas da semana">
    <div className="pro-journey-heading"><span className="pro-goal-icon">{allDone ? <Trophy size={21} /> : <Target size={21} />}</span><div><h3>Minhas metas da semana</h3><span>{shortDate(current.from)} a {shortDate(current.to)} · no seu ritmo</span></div><button aria-label="Editar minhas metas" onClick={edit}><Pencil size={17} /></button></div>
    {main ? <><div className="pro-goal-milestone"><div><span>{allDone ? 'Você chegou lá!' : main.actual >= main.goal ? 'Mais uma conquista' : 'Cada atendimento conta'}</span><h4>{allDone ? 'Suas metas foram alcançadas.' : main.actual >= main.goal ? 'Uma meta já é sua.' : 'Sua semana está avançando.'}</h4></div><strong>{Math.floor(progress(main.goal, main.actual))}<small>%</small></strong></div>
      <div className="pro-primary-goal"><div><span>{main.title}</span><strong>{format(main.actual, main.monetary)} <small>de {format(main.goal, main.monetary)}</small></strong></div><GoalBar value={progress(main.goal, main.actual)} label={'Meta de ' + main.title.toLowerCase()} detail={`${format(main.actual, main.monetary)} de ${format(main.goal, main.monetary)}`} /><p>{main.actual >= main.goal ? <><Check size={14} />Meta alcançada. Aproveite essa conquista.</> : <>Faltam <b>{format(remaining(main.goal, main.actual), main.monetary)}</b>{main.monetary ? ' em comissões' : main.id === 'services' ? ' serviços' : ' clientes'} para chegar lá.</>}</p></div>
      {items.length > 1 && <div className="pro-secondary-goals">{items.slice(1).map(item => <div key={item.id}><span><item.icon size={15} />{item.title}</span><strong>{item.actual} <small>/ {item.goal}</small>{item.actual >= item.goal && <Check size={14} />}</strong><GoalBar value={progress(item.goal, item.actual)} label={'Meta de ' + item.title.toLowerCase()} detail={`${item.actual} de ${item.goal}`} /></div>)}</div>}
      <button className="pro-goal-details" onClick={details}><span>{allDone ? <Sparkles size={16} /> : <Flag size={16} />}{allDone ? 'Ver minhas conquistas' : 'Ver meu progresso'}</span><ArrowUpRight size={17} /></button>
    </> : <div className="pro-goals-welcome"><Sparkles size={25} /><h4>O próximo passo é seu.</h4><p>Escolha uma meta de comissão, serviços ou clientes e acompanhe sua evolução por aqui.</p><button onClick={edit}>Definir minhas metas<ArrowUpRight size={16} /></button></div>}
  </section>
}
export function GoalDetails({ current, previous, close, edit }: { current: ProfessionalCashData; previous?: ProfessionalCashData; close: () => void; edit: () => void }) {
  const items = goals(current), serviceData = current.services > 0 ? current : previous
  const total = serviceData?.entries.filter(entry => entry.type === 'service').reduce((sum, entry) => sum + entry.commission_cents, 0) ?? 0
  const estimate = estimatedServices(remaining(current.preferences.weekly_commission_goal_cents, current.earned), total, serviceData?.services ?? 0)
  return <Modal title="Meu progresso da semana" close={close}><div className="pro-progress-detail"><span className="pro-dialog-symbol"><Target size={25} /></span><h3>Um passo de cada vez.</h3><p className="pro-dialog-intro">Sua evolução entre {shortDate(current.from)} e {shortDate(current.to)}. As metas são pessoais e você pode ajustá-las quando quiser.</p>{items.map(item => <article key={item.id}><div><span><item.icon size={17} />{item.title}</span><strong>{Math.floor(progress(item.goal, item.actual))}%</strong></div><GoalBar value={progress(item.goal, item.actual)} label={'Progresso de ' + item.title.toLowerCase()} detail={`${format(item.actual, item.monetary)} de ${format(item.goal, item.monetary)}`} /><strong>{format(item.actual, item.monetary)} <small>de {format(item.goal, item.monetary)}</small></strong><p>{item.actual >= item.goal ? 'Meta alcançada!' : `Faltam ${format(remaining(item.goal, item.actual), item.monetary)}${item.monetary ? ' em comissões.' : item.id === 'services' ? ' serviços.' : ' clientes distintos.'}`}</p></article>)}
    {estimate !== null && <div className="pro-goal-tip"><Scissors size={18} /><p>Pela sua média, faltam cerca de <strong>{estimate} serviços</strong> para sua meta de comissão.<small>É uma estimativa. O resultado varia conforme o serviço e a comissão configurada.</small></p></div>}
    <div className="pro-previous-target"><strong>Em relação à semana passada</strong><p>{previous && previous.earned > 0 ? current.earned > previous.earned ? 'Você já superou sua comissão da semana passada. Bom trabalho!' : <>Faltam <b>{money(previous.earned - current.earned + 1)}</b> para superar os {money(previous.earned)} da semana passada.</> : 'Quando houver resultados da semana passada, você poderá comparar sua evolução aqui.'}</p></div>
    <button className="primary pro-dialog-save" onClick={edit}><Pencil size={16} />Ajustar minhas metas</button>
  </div></Modal>
}

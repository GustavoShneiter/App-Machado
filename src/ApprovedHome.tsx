import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Clock3, CreditCard, Eye, EyeOff, Plus } from 'lucide-react'
import { useOperations } from './OperationsStore'
import { useCatalog } from './CatalogStore'
import { AgendaCreateModal } from './AgendaScheduling'
import { commandTotal, dayKey, money } from './operations'
import { apiRequest } from './dataClient'
import type { ProfessionalCashData } from './professional/types'

export function ApprovedHome({ professional = false, professionalId }: { professional?: boolean; professionalId?: string }) {
  const { data, refreshVersion } = useOperations(), { business } = useCatalog()
  const [hidden, setHidden] = useState(false), [create, setCreate] = useState(false)
  const today = dayKey(), base = professional ? '/profissional' : '/admin'
  const [ownCash,setOwnCash]=useState<ProfessionalCashData|null>(null),[ownError,setOwnError]=useState('')
  useEffect(()=>{
    if(!professional||!professionalId)return
    let alive=true
    void apiRequest<{data:ProfessionalCashData}>('/professional/cash?'+new URLSearchParams({professional_id:professionalId,from:today,to:today})).then(r=>{if(alive){setOwnCash(r.data);setOwnError('')}}).catch(()=>{if(alive){setOwnCash(null);setOwnError('Não foi possível atualizar suas comissões. Abra Meu Caixa para tentar novamente.')}})
    return()=>{alive=false}
  },[professional,professionalId,today,refreshVersion])
  const appointments = data.appointments.filter(a => dayKey(a.starts_at) === today && !['cancelled', 'no_show'].includes(a.status)).sort((a,b) => a.starts_at.localeCompare(b.starts_at))
  const upcoming = appointments.filter(a => !['completed'].includes(a.status) && new Date(a.ends_at).getTime() > Date.now()).slice(0, 2)
  const overdue = appointments.filter(a => ['scheduled','confirmed'].includes(a.status) && new Date(a.starts_at).getTime() <= Date.now())
  const pending = data.commands.filter(c => c.status === 'awaiting_payment')
  const received = professional
    ? ownCash?.earned??0
    : data.payments.filter(p => !p.reversed_at && dayKey(p.paid_at) === today).reduce((s,p) => s+p.amount_cents,0)
  const pendingValue = professional ? ownCash?.totalPending??0 : pending.reduce((s,c)=>s+commandTotal(data,c),0)
  return <section className="page approved-home" aria-label={professional ? 'Meu início' : 'Início da gestão'}>
    <header className="home-identity"><img src="/logo-machado.png" alt="" /><div><h1>{professional ? 'Meu dia' : business?.name?.replace(/^Barbearia\s+/i,'') || 'Machado'}</h1><p>{new Date(today+'T12:00:00-03:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</p></div></header>
    <div className="home-layout">
      <div><section className="approved-balance"><div><h2>{professional ? 'Comissões geradas hoje' : 'Recebido hoje'}</h2><button className="icon-btn" aria-label={hidden?'Mostrar valores':'Ocultar valores'} onClick={()=>setHidden(!hidden)}>{hidden?<EyeOff size={20}/>:<Eye size={20}/>}</button></div><strong>{hidden?'••••':professional&&!ownCash?'—':money(received)}</strong><Link to={base+'/caixa'}><span>{professional ? 'Comissões a receber' : `${pending.length} ${pending.length===1?'pagamento pendente':'pagamentos pendentes'}`}</span><b>{hidden?'••••':professional&&!ownCash?'—':money(pendingValue)}</b><ChevronRight size={18}/></Link></section>
      {ownError&&<p className="form-error" role="alert">{ownError}</p>}
      <div className="home-actions"><button className="primary" onClick={()=>setCreate(true)}><Plus size={20}/>Agendar</button><Link className="approved-secondary" to={base+'/caixa'}><CreditCard size={20}/>{professional?'Meu Caixa':'Receber'}</Link></div>
      {overdue.length>0 && <Link className="attendance-notice" to={base+'/agenda'}><Clock3 size={22}/><span><b>{overdue.length} {overdue.length===1?'presença para confirmar':'presenças para confirmar'}</b><small>{[...new Set(overdue.map(a=>a.professional_name))].join(' e ')}</small></span><ChevronRight size={18}/></Link>}
      </div>
      <section className="home-upcoming"><header><h2>Próximos horários</h2><Link to={base+'/agenda'}>Ver agenda<ChevronRight size={16}/></Link></header><div className="upcoming-list">{upcoming.map(a=><Link to={base+'/agenda'} className="upcoming-row" key={a.id}><span className="upcoming-time"><b>{new Date(a.starts_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'})}</b><small>{Math.round((Date.parse(a.ends_at)-Date.parse(a.starts_at))/60000)} min</small></span><span><strong>{a.customer_name}</strong><small><b>{a.professional_name}</b> · {a.service_name}</small></span><ChevronRight size={18}/></Link>)}{!upcoming.length&&<div className="approved-empty"><CalendarEmpty/><strong>{appointments.length?'Agenda de hoje concluída':'Nenhum horário para hoje'}</strong><p>Os próximos agendamentos aparecem aqui.</p><Link to={base+'/agenda'}>Consultar agenda<ChevronRight size={16}/></Link></div>}</div></section>
    </div>
    {!professional&&data.products.some(p=>p.active&&p.quantity<=p.minimum_quantity)&&<details className="home-stock-note"><summary>Estoque abaixo do mínimo</summary>{data.products.filter(p=>p.active&&p.quantity<=p.minimum_quantity).map(p=><p key={p.id}>{p.name} · {p.quantity} un.</p>)}<Link to="/admin/produtos">Ver produtos</Link></details>}
    {create&&<AgendaCreateModal close={()=>setCreate(false)}/>}
  </section>
}
function CalendarEmpty(){return <Clock3 size={24} aria-hidden="true"/>}

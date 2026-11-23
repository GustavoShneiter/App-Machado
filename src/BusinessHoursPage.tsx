import {useCallback,useEffect,useState} from 'react'
import {Clock3,ShieldCheck} from 'lucide-react'
import {apiRequest} from './dataClient'
import {Page} from './ManagementPages'
import {useOperations} from './OperationsStore'
import type {BusinessHour} from './operations'

type Day=BusinessHour&{closed:boolean}
type Account={id:string;name:string;email:string;can_manage_business_hours:boolean}
type Settings={hours:BusinessHour[];revision:number;slot_interval_minutes:number;can_edit:boolean;can_delegate:boolean;accounts:Account[]}
const days=['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo']
export function BusinessHoursPage({professional=false}:{professional?:boolean}){
 const {refresh}=useOperations()
 const [settings,setSettings]=useState<Settings|null>(null),[hours,setHours]=useState<Day[]>([]),[allowed,setAllowed]=useState<string[]>([]),[interval,setIntervalMinutes]=useState('15')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const path=professional?'/professional/business-hours':'/business-hours'
 const accept=useCallback((value:Settings,replaceHours=true)=>{
  setSettings(value);setAllowed(value.accounts.filter(a=>a.can_manage_business_hours).map(a=>a.id));setIntervalMinutes(String(value.slot_interval_minutes))
  if(replaceHours)setHours(days.map((_,i)=>({...value.hours.find(h=>h.weekday===i+1)??{weekday:i+1,opens_at:'08:00',closes_at:'22:00'},closed:!value.hours.some(h=>h.weekday===i+1)})))
 },[])
 const load=useCallback(async()=>{setError('');try{accept((await apiRequest<{data:Settings}>(path)).data)}catch(e){setError((e as Error).message)}},[accept,path])
 useEffect(()=>{let alive=true;void apiRequest<{data:Settings}>(path).then(result=>{if(alive)accept(result.data)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[accept,path])
 async function save(action:'hours'|'interval'|'permissions'){
  if(!settings||busy)return
  setBusy(true);setError('');setMessage('')
  try{
   const result=await apiRequest<{data:Settings}>(path,{method:'POST',body:JSON.stringify({action,revision:settings.revision,...(action==='hours'?{hours:hours.map(h=>({...h,opens_at:h.opens_at.slice(0,5),closes_at:h.closes_at.slice(0,5)}))}:action==='interval'?{minutes:Number(interval)}:{profile_ids:allowed})})})
   accept(result.data,action==='hours');setMessage(action==='hours'?'Horários salvos para toda a unidade.':action==='interval'?'Intervalo atualizado em todas as agendas da unidade.':'Permissões atualizadas.');void refresh()
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 const change=(weekday:number,values:Partial<Day>)=>setHours(current=>current.map(h=>h.weekday===weekday?{...h,...values}:h))
 return <Page title="Horário de funcionamento"><div className="work-hours-page">
  <p className="form-note">Horários da barbearia usados na agenda dos dois apps, no agendamento e pelo agente. Fuso de Brasília.</p>
  {error&&<div className="form-error" role="alert">{error}<button className="outline small" disabled={busy} onClick={()=>void load()}>Recarregar configuração</button></div>}
  {message&&<p className="success-message" role="status">{message}</p>}
  {!settings&&!error&&<p role="status">Carregando horários…</p>}
  {settings&&<><section className="work-hours-section"><h2><Clock3 size={20}/>Dias e horários</h2>{!settings.can_edit&&<p className="form-note">Somente consulta. O Gestão pode autorizar sua conta para editar.</p>}
  <form onSubmit={e=>{e.preventDefault();void save('hours')}}><div className="work-hours-list">{hours.map(h=><div className="work-hours-day" key={h.weekday}><label className="work-hours-toggle"><input type="checkbox" checked={!h.closed} disabled={!settings.can_edit||busy} onChange={e=>change(h.weekday,{closed:!e.target.checked})}/><span>{days[h.weekday-1]}</span></label>{h.closed?<span className="work-hours-closed">Fechado</span>:<div className="work-hours-times"><label><span className="sr-only">Abertura — {days[h.weekday-1]}</span><input type="time" required value={h.opens_at.slice(0,5)} readOnly={!settings.can_edit} disabled={busy} onChange={e=>change(h.weekday,{opens_at:e.target.value})}/></label><span>às</span><label><span className="sr-only">Fechamento — {days[h.weekday-1]}</span><input type="time" required value={h.closes_at.slice(0,5)} readOnly={!settings.can_edit} disabled={busy} onChange={e=>change(h.weekday,{closes_at:e.target.value})}/></label></div>}</div>)}</div>
  {settings.can_edit&&<><p className="form-note">Agendamentos existentes são preservados. Novos atendimentos precisam terminar até o fechamento.</p><button className="primary" disabled={busy}>{busy?'Salvando…':'Salvar horários'}</button></>}</form></section>
  <section className="work-hours-section"><h2><Clock3 size={20}/>Intervalo da agenda</h2><p className="form-note">Defina de quantos em quantos minutos um novo horário aparece para agendar. Vale para Gestão, Profissionais, página pública e agente. Agendamentos existentes não mudam.</p><form onSubmit={e=>{e.preventDefault();void save('interval')}}><label className="work-hours-interval"><span>Mostrar horários a cada</span><span className="work-hours-interval-input"><input aria-label="Intervalo entre horários em minutos" type="number" inputMode="numeric" min="5" max="120" step="1" required readOnly={!settings.can_edit} disabled={busy} value={interval} onChange={e=>setIntervalMinutes(e.target.value)}/><span>minutos</span></span></label>{settings.can_edit&&<button className="primary" disabled={busy||!Number.isInteger(Number(interval))||Number(interval)<5||Number(interval)>120}>{busy?'Salvando…':'Salvar intervalo'}</button>}</form></section>
  {settings.can_delegate&&<section className="work-hours-section"><h2><ShieldCheck size={20}/>Quem pode alterar</h2><p className="form-note">O Gestão mantém o controle. Autorize somente as contas profissionais que poderão alterar os horários e o intervalo desta unidade.</p><div className="work-hours-access">{settings.accounts.map(a=><label key={a.id}><span><strong>{a.name}</strong><small>{a.email}</small></span><input type="checkbox" aria-label={`Permitir ${a.name} alterar horários`} disabled={busy} checked={allowed.includes(a.id)} onChange={e=>setAllowed(current=>e.target.checked?[...current,a.id]:current.filter(id=>id!==a.id))}/></label>)}{!settings.accounts.length&&<p className="form-note">Cadastre o acesso dos profissionais para conceder permissão.</p>}</div><button className="primary" disabled={busy||!settings.accounts.length} onClick={()=>void save('permissions')}>{busy?'Salvando…':'Salvar permissões'}</button></section>}</>}
 </div></Page>
}

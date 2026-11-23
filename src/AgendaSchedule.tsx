import type {Appointment,BusinessHour,ScheduleBlock} from './operations'
import {dateTime} from './operations'
import {agendaLanes} from './agendaLayout'
import {agendaTimesForDay,hoursForDay,timeMinutes,minutesTime} from './schedule'

type Column={id:string;name:string;photo?:string|null}
export function AgendaSchedule({date,businessHours,slotIntervalMinutes=15,columns,appointments,busyAppointments,blocks,split=false,compact=false,chooseTime,chooseAppointment,chooseBlock}:{date:string;businessHours?:BusinessHour[];slotIntervalMinutes?:number;columns:Column[];appointments:Appointment[];busyAppointments:Appointment[];blocks:ScheduleBlock[];split?:boolean;compact?:boolean;chooseTime:(time:string,professional:string)=>void;chooseAppointment:(a:Appointment)=>void;chooseBlock:(b:ScheduleBlock)=>void}){
 const workHours=hoursForDay(businessHours,date)
 const localMinutes=(instant:string)=>timeMinutes(new Date(instant).toLocaleTimeString('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}))
 const firstHour=Math.floor(Math.min(...workHours.map(h=>timeMinutes(h.opens_at)),...busyAppointments.map(a=>localMinutes(a.starts_at)),...(workHours.length?[]:[480]))/60)
 const lastHour=Math.ceil(Math.max(...workHours.map(h=>timeMinutes(h.closes_at)),...busyAppointments.map(a=>localMinutes(a.ends_at)),...(workHours.length?[]:[1320]))/60)
 const hourHeight=compact?90:120,gridHeight=(lastHour-firstHour)*hourHeight,headerHeight=split?56:0
 const start=Date.parse(date+'T'+minutesTime(firstHour*60)+':00-03:00')
 const position=(entry:{starts_at:string;ends_at:string})=>({top:Math.max(0,(Date.parse(entry.starts_at)-start)/3600000*hourHeight),height:Math.max(1,(Math.min(start+(lastHour-firstHour)*3600000,Date.parse(entry.ends_at))-Math.max(start,Date.parse(entry.starts_at)))/3600000*hourHeight)})
 const slots=agendaTimesForDay(businessHours,date,slotIntervalMinutes).map(time=>{
  const limit=workHours.find(h=>time>=h.opens_at.slice(0,5)&&time<h.closes_at.slice(0,5))
  const duration=Math.min(slotIntervalMinutes,(limit?timeMinutes(limit.closes_at):lastHour*60)-timeMinutes(time))
  return {time,duration,top:(timeMinutes(time)-firstHour*60)/60*hourHeight}
 })
 const lanes=agendaLanes(appointments)
 const visibleColumns=split?columns:[columns[0]??{id:'',name:''}]
 return <div className={split?'agenda-board-scroll':'agenda-board-single'}><section className={'agenda-schedule'+(split?' agenda-multi-schedule':'')} aria-label="Horários do dia" style={{gridTemplateColumns:`52px repeat(${Math.max(1,visibleColumns.length)},minmax(0,1fr))`,...(split?{minWidth:52+visibleColumns.length*200}:{})}}>
  <div className="agenda-time-axis" style={{height:gridHeight+headerHeight}}>{split&&<div className="agenda-axis-heading">Hora</div>}{[...slots,{time:minutesTime(lastHour*60),top:gridHeight}].map(hour=><time style={{top:hour.top+headerHeight}} key={hour.time}>{hour.time}</time>)}</div>
  {visibleColumns.map(column=>{
   const rows=split?appointments.filter(a=>a.professional_id===column.id):appointments
   const columnBlocks=split?blocks.filter(b=>b.professional_id===column.id):blocks
   const occupied=(time:string,duration:number)=>{
    const from=Date.parse(date+'T'+time+':00-03:00'),to=from+duration*60000
    return [...busyAppointments.filter(a=>(!split||a.professional_id===column.id)&&a.status!=='no_show'),...columnBlocks].some(a=>Date.parse(a.starts_at)<to&&Date.parse(a.ends_at)>from)
   }
   return <section className="agenda-professional-column" aria-label={split?`Agenda de ${column.name}`:undefined} key={column.id||'single'}>
    {split&&<header className="agenda-column-heading">{column.photo?<img src={column.photo} alt=""/>:<span>{column.name.slice(0,2).toUpperCase()}</span>}<strong title={column.name}>{column.name}</strong></header>}
    <div className="agenda-time-grid" style={{height:gridHeight}}>
     {slots.map(slot=><button key={slot.time} type="button" className="agenda-slot major" aria-label={`${occupied(slot.time,slot.duration)?'Ocupado':'Abrir opções'} às ${slot.time}${split?' · '+column.name:''}`} disabled={occupied(slot.time,slot.duration)||Date.parse(date+'T'+slot.time+':00-03:00')<Date.now()} style={{top:slot.top,height:slot.duration/60*hourHeight}} onClick={()=>chooseTime(slot.time,column.id)}><span>{slot.time}</span></button>)}
     <i className="agenda-grid-end" style={{top:gridHeight}}/>
     {columnBlocks.map(block=>{const layout=position(block);return <button key={block.id} type="button" className="agenda-event blocked" style={layout} onClick={()=>chooseBlock(block)}><small>{dateTime(block.starts_at)}–{new Date(block.ends_at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}</small><strong>Agenda bloqueada{block.reason&&block.reason!=='Agenda bloqueada'?' · '+block.reason:''}</strong></button>})}
     {rows.map(appointment=>{const layout=position(appointment),lane=lanes.get(appointment.id)!;return <button key={appointment.id} type="button" className={`agenda-event ${appointment.status}${layout.height<44?' compact':''}${layout.height<25?' tiny':''}`} aria-label={`${appointment.customer_name}, ${appointment.professional_name}, ${appointment.service_name}, ${dateTime(appointment.starts_at)}`} style={{...layout,left:`calc(${lane.column*100/lane.columns}% + 5px)`,right:'auto',width:`calc(${100/lane.columns}% - 10px)`,...(lane.columns>1?{padding:'3px 6px'}:{})}} onClick={()=>chooseAppointment(appointment)}><small>{new Date(appointment.starts_at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}–{new Date(appointment.ends_at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}</small><strong>{!appointment.is_additional_service&&appointment.is_fit_in?'Encaixe · ':''}{appointment.service_name} · {appointment.customer_name}</strong></button>})}
    </div>
   </section>
  })}
 </section></div>
}

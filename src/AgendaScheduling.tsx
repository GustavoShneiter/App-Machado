import { useState } from 'react'
import { useCatalog } from './CatalogStore'
import { useOperations } from './OperationsStore'
import { AppointmentModal, Modal } from './ManagementPages'
import { dayKey } from './operations'
import { addDays, addMonths } from './schedule'

type Props={close:()=>void;initialDate?:string;initialTime?:string;initialProfessional?:string}
export function AgendaCreateModal(props:Props) {
  const [kind,setKind]=useState('')
  if(kind==='appointment'||kind==='fit')return <AppointmentModal {...props} fitIn={kind==='fit'} />
  if(kind==='block')return <ScheduleBlockModal {...props} />
  return <Modal title="Opções da Agenda" close={props.close}>
    <p className="slot-choice-copy">{props.initialTime?`Horário selecionado: ${props.initialTime}. `:''}O que deseja fazer?</p>
    <div className="slot-choice-actions agenda-create-options">
      <button className="primary" onClick={()=>setKind('appointment')}>Novo agendamento</button>
      <button className="outline" onClick={()=>setKind('fit')}>Criar encaixe</button>
      <button className="outline" onClick={()=>setKind('block')}>Bloquear agenda</button>
    </div>
  </Modal>
}
export function ScheduleBlockModal({close,initialDate=dayKey(),initialTime='06:00',initialProfessional=''}:Props) {
  const {professionals}=useCatalog(),{run,busy,error}=useOperations()
  const [professional,setProfessional]=useState(initialProfessional||professionals.find(pro=>pro.ativo)?.id||'')
  const [kind,setKind]=useState('period'),[preset,setPreset]=useState('hours')
  const [start,setStart]=useState(`${initialDate}T${initialTime||'06:00'}`)
  const [end,setEnd]=useState(()=>{
    const value=new Date(`${initialDate}T${initialTime||'06:00'}:00Z`)
    value.setUTCMinutes(value.getUTCMinutes()+40)
    return value.toISOString().slice(0,16)
  })
  const [reason,setReason]=useState(''),[formError,setFormError]=useState('')
  const [startsOn,setStartsOn]=useState(initialDate),[untilOn,setUntilOn]=useState(addDays(addMonths(initialDate,2),-1))
  const [duration,setDuration]=useState('2months'),[allDay,setAllDay]=useState(false)
  const [startTime,setStartTime]=useState(initialTime||'06:00'),[endTime,setEndTime]=useState('08:00')
  const [weekdays,setWeekdays]=useState<number[]>([((new Date(`${initialDate}T12:00:00Z`).getUTCDay()+6)%7)+1])
  const choosePreset=(value:string)=>{
    setPreset(value)
    if(value==='hours')return
    const date=start.slice(0,10)
    setStart(`${date}T00:00`)
    setEnd(`${value==='day'?addDays(date,1):value==='week'?addDays(date,7):addMonths(date,1)}T00:00`)
  }
  const chooseDuration=(value:string,date=startsOn)=>{
    setDuration(value)
    if(value!=='custom'&&value!=='always')setUntilOn(addDays(addMonths(date,value==='year'?12:2),-1))
  }
  return <Modal title="Bloquear agenda" close={close}><form onSubmit={async event=>{
    event.preventDefault();setFormError('')
    if(kind==='recurring'&&(!weekdays.length||(!allDay&&endTime<=startTime))){setFormError('Selecione os dias e um horário final posterior ao inicial.');return}
    const saved=kind==='period'?await run('create_schedule_block',{professional_id:professional,starts_at:`${start}:00-03:00`,ends_at:`${end}:00-03:00`,reason}):await run('create_recurring_block',{payload:{professional_id:professional,starts_on:startsOn,until_on:duration==='always'?null:untilOn,weekdays,start_time:allDay?'00:00':startTime,end_time:allDay?'24:00':endTime,reason}})
    if(saved)close()
  }}>
    <label className="field"><span>Profissional</span><select aria-label="Profissional" required value={professional} onChange={event=>setProfessional(event.target.value)}>{professionals.filter(pro=>pro.ativo).map(pro=><option key={pro.id} value={pro.id}>{pro.nome}</option>)}</select></label>
    <label className="field"><span>Tipo de bloqueio</span><select aria-label="Tipo de bloqueio" value={kind} onChange={event=>setKind(event.target.value)}><option value="period">Um período: horas, dia, semana ou mês</option><option value="recurring">Recorrente: repetir nos dias da semana</option></select></label>
    {kind==='period'?<>
      <label className="field"><span>Período</span><select aria-label="Período" value={preset} onChange={event=>choosePreset(event.target.value)}><option value="hours">Horários personalizados</option><option value="day">Dia inteiro</option><option value="week">7 dias / uma semana</option><option value="month">Um mês</option></select></label>
      <label className="field"><span>Início do bloqueio</span><input type="datetime-local" required value={start} onChange={event=>setStart(event.target.value)} /></label>
      <label className="field"><span>Fim do bloqueio</span><input type="datetime-local" required min={start} value={end} onChange={event=>setEnd(event.target.value)} /></label>
    </>:<>
      <fieldset className="recurrence-weekdays"><legend>Repetir toda semana</legend>{['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map((label,index)=><label key={label}><input type="checkbox" checked={weekdays.includes(index+1)} onChange={event=>setWeekdays(event.target.checked?[...weekdays,index+1]:weekdays.filter(day=>day!==index+1))} />{label}</label>)}</fieldset>
      <label className="check"><input type="checkbox" checked={allDay} onChange={event=>setAllDay(event.target.checked)} />Bloquear o dia inteiro</label>
      {!allDay&&<div className="schedule-time-pair"><label className="field"><span>Das</span><input required type="time" value={startTime} onChange={event=>setStartTime(event.target.value)} /></label><label className="field"><span>Até</span><input required type="time" value={endTime} onChange={event=>setEndTime(event.target.value)} /></label></div>}
      <label className="field"><span>A partir de</span><input type="date" required value={startsOn} onChange={event=>{setStartsOn(event.target.value);chooseDuration(duration,event.target.value)}} /></label>
      <label className="field"><span>Repetir por</span><select aria-label="Repetir por" value={duration} onChange={event=>chooseDuration(event.target.value)}><option value="2months">Dois meses</option><option value="year">Um ano</option><option value="always">Sempre, até eu remover</option><option value="custom">Escolher data final</option></select></label>
      {duration!=='always'&&<label className="field"><span>Último dia da recorrência</span><input required type="date" min={startsOn} value={untilOn} onChange={event=>{setDuration('custom');setUntilOn(event.target.value)}} /></label>}
    </>}
    <label className="field"><span>Motivo (opcional)</span><input maxLength={200} value={reason} onChange={event=>setReason(event.target.value)} /></label>
    {(formError||error)&&<p role="alert" className="form-error">{formError||error}</p>}
    <button className="primary" disabled={busy||!professional}>{busy?'Bloqueando…':'Salvar bloqueio'}</button>
  </form></Modal>
}

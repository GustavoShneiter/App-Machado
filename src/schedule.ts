import { type RecurringBlock, type ScheduleBlock } from './operations'

export const defaultBusinessHours = Array.from({length:6},(_,index)=>({weekday:index+1,opens_at:'08:00',closes_at:'22:00'}))
export function hoursForDay(hours:import('./operations').BusinessHour[]|undefined,date:string) {
  const weekday=((new Date(date+'T12:00:00Z').getUTCDay()+6)%7)+1
  return (hours??defaultBusinessHours).filter(row=>row.weekday===weekday).sort((a,b)=>a.opens_at.localeCompare(b.opens_at))
}
export const timeMinutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3,5))
export const minutesTime=(minutes:number)=>`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`
export function agendaTimesForDay(hours:import('./operations').BusinessHour[]|undefined,date:string) {
  return hoursForDay(hours,date).flatMap(row=>Array.from({length:Math.ceil((timeMinutes(row.closes_at)-timeMinutes(row.opens_at))/40)},(_,i)=>minutesTime(timeMinutes(row.opens_at)+i*40)))
}
export const agendaTimes=agendaTimesForDay(defaultBusinessHours,'2026-11-23')
export function addDays(date:string,days:number) {
  const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days)
  return value.toISOString().slice(0,10)
}
export function addMonths(date:string,months:number) {
  const value=new Date(`${date}T12:00:00Z`),day=value.getUTCDate()
  value.setUTCDate(1);value.setUTCMonth(value.getUTCMonth()+months)
  const last=new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+1,0)).getUTCDate()
  value.setUTCDate(Math.min(day,last));return value.toISOString().slice(0,10)
}
export function recurringForDay(rules:RecurringBlock[],date:string):ScheduleBlock[] {
  const weekday=((new Date(`${date}T12:00:00Z`).getUTCDay()+6)%7)+1
  return rules.filter(rule=>rule.starts_on<=date&&(!rule.until_on||rule.until_on>=date)&&rule.weekdays.includes(weekday)).map(rule=>({
    id:`${rule.id}:${date}`,rule_id:rule.id,professional_id:rule.professional_id,
    starts_at:`${date}T${rule.start_time.slice(0,5)}:00-03:00`,
    ends_at:rule.end_time.startsWith('24:')?`${addDays(date,1)}T00:00:00-03:00`:`${date}T${rule.end_time.slice(0,5)}:00-03:00`,
    reason:rule.reason,created_at:'',
  }))
}

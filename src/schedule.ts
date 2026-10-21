import { type RecurringBlock, type ScheduleBlock } from './operations'

export const agendaTimes = Array.from({length:26},(_,index)=>{
  const minutes=360+index*40
  return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`
})
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

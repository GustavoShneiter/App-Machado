import { addDays } from '../schedule'
import { dayKey } from '../operations'

export function weekRange(offset = 0, today = dayKey()) {
  const weekday = new Date(today + 'T12:00:00Z').getUTCDay()
  const from = addDays(today, -((weekday + 6) % 7) + offset * 7)
  return { from, to: addDays(from, 6) }
}
export function shortDate(value: string) { return new Date(value + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }) }
export function fortnightRange(offset = 0, today = dayKey()) {
  const date = new Date(today + 'T12:00:00Z');
  const half = date.getUTCDate() <= 15 ? 0 : 1;
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + Math.floor((half + offset) / 2));
  const second = ((half + offset) % 2 + 2) % 2 === 1;
  const prefix = date.toISOString().slice(0, 7);
  const last = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  return {from:prefix+(second?'-16':'-01'),to:prefix+'-'+(second?last:15)};
}
export function remaining(goal: number, actual: number) { return Math.max(0, goal - actual) }
export function progress(goal: number, actual: number) { return goal > 0 ? Math.min(100, Math.max(0, actual / goal * 100)) : 0 }
export function estimatedServices(missing: number, serviceCommission: number, count: number) { return missing > 0 && count > 0 && serviceCommission > 0 ? Math.ceil(missing / (serviceCommission / count)) : null }

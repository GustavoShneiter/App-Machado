import { addDays } from '../schedule'
import { dayKey } from '../operations'

export function weekRange(offset = 0, today = dayKey()) {
  const weekday = new Date(today + 'T12:00:00Z').getUTCDay()
  const from = addDays(today, -((weekday + 6) % 7) + offset * 7)
  return { from, to: addDays(from, 6) }
}
export function shortDate(value: string) { return new Date(value + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }) }
export function remaining(goal: number, actual: number) { return Math.max(0, goal - actual) }
export function progress(goal: number, actual: number) { return goal > 0 ? Math.min(100, Math.max(0, actual / goal * 100)) : 0 }
export function estimatedServices(missing: number, serviceCommission: number, count: number) { return missing > 0 && count > 0 && serviceCommission > 0 ? Math.ceil(missing / (serviceCommission / count)) : null }

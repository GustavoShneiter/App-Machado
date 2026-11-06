import { dayKey, type Appointment, type Operations } from '../operations'

export type ReportProfessional = { id: string; nome: string; foto_url?: string | null; ativo?: boolean }
export type RevenuePart = { id: string; label: string; amount: number; kind: 'professional' | 'counter' | 'package' }
export type ReportPerson = { id: string; name: string; photo: string | null; gross: number; received: number; earned: number; pending: number; paid: number; services: number; customers: number; completed: number }
export type ReportPoint = { date: string; amount: number }
export type ManagementReport = {
  from: string; to: string; professional: string; people: ReportPerson[]; parts: RevenuePart[]; timeline: ReportPoint[]; appointments: Appointment[]
  gross: number; received: number; earned: number; pending: number; paid: number; expenses: number; shop: number; result: number; services: number; customers: number; completed: number
}

const counter = '__counter__', packages = '__packages__'
const cents = (value: number) => Number.isFinite(value) ? Math.round(value) : 0
const inRange = (value: string, from: string, to: string) => value >= from && value <= to

export function validReportRange(from: string, to: string) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value
  return valid(from) && valid(to) && from <= to && (Date.parse(to) - Date.parse(from)) / 86400000 <= 366
}

// A command may contain more than one barber. Allocate its exact cents rather
// than round each share separately, which can make a chart's parts disagree.
export function allocateCents(amount: number, weights: { id: string; weight: number }[]) {
  const grouped = new Map<string, number>()
  for (const entry of weights) grouped.set(entry.id, (grouped.get(entry.id) ?? 0) + Math.max(0, cents(entry.weight)))
  const rows = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([id, weight]) => ({ id, weight }))
  const total = rows.reduce((sum, row) => sum + row.weight, 0), absolute = Math.abs(cents(amount)), sign = amount < 0 ? -1 : 1
  if (!total) return new Map([[counter, cents(amount)]])
  const shares = rows.map(row => { const raw = absolute * row.weight / total; return { id: row.id, value: Math.floor(raw), remainder: raw - Math.floor(raw) } })
  const remaining = absolute - shares.reduce((sum, row) => sum + row.value, 0)
  const ranked = [...shares].sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id))
  for (let index = 0; index < remaining; index++) ranked[index % ranked.length].value++
  return new Map(shares.map(row => [row.id, row.value * sign]))
}

export function buildManagementReport(state: Operations, professionals: ReportProfessional[], from: string, to: string, professional = ''): ManagementReport {
  const people = new Map<string, ReportPerson>(), customers = new Map<string, Set<string>>(), allCustomers = new Set<string>()
  for (const person of professionals) people.set(person.id, { id: person.id, name: person.nome, photo: person.foto_url ?? null, gross: 0, received: 0, earned: 0, pending: 0, paid: 0, services: 0, customers: 0, completed: 0 })
  const person = (id: string) => {
    if (!people.has(id)) people.set(id, { id, name: state.appointments.find(row => row.professional_id === id)?.professional_name ?? 'Profissional sem cadastro', photo: null, gross: 0, received: 0, earned: 0, pending: 0, paid: 0, services: 0, customers: 0, completed: 0 })
    return people.get(id)!
  }
  const parts = new Map<string, RevenuePart>(), points = new Map<string, number>()
  let serviceCount = 0
  const addRevenue = (id: string, amount: number, date: string) => {
    if (professional && id !== professional) return
    const existing: RevenuePart = parts.get(id) ?? { id, label: id === counter ? 'Balcão sem profissional' : id === packages ? 'Venda de pacotes' : person(id).name, amount: 0, kind: id === counter ? 'counter' : id === packages ? 'package' : 'professional' }
    existing.amount += amount; parts.set(id, existing); points.set(date, (points.get(date) ?? 0) + amount)
    if (id !== counter && id !== packages) person(id).gross += amount
  }
  const appointmentsById = new Map(state.appointments.map(row => [row.id, row]))
  const commandsById = new Map(state.commands.map(row => [row.id, row]))
  const itemsByCommand = new Map<string, typeof state.items>()
  for (const item of state.items) { const list = itemsByCommand.get(item.command_id) ?? []; list.push(item); itemsByCommand.set(item.command_id, list) }
  const eligible = new Map<string, { day: string; items: typeof state.items; weights: { id: string; weight: number }[] }>()
  for (const command of state.commands) {
    if (!['awaiting_payment', 'closed'].includes(command.status)) continue
    const appointment = command.appointment_id ? appointmentsById.get(command.appointment_id) : undefined
    const day = dayKey(appointment?.starts_at ?? command.closed_at ?? command.created_at), items = itemsByCommand.get(command.id) ?? []
    const weights = items.map(item => ({ id: item.professional_id ?? counter, weight: cents(item.unit_price_cents) * item.quantity }))
    eligible.set(command.id, { day, items, weights })
    if (!inRange(day, from, to)) continue
    const total = items.reduce((sum, item) => sum + cents(item.unit_price_cents) * item.quantity, 0) - cents(command.discount_cents) + cents(command.surcharge_cents)
    for (const [id, value] of allocateCents(total, weights)) addRevenue(id, value, day)
    for (const item of items) {
      if (professional && item.professional_id !== professional) continue
      if (command.customer_id) allCustomers.add(command.customer_id)
      if (item.type === 'service' || (!item.type && !item.product_id)) serviceCount += item.quantity
      if (!item.professional_id) continue
      const value = person(item.professional_id), unique = customers.get(value.id) ?? new Set<string>()
      if (command.customer_id) unique.add(command.customer_id)
      customers.set(value.id, unique)
      if (item.type === 'service' || (!item.type && !item.product_id)) value.services += item.quantity
    }
  }
  const itemsById = new Map(state.items.map(row => [row.id, row]))
  for (const commission of state.commissions) {
    if (!['pending', 'paid'].includes(commission.status) || (professional && commission.professional_id !== professional)) continue
    const item = itemsById.get(commission.command_item_id), entry = item ? eligible.get(item.command_id) : undefined
    if (!item || item.professional_id !== commission.professional_id || !entry || !inRange(entry.day, from, to)) continue
    const value = person(commission.professional_id), amount = cents(commission.commission_cents)
    value.earned += amount
    if (commission.status === 'pending') value.pending += amount
    else value.paid += amount
  }
  let received = 0
  for (const payment of state.payments) {
    if (payment.reversed_at || !inRange(dayKey(payment.paid_at), from, to)) continue
    const command = commandsById.get(payment.command_id), entry = eligible.get(payment.command_id)
    if (!command || !entry) continue
    for (const [id, amount] of allocateCents(payment.amount_cents, entry.weights)) {
      if (professional && id !== professional) continue
      received += amount
      if (id !== counter) person(id).received += amount
    }
  }
  if (!professional) for (const sale of state.packageSales) {
    if (sale.status === 'cancelled' || !inRange(dayKey(sale.sold_at), from, to)) continue
    addRevenue(packages, cents(sale.amount_cents), dayKey(sale.sold_at)); received += cents(sale.amount_cents)
    if (sale.customer_id) allCustomers.add(sale.customer_id)
  }
  const appointments = state.appointments.filter(row => inRange(dayKey(row.starts_at), from, to) && (!professional || row.professional_id === professional))
  for (const appointment of appointments) if (appointment.status === 'completed') person(appointment.professional_id).completed++
  const visiblePeople = [...people.values()].filter(row => !professional || row.id === professional).map(row => ({ ...row, customers: customers.get(row.id)?.size ?? 0 })).sort((a, b) => b.gross - a.gross || a.name.localeCompare(b.name, 'pt-BR'))
  const gross = [...parts.values()].reduce((sum, row) => sum + row.amount, 0), earned = visiblePeople.reduce((sum, row) => sum + row.earned, 0)
  const expenses = professional ? 0 : state.movements.filter(row => row.type === 'expense' && inRange(dayKey(row.created_at), from, to)).reduce((sum, row) => sum - cents(row.amount_cents), 0)
  const timeline: ReportPoint[] = []
  if (validReportRange(from, to)) for (let value = Date.parse(from + 'T12:00:00Z'); value <= Date.parse(to + 'T12:00:00Z'); value += 86400000) { const date = new Date(value).toISOString().slice(0, 10); timeline.push({ date, amount: points.get(date) ?? 0 }) }
  return { from, to, professional, people: visiblePeople, parts: [...parts.values()].filter(row => row.amount !== 0).sort((a, b) => b.amount - a.amount), timeline, appointments,
    gross, received, earned, pending: visiblePeople.reduce((sum, row) => sum + row.pending, 0), paid: visiblePeople.reduce((sum, row) => sum + row.paid, 0), expenses, shop: gross - earned, result: gross - earned - expenses,
    services: serviceCount, customers: allCustomers.size, completed: appointments.filter(row => row.status === 'completed').length }
}

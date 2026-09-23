export type Appointment = { id: string; customer_id: string; professional_id: string; service_id: string; starts_at: string; ends_at: string; expected_price_cents: number; status: string; source: string; customer_name: string; customer_phone: string; professional_name: string; service_name: string }
export type ScheduleBlock = { id: string; professional_id: string; starts_at: string; ends_at: string; reason: string; created_at: string }
export type Customer = { id: string; name: string; phone: string; email?: string | null; birth_date?: string | null; notes: string | null }
export type Command = { id: string; appointment_id: string | null; customer_id: string; status: string; discount_cents: number; surcharge_cents: number; created_at: string; closed_at: string | null }
export type Item = { id: string; command_id: string; type?: 'service' | 'product'; service_id?: string | null; product_id?: string | null; professional_id: string | null; description: string; unit_price_cents: number; quantity: number; commission_cents: number }
export type Payment = { id: string; command_id: string; method: string; amount_cents: number; paid_at: string; reversed_at: string | null }
export type Commission = { id: string; command_item_id: string; professional_id: string; gross_cents: number; commission_cents: number; status: string; paid_at: string | null; created_at: string }
export type CashSession = { id: string; opened_at: string; opening_balance_cents: number; closed_at: string | null; declared_balance_cents: number | null; notes: string | null }
export type Movement = { id: string; session_id: string; type: string; amount_cents: number; payment_method: string; notes: string; created_at: string; command_id: string | null; commission_entry_id: string | null; package_sale_id?: string | null }
export type Product = { id: string; name: string; category: string; quantity: number; minimum_quantity: number; sale_price_cents: number; cost_cents: number; active: boolean; photo_url?: string | null }
export type ServicePackageItem = { service_id: string; service_name: string; quantity: number }
export type ServicePackage = { id: string; name: string; description: string | null; price_cents: number; active: boolean; created_at: string; items: ServicePackageItem[] }
export type PackageBalance = { service_id: string; service_name: string; total: number; remaining: number }
export type PackageSale = { id: string; package_id: string; customer_id: string; package_name: string; customer_name: string; amount_cents: number; method: string; status: string; sold_at: string; balances: PackageBalance[] }
export type BusinessSettings = { id: boolean; name: string; legal_name: string | null; email: string | null; phone: string | null; postal_code: string | null; street: string | null; city: string | null; state: string | null; instagram: string | null; website: string | null }
export type Operations = { appointments: Appointment[]; blocks: ScheduleBlock[]; customers: Customer[]; commands: Command[]; items: Item[]; payments: Payment[]; commissions: Commission[]; sessions: CashSession[]; movements: Movement[]; products: Product[]; packages: ServicePackage[]; packageSales: PackageSale[]; business: BusinessSettings[] }
export const emptyOperations: Operations = { appointments: [], blocks: [], customers: [], commands: [], items: [], payments: [], commissions: [], sessions: [], movements: [], products: [], packages: [], packageSales: [], business: [] }
export const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
export const dayKey = (value: string | Date = new Date()) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
export const dateTime = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
export const labels: Record<string, string> = { scheduled: 'Agendado', confirmed: 'Confirmado', arrived: 'Cliente chegou', in_service: 'Em atendimento', completed: 'Concluído', cancelled: 'Cancelado', no_show: 'Não compareceu', open: 'Em aberto', awaiting_payment: 'Aguardando pagamento', closed: 'Paga', voided: 'Cancelada', refunded: 'Estornada' }
export const methods: Record<string, string> = { cash: 'Dinheiro', pix: 'Pix', debit: 'Débito', credit: 'Crédito', other: 'Outro' }
export const commandTotal = (state: Operations, command: Command) => state.items.filter(i => i.command_id === command.id).reduce((s, i) => s + i.unit_price_cents * i.quantity, 0) - command.discount_cents + command.surcharge_cents
export const cashBalance = (state: Operations, session: CashSession) => session.opening_balance_cents + state.movements.filter(m => m.session_id === session.id && m.payment_method === 'cash').reduce((s, m) => s + m.amount_cents, 0)
export function summarize(state: Operations, from: string, to: string, professional = '') {
  const appointments = state.appointments.filter(a => dayKey(a.starts_at) >= from && dayKey(a.starts_at) <= to && (!professional || a.professional_id === professional))
  const completed = appointments.filter(a => a.status === 'completed')
  const completedIds = new Set(completed.map(a => a.id))
  const commandIds = new Set(state.commands.filter(c => (c.appointment_id !== null && completedIds.has(c.appointment_id)) || (!c.appointment_id && (c.status === 'awaiting_payment' || c.status === 'closed') && dayKey(c.created_at) >= from && dayKey(c.created_at) <= to)).map(c => c.id))
  const proCommands = new Set(state.commands.filter(c => commandIds.has(c.id) && state.items.some(i => i.command_id === c.id && i.professional_id === professional)).map(c => c.id))
  const includedCommandIds = professional ? proCommands : commandIds
  const items = state.items.filter(i => includedCommandIds.has(i.command_id))
  const packageSales = professional ? [] : state.packageSales.filter(sale => dayKey(sale.sold_at) >= from && dayKey(sale.sold_at) <= to && sale.status !== 'cancelled')
  const packageGross = packageSales.reduce((sum, sale) => sum + sale.amount_cents, 0)
  const serviceGross = items.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0)
  const gross = serviceGross + packageGross
  const earned = items.reduce((s, i) => s + i.commission_cents, 0)
  const itemIds = new Set(items.map(i => i.id))
  const pending = state.commissions.filter(e => itemIds.has(e.command_item_id) && e.status === 'pending').reduce((s, e) => s + e.commission_cents, 0)
  const paidCommission = state.commissions.filter(e => itemIds.has(e.command_item_id) && e.status === 'paid').reduce((s, e) => s + e.commission_cents, 0)
  const received = state.payments.filter(p => !p.reversed_at && dayKey(p.paid_at) >= from && dayKey(p.paid_at) <= to && (!professional || proCommands.has(p.command_id))).reduce((s, p) => s + p.amount_cents, 0) + packageGross
  return { appointments, completed, gross, earned, pending, paidCommission, received, shop: gross - earned, ticket: includedCommandIds.size ? Math.round(gross / includedCommandIds.size) : 0 }
}

export const csvCell = (value: unknown) => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"'
export function exportCsv(filename: string, rows: unknown[][]) {
  const blob = new Blob(['\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

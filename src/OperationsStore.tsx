import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabaseClient'
import { emptyOperations, type Operations } from './operations'

type Store = { data: Operations; loading: boolean; error: string; busy: boolean; refreshed: string; refresh: () => Promise<void>; run: (action: string, payload?: Record<string, unknown>) => Promise<boolean> }
const Context = createContext<Store | null>(null)
export function OperationsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Operations>(emptyOperations)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshed, setRefreshed] = useState('')
  const request = useRef(0)
  const saving = useRef(false)
  const alive = useRef(true)
  const refresh = useCallback(async () => {
    const version = ++request.current
    if (!supabase) { setLoadError('Conexão com o sistema indisponível.'); setLoading(false); return }
    try {
      const result = await supabase.rpc('office_snapshot')
      if (result.error) throw result.error
      if (!result.data || !Object.keys(emptyOperations).every(k => Array.isArray(result.data[k]))) throw new Error('Resposta inválida ao atualizar dados.')
      if (alive.current && version === request.current) { setData(result.data as Operations); setRefreshed(new Date().toLocaleTimeString('pt-BR')); setLoading(false); setLoadError('') }
    } catch (e) {
      if (alive.current && version === request.current) { setLoading(false); setLoadError(e instanceof Error ? e.message : 'Não foi possível atualizar os dados. Tente novamente.') }
    }
  }, [])
  useEffect(() => {
    alive.current = true
    void refresh()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 10000)
    const focus = () => { void refresh() }
    window.addEventListener('focus', focus)
    const channel = supabase?.channel('office-live').on('postgres_changes', { event: '*', schema: 'public' }, focus).subscribe()
    return () => { alive.current = false; request.current++; clearInterval(timer); window.removeEventListener('focus', focus); if (channel) void supabase?.removeChannel(channel) }
  }, [refresh])
  const run = async (action: string, payload: Record<string, unknown> = {}) => {
    if (saving.current || !supabase) return false
    saving.current = true; setBusy(true); setError('')
    try {
      const result = action === 'reset_operational_data'
        ? await supabase.rpc('reset_operational_data', { confirmation: String(payload.confirmation ?? '') })
        : action === 'save_product_profile'
          ? await supabase.rpc('save_product_profile', { payload })
          : action === 'add_command_product'
            ? await supabase.rpc('add_product_to_command', { command_id: String(payload.command_id ?? ''), product_id: String(payload.product_id ?? ''), item_quantity: Number(payload.quantity ?? 1) })
          : action === 'open_manual_command'
            ? await supabase.rpc('open_manual_command', { customer_name: String(payload.name ?? ''), customer_phone: String(payload.phone ?? '') })
          : action === 'add_command_service'
            ? await supabase.rpc('add_service_to_command', { command_id: String(payload.command_id ?? ''), service_id: String(payload.service_id ?? ''), professional_id: String(payload.professional_id ?? '') })
          : action === 'remove_command_item'
            ? await supabase.rpc('remove_command_item', { command_item_id: String(payload.id ?? '') })
          : action === 'mark_command_ready'
            ? await supabase.rpc('mark_command_ready', { command_id: String(payload.command_id ?? '') })
          : action === 'delete_customer'
            ? await supabase.rpc('delete_customer_record', { customer_id: String(payload.id ?? '') })
            : await supabase.rpc('office_action', { action, payload })
      if (result.error) throw result.error
      await refresh()
      return true
    } catch (e) {
      const rawMessage = typeof e === 'object' && e && 'message' in e ? String(e.message) : 'Não foi possível salvar. Tente novamente.'
      const message = /atendimento nesse horário|slot_not_available|exclusion/i.test(rawMessage) ? 'Esse profissional já possui um atendimento nesse horário. Escolha outro horário disponível.' : rawMessage
      setError(message); return false
    } finally { saving.current = false; setBusy(false) }
  }
  return <Context.Provider value={{ data, loading, error: error || loadError, busy, refreshed, refresh, run }}>{children}</Context.Provider>
}
export function useOperations() { const value = useContext(Context); if (!value) throw new Error('OperationsProvider ausente'); return value }

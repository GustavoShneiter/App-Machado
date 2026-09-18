import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { type Profissional, type Servico } from './data'
import { supabase } from './supabaseClient'

type Catalog = {
  services: Servico[]; professionals: Profissional[]; loading: boolean; error: string;
  updateService: (id: string, update: Partial<Servico>) => Promise<string | null>;
  addService: (update: Partial<Servico>) => Promise<string | null>;
  updateProfessional: (id: string, update: Partial<Profissional>) => Promise<string | null>;
  addProfessional: (professional: Pick<Profissional, 'nome' | 'telefone' | 'especialidades'>) => Promise<string | null>;
  deleteProfessional: (id: string) => Promise<string | null>;
}
const CatalogContext = createContext<Catalog | null>(null)
const mapService = (row: Record<string, unknown>): Servico => ({ id: String(row.id), nome: String(row.name), descricao: String(row.description ?? ''), preco: Number(row.price_cents) / 100, duracao: Number(row.duration_minutes), cor: String(row.color ?? '#203F20'), ativo: Boolean(row.active) })
const mapProfessional = (row: Record<string, unknown>): Profissional => ({ id: String(row.id), nome: String(row.name), iniciais: String(row.name).split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase(), telefone: String(row.phone ?? ''), especialidades: String(row.specialties ?? ''), comissao: Number(row.default_commission_percent ?? 40), cor: '#203F20', ativo: Boolean(row.active) })
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<Servico[]>([])
  const [professionals, setProfessionals] = useState<Profissional[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!supabase) { setError('Conexão indisponível.'); setLoading(false); return }
    const [s,p] = await Promise.all([supabase.from('services').select('*').order('name'),supabase.from('professionals').select('*').order('name')])
    if (s.error || p.error) { setError('Não foi possível atualizar serviços e profissionais.'); setLoading(false); return }
    setServices((s.data ?? []).map(mapService)); setProfessionals((p.data ?? []).map(mapProfessional)); setError(''); setLoading(false)
  }, [])
  useEffect(() => {
    void load()
    const channel = supabase?.channel('catalog-live').on('postgres_changes',{ event:'*',schema:'public',table:'services' }, () => void load()).on('postgres_changes',{ event:'*',schema:'public',table:'professionals' }, () => void load()).subscribe()
    const auth = supabase?.auth.onAuthStateChange(() => { window.setTimeout(() => void load(),0) })
    const reload = () => void load()
    const timer = window.setInterval(() => { if (document.visibilityState==='visible') void load() },15000)
    window.addEventListener('focus',reload)
    return () => { clearInterval(timer); window.removeEventListener('focus',reload); auth?.data.subscription.unsubscribe(); if(channel) void supabase?.removeChannel(channel) }
  },[load])
  const save = async (action:string,payload:Record<string,unknown>) => {
    if(!supabase) return 'Conexão indisponível.'
    try {
      const result=await supabase.rpc('office_action',{action,payload})
      if(result.error) return result.error.message
      await load(); return null
    } catch { return 'Não foi possível salvar. Confira sua conexão e tente novamente.' }
  }
  const updateService = (id:string,update:Partial<Servico>) => {
    const s={...services.find(s => s.id===id),...update}
    return save('save_service',{id:id||null,name:s.nome,description:s.descricao,price:Math.round(Number(s.preco)*100),duration:s.duracao,color:s.cor,active:s.ativo})
  }
  const updateProfessional = (id:string,update:Partial<Profissional>) => {
    const p={...professionals.find(p => p.id===id),...update}
    return save('save_professional',{id:id||null,name:p.nome,phone:p.telefone,specialties:p.especialidades,active:p.ativo})
  }
  return <CatalogContext.Provider value={{services,professionals,loading,error,updateService,addService:s=>updateService('',s),updateProfessional,addProfessional:p=>updateProfessional('',{...p,ativo:true}),deleteProfessional:id=>updateProfessional(id,{ativo:false})}}>{children}</CatalogContext.Provider>
}
export function useCatalog(){const value=useContext(CatalogContext);if(!value) throw new Error('CatalogProvider ausente');return value}

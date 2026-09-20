import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useCatalog } from './CatalogStore'
import { supabase } from './supabaseClient'

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
const priceLabel = (value: number) => value > 0 ? money(value) : 'Consultar'
const dateBr = (date: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`))

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="public-shell"><header className="public-header"><a href="/agendar" className="brand" aria-label="Barbearia Machado — agendamento"><span className="brand-mark">BM</span><span><strong>Barbearia</strong><small>Machado</small></span></a></header>{children}<footer>© 2026 Barbearia Machado · <a href="/privacidade">Privacidade</a></footer></main>
}

export function PublicBookingV2() {
  const { services: allServices, professionals: allProfessionals, loading: catalogLoading, error: catalogError } = useCatalog()
  const servicos = allServices.filter((service) => service.ativo)
  const profissionais = allProfessionals.filter((professional) => professional.ativo)
  const [step, setStep] = useState(1)
  const [serviceId, setServiceId] = useState('')
  const [professionalId, setProfessionalId] = useState('qualquer')
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [confirmedProfessional, setConfirmedProfessional] = useState('')
  const [remoteSlots, setRemoteSlots] = useState<Array<{ slot_time: string; professional_id: string }>>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [bookingError, setBookingError] = useState('')
  const [slotVersion, setSlotVersion] = useState(0)
  const form = useForm<{ nome: string; telefone: string; terms: boolean }>({ defaultValues: { nome: '', telefone: '', terms: false } })
  const service = servicos.find((item) => item.id === serviceId) ?? servicos[0]!
  useEffect(() => {
    setTime('')
    setBookingError('')
    setRemoteSlots([])
    if (!supabase || !service?.id) return
    let active = true
    setLoadingSlots(true)
    void supabase.rpc('public_available_slots', { chosen_service: service.id, booking_day: date, preferred_professional: professionalId === 'qualquer' ? null : professionalId }).then(({ data, error }) => {
      if (!active) return
      setRemoteSlots(error ? [] : (data ?? []).map((slot: { slot_time: string; professional_id: string }) => ({ slot_time: String(slot.slot_time).slice(0, 5), professional_id: String(slot.professional_id) })))
      if (error) setBookingError('Não foi possível buscar os horários. Tente novamente.')
      setLoadingSlots(false)
    })
    return () => { active = false }
  }, [date, professionalId, service?.id, slotVersion])
  const availableSlots = useMemo(() => {
    if (supabase) return [...new Set(remoteSlots.map((slot) => slot.slot_time))]
    return []
  }, [remoteSlots])
  const selectedProfessional = profissionais.find(pro => pro.id === professionalId)
  const submit = form.handleSubmit(async (customer) => {
    if (!customer.terms || !time || !service) return
    const chosenId = remoteSlots.find((slot) => slot.slot_time === time && (professionalId === 'qualquer' || slot.professional_id === professionalId))?.professional_id
    const professional = profissionais.find((pro) => pro.id === chosenId)
    if (!chosenId || !professional) { setBookingError('Esse horário acabou de ficar indisponível. Escolha outro.'); return }
    setSubmitting(true)
    setBookingError('')
    try {
      if (!supabase) throw new Error('Conexão indisponível')
      const { error } = await supabase.rpc('create_public_appointment', { customer_name: customer.nome.trim(), customer_phone: customer.telefone.replace(/\D/g, ''), chosen_service: service.id, chosen_professional: chosenId, start_time: `${date}T${time}:00-03:00`, terms_accepted: true })
      if (error) throw error
      setConfirmedProfessional(professional.nome)
      setConfirmed(true)
    } catch {
      setBookingError('Não foi possível reservar este horário. Atualize os horários e tente novamente.')
      setTime('')
      setStep(3)
    } finally { setSubmitting(false) }
  })

  if (confirmed) return <Shell><div className="confirmation"><div className="success-mark">✓</div><p className="eyebrow">Agendamento confirmado</p><h1>Até breve!</h1><p>Seu horário foi reservado e a Barbearia Machado já foi avisada.</p><div className="confirmation-card"><strong>{form.getValues('nome')} · {confirmedProfessional}</strong><span>{service?.nome}</span><span>{dateBr(date)} às {time}</span></div><a className="primary" href="/agendar">Fazer outro agendamento</a></div></Shell>
  if (catalogLoading) return <Shell><p className="empty">Carregando serviços…</p></Shell>
  if (catalogError || !servicos.length || !profissionais.length) return <Shell><p className="empty">{catalogError || 'Não há serviços ou profissionais disponíveis para agendamento no momento.'}</p></Shell>

  return <Shell><div className="booking"><div className="booking-intro"><p className="eyebrow">Agendamento online</p><h1>Seu próximo corte começa aqui.</h1><p>Escolha o serviço, o horário e venha se cuidar com a gente.</p><div className="steps">{['Serviço', 'Profissional', 'Horário', 'Seus dados'].map((label, index) => <span className={step === index + 1 ? 'current' : step > index + 1 ? 'completed' : ''} key={label}><i>{index + 1}</i>{label}</span>)}</div></div><div className="booking-card">
    {step === 1 && <><h2>Qual serviço você quer?</h2><p>Selecione uma opção para continuar.</p><div className="service-options">{servicos.map((item) => <button type="button" className={service.id === item.id ? 'selected' : ''} onClick={() => setServiceId(item.id)} key={item.id}><i style={{ background: item.cor }} /><span><strong>{item.nome}</strong><small>{item.descricao} · {item.duracao} min</small></span><b>{priceLabel(item.preco)}</b></button>)}</div></>}
    {step === 2 && <><h2>Com quem você quer agendar?</h2><p>Escolha um profissional ou veja a agenda mais ampla.</p><div className="pro-options"><button type="button" className={professionalId === 'qualquer' ? 'selected' : ''} onClick={() => setProfessionalId('qualquer')}><span className="avatar light">?</span><span><strong>Primeiro disponível</strong><small>Mais opções de horário</small></span></button>{profissionais.map((pro) => <button type="button" className={professionalId === pro.id ? 'selected' : ''} onClick={() => setProfessionalId(pro.id)} key={pro.id}>{pro.foto_url?<img className="booking-pro-photo" src={pro.foto_url} alt=""/>:<span className="avatar" style={{ background: pro.cor }}>{pro.iniciais}</span>}<span><strong>{pro.nome}</strong><small>Ver horários disponíveis</small></span></button>)}</div></>}
    {step === 3 && <><div className="booking-slot-head"><div><p className="eyebrow">Disponibilidade em tempo real</p><h2>Escolha seu horário</h2></div><button type="button" className="outline small" disabled={loadingSlots} onClick={() => setSlotVersion(v => v+1)}>Atualizar</button></div>{bookingError && <p className="form-error">{bookingError}</p>}<div className="booking-date"><label>Dia<input type="date" value={date} min={today} onChange={(event) => { setDate(event.target.value); setTime('') }} /></label>{selectedProfessional&&<span className="availability-chip">{selectedProfessional.nome}</span>}</div>{loadingSlots && <p className="empty">Buscando horários disponíveis…</p>}<div className="slots">{availableSlots.map((slot) => <button type="button" className={time === slot ? 'selected' : ''} key={slot} onClick={() => setTime(slot)}><span>{slot}</span><small>Disponível</small></button>)}</div>{!loadingSlots && !availableSlots.length && <p className="empty">Não há horários disponíveis neste dia.</p>}<p className="availability-note">Os horários ocupados não aparecem. A reserva é confirmada novamente ao finalizar.</p></>}
    {step === 4 && <form onSubmit={submit}><h2>Agora, seus dados</h2><p>Vamos usá-los somente para confirmar seu horário.</p><label className="field"><span>Nome completo</span><input placeholder="Como você quer ser chamado?" {...form.register('nome', { required: true, minLength: 3 })} /></label><label className="field"><span>WhatsApp</span><input placeholder="(00) 00000-0000" {...form.register('telefone', { required: true, minLength: 10 })} /></label><label className="check"><input type="checkbox" {...form.register('terms', { required: true })} /> Li e aceito os <a href="/privacidade" target="_blank">termos e a política de privacidade</a>.</label>{bookingError && <p className="form-error">{bookingError}</p>}<button className="primary wide" disabled={!time || submitting}>{submitting ? 'Reservando…' : 'Confirmar agendamento'}</button></form>}
    <div className="booking-footer">{step > 1 && <button type="button" className="text-button" onClick={() => setStep((current) => current - 1)}>Voltar</button>}{step < 4 && <button type="button" className="primary" disabled={step === 3 && (!time || loadingSlots)} onClick={() => setStep((current) => current + 1)}>Continuar</button>}</div>
  </div></div></Shell>
}

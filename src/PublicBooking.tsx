import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useCatalog } from './CatalogStore'
import { supabase } from './supabaseClient'

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
const priceLabel = (value: number) => value > 0 ? money(value) : 'Consultar'
const dateBr = (date: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`))
const weekDay = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
const dayNumber = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="public-shell"><header className="public-header"><a href="/" className="booking-logo" aria-label="Barbearia Machado — início"><img src="/logo-machado.png" alt="Machado" /></a></header>{children}<footer>© 2026 Barbearia Machado · <a href="/privacidade">Privacidade</a></footer></main>
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
  const [remoteSlots, setRemoteSlots] = useState<Array<{ slot_time: string; professional_id: string | null; available: boolean }>>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [bookingError, setBookingError] = useState('')
  const form = useForm<{ nome: string; telefone: string; terms: boolean }>({ defaultValues: { nome: '', telefone: '', terms: false } })
  const service = servicos.find((item) => item.id === serviceId) ?? servicos[0]!
  useEffect(() => {
    setTime('')
    setBookingError('')
    setRemoteSlots([])
    if (!supabase || !service?.id) return
    let active = true
    setLoadingSlots(true)
    void supabase.rpc('public_booking_slots', { chosen_service: service.id, booking_day: date, preferred_professional: professionalId === 'qualquer' ? null : professionalId }).then(({ data, error }) => {
      if (!active) return
      setRemoteSlots(error ? [] : (data ?? []).map((slot: { slot_time: string; professional_id: string | null; available: boolean }) => ({ slot_time: String(slot.slot_time).slice(0, 5), professional_id: slot.professional_id ? String(slot.professional_id) : null, available: Boolean(slot.available) })))
      if (error) setBookingError('Não foi possível buscar os horários. Tente novamente.')
      setLoadingSlots(false)
    })
    return () => { active = false }
  }, [date, professionalId, service?.id])
  const bookingSlots = useMemo(() => supabase ? remoteSlots : [], [remoteSlots])
  const selectedProfessional = profissionais.find(pro => pro.id === professionalId)
  const bookingDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const value = new Date(`${today}T12:00:00`)
    value.setDate(value.getDate() + index)
    return { value: value.toLocaleDateString('en-CA'), weekday: index === 0 ? 'Hoje' : weekDay.format(value).replace('.', ''), label: dayNumber.format(value) }
  }), [])
  const submit = form.handleSubmit(async (customer) => {
    if (!customer.terms || !time || !service) return
    const chosenId = remoteSlots.find((slot) => slot.slot_time === time && slot.available)?.professional_id
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
    {step === 1 && <><h2>Escolha seu serviço</h2><div className="service-options">{servicos.map((item) => <button type="button" className={service.id === item.id ? 'selected' : ''} onClick={() => setServiceId(item.id)} key={item.id}><strong>{item.nome}</strong><b>{priceLabel(item.preco)}</b></button>)}</div></>}
    {step === 2 && <><h2>Preferência de profissional</h2><div className="pro-options"><button type="button" className={`any-professional ${professionalId === 'qualquer' ? 'selected' : ''}`} onClick={() => setProfessionalId('qualquer')}><strong>Qualquer profissional disponível</strong><span>Ver mais horários</span></button><div className="professional-grid">{profissionais.map((pro) => <button type="button" className={`professional-card ${professionalId === pro.id ? 'selected' : ''}`} onClick={() => setProfessionalId(pro.id)} key={pro.id}>{pro.foto_url?<img src={pro.foto_url} alt={`Profissional ${pro.nome}`}/>:<span className="professional-photo-placeholder">{pro.iniciais}</span>}<strong>{pro.nome}</strong></button>)}</div></div></>}
    {step === 3 && <><div className="booking-slot-head"><div><p className="eyebrow">Disponibilidade</p><h2>Escolha o horário</h2></div></div>{bookingError && <p className="form-error">{bookingError}</p>}<div className="week-picker">{bookingDays.map(day=><button key={day.value} type="button" className={date===day.value?'selected':''} onClick={()=>{setDate(day.value);setTime('')}}><strong>{day.weekday}</strong><span>{day.label}</span></button>)}</div><div className="booking-date">{selectedProfessional&&<span className="availability-chip">{selectedProfessional.nome}</span>}</div>{loadingSlots && <p className="empty">Buscando horários disponíveis…</p>}<div className="slots">{bookingSlots.map((slot) => <button type="button" disabled={!slot.available} className={`${time === slot.slot_time ? 'selected' : ''} ${!slot.available ? 'unavailable' : ''}`} key={slot.slot_time} onClick={() => setTime(slot.slot_time)}><span>{slot.slot_time}</span>{!slot.available&&<small>Ocupado</small>}</button>)}</div>{!loadingSlots && !bookingSlots.length && <p className="empty">Não há horários neste dia.</p>}<p className="availability-note">Horários escuros estão indisponíveis.</p></>}
    {step === 4 && <form onSubmit={submit}><h2>Agora, seus dados</h2><p>Vamos usá-los somente para confirmar seu horário.</p><label className="field"><span>Nome completo</span><input placeholder="Como você quer ser chamado?" {...form.register('nome', { required: true, minLength: 3 })} /></label><label className="field"><span>WhatsApp</span><input placeholder="(00) 00000-0000" {...form.register('telefone', { required: true, minLength: 10 })} /></label><label className="check"><input type="checkbox" {...form.register('terms', { required: true })} /> Li e aceito os <a href="/privacidade" target="_blank">termos e a política de privacidade</a>.</label>{bookingError && <p className="form-error">{bookingError}</p>}<button className="primary wide" disabled={!time || submitting}>{submitting ? 'Reservando…' : 'Confirmar agendamento'}</button></form>}
    <div className="booking-footer">{step > 1 && <button type="button" className="text-button" onClick={() => setStep((current) => current - 1)}>Voltar</button>}{step < 4 && <button type="button" className="primary" disabled={step === 3 && (!time || loadingSlots)} onClick={() => setStep((current) => current + 1)}>Continuar</button>}</div>
  </div></div></Shell>
}

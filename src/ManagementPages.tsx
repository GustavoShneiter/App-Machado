import {AgendaSchedule} from "./AgendaSchedule"
import {resolveAgendaProfessionals} from "./agendaLayout"
import {Capacitor} from "@capacitor/core"
import {CustomerLookup} from "./CustomerLookup"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CommissionFields } from "./CommissionFields";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useOperations } from "./OperationsStore";
import { useCatalog } from "./CatalogStore";
import {
  cashBalance,
  commandServiceValue,
  commandTotal,
  projectedCommandTotal,
  dateTime,
  dayKey,
  exportCsv,
  labels,
  methods,
  money,
  summarize,
  type Appointment,
  type Command,
  type Customer,
  type Operations,
  type Product,
  type ScheduleBlock,
} from "./operations";
import { uploadCatalogPhoto } from "./media";
import {
  CalendarDays, ChevronLeft, ChevronRight, SlidersHorizontal, List, CalendarRange,
  ChevronDown,
  Gift,
  History,
  MessageCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import { registerDismissibleLayer } from "./dismissibleLayers";
import { AgendaCreateModal } from './AgendaScheduling';
import { AgendaDatePicker } from './AgendaDatePicker';
import { agendaTimesForDay, hoursForDay, recurringForDay, timeMinutes } from './schedule';
import { ApprovedCashView } from './ApprovedCashView';
import { ApprovedHome } from './ApprovedHome';
import { AgentContactConsent } from './AgentWhatsApp';

export function Page({
  title,
  text,
  action,
  children,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h2>{title}</h2>
          {text && <p>{text}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef(close);
  const dialogRef = useRef<HTMLElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [validationError, setValidationError] = useState("");
  closeRef.current = close;

  useEffect(() => registerDismissibleLayer(() => closeRef.current()), []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      layerRef.current?.style.setProperty('--dialog-height', `${viewport?.height ?? window.innerHeight}px`);
      layerRef.current?.style.setProperty('--dialog-top', `${viewport?.offsetTop ?? 0}px`);
      const active = document.activeElement;
      if (active instanceof HTMLElement && dialogRef.current?.contains(active)) active.scrollIntoView({ block: 'nearest' });
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    return () => { viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize); };
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = focusable(); const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); document.body.style.overflow = previousOverflow; if (previous?.isConnected) previous.focus(); };
  }, []);

  const content = (
    <div ref={layerRef} className="app-shell machado-ui modal-layer"><div
      className="modal-backdrop"
      onClick={() => closeRef.current()}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); closeRef.current(); }
      }}
    >
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onInvalidCapture={(event) => {
          event.preventDefault();
          const input = event.target;
          if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement) {
            if (dialogRef.current?.querySelector('input:invalid, select:invalid, textarea:invalid') !== input) return;
            setValidationError(`${input.closest('label')?.querySelector('span')?.textContent ?? 'Campo'}: ${input.validationMessage}`);
            input.focus();
            input.scrollIntoView({ block: 'nearest' });
          }
        }}
        onInputCapture={() => setValidationError("")}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="outline small" onClick={() => closeRef.current()}>
            Fechar
          </button>
        </div>
        {validationError && <p className="form-error modal-validation" role="alert">{validationError}</p>}
        {children}
      </section>
    </div></div>
  );
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
function Metrics({ entries }: { entries: [string, string | number][] }) {
  return (
    <div className="stats-grid">
      {entries.map(([label, value]) => (
        <article className="stat-card" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </article>
      ))}
    </div>
  );
}
function Method({ value, set }: { value: string; set: (v: string) => void }) {
  return (
    <fieldset className="payment-methods">
      <legend>Recebimento</legend>
      <div>
        {Object.entries(methods).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={value === key ? "selected" : ""}
            onClick={() => set(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
function commandPackage(state: Operations, command: Command) {
  const items = state.items.filter(
    (item) => item.command_id === command.id && item.service_id,
  );
  const itemIds = new Set(items.map((item) => item.id));
  const redemption = state.packageRedemptions.find((entry) =>
    itemIds.has(entry.command_item_id),
  );
  if (redemption)
    return {
      name: redemption.package_name,
      service:
        items.find((item) => item.id === redemption.command_item_id)
          ?.description ?? "Serviço",
      remaining: null as number | null,
      redeemed: true,
      sessionValue: (()=>{const sale=state.packageSales.find(s=>s.id===redemption.sale_id);return sale?Math.round(sale.amount_cents/sale.balances.reduce((sum,b)=>sum+b.total,0)):null})(),
    };
  for (const sale of state.packageSales.filter(
    (entry) =>
      entry.customer_id === command.customer_id && entry.status === "active",
  )) {
    const balance = sale.balances.find(
      (entry) =>
        entry.remaining > 0 &&
        items.some((item) => item.service_id === entry.service_id),
    );
    if (balance)
      return {
        name: sale.package_name,
        service: balance.service_name,
        remaining: balance.remaining,
        redeemed: false,
        sessionValue:Math.round(sale.amount_cents/sale.balances.reduce((sum,b)=>sum+b.total,0)),
      };
  }
  return null;
}
export function EmptyState({
  children = "Nenhum registro neste período.",
}: {
  children?: ReactNode;
}) {
  return <p className="empty">{children}</p>;
}
const Empty = EmptyState;
export function AppointmentIdentity({
  appointment: a,
}: {
  appointment: Appointment;
}) {
  return (
    <div className="appointment-identity">
      <strong>
        {a.customer_name}{" "}
        <span className="professional-label">· {a.professional_name}</span>
      </strong>
      <span>
        {a.service_name} · {money(a.expected_price_cents)}
      </span>
      <small>
        {dateTime(a.starts_at)} · {labels[a.status] ?? a.status}{a.source==='whatsapp_agent'?' · WhatsApp':''}
      </small>
    </div>
  );
}

export function Dashboard() { return <ApprovedHome />; }

export function AppointmentModal({
  close,
  initialDate = dayKey(),
  initialTime = "",
  initialProfessional = "",
  fitIn = false,
}: {
  close: () => void;
  initialDate?: string;
  initialTime?: string;
  initialProfessional?: string;
  fitIn?: boolean;
}) {
  const { services, professionals } = useCatalog();
  const { data:operations, run, busy, error } = useOperations();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [customerId,setCustomerId]=useState('');
  const selectedCustomer=operations.customers.find(c=>c.id===customerId);
  const [service, setService] = useState(
    services.find((s) => s.ativo)?.id ?? "",
  );
  const [professional, setProfessional] = useState(
    initialProfessional || professionals.find((p) => p.ativo)?.id || "",
  );
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const workHours=useMemo(()=>hoursForDay(operations.businessHours,date),[operations.businessHours,date]);
  const openTime=workHours[0]?.opens_at.slice(0,5),closeTime=workHours[workHours.length-1]?.closes_at.slice(0,5);
  const [price, setPrice] = useState(
    String(services.find((s) => s.id === service)?.preco ?? 0),
  );
  const [duration, setDuration] = useState(services.find(s => s.id === service)?.duracao ?? 40);
  useEffect(() => { if (!service) { const first=services.find(item=>item.ativo); if(first){setService(first.id);setDuration(first.duracao);setPrice(String(first.preco))} } }, [service,services]);
  useEffect(() => { if (!professional) setProfessional(professionals.find(item=>item.ativo)?.id??'') }, [professional,professionals]);
  // Manual scheduling uses the unit's working hours, including past dates and
  // blocked periods. The server remains authoritative for concurrent bookings.
  const slots = useMemo(() => {
    if (fitIn || !service || !professional) return [];
    const minutes=services.find(item=>item.id===service)?.duracao??duration;
    return agendaTimesForDay(operations.businessHours,date,operations.slotIntervalMinutes).map(slotTime=>{
      const start=Date.parse(`${date}T${slotTime}:00-03:00`),end=start+minutes*60000;
      const within=workHours.some(hour=>timeMinutes(slotTime)>=timeMinutes(hour.opens_at)&&end<=Date.parse(`${date}T${hour.closes_at.slice(0,5)}:00-03:00`));
      const occupied=operations.appointments.some(item=>item.professional_id===professional&&!['cancelled','no_show'].includes(item.status)&&Date.parse(item.starts_at)<end&&Date.parse(item.ends_at)>start);
      return {time:slotTime,available:within&&!occupied,within};
    }).filter(slot=>slot.within);
  },[date,duration,fitIn,operations.appointments,operations.businessHours,operations.slotIntervalMinutes,professional,service,services,workHours]);
  const selectedSlotAvailable=fitIn||slots.some(slot=>slot.time===time&&slot.available);
  const nextSlot=slots.find(slot=>slot.available&&Date.parse(`${date}T${slot.time}:00-03:00`)>=Date.now())?.time;
  return (
    <Modal title={fitIn ? 'Criar encaixe' : 'Novo agendamento'} close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run("create_appointment", {
              name,
              phone,
              ...(selectedCustomer?{customer_id:selectedCustomer.id}:{}),
              professional_id: professional,
              service_id: service,
              starts_at: `${date}T${time}:00-03:00`,
              amount: Math.round(Number(price) * 100),
              fit_in: fitIn,
              duration,
            })
          )
            close();
        }}
      >
        <div className="form-grid">
          <CustomerLookup customers={operations.customers} name={name} selected={selectedCustomer} onName={value=>{setName(value);if(customerId)setPhone('');setCustomerId('')}} onSelect={customer=>{setCustomerId(customer.id);setName(customer.name);setPhone(customer.phone)}} onClear={()=>{setCustomerId('');setName('');setPhone('')}}/>
          <label className="field">
            <span>WhatsApp</span>
            <input
              required={!selectedCustomer}
              readOnly={Boolean(selectedCustomer)}
              type="tel"
              placeholder={selectedCustomer?'Sem WhatsApp cadastrado':'WhatsApp do cliente'}
              minLength={selectedCustomer?undefined:10}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Profissional</span>
            <select
              required
              aria-label="Profissional"
              value={professional}
              onChange={(e) => setProfessional(e.target.value)}
            >
              <option value="">Selecione</option>
              {professionals
                .filter((p) => p.ativo)
                .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.nome}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Serviço</span>
            <select
              required
              aria-label="Serviço"
              value={service}
              onChange={(e) => {
                setService(e.target.value);
                setDuration(services.find(s => s.id === e.target.value)?.duracao ?? 40);
                setPrice(
                  String(
                    services.find((s) => s.id === e.target.value)?.preco ?? 0,
                  ),
                );
              }}
            >
              <option value="">Selecione</option>
              {services
                .filter((s) => s.ativo)
                .map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.nome}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Data</span>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Valor (R$)</span>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
        </div>
        {fitIn ? <><div className="schedule-time-pair"><label className="field"><span>Horário do encaixe</span><input type="time" min={openTime} max={closeTime} disabled={!workHours.length} required value={time} onChange={event => setTime(event.target.value)} /></label><label className="field"><span>Duração do encaixe (minutos)</span><input type="number" min="5" max="480" required value={duration} onChange={event => setDuration(Number(event.target.value))} /></label></div><p className="form-hint">{workHours.length?`Funcionamento: ${openTime} às ${closeTime}. O atendimento precisa terminar até o fechamento.`:'Barbearia fechada neste dia. Escolha outra data.'}</p></> : <div className="admin-slot-picker">
          <span>Horário</span>
          <>
            {nextSlot && <button type="button" className="next-free-slot" onClick={() => setTime(nextSlot)}>Próximo horário livre: {nextSlot}</button>}
            <div className="slot-grid">
              {slots.map((slot) => (
                <button
                  type="button"
                  key={slot.time}
                  disabled={!slot.available}
                  className={`${time === slot.time ? "selected" : ""} ${!slot.available ? "unavailable" : ""}`}
                  onClick={() => setTime(slot.time)}
                >
                  {slot.time}
                  {!slot.available && <small>Ocupado</small>}
                </button>
              ))}
            </div>
          </>
        </div>}
        {!fitIn && time && !selectedSlotAvailable && <p className="form-hint">Este horário já tem atendimento. Para colocar outro atendimento no mesmo horário, escolha Criar encaixe.</p>}
        {!fitIn &&
          professional &&
          service &&
          !slots.some((slot) => slot.available) && (
            <p className="form-hint">
              Não há horário livre para esse profissional e serviço nesta data.
            </p>
          )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button disabled={busy || !time || !workHours.length || !selectedSlotAvailable} className="primary">
          {busy ? "Salvando…" : "Salvar agendamento"}
        </button>
      </form>
    </Modal>
  );
}

export function Agenda({ professionalOnly = false }: { professionalOnly?: boolean } = {}) {
  const { data, run, busy, error } = useOperations();
  const { professionals } = useCatalog();
  const navigate = useNavigate();
  const [date, setDate] = useState(dayKey());
  const [professional, setProfessional] = useState("");
  const multi=!professionalOnly&&!Capacitor.isNativePlatform();
  const [selected,setSelected]=useState<string[]|null>(null),[choosingProfessionals,setChoosingProfessionals]=useState(false),[slotProfessional,setSlotProfessional]=useState('');
  const [focused, setFocused] = useState<Appointment | null>(null);
  const [focusedBlock, setFocusedBlock] = useState<ScheduleBlock | null>(null);
  const [slotChoice, setSlotChoice] = useState("");
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [view, setView] = useState('list'), [filtersOpen, setFiltersOpen] = useState(false), [search, setSearch] = useState('');
  useEffect(() => { const open = () => {setSlotProfessional('');setSlotChoice('new')}; window.addEventListener('agenda:create',open); return () => window.removeEventListener('agenda:create',open); }, []);
  const [confirmation, setConfirmation] = useState<{
    appointment: Appointment;
    status: string;
  } | null>(null);
  const [removing, setRemoving] = useState<Appointment | null>(null);
  const [actualPrice, setActualPrice] = useState("");
  const activeProfessionals = professionals.filter((item) => item.ativo);
  useEffect(() => {
    if (
      activeProfessionals.length &&
      !activeProfessionals.some((item) => item.id === professional)
    )
      setProfessional(activeProfessionals.find(p=>selected?.includes(p.id))?.id??activeProfessionals[0].id);
  }, [activeProfessionals, professional, selected]);
  const selectedIds=multi?resolveAgendaProfessionals(selected,activeProfessionals.map(p=>p.id),professional):[professional];
  const selectedProfessionals=activeProfessionals.filter(p=>selectedIds.includes(p.id));
  const toggleProfessional=(id:string)=>{
    const next=selectedIds.includes(id)?selectedIds.filter(value=>value!==id):[...selectedIds,id];
    if(!next.length)return;
    setSelected(next);setProfessional(next[0]);if(next.length>1)setView('grid');
  };
  const selectedDate = new Date(`${date}T12:00:00-03:00`);
  const weekStart = new Date(selectedDate);
  weekStart.setDate(selectedDate.getDate() - (selectedDate.getDay()+6)%7);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return {
      key: dayKey(day),
      label: day
        .toLocaleDateString("pt-BR", { weekday: "short" })
        .replace(".", ""),
      number: day.getDate(),
    };
  });
  const calendarRows = data.appointments
    .filter(
      (a) =>
        a.status !== "cancelled" &&
        dayKey(a.starts_at) === date &&
        (multi?selectedIds.includes(a.professional_id):!professional||a.professional_id===professional),
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const rows=calendarRows.filter(a=>!search||[a.customer_name,a.service_name,a.professional_name].some(v=>v.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))));
  const dayStart = new Date(date+'T00:00:00-03:00').getTime();
  const dayEnd = dayStart+86400000;
  const dayBlocks = [...data.blocks,...recurringForDay(data.recurringBlocks ?? [],date)]
    .filter(block => new Date(block.starts_at).getTime()<dayEnd && new Date(block.ends_at).getTime()>dayStart && (multi?selectedIds.includes(block.professional_id):!professional||block.professional_id===professional))
    .sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
  const shiftDate = (amount: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + amount);
    setDate(dayKey(next));
  };
  const monthLabel = selectedDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const workHours=hoursForDay(data.businessHours,date),closed=!workHours.length;
  const nextStatus = (status: string) =>
    status === "arrived"
      ? "in_service"
      : status === "in_service"
        ? "completed"
        : "arrived";
  const nextLabel = (status: string) =>
    status === "arrived"
      ? "Iniciar"
      : status === "in_service"
        ? "Pronto"
        : "Chegou";
  return (
    <section className="page agenda-page">
      <header className="approved-agenda-heading"><h1>{professionalOnly?'Minha Agenda':'Agenda'}</h1><button className="text-action" onClick={()=>setFiltersOpen(true)}><SlidersHorizontal size={17}/>Filtro</button></header>
      <section className="agenda-daybar" aria-label="Navegação por semana"><button aria-label="Semana anterior" onClick={()=>shiftDate(-7)}><ChevronLeft size={20}/></button><button className="agenda-week-picker" aria-label="Semana selecionada: escolher mês e ano" aria-haspopup="dialog" onClick={()=>setCalendarOpen(true)}><CalendarDays size={18}/><strong>{monthLabel}</strong><ChevronDown size={15}/></button><button aria-label="Próxima semana" onClick={()=>shiftDate(7)}><ChevronRight size={20}/></button></section>
      <section className="agenda-week" aria-label="Dias da semana">{weekDays.map(day=><button type="button" className={date===day.key?'active':''} aria-pressed={date===day.key} key={day.key} onClick={()=>setDate(day.key)}><small>{day.label}</small><strong>{day.number}</strong></button>)}</section>
      {!professionalOnly&&<section className="agenda-professionals" aria-label="Selecionar profissional">{activeProfessionals.map(item=><button key={item.id} type="button" className={selectedIds.includes(item.id)?'active':''} aria-pressed={selectedIds.includes(item.id)} onClick={()=>multi?toggleProfessional(item.id):setProfessional(item.id)}>{item.foto_url?<img src={item.foto_url} alt=""/>:<span>{item.iniciais||item.nome.slice(0,2).toUpperCase()}</span>}<small>{item.nome}</small></button>)}</section>}
      {multi&&<div className="agenda-team-toolbar"><span>{selectedIds.length} {selectedIds.length===1?'profissional selecionado':'profissionais selecionados'}</span><button className="text-action" onClick={()=>setChoosingProfessionals(true)}>Selecionar profissionais</button></div>}
      {closed&&<p className="form-note" role="status">Barbearia fechada neste dia. Os agendamentos existentes continuam disponíveis para consulta.</p>}
      <div className="agenda-list-toolbar"><span>{rows.length} agendamentos</span><div role="group" aria-label="Visualização da agenda"><button aria-label="Lista" aria-pressed={view==='list'} onClick={()=>setView('list')}><List size={18}/></button><button aria-label="Grade de horários" aria-pressed={view==='grid'} onClick={()=>setView('grid')}><CalendarRange size={18}/></button></div></div>
      {view==='list'&&<div className="approved-agenda-list">{rows.map(a=><button className="agenda-list-row" key={a.id} onClick={()=>setFocused(a)}><span className="agenda-list-time"><b>{new Date(a.starts_at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}</b><small>{Math.round((Date.parse(a.ends_at)-Date.parse(a.starts_at))/60000)} min</small></span><span className="agenda-list-person"><strong>{a.customer_name}</strong><small><b>{a.professional_name}</b> · {a.service_name}</small>{data.packageSales.some(s=>s.customer_id===a.customer_id&&s.status==='active'&&s.balances.some(b=>b.service_id===a.service_id&&b.remaining>0))&&<span className="status-tag"><Gift size={12}/> Plano</span>}<span className={'status-tag '+a.status}>{labels[a.status]??a.status}{a.is_fit_in?' · Encaixe':''}</span></span><ChevronRight size={17}/></button>)}{!rows.length&&<div className="approved-empty"><CalendarDays size={24}/><strong>Nenhum agendamento neste dia</strong><p>{closed?'A barbearia não abre neste dia. Consulte outra data.':'Crie um horário ou consulte outra data.'}</p>{!closed&&<button className="primary" onClick={()=>setSlotChoice('new')}>Novo agendamento</button>}</div>}{dayBlocks.length>0&&<details className="agenda-block-summary"><summary>{dayBlocks.length} bloqueios neste dia</summary>{dayBlocks.map(block=><button className="outline" key={block.id} onClick={()=>setFocusedBlock(block)}>{block.reason||'Agenda bloqueada'} · {dateTime(block.starts_at)}</button>)}</details>}</div>}
      {filtersOpen&&<Modal title="Filtro da agenda" close={()=>setFiltersOpen(false)}><label className="field"><span>Data</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>{multi?<button className="outline" onClick={()=>{setFiltersOpen(false);setChoosingProfessionals(true)}}>Profissionais · {selectedIds.length} selecionados</button>:!professionalOnly&&<label className="field"><span>Profissional</span><select value={professional} onChange={e=>setProfessional(e.target.value)}>{activeProfessionals.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>}<label className="field"><span>Buscar cliente ou serviço</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome do cliente ou serviço"/></label><button className="outline" onClick={()=>{setFiltersOpen(false);setBlocksOpen(true)}}>Gerenciar bloqueios</button><button className="primary" onClick={()=>setFiltersOpen(false)}>Aplicar filtros</button></Modal>}
      {choosingProfessionals&&<Modal title="Selecionar profissionais" close={()=>setChoosingProfessionals(false)}><p className="form-note">Escolha as agendas que deseja visualizar juntas. Mantenha pelo menos um profissional selecionado.</p><button className="outline" disabled={!activeProfessionals.length} onClick={()=>{setSelected(activeProfessionals.map(p=>p.id));if(activeProfessionals.length>1)setView('grid')}}>Selecionar todos</button><div className="agenda-team-options">{activeProfessionals.map(p=><label key={p.id}><input type="checkbox" checked={selectedIds.includes(p.id)} disabled={selectedIds.length===1&&selectedIds.includes(p.id)} onChange={()=>toggleProfessional(p.id)}/><span>{p.nome}</span></label>)}</div><button className="primary" onClick={()=>setChoosingProfessionals(false)}>Ver agendas</button></Modal>}
      {view==='grid'&&<AgendaSchedule date={date} businessHours={data.businessHours} slotIntervalMinutes={data.slotIntervalMinutes} columns={selectedProfessionals.map(p=>({id:p.id,name:p.nome,photo:p.foto_url}))} appointments={rows.map(a=>({...a,commandPaid:data.commands.some(c=>c.appointment_id===a.id&&c.status==='closed'),hasPlan:data.packageSales.some(s=>s.customer_id===a.customer_id&&s.status==='active'&&s.balances.some(b=>b.service_id===a.service_id&&b.remaining>0))||data.packageRedemptions.some(r=>data.items.some(i=>i.id===r.command_item_id&&data.commands.some(c=>c.id===i.command_id&&c.appointment_id===a.id)))}))} busyAppointments={calendarRows} blocks={dayBlocks} split={multi} compact={professionalOnly} chooseTime={(time,id)=>{setSlotProfessional(id);setSlotChoice(time)}} chooseBlock={setFocusedBlock} chooseAppointment={setFocused}/>}
      {calendarOpen && <AgendaDatePicker date={date} choose={setDate} close={() => setCalendarOpen(false)} />}
      {slotChoice && <AgendaCreateModal initialDate={date} initialTime={slotChoice==='new'?'':slotChoice} initialProfessional={slotProfessional||selectedIds[0]||professional} close={()=>setSlotChoice('')} manageBlocks={()=>{setSlotChoice('');setBlocksOpen(true)}} />}
      {blocksOpen && <Modal title="Bloqueios da agenda" close={()=>setBlocksOpen(false)}><div className="schedule-block-list">
        <button className="primary" onClick={()=>{setBlocksOpen(false);setSlotChoice('new')}}>Novo bloqueio ou agendamento</button>
        {(data.recurringBlocks??[]).filter(rule=>rule.professional_id===professional).map(rule=><article key={rule.id}><strong>{rule.reason||'Bloqueio recorrente'}</strong><p>{rule.weekdays.map(day=>['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][day-1]).join(', ')} · {rule.start_time.slice(0,5)}–{rule.end_time.slice(0,5)}</p><small>{rule.starts_on} até {rule.until_on||'sempre'}</small><button className="danger-button" disabled={busy} onClick={async()=>{if(window.confirm('Excluir toda esta recorrência?') )await run('delete_recurring_block',{id:rule.id})}}>Excluir recorrência</button></article>)}
        {data.blocks.filter(block=>block.professional_id===professional&&new Date(block.ends_at).getTime()>=Date.now()).map(block=><article key={block.id}><strong>{block.reason||'Agenda bloqueada'}</strong><p>{dateTime(block.starts_at)} até {dateTime(block.ends_at)}</p><button className="danger-button" disabled={busy} onClick={async()=>{if(window.confirm('Excluir este período de bloqueio?'))await run('delete_schedule_block',{id:block.id})}}>Excluir período</button></article>)}
        {error&&<p className="form-error" role="alert">{error}</p>}
      </div></Modal>}
      {focusedBlock && (
        <Modal title="Agenda bloqueada" close={() => setFocusedBlock(null)}>
          <div className="block-summary">
            <strong>
              {new Date(focusedBlock.starts_at).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit", timeZone: "America/Sao_Paulo",
              })}
              –
              {new Date(focusedBlock.ends_at).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit", timeZone: "America/Sao_Paulo",
              })}
            </strong>
            <span>{focusedBlock.reason || "Agenda bloqueada"}</span>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button
            className="danger-button"
            disabled={busy}
            onClick={async () => {
              if (window.confirm(focusedBlock.rule_id ? "Excluir toda esta recorrência?" : "Excluir este período de bloqueio?") && await run(focusedBlock.rule_id ? "delete_recurring_block" : "delete_schedule_block", { id: focusedBlock.rule_id ?? focusedBlock.id }))
                setFocusedBlock(null);
            }}
          >
            Liberar horário
          </button>
        </Modal>
      )}
      {focused && (
        <Modal title="Agendamento" close={() => setFocused(null)}>
          <AppointmentIdentity appointment={focused} />
          <div className="row-actions agenda-detail-actions">
            {data.commands.some(c=>c.appointment_id===focused.id)&&<button className="approved-secondary" onClick={()=>navigate((professionalOnly?'/profissional/atendimentos':'/admin/comandas')+'?comanda='+data.commands.find(c=>c.appointment_id===focused.id)?.id)}>Ver atendimento e pagamento</button>}
            <button className="outline" onClick={()=>{setSlotProfessional(focused.professional_id);setSlotChoice(new Date(focused.starts_at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}));setFocused(null)}}>Criar encaixe neste horário</button>
            {!["completed", "cancelled", "no_show"].includes(
              focused.status,
            ) && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  setActualPrice(String(focused.expected_price_cents / 100));
                  setFocused(null);
                  setConfirmation({
                    appointment: focused,
                    status: nextStatus(focused.status),
                  });
                }}
              >
                {nextLabel(focused.status)}
              </button>
            )}
            {![
              "arrived",
              "in_service",
              "completed",
              "cancelled",
              "no_show",
            ].includes(focused.status) && (
              <button
                className="outline"
                disabled={busy}
                onClick={() => {
                  setFocused(null);
                  setConfirmation({ appointment: focused, status: "no_show" });
                }}
              >
                Faltou
              </button>
            )}
            {(!professionalOnly || !['completed','cancelled','no_show'].includes(focused.status)) && <button
              className="danger-button"
              disabled={busy}
              onClick={() => {
                setFocused(null);
                setRemoving(focused);
              }}
            >
              {professionalOnly ? 'Cancelar agendamento' : 'Remover'}
            </button>}
          </div>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={
            confirmation.status === "completed"
              ? "Enviar para receber?"
              : confirmation.status === "no_show"
                ? "Marcar falta?"
                : confirmation.status === "in_service"
                  ? "Iniciar atendimento?"
                  : "Confirmar chegada?"
          }
          close={() => setConfirmation(null)}
        >
          <AppointmentIdentity appointment={confirmation.appointment} />
          <p>
            {confirmation.status === "completed"
              ? "A comanda ficará pronta no Caixa."
              : confirmation.status === "no_show"
                ? "Este horário será liberado."
                : confirmation.status === "in_service"
                  ? "O atendimento ficará em andamento."
                  : "O cliente ficará marcado como presente."}
          </p>
          {confirmation.status === "completed" &&
            confirmation.appointment.expected_price_cents <= 0 && (
              <label className="field">
                <span>Valor (R$)</span>
                <input
                  autoFocus
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={actualPrice}
                  onChange={(e) => setActualPrice(e.target.value)}
                />
              </label>
            )}
          {error && <p className="form-error">{error}</p>}
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              if (
                confirmation.status === "completed" &&
                confirmation.appointment.expected_price_cents <= 0 &&
                !(await run("set_price", {
                  id: confirmation.appointment.id,
                  amount: Math.round(Number(actualPrice) * 100),
                }))
              )
                return;
              if (
                await run("set_status", {
                  id: confirmation.appointment.id,
                  status: confirmation.status,
                })
              )
                setConfirmation(null);
            }}
          >
            {confirmation.status === "completed"
              ? "Enviar para Caixa"
              : confirmation.status === "no_show"
                ? "Confirmar falta"
                : confirmation.status === "in_service"
                  ? "Iniciar atendimento"
                  : "Confirmar chegada"}
          </button>
        </Modal>
      )}
      {removing && (
        <Modal title={professionalOnly ? 'Cancelar agendamento' : 'Remover agendamento'} close={() => setRemoving(null)}>
          <AppointmentIdentity appointment={removing} />
          <p>
            {professionalOnly ? 'O horário será liberado e o agendamento ficará cancelado. Alterações em atendimentos concluídos são feitas pela administração.' : 'Exclusão definitiva: o agendamento e sua comanda, pagamentos e comissões serão apagados. Esta ação não pode ser desfeita.'}
          </p>
          {error && <p className="form-error">{error}</p>}
          <button
            className="danger"
            disabled={busy}
            onClick={async () => {
              if (
                await run(professionalOnly ? "cancel_appointment" : "delete_appointment", {
                  id: removing.id,
                })
              )
                setRemoving(null);
            }}
          >
            {professionalOnly ? 'Confirmar cancelamento' : 'Excluir definitivamente'}
          </button>
        </Modal>
      )}
    </section>
  );
}

export function Customers({
  requestedNew = false,
  onRequestedNewHandled = () => {},
}: {
  requestedNew?: boolean;
  onRequestedNewHandled?: () => void;
}) {
  const { data, run, busy, error } = useOperations();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Customer | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const visible = data.customers.filter((c) =>
    `${c.name} ${c.phone}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const remove = async () => {
    if (
      !draft?.id ||
      !window.confirm(
        "Excluir definitivamente este cliente, seus agendamentos, comandas, pagamentos, comissões e planos comprados? Esta ação não pode ser desfeita.",
      )
    )
      return;
    if (await run("delete_customer", { id: draft.id })) setDraft(null);
  };
  const freshCustomer = (): Customer => ({
    id: "",
    name: "",
    phone: "",
    email: "",
    birth_date: "",
    notes: "",
  });
  const whatsapp = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    return `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}`;
  };
  useEffect(() => {
    if (requestedNew) {
      setDraft(freshCustomer());
      onRequestedNewHandled();
    }
  }, [requestedNew, onRequestedNewHandled]);
  return (
    <Page
      title="Clientes"
      action={
        <button
          className="primary"
          onClick={() => setDraft({ id: "", name: "", phone: "", notes: "" })}
        >
          Novo cliente
        </button>
      }
    >
      <div className="management-filters customer-search">
        <label>
          Buscar cliente
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome ou telefone"
          />
        </label>
      </div>
      <section className="customer-list">
        {visible.map((c) => {
          const visits = data.appointments.filter(
            (a) => a.customer_id === c.id && a.status === "completed",
          );
          const commands = new Set(
            data.commands
              .filter((cmd) => cmd.customer_id === c.id)
              .map((cmd) => cmd.id),
          );
          const paid = data.payments
            .filter((p) => commands.has(p.command_id) && !p.reversed_at)
            .reduce((s, p) => s + p.amount_cents, 0);
          const initials = c.name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase();
          const lastVisit = visits.sort((a, b) =>
            b.starts_at.localeCompare(a.starts_at),
          )[0];
          return (
            <article className="customer-card" key={c.id}>
              <div className="customer-card-header">
                <span className="customer-avatar">{initials || "C"}</span>
                <div className="customer-card-main">
                  <strong>{c.name}</strong>
                  <small>{c.phone}</small>
                </div>
                <button className="customer-action" aria-label={`Editar ${c.name}`} onClick={()=>setDraft({...c})}><Pencil size={17}/></button>
              </div>
              <details className="customer-summary-disclosure"><summary>Histórico e informações</summary><div className="customer-summary">
                <span>
                  <small>Visitas</small>
                  <b>{visits.length}</b>
                </span>
                <span>
                  <small>Total recebido</small>
                  <b>{money(paid)}</b>
                </span>
                <span>
                  <small>Última visita</small>
                  <b>
                    {lastVisit
                      ? new Date(lastVisit.starts_at).toLocaleDateString(
                          "pt-BR",
                        )
                      : "—"}
                  </b>
                </span>
              </div><div className="customer-detail-actions"><a className="outline" aria-label={`WhatsApp de ${c.name}`} href={whatsapp(c.phone)} target="_blank" rel="noreferrer"><MessageCircle size={17}/>WhatsApp</a><button className="outline" aria-label={`Histórico de ${c.name}`} onClick={()=>setHistory(c.id)}><History size={17}/>Ver atendimentos</button></div></details>
            </article>
          );
        })}
        {!visible.length && (
          <section className="panel operation-panel">
            <Empty>Nenhum cliente encontrado.</Empty>
          </section>
        )}
      </section>
      {draft && (
        <Modal
          title={draft.id ? "Editar cliente" : "Novo cliente"}
          close={() => setDraft(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run("save_customer", { ...draft, id: draft.id || null })
              )
                setDraft(null);
            }}
          >
            <label className="field">
              <span>Nome</span>
              <input
                required
                minLength={2}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="field">
              <span>WhatsApp</span>
              <input
                required
                type="tel"
                minLength={10}
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input
                type="email"
                value={draft.email ?? ""}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Nascimento</span>
              <input
                type="date"
                value={draft.birth_date ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, birth_date: e.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Observações</span>
              <textarea
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="row-actions">
              <button className="primary" disabled={busy}>
                Salvar cliente
              </button>
              {draft.id && (
                <button
                  className="danger-button"
                  type="button"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Excluir cliente
                </button>
              )}
            </div>
          </form>
          {draft.id && <AgentContactConsent phone={draft.phone} />}
        </Modal>
      )}
      {history && (
        <Modal title="Histórico do cliente" close={() => setHistory(null)}>
          {data.appointments
            .filter((a) => a.customer_id === history)
            .map((a) => (
              <div className="record-row" key={a.id}>
                <AppointmentIdentity appointment={a} />
              </div>
            ))}
          {data.packageSales
            .filter((sale) => sale.customer_id === history)
            .map((sale) => (
              <div className="record-row" key={sale.id}>
                <div>
                  <strong>{sale.package_name}</strong>
                  <small>Pacote comprado em {dateTime(sale.sold_at)}</small>
                </div>
                <strong>{money(sale.amount_cents)}</strong>
              </div>
            ))}
          {!data.appointments.some((a) => a.customer_id === history) &&
            !data.packageSales.some((sale) => sale.customer_id === history) && (
              <Empty />
            )}
        </Modal>
      )}
    </Page>
  );
}

export function Orders({
  requestedNew = false,
  onRequestedNewHandled = () => {},
  professionalOnly = false,
}: {
  requestedNew?: boolean;
  onRequestedNewHandled?: () => void;
  professionalOnly?: boolean;
}) {
  const { data, run, busy, error } = useOperations();
  const { services, professionals } = useCatalog();
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState("");
  const [receive, setReceive] = useState("");
  const [method, setMethod] = useState("pix");
  const [details, setDetails] = useState("");
  const [commandAction, setCommandAction] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [newCommand, setNewCommand] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discount, setDiscount] = useState("0");
  const [surcharge, setSurcharge] = useState("0");
  const [editingService, setEditingService] = useState("");
  const [servicePrice, setServicePrice] = useState("0");
  const [serviceNotice,setServiceNotice]=useState("");
  const commandTeam=professionalOnly?(data.commandProfessionals??professionals.map(p=>({id:p.id,name:p.nome}))):professionals.filter(p=>p.ativo).map(p=>({id:p.id,name:p.nome}));
  const assignedId=professionalId||(professionalOnly?professionals[0]?.id:"");
  const addServices=professionalOnly?(data.commandServices??[]).filter(s=>s.professional_id===assignedId).map(s=>({id:s.id,nome:s.name,preco:s.price_cents/100,ativo:true})):services;
  const openDetails = (current: (typeof data.commands)[number]) => {
    setDetails(current.id);
    setServiceNotice("");
    setCommandAction("");
    setProductId("");
    setQuantity("1");
    setServiceId("");
    setProfessionalId("");
    setDiscount(String((current?.discount_cents ?? 0) / 100));
    setSurcharge(String((current?.surcharge_cents ?? 0) / 100));
  };
  const requestedCommand = searchParams.get("comanda") ?? "";
  const openedRequested = useRef("");
  useEffect(() => {
    const current = data.commands.find(item => item.id === requestedCommand);
    if (!requestedCommand) openedRequested.current = "";
    if (
      requestedCommand &&
      openedRequested.current !== requestedCommand &&
      current
    ) {
      openedRequested.current = requestedCommand;
      openDetails(current);
    }
  }, [requestedCommand, data.commands]);
  const selected = data.commands.find((c) => c.id === receive);
  const command = data.commands.find((c) => c.id === details);
  const visible = data.commands.filter((c) => !filter || c.status === filter);
  const products = data.products.filter((p) => p.active && p.quantity > 0);
  const statusCount = (status: string) =>
    data.commands.filter((c) => c.status === status).length;
  useEffect(() => {
    if (requestedNew) {
      setCustomerName("");
      setCustomerPhone("");
      setNewCommand(true);
      onRequestedNewHandled();
    }
  }, [requestedNew, onRequestedNewHandled]);
  return (
    <Page
      title={professionalOnly ? "Meus atendimentos" : "Comandas"}
      action={
        !professionalOnly && <button
          className="primary"
          onClick={() => {
            setCustomerName("");
            setCustomerPhone("");
            setNewCommand(true);
          }}
        >
          Nova comanda
        </button>
      }
    >
      <div className="command-filters" aria-label="Filtrar comandas">
        <button
          className={!filter ? "active" : ""}
          onClick={() => setFilter("")}
        >
          Todas <span>{data.commands.length}</span>
        </button>
        {["open", "awaiting_payment", "closed"].map((status) => (
          <button
            className={filter === status ? "active" : ""}
            onClick={() => setFilter(status)}
            key={status}
          >
            {status === "awaiting_payment" ? "Prontas" : labels[status]}{" "}
            <span>{statusCount(status)}</span>
          </button>
        ))}
      </div>
      <section className="command-list">
        {visible.map((c) => {
          const a = data.appointments.find((a) => a.id === c.appointment_id);
          const customer = data.customers.find((x) => x.id === c.customer_id);
          const itemCount = data.items
            .filter((item) => item.command_id === c.id)
            .reduce((sum, item) => sum + item.quantity, 0);
          const packageInfo = commandPackage(data, c);
          const total = projectedCommandTotal(data, c);
          return (
            <article className={`command-card ${c.status}`} key={c.id}>
              <button
                className="command-card-main"
                onClick={() => openDetails(c)}
              >
                <div className="command-card-top">
                  <span
                    className={`status ${c.status === "closed" ? "positive" : c.status === "awaiting_payment" ? "warning" : "muted"}`}
                  >
                    {c.status === "awaiting_payment"
                      ? "Pronta"
                      : labels[c.status]}
                  </span>
                  <div className="command-card-meta">
                    {packageInfo && (
                      <span
                        className={`command-plan ${packageInfo.redeemed ? "used" : ""}`}
                        title={
                          packageInfo.redeemed
                            ? "Sessão do plano utilizada"
                            : "Plano disponível"
                        }
                      >
                        <Gift size={13} />
                      </span>
                    )}
                    <small>
                      {itemCount} {itemCount === 1 ? "item" : "itens"}
                    </small>
                  </div>
                </div>
                <strong>
                  {c.attendee_name ?? a?.customer_name ?? customer?.name ?? "Cliente"}
                </strong>
                <p>
                  {[data.items.filter(item=>item.command_id===c.id).map(item=>item.description).join(", ")||a?.service_name,commandTeam.find(p=>p.id===c.professional_id)?.name??a?.professional_name].filter(Boolean).join(" · ")||"Atendimento de balcão"}
                </p>
              </button>
              <div className="command-card-footer">
                <div className="command-card-value">
                  <strong>{money(packageInfo ? commandServiceValue(data,c) : total)}</strong>
                  {packageInfo&&<small>{packageInfo.redeemed?'Sessão do plano':'Plano disponível'} · {money(total)} a receber</small>}
                </div>
                <div>
                  {c.status === "open" && a && (
                    <Link className="outline small" to={professionalOnly?'/profissional/agenda':'/admin/agenda'}>
                      Atender
                    </Link>
                  )}
                  {c.status === "awaiting_payment" && (
                    <button
                      className="primary small"
                      onClick={() => setReceive(c.id)}
                    >
                      {packageInfo?.redeemed && total === 0
                        ? "Concluir"
                        : "Receber"}
                    </button>
                  )}
                  <button
                    className="text-button"
                    onClick={() => openDetails(c)}
                  >
                    Itens
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {!visible.length && (
          <section className="panel operation-panel">
            <Empty>Nenhuma comanda neste status.</Empty>
          </section>
        )}
      </section>
      {newCommand && (
        <Modal title="Nova comanda" close={() => setNewCommand(false)}>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await run("open_manual_command", {
                  name: customerName,
                  phone: customerPhone,
                })
              )
                setNewCommand(false);
            }}
          >
            <p className="form-hint">
              Informe o cliente para abrir o atendimento. Se ele já existir pelo
              WhatsApp, o cadastro será reaproveitado.
            </p>
            <label className="field">
              <span>Cliente</span>
              <input
                autoFocus
                required
                minLength={2}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </label>
            <label className="field">
              <span>WhatsApp</span>
              <input
                required
                type="tel"
                minLength={10}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary" disabled={busy}>
              {busy ? "Abrindo…" : "Abrir comanda"}
            </button>
          </form>
        </Modal>
      )}
      {selected &&
        (() => {
          const total = commandTotal(data, selected);
          const packageInfo = commandPackage(data, selected);
          const planOnly = packageInfo?.redeemed && total === 0;
          return (
            <Modal
              title={planOnly ? "Concluir pelo plano" : "Registrar recebimento"}
              close={() => setReceive("")}
            >
              <p>
                Total: <strong>{money(total)}</strong>
              </p>
              {planOnly ? (
                <div className="command-package used">
                  <Gift />
                  <div>
                    <strong>Sessão coberta pelo plano</strong>
                    <small>
                      {packageInfo.name} · {packageInfo.service}
                    </small>
                  </div>
                </div>
              ) : (
                <Method value={method} set={setMethod} />
              )}
              {error && <p className="form-error">{error}</p>}
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  const action = planOnly ? "close_package_command" : "receive";
                  if (await run(action, { id: receive, method, ...(professionalOnly ? { expected_total: total } : {}) }))
                    setReceive("");
                }}
              >
                {planOnly ? "Concluir sem cobrança" : "Confirmar pagamento"}
              </button>
            </Modal>
          );
        })()}
      {command &&
        (() => {
          const appointment = data.appointments.find(
            (a) => a.id === command.appointment_id,
          );
          const manualOpen =
            command.status === "open" && !command.appointment_id;
          const canEdit = ["open", "awaiting_payment"].includes(command.status);
          const itemEditable = (item: (typeof data.items)[number]) =>
            canEdit && !data.packageRedemptions.some(row => row.command_item_id === item.id)
            && !(command.status === "open" && item.type === "service" && item.service_id === appointment?.service_id);
          const items = data.items.filter(
            (item) => item.command_id === command.id,
          );
          const packageInfo = commandPackage(data, command);
          const total = projectedCommandTotal(data, command);
          const serviceValue = commandServiceValue(data,command);
          return (
            <Modal title="Comanda" close={() => setDetails("")}>
              {command.status==='closed'&&<button className="outline" disabled={busy} onClick={async()=>{if(window.confirm('Reabrir para editar? O recebimento anterior será estornado no caixa aberto, preservando o histórico. Após editar, registre novamente o pagamento.'))await run('reopen_command',{id:command.id})}}>Reabrir comanda</button>}
              {serviceNotice && <p className="sheet-notice" role="status">{serviceNotice}</p>}
              <div className="command-detail-head">
                <div>
                  <span className="badge">
                    {command.status === "awaiting_payment"
                      ? "Pronta para receber"
                      : labels[command.status]}
                  </span>
                  <p>
                    {appointment
                      ? `${appointment.customer_name} · ${appointment.professional_name}`
                      : [command.attendee_name??data.customers.find(c=>c.id===command.customer_id)?.name,commandTeam.find(p=>p.id===command.professional_id)?.name].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="command-detail-total"><strong>{money(packageInfo?serviceValue:total)}</strong><small>{packageInfo?`Valor do atendimento · ${money(total)} a receber`:'A receber'}</small></div>
              </div>
              {packageInfo && (
                <div
                  className={`command-package ${packageInfo.redeemed ? "used" : ""}`}
                >
                  <Gift />
                  <div>
                    <strong>
                      {packageInfo.redeemed
                        ? "Sessão utilizada no plano"
                        : "Plano disponível para este serviço"}
                    </strong>
                    <small>
                      {packageInfo.name} · {packageInfo.service}
                      {packageInfo.sessionValue!==null?` · ${money(packageInfo.sessionValue)} por sessão`:''}
                      {packageInfo.remaining !== null
                        ? ` · ${packageInfo.remaining} restante${packageInfo.remaining === 1 ? "" : "s"}`
                        : ""}
                    </small>
                  </div>
                </div>
              )}
              {canEdit && (
                <div
                  className={professionalOnly ? "command-quick-actions professional-command-actions" : "command-quick-actions"}
                  aria-label="Ações da comanda"
                >
                  <button
                    type="button"
                    className={
                      commandAction === "product" ? "active product" : "product"
                    }
                    onClick={() =>
                      setCommandAction(
                        commandAction === "product" ? "" : "product",
                      )
                    }
                  >
                    + produto
                  </button>
                  <button
                    type="button"
                    className={
                      commandAction === "service" ? "active service" : "service"
                    }
                    onClick={() =>
                      setCommandAction(
                        commandAction === "service" ? "" : "service",
                      )
                    }
                  >
                    + serviço
                  </button>
                  <button
                    type="button"
                    className="payment"
                    disabled={command.status !== "awaiting_payment"}
                    onClick={() => {
                      setDetails("");
                      setReceive(command.id);
                    }}
                  >
                    + pagamento
                  </button>
                  <button
                    type="button"
                    className={
                      commandAction === "discount"
                        ? "active discount"
                        : "discount"
                    }
                    onClick={() =>
                      setCommandAction(
                        commandAction === "discount" ? "" : "discount",
                      )
                    }
                  >
                    + desconto
                  </button>
                  <button
                    type="button"
                    className={commandAction === "tip" ? "active tip" : "tip"}
                    onClick={() =>
                      setCommandAction(commandAction === "tip" ? "" : "tip")
                    }
                  >
                    + gorjeta
                  </button>
                  <button
                    type="button"
                    className="delete"
                    aria-label="Excluir comanda"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        window.confirm(
                          professionalOnly ? "Excluir esta comanda e seu agendamento? Os produtos voltarão ao estoque. O cadastro do cliente será mantido." : "Excluir definitivamente esta comanda, seu agendamento, pagamentos e comissões? Esta ação não pode ser desfeita.",
                        ) &&
                        (await run("delete_command", { id: command.id }))
                      )
                        setDetails("");
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
              <section className="command-items">
                {items.map((item) => (
                  <div key={item.id}>
                    <span>
                      {item.description} <small>× {item.quantity}</small>
                    </span>
                    <strong>
                      {money(item.unit_price_cents * item.quantity)}
                    </strong>
                    {professionalOnly && itemEditable(item) && item.type === 'service' && <button className="text-button" type="button" disabled={busy} onClick={()=>{setEditingService(item.id);setServiceId(item.service_id??'');setServicePrice(String(item.unit_price_cents/100));setCommandAction('edit-service')}}>Editar serviço</button>}
                    {(manualOpen || (professionalOnly && itemEditable(item))) && (
                      <button
                        className="text-button danger-text"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run("remove_command_item", { id: item.id, command_id: command.id })
                        }
                      >
                        Remover
                      </button>
                    )}
                  </div>
                ))}
                {!items.length && (
                  <Empty>Inclua serviços ou produtos para continuar.</Empty>
                )}
              </section>
              {professionalOnly && (command.discount_cents > 0 || command.surcharge_cents > 0) && <div className="command-items">
                {command.discount_cents > 0 && <div><span>Desconto</span><strong>− {money(command.discount_cents)}</strong></div>}
                {command.surcharge_cents > 0 && <div><span>Gorjeta</span><strong>+ {money(command.surcharge_cents)}</strong></div>}
              </div>}
              {professionalOnly && command.status === 'open' && appointment && <p className="form-hint">Finalize o atendimento para editar o serviço originalmente agendado ou registrar o pagamento.</p>}
              {professionalOnly && command.status === 'closed' && <p className="form-hint">Pagamento registrado. Este atendimento também está pago na gestão. O repasse da comissão é registrado separadamente pela gestão.</p>}
              {professionalOnly && canEdit && commandAction === 'edit-service' && <form className="command-product-form" onSubmit={async event=>{event.preventDefault();if(await run('edit_command_service',{command_id:command.id,item_id:editingService,service_id:serviceId,amount:Math.round(Number(servicePrice)*100)}))setCommandAction('')}}>
                <h3>Editar serviço realizado</h3>
                <label className="field"><span>Serviço</span><select required value={serviceId} onChange={event=>{setServiceId(event.target.value);setServicePrice(String(services.find(s=>s.id===event.target.value)?.preco??0))}}><option value="">Escolha um serviço</option>{services.filter(s=>s.ativo).map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
                <label className="field"><span>Valor (R$)</span><input required type="number" min="0" max="1000000" step="0.01" value={servicePrice} onChange={event=>setServicePrice(event.target.value)}/></label>
                <button className="primary" disabled={busy}>{busy?'Salvando…':'Salvar serviço'}</button>
                <button className="outline" type="button" disabled={busy} onClick={()=>setCommandAction('')}>Cancelar edição</button>
              </form>}
              {canEdit && commandAction === "service" && (
                <form
                  className="command-product-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (
                      await run("add_command_service", {
                        command_id: command.id,
                        service_id: serviceId,
                        ...(professionalOnly?{assigned_professional_id:assignedId}:{professional_id:assignedId}),
                      })
                    ) {
                      setServiceNotice(assignedId!==command.professional_id && command.professional_id ? "Serviço incluído na agenda e na comanda de "+commandTeam.find(p=>p.id===assignedId)?.name+"." : "Serviço adicionado à comanda.");
                      setServiceId("");
                      setProfessionalId("");
                      setCommandAction("");
                    }
                  }}
                >
                  <h3>Adicionar serviço</h3>
                  <label className="field"><span>Profissional que fará o serviço</span><select required value={assignedId} onChange={event=>{setProfessionalId(event.target.value);setServiceId("")}}><option value="">Escolha um profissional</option>{commandTeam.map(pro=><option key={pro.id} value={pro.id}>{pro.name}</option>)}</select></label>
                  {assignedId && command.professional_id && assignedId!==command.professional_id && <p className="form-hint">O serviço aparecerá na agenda e na comanda desse profissional, no mesmo horário de início do atendimento original, mesmo que ele já tenha outro atendimento.</p>}
                  <label className="field">
                    <span>Serviço</span>
                    <select
                      required
                      value={serviceId}
                      onChange={(e) => setServiceId(e.target.value)}
                    >
                      <option value="">Escolha um serviço</option>
                      {addServices
                        .filter((service) => service.ativo)
                        .map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.nome} ·{" "}
                            {money(Math.round(service.preco * 100))}
                          </option>
                        ))}
                    </select>
                  </label>

                  <button
                    className="outline"
                    disabled={busy || !serviceId || !assignedId}
                  >
                    Adicionar serviço
                  </button>
                  {professionalOnly && <button className="outline" type="button" disabled={busy} onClick={()=>setCommandAction('')}>Cancelar</button>}
                </form>
              )}
              {canEdit && commandAction === "product" && (
                <form
                  className="command-product-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (
                      await run("add_command_product", {
                        command_id: command.id,
                        product_id: productId,
                        quantity: Number(quantity),
                        professional_id: professionalOnly ? professionals[0]?.id : professionalId,
                      })
                    ) {
                      setProductId("");
                      setQuantity("1");
                      setCommandAction("");
                    }
                  }}
                >
                  <h3>Adicionar produto</h3>
                  {products.length ? (
                    <>
                      <label className="field">
                        <span>Produto</span>
                        <select
                          required
                          value={productId}
                          onChange={(e) => setProductId(e.target.value)}
                        >
                          <option value="">Escolha um produto</option>
                          {products.map((product) => (
                            <option value={product.id} key={product.id}>
                              {product.name} · {money(product.sale_price_cents)}{" "}
                              · {product.quantity} un.
                            </option>
                          ))}
                        </select>
                      </label>
                      {!professionalOnly && <label className="field">
                        <span>Profissional responsável pela venda</span>
                        <select required value={professionalId} onChange={event => setProfessionalId(event.target.value)}>
                          <option value="">Escolha um profissional</option>
                          {professionals.filter(pro => pro.ativo).map(pro => <option key={pro.id} value={pro.id}>{pro.nome}</option>)}
                        </select>
                      </label>}
                      <label className="field">
                        <span>Quantidade</span>
                        <input
                          required
                          min="1"
                          type="number"
                          step="1"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                        />
                      </label>
                      <button className="outline" disabled={busy || !productId || (!professionalOnly && !professionalId)}>
                        Adicionar produto
                      </button>
                    </>
                  ) : (
                    <p className="form-hint">
                      Não há produto ativo com estoque disponível.
                    </p>
                  )}
                </form>
              )}
              {canEdit &&
                commandAction === "discount" &&
                items.length > 0 &&
                total > 0 && (
                  <form
                    className="command-adjustments"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (
                        await run("set_command_adjustments", {
                          command_id: command.id,
                          discount: Math.round(Number(discount) * 100),
                          ...(!professionalOnly && { surcharge: Math.round(Number(surcharge) * 100) }),
                        })
                      )
                        setCommandAction("");
                    }}
                  >
                    <h3>Aplicar desconto</h3>
                    <div>
                      <label className="field">
                        <span>Desconto (R$)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={discount}
                          onChange={(event) => setDiscount(event.target.value)}
                        />
                      </label>
                    </div>
                    <button className="outline" disabled={busy}>
                      Aplicar desconto
                    </button>
                  </form>
                )}
              {canEdit && commandAction === "tip" && items.length > 0 && (
                <form
                  className="command-adjustments"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (
                      await run("set_command_adjustments", {
                        command_id: command.id,
                        ...(!professionalOnly && { discount: Math.round(Number(discount) * 100) }),
                        surcharge: Math.round(Number(surcharge) * 100),
                      })
                    )
                      setCommandAction("");
                  }}
                >
                  <h3>Adicionar gorjeta</h3>
                  <div>
                    <label className="field">
                      <span>Gorjeta (R$)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={surcharge}
                        onChange={(event) => setSurcharge(event.target.value)}
                      />
                    </label>
                  </div>
                  <button className="outline" disabled={busy}>
                    Aplicar gorjeta
                  </button>
                </form>
              )}
              {manualOpen && (
                <button
                  className="primary"
                  disabled={busy || !items.length}
                  onClick={async () => {
                    if (
                      await run("mark_command_ready", {
                        command_id: command.id,
                      })
                    )
                      setDetails("");
                  }}
                >
                  Pronta para receber
                </button>
              )}
              {command.status === "open" && appointment && (
                <button
                  className="primary command-finalize"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await run("set_status", {
                        id: appointment.id,
                        status: "completed",
                      }) && !professionalOnly
                    )
                      setDetails("");
                  }}
                >
                  Finalizar atendimento
                </button>
              )}
              {command.status === "awaiting_payment" && (!professionalOnly || !commandAction) && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    setDetails("");
                    setReceive(command.id);
                  }}
                >
                  {packageInfo?.redeemed && total === 0
                    ? "Concluir com plano"
                    : professionalOnly ? "Receber pagamento" : "Receber no Caixa"}
                </button>
              )}
              {error && <p className="form-error">{error}</p>}
            </Modal>
          );
        })()}
    </Page>
  );
}

export function CashManagement({
  requestedNew = false,
  onRequestedNewHandled = () => {},
}: {
  requestedNew?: boolean;
  onRequestedNewHandled?: () => void;
}) {
  const { data, run, busy, error } = useOperations();
  const [dialog, setDialog] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState("cash");
  const [type, setType] = useState("expense");
  const [professionalId, setProfessionalId] = useState("");
  const [entryIds, setEntryIds] = useState<string[]>([]);
  const [receive, setReceive] = useState("");
  const active = data.sessions.find(s => !s.closed_at);
  const pending = data.commissions.filter(e => e.status === 'pending' && e.commission_cents > 0);
  const payment = data.commands.find((c) => c.id === receive);
  const openDialog = (value: string) => {
    setDialog(value);
    setAmount("");
    setNotes("");
    setMethod("cash");
  };
  useEffect(() => {
    if (requestedNew) {
      openDialog(active ? "move" : "open");
      onRequestedNewHandled();
    }
  }, [requestedNew, active, onRequestedNewHandled]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const action =
      dialog === "open"
        ? "open_cash"
        : dialog === "close"
          ? "close_cash"
          : dialog === "pay"
            ? "pay_commissions"
            : "move_cash";
    if (
      await run(action, {
        id: dialog === "pay" ? professionalId : active?.id,
        amount: Math.round(Number(amount) * 100),
        method,
        type,
        notes,
        entries: entryIds,
      })
    )
      setDialog("");
  };
  return (
    <Page title="Caixa" action={<span className={'cash-state '+(active?'open':'closed')}>{active?'Aberto':'Fechado'}</span>}>
      <ApprovedCashView receive={id=>{setMethod('pix');setReceive(id)}} pay={(id,entries)=>{setProfessionalId(id);setEntryIds(entries);openDialog('pay')}} open={openDialog}/>
      {dialog && (
        <Modal
          title={
            {
              open: "Abrir caixa",
              close: "Fechar caixa",
              move: "Novo lançamento",
              pay: "Registrar repasse",
            }[dialog] ?? ""
          }
          close={() => setDialog("")}
        >
          <form onSubmit={submit}>
            {dialog === "pay" ? (
              <p>
                Confirmar o pagamento de{" "}
                {money(
                  pending
                    .filter((e) => entryIds.includes(e.id))
                    .reduce((s, e) => s + e.commission_cents, 0),
                )}{" "}
                ao profissional?
              </p>
            ) : (
              <label className="field">
                <span>
                  {dialog === "open"
                    ? "Dinheiro inicial (R$)"
                    : dialog === "close"
                      ? "Dinheiro contado no fechamento (R$)"
                      : "Valor (R$)"}
                </span>
                <input
                  autoFocus
                  required
                  type="number"
                  min={dialog === "move" ? "0.01" : "0"}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
            )}
            {dialog === "move" && (
              <label className="field">
                <span>Tipo</span>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="expense">Despesa</option>
                  <option value="withdrawal">Retirada</option>
                  <option value="reinforcement">Reforço</option>
                </select>
              </label>
            )}
            {["pay", "move"].includes(dialog) && (
              <Method value={method} set={setMethod} />
            )}
            {["close", "move"].includes(dialog) && (
              <label className="field">
                <span>Descrição / observação</span>
                <input
                  required={dialog === "move"}
                  minLength={dialog === "move" ? 3 : undefined}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            )}
            {dialog === "close" && active && (
              <p>
                Dinheiro esperado: {money(cashBalance(data, active))}. Pix e
                cartões ficam separados do dinheiro físico.
              </p>
            )}
            {error && <p className="form-error">{error}</p>}
            <button className="primary" disabled={busy}>
              Confirmar
            </button>
          </form>
        </Modal>
      )}
      {payment &&
        (() => {
          const total = commandTotal(data, payment);
          const packageInfo = commandPackage(data, payment);
          const planOnly = packageInfo?.redeemed && total === 0;
          return (
            <Modal
              title={planOnly ? "Concluir pelo plano" : "Confirmar pagamento"}
              close={() => setReceive("")}
            >
              <p>
                Total: <strong>{money(total)}</strong>
              </p>
              {planOnly ? (
                <div className="command-package used">
                  <Gift />
                  <div>
                    <strong>Sessão coberta pelo plano</strong>
                    <small>
                      {packageInfo.name} · {packageInfo.service}
                    </small>
                  </div>
                </div>
              ) : (
                <Method value={method} set={setMethod} />
              )}
              {error && <p className="form-error">{error}</p>}
              <button
                className="primary"
                disabled={busy || (!active && !planOnly)}
                onClick={async () => {
                  const action = planOnly ? "close_package_command" : "receive";
                  if (await run(action, { id: payment.id, method }))
                    setReceive("");
                }}
              >
                {planOnly ? "Concluir sem cobrança" : "Pagamento recebido"}
              </button>
            </Modal>
          );
        })()}
    </Page>
  );
}

export function Reports() {
  const { data } = useOperations();
  const { professionals } = useCatalog();
  const [from, setFrom] = useState(dayKey().slice(0, 7) + "-01");
  const [to, setTo] = useState(dayKey());
  const [professional, setProfessional] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const summary = summarize(data, from, to, professional);
  const expenses = data.movements
    .filter(
      (m) =>
        m.type === "expense" &&
        dayKey(m.created_at) >= from &&
        dayKey(m.created_at) <= to,
    )
    .reduce((s, m) => s - m.amount_cents, 0);
  const ids = professionals
    .filter((item) => {
      const result = summarize(data, from, to, item.id);
      return result.gross > 0 || result.completed.length > 0;
    })
    .map((item) => item.id);
  const exportRows = () =>
    exportCsv(`relatorio-${from}-${to}.csv`, [
      ["Cliente", "Profissional", "Serviço", "Data", "Status", "Valor (R$)"],
      ...summary.appointments.map((a) => [
        a.customer_name,
        a.professional_name,
        a.service_name,
        dateTime(a.starts_at),
        labels[a.status],
        (a.expected_price_cents / 100).toFixed(2),
      ]),
    ]);
  return (
    <Page
      title="Relatórios"
      text="Resumo simples da operação."
      action={
        <div className="row-actions">
          <button className="outline" onClick={() => setFiltersOpen((v) => !v)}>
            {filtersOpen ? "Fechar filtros" : "Filtros"}
          </button>
          <button className="outline" onClick={exportRows}>
            Exportar CSV
          </button>
        </div>
      }
    >
      {filtersOpen && (
        <div className="management-filters filter-panel">
          <label>
            De
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              min={from}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label>
            Profissional
            <select
              value={professional}
              onChange={(e) => setProfessional(e.target.value)}
            >
              <option value="">Todos</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <Metrics
        entries={[
          ["Faturamento", money(summary.gross)],
          ["Recebido", money(summary.received)],
          ["A repassar", money(summary.pending)],
          ["Resultado", money(summary.shop - expenses)],
        ]}
      />
      <section className="panel operation-panel">
        <h3>Por profissional</h3>
        {ids.map((id) => {
          const s = summarize(data, from, to, id);
          return (
            <div className="record-row" key={id}>
              <strong>
                {professionals.find((item) => item.id === id)?.nome ??
                  "Profissional"}
              </strong>
              <span>
                {s.completed.length} agendados · {money(s.gross)}
              </span>
              <span>Comissão: {money(s.earned)}</span>
            </div>
          );
        })}
        {!ids.length && <Empty />}
      </section>
      <section className="panel operation-panel">
        <h3>Atendimentos no período</h3>
        {summary.appointments.map((a) => (
          <div className="record-row" key={a.id}>
            <AppointmentIdentity appointment={a} />
          </div>
        ))}
        {!summary.appointments.length && <Empty />}
      </section>
    </Page>
  );
}

export function Products() {
  const { data, run, busy, error } = useOperations();
  const { professionals } = useCatalog();
  const [draft, setDraft] = useState<Product | null>(null);
  const [stock, setStock] = useState<Product | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [delta, setDelta] = useState("");
  const [notes, setNotes] = useState("");
  const fresh: Product = {
    id: "",
    name: "",
    category: "",
    quantity: 0,
    minimum_quantity: 0,
    sale_price_cents: 0,
    cost_cents: 0,
    active: true,
    photo_url: null,
    commission_percent: 20,
    commission_mode: 'professional',
    commissions: {},
  };
  const visibleProducts = data.products.filter((product) => product.active);
  return (
    <Page
      title="Produtos e estoque"
      text="Cadastros e movimentações salvos no sistema."
      action={
        <button
          className="primary"
          onClick={() => {
            setDraft(fresh);
            setPhoto(null);
          }}
        >
          Novo produto
        </button>
      }
    >
      <section className="product-grid">
        {visibleProducts.map((p) => (
          <article className="product-card" key={p.id}>
            {p.photo_url ? (
              <img className="product-photo" src={p.photo_url} alt="" />
            ) : (
              <div className="product-photo product-placeholder">Produto</div>
            )}
            <div className="product-card-body">
              <strong>{p.name}</strong>
              <p>
                {p.category || "Sem categoria"} · {money(p.sale_price_cents)}
              </p>
              <span className={p.quantity <= p.minimum_quantity ? "low" : ""}>
                {p.quantity} un. · mín. {p.minimum_quantity}
              </span>
              <details className="service-commission-details"><summary>Comissões por profissional</summary><div className="service-commission-summary">
                {professionals.filter(pro => pro.ativo).map(pro => <span key={pro.id}>{pro.nome}: {p.commission_mode === 'professional' ? pro.comissaoProdutos ?? 20 : p.commission_mode === 'uniform' ? p.commission_percent ?? 20 : p.commissions?.[pro.id] ?? p.commission_percent ?? 20}%</span>)}
              </div></details>
              <div className="row-actions">
                <button
                  className="outline small"
                  onClick={() => {
                    setDraft({ ...p });
                    setPhoto(null);
                  }}
                >
                  Editar
                </button>
                <button
                  className="outline small"
                  onClick={() => {
                    setStock(p);
                    setDelta("");
                    setNotes("");
                  }}
                >
                  Estoque
                </button>
              </div>
            </div>
          </article>
        ))}
        {!visibleProducts.length && (
          <section className="panel operation-panel">
            <Empty />
          </section>
        )}
      </section>
      {draft && (
        <Modal title="Produto" close={() => setDraft(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                let photoUrl = draft.photo_url ?? null;
                if (photo)
                  photoUrl = await uploadCatalogPhoto(photo, "products");
                if (
                  await run("save_product_profile", {
                    id: draft.id || null,
                    name: draft.name,
                    category: draft.category,
                    price: draft.sale_price_cents,
                    cost: draft.cost_cents,
                    minimum: draft.minimum_quantity,
                    active: draft.active,
                    photo_url: photoUrl,
                    commission: draft.commission_percent ?? 20,
                    commission_mode: draft.commission_mode ?? 'custom',
                    commissions: Object.entries(draft.commissions ?? {}).map(([professional_id, commission_percent]) => ({ professional_id, commission_percent })),
                  })
                )
                  setDraft(null);
              } catch (err) {
                alert(
                  err instanceof Error
                    ? err.message
                    : "Não foi possível enviar a foto.",
                );
              }
            }}
          >
            <label className="field">
              <span>Foto (4:5)</span>
              <input
                accept="image/*"
                type="file"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
            {draft.photo_url && !photo && (
              <img className="photo-preview" src={draft.photo_url} alt="" />
            )}
            <label className="field">
              <span>Nome</span>
              <input
                required
                minLength={2}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Categoria</span>
              <input
                value={draft.category ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              />
            </label>
            {(
              ["sale_price_cents", "cost_cents", "minimum_quantity"] as const
            ).map((k) => (
              <label className="field" key={k}>
                <span>
                  {
                    {
                      sale_price_cents: "Venda (R$)",
                      cost_cents: "Custo (R$)",
                      minimum_quantity: "Estoque mínimo",
                    }[k]
                  }
                </span>
                <input
                  type="number"
                  required
                  min="0"
                  step={k === "minimum_quantity" ? 1 : 0.01}
                  value={draft[k] / (k === "minimum_quantity" ? 1 : 100)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [k]: Math.round(
                        Number(e.target.value) *
                          (k === "minimum_quantity" ? 1 : 100),
                      ),
                    })
                  }
                />
              </label>
            ))}
            <CommissionFields rate={draft.commission_percent ?? 20} overrides={draft.commissions ?? {}} mode={draft.commission_mode ?? 'custom'}
              onModeChange={mode => setDraft({ ...draft, commission_mode: mode })}
              onChange={(rate, overrides) => setDraft({ ...draft, commission_percent: rate, commissions: overrides })} />
            <label className="check">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked })
                }
              />{" "}
              Ativo
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="row-actions">
              <button className="primary" disabled={busy}>
                Salvar produto
              </button>
              {draft.id && (
                <button
                  className="danger-button"
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      window.confirm(
                        `Excluir definitivamente ${draft.name}, suas movimentações e os atendimentos, pagamentos e comissões vinculados? Esta ação não pode ser desfeita.`,
                      ) &&
                      (await run("delete_product", { id: draft.id }))
                    )
                      setDraft(null);
                  }}
                >
                  Remover produto
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
      {stock && (
        <Modal title={`Estoque · ${stock.name}`} close={() => setStock(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run("adjust_stock", {
                  id: stock.id,
                  delta: Number(delta),
                  notes,
                })
              )
                setStock(null);
            }}
          >
            <label className="field">
              <span>Quantidade a adicionar ou retirar (ex.: 5 ou -2)</span>
              <input
                required
                type="number"
                step="1"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Motivo</span>
              <input
                required
                minLength={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary" disabled={busy}>
              Registrar ajuste
            </button>
          </form>
        </Modal>
      )}
    </Page>
  );
}

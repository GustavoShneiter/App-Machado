import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useOperations } from "./OperationsStore";
import { useCatalog } from "./CatalogStore";
import { supabase } from "./supabaseClient";
import {
  cashBalance,
  commandTotal,
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
  ChevronDown,
  Gift,
  HandCoins,
  History,
  MessageCircle,
  Pencil,
  Trash2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { registerDismissibleLayer } from "./dismissibleLayers";

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
  closeRef.current = close;

  useEffect(() => registerDismissibleLayer(() => closeRef.current()), []);

  return (
    <div
      className="modal-backdrop"
      onClick={() => closeRef.current()}
      onKeyDown={(event) => {
        if (event.key === "Escape") closeRef.current();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="outline small" onClick={() => closeRef.current()}>
            Fechar
          </button>
        </div>
        {children}
      </section>
    </div>
  );
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
function CashActivity({
  movements,
}: {
  movements: { created_at: string; amount_cents: number }[];
}) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    const amount = movements
      .filter((m) => dayKey(m.created_at) === key)
      .reduce((sum, m) => sum + m.amount_cents, 0);
    return {
      key,
      amount,
      label: date.toLocaleDateString("pt-BR", { weekday: "narrow" }),
    };
  });
  const largest = Math.max(...days.map((day) => Math.abs(day.amount)), 1);
  const total = days.reduce((sum, day) => sum + day.amount, 0);
  return (
    <section className="panel operation-panel cash-activity-card">
      <div className="panel-title">
        <div>
          <h3>Movimento da semana</h3>
          <p>Entradas e saídas dos últimos 7 dias.</p>
        </div>
        <strong className={total < 0 ? "red" : "green"}>
          {total < 0 ? "−" : "+"}
          {money(Math.abs(total))}
        </strong>
      </div>
      <div
        className="cash-chart"
        aria-label={`Movimento acumulado de ${money(total)} na semana`}
      >
        {days.map((day, index) => (
          <div
            className={
              day.amount < 0
                ? "negative"
                : index === days.length - 1
                  ? "current"
                  : ""
            }
            key={day.key}
          >
            <i
              style={{
                height: `${Math.max(9, Math.round((Math.abs(day.amount) / largest) * 100))}%`,
              }}
            />
            <span>{day.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
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
        {dateTime(a.starts_at)} · {labels[a.status] ?? a.status}
      </small>
    </div>
  );
}

export function Dashboard() {
  const { data } = useOperations();
  const today = dayKey();
  const summary = summarize(data, today, today);
  const pending = data.commissions
    .filter((c) => c.status === "pending")
    .reduce((s, c) => s + c.commission_cents, 0);
  return (
    <Page title="Visão geral">
      <Metrics
        entries={[
          ["Agendamentos hoje", summary.appointments.length],
          ["Recebido hoje", money(summary.received)],
          ["Atendimentos concluídos hoje", summary.completed.length],
          ["Repasses pendentes", money(pending)],
        ]}
      />
      <div className="management-grid">
        <section className="panel operation-panel">
          <div className="panel-title">
            <h3>Agenda de hoje</h3>
            <Link to="/admin/agenda">Abrir agenda</Link>
          </div>
          {summary.appointments.map((a) => (
            <div className="record-row" key={a.id}>
              <AppointmentIdentity appointment={a} />
            </div>
          ))}
          {!summary.appointments.length && <Empty />}
        </section>
        <section className="panel operation-panel">
          <h3>Estoque baixo</h3>
          {data.products
            .filter((p) => p.active && p.quantity <= p.minimum_quantity)
            .map((p) => (
              <p key={p.id}>
                {p.name} · {p.quantity} un.
              </p>
            ))}
          {!data.products.some(
            (p) => p.active && p.quantity <= p.minimum_quantity,
          ) && <Empty>Sem produtos abaixo do mínimo.</Empty>}
        </section>
      </div>
    </Page>
  );
}

export function AppointmentModal({
  close,
  initialDate = dayKey(),
  initialTime = "",
  initialProfessional = "",
}: {
  close: () => void;
  initialDate?: string;
  initialTime?: string;
  initialProfessional?: string;
}) {
  const { services, professionals } = useCatalog();
  const { run, busy, error } = useOperations();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState(
    services.find((s) => s.ativo)?.id ?? "",
  );
  const [professional, setProfessional] = useState(
    initialProfessional || professionals.find((p) => p.ativo)?.id || "",
  );
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [price, setPrice] = useState(
    String(services.find((s) => s.id === service)?.preco ?? 0),
  );
  const [slots, setSlots] = useState<
    Array<{ time: string; available: boolean }>
  >([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!supabase || !service || !professional) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    void supabase
      .rpc("public_booking_slots", {
        chosen_service: service,
        booking_day: date,
        preferred_professional: professional,
      })
      .then(({ data, error: slotError }) => {
        if (!alive) return;
        const found = (data ?? []) as Array<{
          slot_time: string;
          available: boolean;
        }>;
        const mapped = slotError
          ? []
          : found.map((slot) => ({
              time: String(slot.slot_time).slice(0, 5),
              available: Boolean(slot.available),
            }));
        setSlots(mapped);
        if (
          time &&
          !mapped.some((slot) => slot.time === time && slot.available)
        )
          setTime("");
        setLoadingSlots(false);
      });
    return () => {
      alive = false;
    };
  }, [service, professional, date, time]);
  return (
    <Modal title="Novo agendamento" close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run("create_appointment", {
              name,
              phone,
              professional_id: professional,
              service_id: service,
              starts_at: `${date}T${time}:00-03:00`,
              amount: Math.round(Number(price) * 100),
            })
          )
            close();
        }}
      >
        <div className="form-grid">
          <label className="field">
            <span>Cliente</span>
            <input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>WhatsApp</span>
            <input
              required
              type="tel"
              minLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Profissional</span>
            <select
              required
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
              value={service}
              onChange={(e) => {
                setService(e.target.value);
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
              min={dayKey()}
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
        <div className="admin-slot-picker">
          <span>Horário</span>
          {loadingSlots ? (
            <p>Buscando horários…</p>
          ) : (
            <div>
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
          )}
        </div>
        {!loadingSlots &&
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
        <button disabled={busy || loadingSlots || !time} className="primary">
          {busy ? "Salvando…" : "Salvar agendamento"}
        </button>
      </form>
    </Modal>
  );
}

export function Agenda() {
  const { data, run, busy, error } = useOperations();
  const { professionals } = useCatalog();
  const navigate = useNavigate();
  const [date, setDate] = useState(dayKey());
  const [professional, setProfessional] = useState("");
  const [focused, setFocused] = useState<Appointment | null>(null);
  const [focusedBlock, setFocusedBlock] = useState<ScheduleBlock | null>(null);
  const [slotChoice, setSlotChoice] = useState("");
  const [slotAppointment, setSlotAppointment] = useState("");
  const [blockDraft, setBlockDraft] = useState<{
    time: string;
    duration: number;
    reason: string;
  } | null>(null);
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
      setProfessional(activeProfessionals[0].id);
  }, [activeProfessionals, professional]);
  const selectedDate = new Date(`${date}T12:00:00-03:00`);
  const weekStart = new Date(selectedDate);
  weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());
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
  const rows = data.appointments
    .filter(
      (a) =>
        a.status !== "cancelled" &&
        dayKey(a.starts_at) === date &&
        (!professional || a.professional_id === professional),
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const dayBlocks = data.blocks
    .filter(
      (block) =>
        dayKey(block.starts_at) === date &&
        (!professional || block.professional_id === professional),
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const shiftDate = (amount: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + amount);
    setDate(dayKey(next));
  };
  const monthLabel = selectedDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const firstHour = 8;
  const lastHour = 20;
  const hourHeight = 72;
  const hours = Array.from(
    { length: lastHour - firstHour + 1 },
    (_, index) => firstHour + index,
  );
  const slots = Array.from(
    { length: (lastHour - firstHour) * 4 },
    (_, index) => {
      const minutes = firstHour * 60 + index * 15;
      return {
        time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
        top: (index * hourHeight) / 4,
        major: index % 4 === 0,
      };
    },
  );
  const position = (entry: { starts_at: string; ends_at: string }) => {
    const start = new Date(entry.starts_at);
    const end = new Date(entry.ends_at);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    return {
      top: Math.max(0, ((startMinutes - firstHour * 60) / 60) * hourHeight),
      height: Math.max(
        hourHeight / 4,
        ((endMinutes - startMinutes) / 60) * hourHeight,
      ),
    };
  };
  const slotDate = (time: string) => new Date(`${date}T${time}:00-03:00`);
  const occupied = (time: string) => {
    const start = slotDate(time).getTime();
    const end = start + 15 * 60_000;
    return [...rows, ...dayBlocks].some(
      (entry) =>
        new Date(entry.starts_at).getTime() < end &&
        new Date(entry.ends_at).getTime() > start,
    );
  };
  const saveBlock = async () => {
    if (!blockDraft || !professional) return;
    const start = slotDate(blockDraft.time);
    const end = new Date(start.getTime() + blockDraft.duration * 60_000);
    if (
      await run("create_schedule_block", {
        professional_id: professional,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        reason: blockDraft.reason.trim() || "Agenda bloqueada",
      })
    )
      setBlockDraft(null);
  };
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
      <section
        className="agenda-professionals"
        aria-label="Selecionar profissional"
      >
        {activeProfessionals.map((item) => (
          <button
            type="button"
            className={professional === item.id ? "active" : ""}
            aria-pressed={professional === item.id}
            key={item.id}
            onClick={() => setProfessional(item.id)}
          >
            {item.foto_url ? (
              <img src={item.foto_url} alt="" />
            ) : (
              <span style={{ background: item.cor }}>
                {item.iniciais || item.nome.slice(0, 2).toUpperCase()}
              </span>
            )}
            <small>{item.nome}</small>
          </button>
        ))}
      </section>
      <section className="agenda-daybar" aria-label="Navegação por semana">
        <button aria-label="Semana anterior" onClick={() => shiftDate(-7)}>
          ‹
        </button>
        <div>
          <span>Semana selecionada</span>
          <strong>{monthLabel}</strong>
        </div>
        <button aria-label="Próxima semana" onClick={() => shiftDate(7)}>
          ›
        </button>
      </section>
      <section className="agenda-week" aria-label="Dias da semana">
        {weekDays.map((day) => (
          <button
            type="button"
            className={date === day.key ? "active" : ""}
            aria-pressed={date === day.key}
            key={day.key}
            onClick={() => setDate(day.key)}
          >
            <small>{day.label}</small>
            <strong>{day.number}</strong>
          </button>
        ))}
      </section>
      <section className="agenda-schedule" aria-label="Horários do dia">
        <div
          className="agenda-time-axis"
          style={{ height: (lastHour - firstHour) * hourHeight }}
        >
          {hours.map((hour, index) => (
            <time style={{ top: index * hourHeight }} key={hour}>
              {String(hour).padStart(2, "0")}:00
            </time>
          ))}
        </div>
        <div
          className="agenda-time-grid"
          style={{ height: (lastHour - firstHour) * hourHeight }}
        >
          {slots.map((slot) => (
            <button
              type="button"
              className={`agenda-slot ${slot.major ? "major" : ""}`}
              aria-label={`${occupied(slot.time) ? "Ocupado" : "Abrir opções"} às ${slot.time}`}
              disabled={
                occupied(slot.time) ||
                slotDate(slot.time).getTime() < Date.now()
              }
              style={{ top: slot.top, height: hourHeight / 4 }}
              key={slot.time}
              onClick={() => setSlotChoice(slot.time)}
            >
              <span>{slot.time}</span>
            </button>
          ))}
          <i
            className="agenda-grid-end"
            style={{ top: (lastHour - firstHour) * hourHeight }}
          />
          {dayBlocks.map((block) => {
            const layout = position(block);
            return (
              <button
                type="button"
                className="agenda-event blocked"
                style={{ top: layout.top, height: layout.height }}
                key={block.id}
                onClick={() => setFocusedBlock(block)}
              >
                <small>
                  {new Date(block.starts_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  –
                  {new Date(block.ends_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
                <strong>
                  Agenda bloqueada
                  {block.reason && block.reason !== "Agenda bloqueada"
                    ? ` · ${block.reason}`
                    : ""}
                </strong>
              </button>
            );
          })}
          {rows.map((appointment) => {
            const layout = position(appointment);
            const command = data.commands.find(
              (item) => item.appointment_id === appointment.id,
            );
            return (
              <button
                type="button"
                className={`agenda-event ${appointment.status}`}
                style={{ top: layout.top, height: layout.height }}
                key={appointment.id}
                onClick={() =>
                  command
                    ? navigate(`/admin/comandas?comanda=${command.id}`)
                    : setFocused(appointment)
                }
              >
                <small>
                  {new Date(appointment.starts_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  –
                  {new Date(appointment.ends_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
                <strong>
                  {appointment.service_name} · {appointment.customer_name}
                </strong>
              </button>
            );
          })}
        </div>
      </section>
      {slotChoice && (
        <Modal title={`Horário ${slotChoice}`} close={() => setSlotChoice("")}>
          <p className="slot-choice-copy">O que deseja fazer neste horário?</p>
          <div className="slot-choice-actions">
            <button
              className="primary"
              onClick={() => {
                setSlotAppointment(slotChoice);
                setSlotChoice("");
              }}
            >
              Agendar horário
            </button>
            <button
              className="outline"
              onClick={() => {
                setBlockDraft({ time: slotChoice, duration: 15, reason: "" });
                setSlotChoice("");
              }}
            >
              Bloquear horário
            </button>
          </div>
        </Modal>
      )}
      {slotAppointment && (
        <AppointmentModal
          initialDate={date}
          initialTime={slotAppointment}
          initialProfessional={professional}
          close={() => setSlotAppointment("")}
        />
      )}
      {blockDraft && (
        <Modal title="Bloquear horário" close={() => setBlockDraft(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveBlock();
            }}
          >
            <div className="block-summary">
              <strong>{blockDraft.time}</strong>
              <span>
                {
                  activeProfessionals.find((item) => item.id === professional)
                    ?.nome
                }{" "}
                · {selectedDate.toLocaleDateString("pt-BR")}
              </span>
            </div>
            <label className="field">
              <span>Duração</span>
              <select
                value={blockDraft.duration}
                onChange={(event) =>
                  setBlockDraft({
                    ...blockDraft,
                    duration: Number(event.target.value),
                  })
                }
              >
                <option value={15}>15 minutos</option>
                <option value={30}>30 minutos</option>
                <option value={45}>45 minutos</option>
                <option value={60}>1 hora</option>
              </select>
            </label>
            <label className="field">
              <span>Motivo (opcional)</span>
              <input
                value={blockDraft.reason}
                onChange={(event) =>
                  setBlockDraft({ ...blockDraft, reason: event.target.value })
                }
                placeholder="Ex.: intervalo"
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary" disabled={busy}>
              {busy ? "Bloqueando…" : "Bloquear horário"}
            </button>
          </form>
        </Modal>
      )}
      {focusedBlock && (
        <Modal title="Agenda bloqueada" close={() => setFocusedBlock(null)}>
          <div className="block-summary">
            <strong>
              {new Date(focusedBlock.starts_at).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              –
              {new Date(focusedBlock.ends_at).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </strong>
            <span>{focusedBlock.reason || "Agenda bloqueada"}</span>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button
            className="danger-button"
            disabled={busy}
            onClick={async () => {
              if (await run("delete_schedule_block", { id: focusedBlock.id }))
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
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => {
                setFocused(null);
                setRemoving(focused);
              }}
            >
              Remover
            </button>
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
        <Modal title="Remover agendamento" close={() => setRemoving(null)}>
          <AppointmentIdentity appointment={removing} />
          <p>
            Esse horário será removido da agenda. O histórico financeiro
            permanece protegido.
          </p>
          {error && <p className="form-error">{error}</p>}
          <button
            className="danger"
            disabled={busy}
            onClick={async () => {
              if (
                await run("set_status", {
                  id: removing.id,
                  status: "cancelled",
                })
              )
                setRemoving(null);
            }}
          >
            Remover da agenda
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
        "Remover este cliente? Primeiro remova os agendamentos dele, se houver.",
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
          Novo
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
                <div className="customer-actions">
                  <a
                    className="customer-action whatsapp-action"
                    aria-label={`WhatsApp de ${c.name}`}
                    href={whatsapp(c.phone)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle size={17} />
                  </a>
                  <button
                    className="customer-action"
                    aria-label={`Histórico de ${c.name}`}
                    onClick={() => setHistory(c.id)}
                  >
                    <History size={17} />
                  </button>
                  <button
                    className="customer-action"
                    aria-label={`Editar ${c.name}`}
                    onClick={() => setDraft({ ...c })}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              </div>
              <div className="customer-summary">
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
              </div>
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
}: {
  requestedNew?: boolean;
  onRequestedNewHandled?: () => void;
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
  const requestedCommand = searchParams.get("comanda") ?? "";
  useEffect(() => {
    if (
      requestedCommand &&
      data.commands.some((item) => item.id === requestedCommand)
    )
      setDetails(requestedCommand);
  }, [requestedCommand, data.commands]);
  const selected = data.commands.find((c) => c.id === receive);
  const command = data.commands.find((c) => c.id === details);
  const visible = data.commands.filter((c) => !filter || c.status === filter);
  const products = data.products.filter((p) => p.active && p.quantity > 0);
  const statusCount = (status: string) =>
    data.commands.filter((c) => c.status === status).length;
  const openDetails = (id: string) => {
    const current = data.commands.find((item) => item.id === id);
    setDetails(id);
    setCommandAction("");
    setProductId("");
    setQuantity("1");
    setServiceId("");
    setProfessionalId("");
    setDiscount(String((current?.discount_cents ?? 0) / 100));
    setSurcharge(String((current?.surcharge_cents ?? 0) / 100));
  };
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
      title="Comandas"
      action={
        <button
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
          const total = commandTotal(data, c);
          return (
            <article className={`command-card ${c.status}`} key={c.id}>
              <button
                className="command-card-main"
                onClick={() => openDetails(c.id)}
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
                  {a?.customer_name ?? customer?.name ?? "Cliente"}
                </strong>
                <p>
                  {a
                    ? `${a.service_name} · ${a.professional_name}`
                    : "Atendimento de balcão"}
                </p>
              </button>
              <div className="command-card-footer">
                <strong>{money(total)}</strong>
                <div>
                  {c.status === "open" && a && (
                    <Link className="outline small" to="/admin/agenda">
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
                    onClick={() => openDetails(c.id)}
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
                  if (await run(action, { id: receive, method }))
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
          const canAddService = canEdit;
          const canAddProduct = canEdit;
          const canAdjust = canEdit;
          const items = data.items.filter(
            (item) => item.command_id === command.id,
          );
          const packageInfo = commandPackage(data, command);
          const total = commandTotal(data, command);
          return (
            <Modal title="Comanda" close={() => setDetails("")}>
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
                      : data.customers.find((c) => c.id === command.customer_id)
                          ?.name}
                  </p>
                </div>
                <strong>{money(total)}</strong>
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
                      {packageInfo.remaining !== null
                        ? ` · ${packageInfo.remaining} restante${packageInfo.remaining === 1 ? "" : "s"}`
                        : ""}
                    </small>
                  </div>
                </div>
              )}
              {canEdit && (
                <div
                  className="command-quick-actions"
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
                          "Excluir esta comanda e liberar o atendimento?",
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
                    {manualOpen && (
                      <button
                        className="text-button danger-text"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run("remove_command_item", { id: item.id })
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
              {canAddService && commandAction === "service" && (
                <form
                  className="command-product-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (
                      await run("add_command_service", {
                        command_id: command.id,
                        service_id: serviceId,
                        professional_id: professionalId,
                      })
                    ) {
                      setServiceId("");
                      setProfessionalId("");
                      setCommandAction("");
                    }
                  }}
                >
                  <h3>Adicionar serviço</h3>
                  <label className="field">
                    <span>Serviço</span>
                    <select
                      required
                      value={serviceId}
                      onChange={(e) => setServiceId(e.target.value)}
                    >
                      <option value="">Escolha um serviço</option>
                      {services
                        .filter((service) => service.ativo)
                        .map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.nome} ·{" "}
                            {money(Math.round(service.preco * 100))}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Profissional</span>
                    <select
                      required
                      value={professionalId}
                      onChange={(e) => setProfessionalId(e.target.value)}
                    >
                      <option value="">Escolha um profissional</option>
                      {professionals
                        .filter((pro) => pro.ativo)
                        .map((pro) => (
                          <option key={pro.id} value={pro.id}>
                            {pro.nome}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className="outline"
                    disabled={busy || !serviceId || !professionalId}
                  >
                    Adicionar serviço
                  </button>
                </form>
              )}
              {canAddProduct && commandAction === "product" && (
                <form
                  className="command-product-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (
                      await run("add_command_product", {
                        command_id: command.id,
                        product_id: productId,
                        quantity: Number(quantity),
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
                      <button className="outline" disabled={busy || !productId}>
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
              {canAdjust &&
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
                          surcharge: Math.round(Number(surcharge) * 100),
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
              {canAdjust && commandAction === "tip" && items.length > 0 && (
                <form
                  className="command-adjustments"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (
                      await run("set_command_adjustments", {
                        command_id: command.id,
                        discount: Math.round(Number(discount) * 100),
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
                      })
                    )
                      setDetails("");
                  }}
                >
                  Finalizar atendimento
                </button>
              )}
              {command.status === "awaiting_payment" && (
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
                    : "Receber no Caixa"}
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
  const { professionals } = useCatalog();
  const [dialog, setDialog] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState("cash");
  const [type, setType] = useState("expense");
  const [professionalId, setProfessionalId] = useState("");
  const [entryIds, setEntryIds] = useState<string[]>([]);
  const [receive, setReceive] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [payoutsOpen, setPayoutsOpen] = useState(false);
  const [commissionView, setCommissionView] = useState("pending");
  const [commissionProfessional, setCommissionProfessional] = useState("");
  const active = data.sessions.find((s) => !s.closed_at);
  const [chosenSession, setChosenSession] = useState("");
  const shown =
    data.sessions.find((s) => s.id === chosenSession) ??
    active ??
    data.sessions[0];
  const pending = data.commissions.filter(
    (e) => e.status === "pending" && e.commission_cents > 0,
  );
  const movements = data.movements.filter((m) => m.session_id === shown?.id);
  const receivedInSession = movements
    .filter(
      (movement) =>
        movement.amount_cents > 0 &&
        ["sale", "package_sale"].includes(movement.type),
    )
    .reduce((sum, movement) => sum + movement.amount_cents, 0);
  const commandIdsInSession = new Set(
    movements
      .filter((movement) => movement.command_id)
      .map((movement) => movement.command_id),
  );
  const itemIdsInSession = new Set(
    data.items
      .filter((item) => commandIdsInSession.has(item.command_id))
      .map((item) => item.id),
  );
  const commissionsInSession = data.commissions
    .filter((commission) => itemIdsInSession.has(commission.command_item_id))
    .reduce((sum, commission) => sum + commission.commission_cents, 0);
  const operatingExpenses = movements
    .filter(
      (movement) =>
        movement.amount_cents < 0 &&
        movement.type === "expense" &&
        !movement.commission_entry_id,
    )
    .reduce((sum, movement) => sum + Math.abs(movement.amount_cents), 0);
  const barbershopEarnings =
    receivedInSession - commissionsInSession - operatingExpenses;
  const pendingPayments = data.commands.filter(
    (c) => c.status === "awaiting_payment",
  );
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
  const visibleCommissions = data.commissions.filter(
    (e) =>
      e.commission_cents > 0 &&
      e.status === commissionView &&
      (!commissionProfessional || e.professional_id === commissionProfessional),
  );
  return (
    <Page
      title="Caixa"
      action={
        <div className="row-actions">
          <button className="outline" onClick={() => setFiltersOpen((v) => !v)}>
            {filtersOpen ? "Fechar histórico" : "Histórico"}
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => openDialog(active ? "close" : "open")}
          >
            {active ? "Fechar caixa" : "Abrir caixa"}
          </button>
        </div>
      }
    >
      {filtersOpen && (
        <div className="management-filters filter-panel">
          <label>
            Caixa
            <select
              value={shown?.id ?? ""}
              onChange={(e) => setChosenSession(e.target.value)}
            >
              {!data.sessions.length && (
                <option value="">Nenhum caixa aberto</option>
              )}
              {data.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {dateTime(s.opened_at)} · {s.closed_at ? "Fechado" : "Aberto"}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <section className="cash-overview-grid">
        <article className="cash-overview-card cash-register-card">
          <div className="cash-overview-icon">
            <WalletCards size={22} />
          </div>
          <div>
            <span>Caixa físico</span>
            <strong>{money(shown ? cashBalance(data, shown) : 0)}</strong>
            <small className={active ? "open" : "closed"}>
              {active ? "Caixa aberto" : "Caixa fechado"}
            </small>
          </div>
        </article>
        <article className="cash-overview-card earnings-card">
          <div className="cash-overview-icon">
            <TrendingUp size={22} />
          </div>
          <div>
            <span>Rendimento da barbearia</span>
            <strong>{money(barbershopEarnings)}</strong>
            <small>
              {money(receivedInSession)} recebido ·{" "}
              {money(commissionsInSession)} reservado para repasses
            </small>
          </div>
        </article>
      </section>
      <CashActivity movements={movements} />
      <button
        className={`payout-summary-button ${payoutsOpen ? "open" : ""}`}
        onClick={() => setPayoutsOpen((value) => !value)}
        aria-expanded={payoutsOpen}
      >
        <span className="payout-summary-icon">
          <HandCoins size={22} />
        </span>
        <span>
          <small>Colaboradores e profissionais</small>
          <strong>Valores a repassar</strong>
        </span>
        <b>
          {money(
            pending.reduce((sum, entry) => sum + entry.commission_cents, 0),
          )}
        </b>
        <ChevronDown size={19} />
      </button>
      {payoutsOpen && (
        <section className="panel operation-panel payout-panel">
          <div className="panel-title">
            <div>
              <h3>
                {commissionView === "pending"
                  ? "Repasses pendentes"
                  : "Repasses pagos"}
              </h3>
              <p>Valores calculados conforme a comissão de cada serviço.</p>
            </div>
          </div>
          <div className="payout-filters">
            <button
              className={commissionView === "pending" ? "active" : ""}
              onClick={() => setCommissionView("pending")}
            >
              Pendentes
            </button>
            <button
              className={commissionView === "paid" ? "active" : ""}
              onClick={() => setCommissionView("paid")}
            >
              Pagos
            </button>
            <select
              value={commissionProfessional}
              onChange={(event) =>
                setCommissionProfessional(event.target.value)
              }
              aria-label="Filtrar profissional"
            >
              <option value="">Todos os profissionais</option>
              {professionals.map((professional) => (
                <option value={professional.id} key={professional.id}>
                  {professional.nome}
                </option>
              ))}
            </select>
          </div>
          {commissionView === "pending"
            ? [
                ...new Set(
                  visibleCommissions.map((entry) => entry.professional_id),
                ),
              ].map((id) => {
                const entries = visibleCommissions.filter(
                  (entry) => entry.professional_id === id,
                );
                return (
                  <div className="record-row payout-row" key={id}>
                    <div>
                      <strong>
                        {professionals.find(
                          (professional) => professional.id === id,
                        )?.nome ??
                          data.appointments.find(
                            (appointment) => appointment.professional_id === id,
                          )?.professional_name ??
                          "Profissional"}
                      </strong>
                      <small>
                        {entries.length}{" "}
                        {entries.length === 1 ? "serviço" : "serviços"}
                      </small>
                    </div>
                    <b>
                      {money(
                        entries.reduce(
                          (sum, entry) => sum + entry.commission_cents,
                          0,
                        ),
                      )}
                    </b>
                    <button
                      className="primary small"
                      disabled={!active || busy}
                      onClick={() => {
                        setProfessionalId(id);
                        setEntryIds(entries.map((entry) => entry.id));
                        openDialog("pay");
                      }}
                    >
                      Pagar repasse
                    </button>
                  </div>
                );
              })
            : visibleCommissions.map((entry) => (
                <div className="record-row payout-row" key={entry.id}>
                  <span>
                    {professionals.find(
                      (professional) =>
                        professional.id === entry.professional_id,
                    )?.nome ?? "Profissional"}{" "}
                    · {entry.paid_at ? dateTime(entry.paid_at) : ""}
                  </span>
                  <b>{money(entry.commission_cents)}</b>
                </div>
              ))}
          {!visibleCommissions.length && (
            <Empty>
              {commissionView === "pending"
                ? "Nenhum repasse pendente."
                : "Nenhum repasse pago neste filtro."}
            </Empty>
          )}
        </section>
      )}
      <section className="panel operation-panel ready-receipts">
        <div className="panel-title">
          <h3>Prontas para receber</h3>
          <span>{pendingPayments.length}</span>
        </div>
        {pendingPayments.map((command) => {
          const appointment = data.appointments.find(
            (a) => a.id === command.appointment_id,
          );
          const customer = data.customers.find(
            (c) => c.id === command.customer_id,
          );
          const packageInfo = commandPackage(data, command);
          const total = commandTotal(data, command);
          return (
            <div className="record-row" key={command.id}>
              <div>
                {appointment ? (
                  <AppointmentIdentity appointment={appointment} />
                ) : (
                  <div className="appointment-identity">
                    <strong>{customer?.name ?? "Cliente"}</strong>
                    <small>Comanda de balcão</small>
                  </div>
                )}
                {packageInfo && (
                  <span
                    className={`ready-plan ${packageInfo.redeemed ? "used" : ""}`}
                  >
                    <Gift size={13} />
                    {packageInfo.name}
                  </span>
                )}
              </div>
              <strong>{money(total)}</strong>
              <button
                className="primary small"
                disabled={
                  (!active && !(packageInfo?.redeemed && total === 0)) || busy
                }
                onClick={() => {
                  setMethod("pix");
                  setReceive(command.id);
                }}
              >
                {packageInfo?.redeemed && total === 0 ? "Concluir" : "Receber"}
              </button>
            </div>
          );
        })}
        {!pendingPayments.length && <Empty>Sem recebimentos pendentes.</Empty>}
      </section>
      <section className="panel operation-panel">
        <div className="panel-title">
          <h3>Movimentações</h3>
          <button
            className="outline small"
            disabled={!active || busy}
            onClick={() => openDialog("move")}
          >
            Novo lançamento
          </button>
        </div>
        {shown?.closed_at && (
          <p>
            Contado: {money(shown.declared_balance_cents ?? 0)} · Diferença:{" "}
            {money(
              (shown.declared_balance_cents ?? 0) - cashBalance(data, shown),
            )}
          </p>
        )}
        {movements.map((m) => {
          const cmd = data.commands.find((c) => c.id === m.command_id);
          const a = data.appointments.find((a) => a.id === cmd?.appointment_id);
          return (
            <div className="record-row" key={m.id}>
              <div>
                <strong>{m.notes}</strong>
                <p>
                  {a
                    ? `${a.customer_name} · ${a.professional_name} · ${a.service_name}`
                    : ""}
                </p>
                <small>
                  {dateTime(m.created_at)} · {methods[m.payment_method]}
                </small>
              </div>
              <strong className={m.amount_cents < 0 ? "red" : "green"}>
                {money(m.amount_cents)}
              </strong>
            </div>
          );
        })}
        {!movements.length && <Empty />}
      </section>
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
                        `Remover ${draft.name} da lista de produtos?`,
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

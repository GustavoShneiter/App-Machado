import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useOperations } from "./OperationsStore";
import { useCatalog } from "./CatalogStore";
import { backend } from "./dataClient";
import {
  AppointmentIdentity,
  AppointmentModal,
  EmptyState,
  Modal,
} from "./ManagementPages";
import {
  dayKey,
  money,
  type Appointment,
  type ScheduleBlock,
} from "./operations";

type Filters = {
  from: string;
  to: string;
  period: boolean;
  professional: string;
  customer: string;
  search: string;
  status: string;
};
const initialFilters = (): Filters => ({
  from: dayKey(),
  to: dayKey(),
  period: false,
  professional: "",
  customer: "",
  search: "",
  status: "",
});
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
const timeLabel = (value: string) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
const dateLabel = (value: string) =>
  new Date(`${value}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

export function Agenda() {
  const { data, run, busy, error, clearError } = useOperations();
  const { professionals, services } = useCatalog();
  const [filters, setFilters] = useState(initialFilters);
  const [draft, setDraft] = useState(filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [focused, setFocused] = useState<Appointment | null>(null);
  const [confirmation, setConfirmation] = useState<{
    appointment: Appointment;
    status: "completed" | "no_show";
  } | null>(null);
  const [removing, setRemoving] = useState<Appointment | null>(null);
  const [newTime, setNewTime] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [block, setBlock] = useState<{
    time: string;
    duration: number;
    reason: string;
  } | null>(null);
  const [slot, setSlot] = useState("");
  const [focusedBlock, setFocusedBlock] = useState<ScheduleBlock | null>(null);
  const [availableSlots, setAvailableSlots] = useState<
    Array<{ time: string; available: boolean }>
  >([]);
  const [slotsMessage, setSlotsMessage] = useState("");
  const end = filters.period ? filters.to : filters.from;
  const selectedProfessional = professionals.find(
    (pro) => pro.id === filters.professional,
  );
  const availabilityService = services.find((service) => service.ativo);
  useEffect(() => {
    let alive = true;
    setAvailableSlots([]);
    if (
      !filters.professional ||
      end !== filters.from ||
      !availabilityService?.id
    )
      return;
    setSlotsMessage("Consultando horários…");
    void backend
      .rpc("public_booking_slots", {
        chosen_service: availabilityService.id,
        booking_day: filters.from,
        preferred_professional: filters.professional,
      })
      .then(({ data: slots, error: cause }) => {
        if (!alive) return;
        setAvailableSlots(
          cause
            ? []
            : (slots ?? []).map(
                (entry: { slot_time: string; available: boolean }) => ({
                  time: String(entry.slot_time).slice(0, 5),
                  available: Boolean(entry.available),
                }),
              ),
        );
        setSlotsMessage(
          cause
            ? "Não foi possível consultar os horários. Use Atualizar para tentar novamente."
            : !slots?.length
              ? "Não há horários de funcionamento nesta data."
              : "",
        );
      });
    return () => {
      alive = false;
    };
  }, [
    filters.from,
    filters.professional,
    end,
    availabilityService?.id,
    data.appointments,
    data.blocks,
  ]);
  const commandFor = (id: string) =>
    data.commands.find((command) => command.appointment_id === id);
  const situation = (appointment: Appointment) =>
    commandFor(appointment.id)?.status === "closed"
      ? "paid"
      : appointment.status === "completed"
        ? "completed"
        : appointment.status === "no_show"
          ? "no_show"
          : "scheduled";
  const statusLabel = (appointment: Appointment) =>
    ({
      paid: "Pago",
      completed: "Veio · pronto para receber",
      no_show: "Não veio",
      scheduled: "Aguardando presença",
    })[situation(appointment)];
  const withinPeriod = (value: string) =>
    dayKey(value) >= filters.from && dayKey(value) <= end;
  const appointments = data.appointments
    .filter(
      (appointment) =>
        !appointment.agenda_hidden &&
        appointment.status !== "cancelled" &&
        withinPeriod(appointment.starts_at) &&
        (!filters.professional ||
          appointment.professional_id === filters.professional) &&
        normalize(
          `${appointment.customer_name} ${appointment.customer_phone}`,
        ).includes(normalize(filters.customer)) &&
        normalize(
          `${appointment.service_name} ${appointment.customer_name} ${appointment.id}`,
        ).includes(normalize(filters.search)) &&
        (!filters.status || situation(appointment) === filters.status),
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const blocks = data.blocks.filter(
    (entry) =>
      withinPeriod(entry.starts_at) &&
      (!filters.professional || entry.professional_id === filters.professional),
  );
  const activeFilters = [
    filters.period,
    filters.professional,
    filters.customer,
    filters.search,
    filters.status,
  ].filter(Boolean).length;
  const shiftDay = (amount: number) => {
    const shift = (date: string) => {
      const value = new Date(`${date}T12:00:00-03:00`);
      value.setDate(value.getDate() + amount);
      return dayKey(value);
    };
    setFilters((current) => ({
      ...current,
      from: shift(current.from),
      to: shift(current.to),
    }));
  };
  // Disponibilidade considera todos os registros, inclusive os ocultos e os que a pesquisa não exibe.
  const occupied = (time: string) => {
    const start = new Date(`${filters.from}T${time}:00-03:00`).getTime();
    const finish = start + 15 * 60000;
    return [
      ...data.appointments.filter(
        (a) => !["cancelled", "no_show"].includes(a.status),
      ),
      ...data.blocks,
    ].some(
      (entry) =>
        entry.professional_id === filters.professional &&
        new Date(entry.starts_at).getTime() < finish &&
        new Date(entry.ends_at).getTime() > start,
    );
  };
  const askPresence = (
    appointment: Appointment,
    status: "completed" | "no_show",
  ) => {
    clearError();
    setFocused(null);
    setPrice(String(appointment.expected_price_cents / 100));
    setConfirmation({ appointment, status });
  };
  const presenceActions = (appointment: Appointment) => {
    if (situation(appointment) === "completed")
      return (
        <Link className="primary small" to="/admin/caixa">
          Receber no Caixa
        </Link>
      );
    if (["paid", "no_show"].includes(situation(appointment))) return null;
    return (
      <>
        <button
          className="primary small"
          disabled={busy}
          onClick={() => askPresence(appointment, "completed")}
        >
          Confirmar que veio
        </button>
        <button
          className="outline small"
          disabled={busy}
          onClick={() => askPresence(appointment, "no_show")}
        >
          Confirmar que não veio
        </button>
      </>
    );
  };
  return (
    <section className="page agenda-clean">
      <header className="agenda-heading">
        <div>
          <p className="eyebrow">Atendimentos da barbearia</p>
          <h1>Agenda</h1>
        </div>
        <div className="agenda-toolbar">
          <button
            className="outline"
            aria-haspopup="dialog"
            onClick={() => {
              setDraft(filters);
              setFiltersOpen(true);
            }}
          >
            <SlidersHorizontal size={17} />
            Filtros
            {activeFilters > 0 && (
              <span className="agenda-filter-count">{activeFilters}</span>
            )}
          </button>
          <button
            className="primary"
            onClick={() => {
              clearError();
              setNewTime("");
            }}
          >
            Novo agendamento
          </button>
        </div>
      </header>
      <div className="agenda-period">
        <button
          className="icon-btn"
          aria-label="Dia anterior"
          onClick={() => shiftDay(-1)}
        >
          <ChevronLeft />
        </button>
        <div>
          <CalendarDays size={18} />
          <strong>
            {dateLabel(filters.from)}
            {end !== filters.from && <> a {dateLabel(end)}</>}
          </strong>
          <span>
            {selectedProfessional?.nome || "Todos os profissionais"} ·{" "}
            {appointments.length}{" "}
            {appointments.length === 1 ? "agendamento" : "agendamentos"}
          </span>
        </div>
        <button
          className="icon-btn"
          aria-label="Próximo dia"
          onClick={() => shiftDay(1)}
        >
          <ChevronRight />
        </button>
      </div>
      <div className="agenda-appointments" aria-label="Agendamentos">
        {appointments.map((appointment) => (
          <article
            className={`agenda-appointment ${situation(appointment)}`}
            key={appointment.id}
            data-appointment-id={appointment.id}
            aria-label={`Agendamento de ${appointment.customer_name}`}
          >
            <div className="agenda-card-top">
              <span
                className={`status ${["completed", "paid"].includes(situation(appointment)) ? "positive" : "muted"}`}
              >
                {statusLabel(appointment)}
              </span>
              <button
                className="icon-btn"
                aria-label={`Remover ${appointment.customer_name} da agenda`}
                onClick={() => {
                  clearError();
                  setRemoving(appointment);
                }}
              >
                <Trash2 size={17} />
              </button>
            </div>
            <button
              className="agenda-card-summary"
              onClick={() => setFocused(appointment)}
              aria-label={`Ver agendamento de ${appointment.customer_name}`}
            >
              <h2>{appointment.customer_name}</h2>
              <dl>
                <div>
                  <dt>Profissional</dt>
                  <dd>{appointment.professional_name}</dd>
                </div>
                <div>
                  <dt>Serviço</dt>
                  <dd>{appointment.service_name}</dd>
                </div>
                <div>
                  <dt>Data</dt>
                  <dd>{dateLabel(dayKey(appointment.starts_at))}</dd>
                </div>
                <div>
                  <dt>Horário</dt>
                  <dd>
                    {timeLabel(appointment.starts_at)} às{" "}
                    {timeLabel(appointment.ends_at)}
                  </dd>
                </div>
              </dl>
              <span className="agenda-price">
                {appointment.expected_price_cents > 0
                  ? money(appointment.expected_price_cents)
                  : "Valor a combinar"}
              </span>
            </button>
            <div className="agenda-card-actions">
              {presenceActions(appointment)}
            </div>
          </article>
        ))}
        {!appointments.length && (
          <EmptyState>
            Nenhum agendamento encontrado. Use Filtros para consultar outra data
            ou profissional.
          </EmptyState>
        )}
      </div>
      {blocks.length > 0 && (
        <section
          className="agenda-block-list"
          aria-label="Intervalos bloqueados"
        >
          <h2>Intervalos bloqueados</h2>
          {blocks.map((entry) => (
            <button
              className="outline"
              key={entry.id}
              onClick={() => {
                clearError();
                setFocusedBlock(entry);
              }}
            >
              <strong>
                {professionals.find((pro) => pro.id === entry.professional_id)
                  ?.nome || "Profissional"}
              </strong>
              <span>
                {dateLabel(dayKey(entry.starts_at))} ·{" "}
                {timeLabel(entry.starts_at)}–{timeLabel(entry.ends_at)}
              </span>
              <small>{entry.reason || "Agenda bloqueada"}</small>
            </button>
          ))}
        </section>
      )}
      {filters.professional && end === filters.from && (
        <details className="agenda-availability">
          <summary>
            Ver horários de {selectedProfessional?.nome || "profissional"}
          </summary>
          <p>
            Disponibilidade para {availabilityService?.nome}. Horários ocupados
            estão bloqueados; a duração será conferida para o serviço escolhido
            ao agendar.
          </p>
          {slotsMessage && <p role="status">{slotsMessage}</p>}
          <div className="agenda-available-grid">
            {availableSlots.map((entry) => {
              const time = entry.time;
              const taken = !entry.available || occupied(time);
              return (
                <button
                  type="button"
                  key={time}
                  disabled={
                    taken ||
                    new Date(`${filters.from}T${time}:00-03:00`).getTime() <
                      Date.now()
                  }
                  className={taken ? "unavailable" : ""}
                  aria-label={`${time} ${taken ? "Ocupado" : "Disponível"}`}
                  onClick={() => setSlot(time)}
                >
                  {time}
                  <small>{taken ? "Ocupado" : "Livre"}</small>
                </button>
              );
            })}
          </div>
        </details>
      )}
      {filtersOpen && (
        <Modal title="Filtros da Agenda" close={() => setFiltersOpen(false)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setFilters(draft);
              setFiltersOpen(false);
            }}
          >
            <div className="form-grid">
              <label className="field">
                <span>Consultar</span>
                <select
                  aria-label="Consultar"
                  value={draft.period ? "period" : "day"}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      period: event.target.value === "period",
                      to: draft.to < draft.from ? draft.from : draft.to,
                    })
                  }
                >
                  <option value="day">Uma data</option>
                  <option value="period">Um período</option>
                </select>
              </label>
              <label className="field">
                <span>{draft.period ? "Data inicial" : "Data"}</span>
                <input
                  type="date"
                  required
                  value={draft.from}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      from: event.target.value,
                      to:
                        draft.to < event.target.value
                          ? event.target.value
                          : draft.to,
                    })
                  }
                />
              </label>
              {draft.period && (
                <label className="field">
                  <span>Data final</span>
                  <input
                    type="date"
                    required
                    min={draft.from}
                    value={draft.to}
                    onChange={(event) =>
                      setDraft({ ...draft, to: event.target.value })
                    }
                  />
                </label>
              )}
              <label className="field">
                <span>Profissional</span>
                <select
                  aria-label="Profissional"
                  value={draft.professional}
                  onChange={(event) =>
                    setDraft({ ...draft, professional: event.target.value })
                  }
                >
                  <option value="">Todos os profissionais</option>
                  {professionals.map((pro) => (
                    <option key={pro.id} value={pro.id}>
                      {pro.nome}
                      {pro.ativo ? "" : " (inativo)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Cliente ou telefone</span>
                <input
                  value={draft.customer}
                  placeholder="Nome ou WhatsApp"
                  onChange={(event) =>
                    setDraft({ ...draft, customer: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Serviço ou agendamento</span>
                <input
                  value={draft.search}
                  placeholder="Serviço, cliente ou código do agendamento"
                  onChange={(event) =>
                    setDraft({ ...draft, search: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Situação do atendimento</span>
                <select
                  aria-label="Situação do atendimento"
                  value={draft.status}
                  onChange={(event) =>
                    setDraft({ ...draft, status: event.target.value })
                  }
                >
                  <option value="">Todas as situações</option>
                  <option value="scheduled">Aguardando presença</option>
                  <option value="completed">Veio · pronto para receber</option>
                  <option value="paid">Pago</option>
                  <option value="no_show">Não veio</option>
                </select>
              </label>
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="outline"
                onClick={() => {
                  const reset = initialFilters();
                  setDraft(reset);
                  setFilters(reset);
                  setFiltersOpen(false);
                }}
              >
                Limpar filtros
              </button>
              <button className="primary">Aplicar filtros</button>
            </div>
          </form>
        </Modal>
      )}
      {newTime !== null && (
        <AppointmentModal
          initialDate={filters.from}
          initialTime={newTime}
          initialProfessional={filters.professional}
          close={() => setNewTime(null)}
        />
      )}
      {focused && (
        <Modal title="Agendamento" close={() => setFocused(null)}>
          <AppointmentIdentity appointment={focused} />
          <div className="agenda-dialog-actions">
            {presenceActions(focused)}
          </div>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={
            confirmation.status === "completed"
              ? "Confirmar que veio"
              : "Confirmar que não veio"
          }
          close={() => setConfirmation(null)}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                confirmation.status === "completed" &&
                confirmation.appointment.expected_price_cents <= 0 &&
                !(await run("set_price", {
                  id: confirmation.appointment.id,
                  amount: Math.round(Number(price) * 100),
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
            <AppointmentIdentity appointment={confirmation.appointment} />
            <p>
              {confirmation.status === "completed"
                ? "O atendimento ficará pronto para receber no Caixa. O pagamento será registrado ao confirmar o recebimento."
                : "A ausência será registrada e o horário ficará livre."}
            </p>
            {confirmation.status === "completed" &&
              confirmation.appointment.expected_price_cents <= 0 && (
                <label className="field">
                  <span>Valor combinado (R$)</span>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </label>
              )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Confirmar"}
            </button>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal title="Remover da Agenda" close={() => setRemoving(null)}>
          <AppointmentIdentity appointment={removing} />
          <p>
            Remover este agendamento da Agenda? Reservas ainda não atendidas
            serão canceladas e o horário ficará livre. Atendimentos concluídos e
            seu histórico financeiro serão preservados.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="danger"
            disabled={busy}
            onClick={async () => {
              if (await run("remove_agenda_appointment", { id: removing.id }))
                setRemoving(null);
            }}
          >
            Remover da Agenda
          </button>
        </Modal>
      )}
      {slot && (
        <Modal title={`Horário ${slot}`} close={() => setSlot("")}>
          <div className="agenda-dialog-actions">
            <button
              className="primary"
              onClick={() => {
                setNewTime(slot);
                setSlot("");
              }}
            >
              Agendar horário
            </button>
            <button
              className="outline"
              onClick={() => {
                setBlock({ time: slot, duration: 15, reason: "" });
                setSlot("");
              }}
            >
              Bloquear horário
            </button>
          </div>
        </Modal>
      )}
      {block && (
        <Modal title="Bloquear horário" close={() => setBlock(null)}>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const start = new Date(`${filters.from}T${block.time}:00-03:00`);
              if (
                await run("create_schedule_block", {
                  professional_id: filters.professional,
                  starts_at: start.toISOString(),
                  ends_at: new Date(
                    start.getTime() + block.duration * 60000,
                  ).toISOString(),
                  reason: block.reason || "Agenda bloqueada",
                })
              )
                setBlock(null);
            }}
          >
            <p>
              {selectedProfessional?.nome} · {dateLabel(filters.from)} ·{" "}
              {block.time}
            </p>
            <label className="field">
              <span>Duração</span>
              <select
                value={block.duration}
                onChange={(event) =>
                  setBlock({ ...block, duration: Number(event.target.value) })
                }
              >
                {[15, 30, 45, 60].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minutos
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Motivo (opcional)</span>
              <input
                value={block.reason}
                onChange={(event) =>
                  setBlock({ ...block, reason: event.target.value })
                }
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Bloquear horário
            </button>
          </form>
        </Modal>
      )}
      {focusedBlock && (
        <Modal title="Intervalo bloqueado" close={() => setFocusedBlock(null)}>
          <p>
            {focusedBlock.reason} · {timeLabel(focusedBlock.starts_at)}–
            {timeLabel(focusedBlock.ends_at)}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary"
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
    </section>
  );
}

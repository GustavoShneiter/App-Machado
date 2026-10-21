-- Remove apenas a exibição na Agenda; mantém os registros financeiros e o bloqueio de atendimentos concluídos.
alter table public.appointments add column if not exists agenda_hidden boolean not null default false;

create or replace function public.remove_agenda_appointment(appointment_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare appointment_row public.appointments%rowtype; command_status_value public.command_status;
begin
  perform public.require_office();
  select * into strict appointment_row from public.appointments where id=appointment_id for update;
  select c.status into command_status_value from public.commands c where c.appointment_id=remove_agenda_appointment.appointment_id for update;
  if appointment_row.status not in ('completed','cancelled','no_show') and coalesce(command_status_value::text,'') not in ('closed','refunded') then
    update public.appointments set status='cancelled',agenda_hidden=true where id=appointment_row.id;
  else
    update public.appointments set agenda_hidden=true where id=appointment_row.id;
  end if;
  return jsonb_build_object('id',appointment_row.id);
end;
$$;
revoke all on function public.remove_agenda_appointment(uuid) from public;

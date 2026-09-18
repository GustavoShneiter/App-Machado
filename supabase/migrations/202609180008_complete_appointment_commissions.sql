-- Finaliza um atendimento, registra a comanda e gera a comissão automaticamente.
create or replace function public.complete_appointment(appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  appointment_row public.appointments%rowtype;
  command_uuid uuid;
  item_uuid uuid;
  commission_rate numeric(5,2);
  commission_amount integer;
begin
  if public.current_role() not in ('owner', 'admin') then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;

  select * into appointment_row
  from public.appointments
  where id = appointment_id
  for update;

  if not found then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;

  if appointment_row.status = 'completed' then
    return;
  end if;

  update public.appointments set status = 'completed' where id = appointment_id;

  insert into public.commands (appointment_id, customer_id, status, opened_by, closed_at)
  values (appointment_row.id, appointment_row.customer_id, 'closed', auth.uid(), now())
  on conflict (appointment_id) do nothing;

  select c.id into command_uuid from public.commands c where c.appointment_id = appointment_row.id;

  select case when lower(trim(p.name)) = 'machado' then 0 else coalesce(ps.commission_percent, p.default_commission_percent, 40) end
  into commission_rate
  from public.professionals p
  left join public.professional_services ps on ps.professional_id = p.id and ps.service_id = appointment_row.service_id
  where p.id = appointment_row.professional_id;

  commission_amount := round(appointment_row.expected_price_cents * coalesce(commission_rate, 40) / 100.0);

  if not exists (select 1 from public.command_items where command_id = command_uuid and service_id = appointment_row.service_id) then
    insert into public.command_items (command_id, type, service_id, professional_id, description, unit_price_cents, quantity, commission_kind, commission_value, commission_cents)
    select command_uuid, 'service', s.id, appointment_row.professional_id, s.name, appointment_row.expected_price_cents, 1, 'percent', commission_rate, commission_amount
    from public.services s
    where s.id = appointment_row.service_id
    returning id into item_uuid;

    insert into public.commission_entries (command_item_id, professional_id, gross_cents, commission_cents, rule_snapshot, status)
    values (item_uuid, appointment_row.professional_id, appointment_row.expected_price_cents, commission_amount, jsonb_build_object('rate_percent', commission_rate, 'barbershop_cents', appointment_row.expected_price_cents - commission_amount), 'pending');
  end if;
end;
$$;

grant execute on function public.complete_appointment(uuid) to authenticated;

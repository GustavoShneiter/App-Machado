-- Dados iniciais e regras reais de atendimento da Barbearia Machado.
create table if not exists public.business_hours (
  weekday smallint not null check (weekday between 1 and 7),
  opens_at time not null,
  closes_at time not null,
  check (closes_at > opens_at),
  primary key (weekday, opens_at)
);

insert into public.business_hours (weekday, opens_at, closes_at) values
  (1, '08:00', '12:00'), (1, '13:00', '20:00'),
  (2, '08:00', '12:00'), (2, '13:30', '20:00'),
  (3, '08:00', '12:00'), (3, '13:00', '20:00'),
  (4, '08:00', '12:00'), (4, '13:30', '20:00'),
  (5, '08:00', '12:00'), (5, '13:30', '20:00'),
  (6, '08:00', '12:00'), (6, '13:00', '19:00')
on conflict do nothing;

insert into public.professionals (name, specialties, default_commission_percent, active)
select 'Machado', 'Cortes e barba', 0, true
where not exists (select 1 from public.professionals where name = 'Machado');

insert into public.professionals (name, specialties, default_commission_percent, active)
select 'Araujo', 'Cortes e barba', 50, true
where not exists (select 1 from public.professionals where name = 'Araujo');

insert into public.services (name, description, price_cents, duration_minutes, color, active) values
  ('Acabamento', 'Finalização do corte', 1500, 15, '#2f7d4c', true),
  ('Barba expressa', 'Barba rápida e alinhada', 3000, 30, '#2f7d4c', true),
  ('Barbo terapia', 'Valor a combinar', 0, 30, '#2f7d4c', true),
  ('Corte de cabelo', 'Corte masculino', 4000, 45, '#2f7d4c', true),
  ('Corte de cabelo + barbo terapia', 'Corte e tratamento de barba', 8000, 60, '#2f7d4c', true),
  ('Depilação nariz', 'Depilação facial', 2000, 15, '#2f7d4c', true),
  ('Depilação orelha', 'Depilação facial', 2000, 15, '#2f7d4c', true),
  ('Hidratação', 'Tratamento capilar', 3000, 15, '#2f7d4c', true),
  ('Pigmentação', 'Pigmentação capilar', 3500, 15, '#2f7d4c', true),
  ('Relaxamento', 'Tratamento capilar', 4000, 15, '#2f7d4c', true),
  ('Sobrancelha', 'Design de sobrancelha', 1500, 15, '#2f7d4c', true)
on conflict do nothing;

insert into public.professional_services (professional_id, service_id)
select p.id, s.id
from public.professionals p cross join public.services s
where p.name in ('Machado', 'Araujo')
on conflict do nothing;

create or replace function public.public_available_slots(chosen_service uuid, booking_day date, preferred_professional uuid default null)
returns table(slot_time time, professional_id uuid)
language sql stable security definer set search_path = public as $$
  with selected_service as (
    select duration_minutes from public.services where id = chosen_service and active
  ), candidates as (
    select candidate::time as slot_time, candidate as local_start, selected_service.duration_minutes
    from public.business_hours h cross join selected_service,
      lateral generate_series(
        (booking_day + h.opens_at)::timestamp,
        (booking_day + h.closes_at)::timestamp - make_interval(mins => selected_service.duration_minutes),
        interval '15 minutes'
      ) candidate
    where h.weekday = extract(isodow from booking_day)
      and candidate >= (now() at time zone 'America/Sao_Paulo') + interval '5 minutes'
  )
  select c.slot_time, p.id
  from candidates c
  join public.professionals p on p.active and (preferred_professional is null or p.id = preferred_professional)
  join public.professional_services ps on ps.professional_id = p.id and ps.service_id = chosen_service
  where not exists (
    select 1 from public.appointments a
    where a.professional_id = p.id
      and a.status not in ('cancelled', 'no_show')
      and a.starts_at < ((c.local_start + make_interval(mins => c.duration_minutes)) at time zone 'America/Sao_Paulo')
      and a.ends_at > (c.local_start at time zone 'America/Sao_Paulo')
  )
  order by c.slot_time, p.id;
$$;

create or replace function public.create_public_appointment(customer_name text, customer_phone text, chosen_service uuid, chosen_professional uuid, start_time timestamptz, terms_accepted boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare customer_uuid uuid; appointment_uuid uuid; duration integer; price integer; local_start timestamp;
begin
  if not terms_accepted then raise exception 'terms_not_accepted' using errcode = '22023'; end if;
  local_start := start_time at time zone 'America/Sao_Paulo';
  if not exists (
    select 1 from public.public_available_slots(chosen_service, local_start::date, chosen_professional)
    where slot_time = local_start::time
  ) then raise exception 'slot_not_available' using errcode = '22023'; end if;
  select duration_minutes, price_cents into duration, price from public.services where id = chosen_service and active;
  select id into customer_uuid from public.customers where phone = customer_phone;
  if customer_uuid is null then
    insert into public.customers(name, phone) values (customer_name, customer_phone) returning id into customer_uuid;
  else
    update public.customers set name = customer_name where id = customer_uuid;
  end if;
  insert into public.appointments(customer_id, professional_id, service_id, starts_at, ends_at, expected_price_cents, source)
  values (customer_uuid, chosen_professional, chosen_service, start_time, start_time + make_interval(mins => duration), price, 'instagram')
  returning id into appointment_uuid;
  insert into public.notifications(title, body) values ('Novo agendamento online', customer_name || ' agendou pelo link público.');
  return appointment_uuid;
end $$;

grant execute on function public.public_available_slots(uuid, date, uuid) to anon, authenticated;
grant execute on function public.create_public_appointment(text, text, uuid, uuid, timestamptz, boolean) to anon, authenticated;

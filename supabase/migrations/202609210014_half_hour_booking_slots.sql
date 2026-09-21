-- Horários públicos em blocos de 30 minutos, respeitando expediente e conflitos.
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
        interval '30 minutes'
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

grant execute on function public.public_available_slots(uuid, date, uuid) to anon, authenticated;

-- Grade operacional em intervalos de 15 minutos e bloqueios reais de agenda.
begin;

create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default 'Agenda bloqueada',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  check (ends_at > starts_at)
);

create index if not exists schedule_blocks_professional_period_idx
  on public.schedule_blocks(professional_id, starts_at, ends_at);

do $$ begin
  if not exists(select 1 from pg_constraint where conname='schedule_blocks_no_overlap') then
    alter table public.schedule_blocks add constraint schedule_blocks_no_overlap
      exclude using gist (professional_id with =, tstzrange(starts_at,ends_at,'[)') with &&);
  end if;
end $$;

alter table public.schedule_blocks enable row level security;
drop policy if exists "staff read schedule blocks" on public.schedule_blocks;
create policy "staff read schedule blocks" on public.schedule_blocks for select to authenticated
  using (public.current_role() in ('owner','admin') or professional_id in (select id from public.professionals where profile_id=auth.uid()));
drop policy if exists "office manage schedule blocks" on public.schedule_blocks;
create policy "office manage schedule blocks" on public.schedule_blocks for all to authenticated
  using (public.current_role() in ('owner','admin')) with check (public.current_role() in ('owner','admin'));

create or replace function public.ensure_appointment_not_blocked() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.status not in ('cancelled','no_show') then
    perform pg_advisory_xact_lock(hashtextextended(new.professional_id::text,0));
    if exists (
      select 1 from public.schedule_blocks b
      where b.professional_id=new.professional_id
        and b.starts_at<new.ends_at and b.ends_at>new.starts_at
    ) then
      raise exception 'slot_blocked' using errcode='23P01';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists appointments_block_guard on public.appointments;
create trigger appointments_block_guard before insert or update of professional_id,starts_at,ends_at,status
  on public.appointments for each row execute function public.ensure_appointment_not_blocked();

create or replace function public.create_schedule_block(professional_id uuid, starts_at timestamptz, ends_at timestamptz, reason text default '') returns jsonb
language plpgsql security definer set search_path=public as $$
declare block_uuid uuid;
begin
  perform public.require_office();
  if not exists(select 1 from public.professionals p where p.id=create_schedule_block.professional_id and p.active) then
    raise exception 'Profissional indisponível.';
  end if;
  if create_schedule_block.starts_at is null or create_schedule_block.ends_at is null or create_schedule_block.ends_at<=create_schedule_block.starts_at then
    raise exception 'Período de bloqueio inválido.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(create_schedule_block.professional_id::text,0));
  if extract(second from create_schedule_block.starts_at at time zone 'America/Sao_Paulo')<>0
    or mod(extract(minute from create_schedule_block.starts_at at time zone 'America/Sao_Paulo')::integer,15)<>0
    or mod((extract(epoch from (create_schedule_block.ends_at-create_schedule_block.starts_at))/60)::integer,15)<>0 then
    raise exception 'O bloqueio precisa respeitar intervalos de 15 minutos.';
  end if;
  if exists(select 1 from public.appointments a where a.professional_id=create_schedule_block.professional_id and a.status not in ('cancelled','no_show') and a.starts_at<create_schedule_block.ends_at and a.ends_at>create_schedule_block.starts_at)
    or exists(select 1 from public.schedule_blocks b where b.professional_id=create_schedule_block.professional_id and b.starts_at<create_schedule_block.ends_at and b.ends_at>create_schedule_block.starts_at) then
    raise exception 'slot_blocked' using errcode='23P01';
  end if;
  insert into public.schedule_blocks(professional_id,starts_at,ends_at,reason,created_by)
    values(create_schedule_block.professional_id,create_schedule_block.starts_at,create_schedule_block.ends_at,coalesce(nullif(trim(create_schedule_block.reason),''),'Agenda bloqueada'),auth.uid())
    returning id into block_uuid;
  return jsonb_build_object('id',block_uuid);
end; $$;

create or replace function public.delete_schedule_block(block_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform public.require_office();
  delete from public.schedule_blocks where id=block_id;
  if not found then raise exception 'Bloqueio não encontrado.'; end if;
  return jsonb_build_object('id',block_id);
end; $$;

create or replace function public.public_booking_slots(chosen_service uuid, booking_day date, preferred_professional uuid default null)
returns table(slot_time time, professional_id uuid, available boolean)
language sql stable security definer set search_path=public as $$
  with selected_service as (
    select duration_minutes from public.services where id=chosen_service and active
  ), candidates as (
    select candidate::time as slot_time, candidate as local_start, selected_service.duration_minutes
    from public.business_hours h cross join selected_service,
      lateral generate_series(
        (booking_day+h.opens_at)::timestamp,
        (booking_day+h.closes_at)::timestamp-make_interval(mins=>selected_service.duration_minutes),
        interval '15 minutes'
      ) candidate
    where h.weekday=extract(isodow from booking_day)
      and candidate>=(now() at time zone 'America/Sao_Paulo')+interval '5 minutes'
  )
  select c.slot_time,free_professional.id,free_professional.id is not null
  from candidates c
  left join lateral (
    select p.id from public.professionals p
    join public.professional_services ps on ps.professional_id=p.id and ps.service_id=chosen_service
    where p.active and (preferred_professional is null or p.id=preferred_professional)
      and not exists(select 1 from public.appointments a where a.professional_id=p.id and a.status not in ('cancelled','no_show') and a.starts_at<((c.local_start+make_interval(mins=>c.duration_minutes)) at time zone 'America/Sao_Paulo') and a.ends_at>(c.local_start at time zone 'America/Sao_Paulo'))
      and not exists(select 1 from public.schedule_blocks b where b.professional_id=p.id and b.starts_at<((c.local_start+make_interval(mins=>c.duration_minutes)) at time zone 'America/Sao_Paulo') and b.ends_at>(c.local_start at time zone 'America/Sao_Paulo'))
    order by p.name limit 1
  ) free_professional on true
  order by c.slot_time;
$$;

create or replace function public.office_snapshot() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform public.require_office();
  return jsonb_build_object(
    'appointments',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from (select a.*,c.name customer_name,c.phone customer_phone,p.name professional_name,s.name service_name from public.appointments a join public.customers c on c.id=a.customer_id join public.professionals p on p.id=a.professional_id join public.services s on s.id=a.service_id) x),'[]'::jsonb),
    'blocks',coalesce((select jsonb_agg(b order by b.starts_at) from public.schedule_blocks b),'[]'::jsonb),
    'customers',coalesce((select jsonb_agg(c order by c.name) from public.customers c),'[]'::jsonb),
    'commands',coalesce((select jsonb_agg(c order by c.created_at desc) from public.commands c),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(i) from public.command_items i),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(p) from public.payments p),'[]'::jsonb),
    'commissions',coalesce((select jsonb_agg(c) from public.commission_entries c),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(s order by s.opened_at desc) from public.cash_sessions s),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(m order by m.created_at desc) from public.cash_movements m),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(p order by p.name) from public.products p),'[]'::jsonb),
    'packages',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (select p.*,coalesce((select jsonb_agg(jsonb_build_object('service_id',i.service_id,'service_name',s.name,'quantity',i.quantity) order by s.name) from public.service_package_items i join public.services s on s.id=i.service_id where i.package_id=p.id),'[]'::jsonb) items from public.service_packages p) x),'[]'::jsonb),
    'packageSales',coalesce((select jsonb_agg(to_jsonb(x) order by x.sold_at desc) from (select ps.*,p.name package_name,c.name customer_name,coalesce((select jsonb_agg(jsonb_build_object('service_id',b.service_id,'service_name',s.name,'total',b.total,'remaining',b.remaining) order by s.name) from public.package_sale_balances b join public.services s on s.id=b.service_id where b.sale_id=ps.id),'[]'::jsonb) balances from public.package_sales ps join public.service_packages p on p.id=ps.package_id join public.customers c on c.id=ps.customer_id) x),'[]'::jsonb),
    'business',coalesce((select jsonb_agg(b) from public.business_settings b),'[]'::jsonb)
  );
end; $$;

create or replace function public.reset_operational_data(confirmation text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare removed_appointments integer:=0; removed_customers integer:=0; removed_commands integer:=0; removed_sessions integer:=0; removed_packages integer:=0; removed_blocks integer:=0;
begin
  perform public.require_office();
  if public.current_role()<>'owner' then raise exception 'Somente o proprietário pode zerar a operação.'; end if;
  if coalesce(confirmation,'')<>'ZERAR OPERAÇÃO' then raise exception 'Digite ZERAR OPERAÇÃO para confirmar a limpeza.'; end if;
  delete from public.cash_movements where id is not null;
  delete from public.package_sale_balances where sale_id is not null;
  delete from public.package_sales where id is not null; get diagnostics removed_packages=row_count;
  delete from public.commission_entries where id is not null;
  delete from public.payments where id is not null;
  delete from public.command_items where id is not null;
  delete from public.commands where id is not null; get diagnostics removed_commands=row_count;
  delete from public.appointments where id is not null; get diagnostics removed_appointments=row_count;
  delete from public.schedule_blocks where id is not null; get diagnostics removed_blocks=row_count;
  delete from public.cash_sessions where id is not null; get diagnostics removed_sessions=row_count;
  delete from public.customers where id is not null; get diagnostics removed_customers=row_count;
  insert into public.audit_logs(actor_profile_id,operation,entity_type,request_summary,result) values(auth.uid(),'reset_operational_data','operation',jsonb_build_object('appointments',removed_appointments,'blocks',removed_blocks,'customers',removed_customers,'commands',removed_commands,'cash_sessions',removed_sessions,'package_sales',removed_packages),'success');
  return jsonb_build_object('appointments',removed_appointments,'blocks',removed_blocks,'customers',removed_customers,'commands',removed_commands,'cash_sessions',removed_sessions,'package_sales',removed_packages);
end; $$;

revoke all on function public.create_schedule_block(uuid,timestamptz,timestamptz,text),public.delete_schedule_block(uuid) from public,anon;
grant execute on function public.create_schedule_block(uuid,timestamptz,timestamptz,text),public.delete_schedule_block(uuid) to authenticated;
grant execute on function public.public_booking_slots(uuid,date,uuid) to anon,authenticated;

commit;

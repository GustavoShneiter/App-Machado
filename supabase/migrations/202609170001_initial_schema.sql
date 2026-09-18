-- Schema inicial: Barbearia Machado (uma única empresa).
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type public.user_role as enum ('owner', 'admin', 'professional');
create type public.appointment_status as enum ('scheduled', 'confirmed', 'arrived', 'in_service', 'completed', 'cancelled', 'no_show');
create type public.command_status as enum ('open', 'awaiting_payment', 'closed', 'voided', 'refunded');
create type public.commission_status as enum ('forecast', 'pending', 'paid', 'reversed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role public.user_role not null default 'professional',
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) >= 2),
  phone text not null unique, email text, birth_date date, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references public.profiles(id)
);
create table public.professionals (
  id uuid primary key default gen_random_uuid(), profile_id uuid unique references public.profiles(id), name text not null,
  phone text, specialties text, active boolean not null default true, default_commission_percent numeric(5,2) check (default_commission_percent between 0 and 100), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.services (
  id uuid primary key default gen_random_uuid(), name text not null, description text, price_cents integer not null check (price_cents >= 0),
  duration_minutes integer not null check (duration_minutes between 5 and 480), color text, active boolean not null default true,
  default_commission_percent numeric(5,2) check (default_commission_percent between 0 and 100), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.professional_services (professional_id uuid references public.professionals(id) on delete cascade, service_id uuid references public.services(id) on delete cascade, commission_percent numeric(5,2) check (commission_percent between 0 and 100), primary key (professional_id, service_id));
create table public.products (id uuid primary key default gen_random_uuid(), name text not null, category text, internal_code text unique, barcode text unique, cost_cents integer check (cost_cents >= 0), sale_price_cents integer not null check (sale_price_cents >= 0), quantity integer not null default 0, minimum_quantity integer not null default 0 check (minimum_quantity >= 0), active boolean not null default true, commission_percent numeric(5,2) check (commission_percent between 0 and 100), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.appointments (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id), professional_id uuid not null references public.professionals(id), service_id uuid not null references public.services(id),
  starts_at timestamptz not null, ends_at timestamptz not null, expected_price_cents integer not null check (expected_price_cents >= 0), status public.appointment_status not null default 'scheduled', source text not null default 'panel', notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references public.profiles(id),
  check (ends_at > starts_at),
  exclude using gist (professional_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status not in ('cancelled', 'no_show'))
);
create index appointments_start_idx on public.appointments(starts_at); create index appointments_customer_idx on public.appointments(customer_id);
create table public.commands (id uuid primary key default gen_random_uuid(), appointment_id uuid unique references public.appointments(id), customer_id uuid references public.customers(id), status public.command_status not null default 'open', discount_cents integer not null default 0 check (discount_cents >= 0), surcharge_cents integer not null default 0 check (surcharge_cents >= 0), notes text, opened_by uuid references public.profiles(id), closed_at timestamptz, created_at timestamptz not null default now());
create table public.command_items (id uuid primary key default gen_random_uuid(), command_id uuid not null references public.commands(id), type text not null check (type in ('service','product')), service_id uuid references public.services(id), product_id uuid references public.products(id), professional_id uuid references public.professionals(id), description text not null, unit_price_cents integer not null check (unit_price_cents >= 0), quantity integer not null default 1 check (quantity > 0), commission_kind text check (commission_kind in ('percent','fixed')), commission_value numeric(10,2), commission_cents integer not null default 0, check ((service_id is not null)::integer + (product_id is not null)::integer = 1));
create table public.payments (id uuid primary key default gen_random_uuid(), command_id uuid not null references public.commands(id), method text not null check (method in ('cash','pix','debit','credit','other')), amount_cents integer not null check (amount_cents > 0), paid_at timestamptz not null default now(), recorded_by uuid references public.profiles(id), reversed_at timestamptz);
create table public.stock_movements (id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id), type text not null check (type in ('entry','sale','adjustment','loss','return')), quantity_delta integer not null, reference_id uuid, reason text, created_at timestamptz not null default now(), created_by uuid references public.profiles(id));
create table public.cash_sessions (id uuid primary key default gen_random_uuid(), opened_by uuid not null references public.profiles(id), opened_at timestamptz not null default now(), opening_balance_cents integer not null default 0, closed_at timestamptz, declared_balance_cents integer, notes text);
create table public.cash_movements (id uuid primary key default gen_random_uuid(), session_id uuid not null references public.cash_sessions(id), type text not null check (type in ('sale','expense','withdrawal','reinforcement','refund')), amount_cents integer not null, payment_method text, notes text, created_at timestamptz not null default now(), created_by uuid references public.profiles(id));
create table public.commission_entries (id uuid primary key default gen_random_uuid(), command_item_id uuid unique not null references public.command_items(id), professional_id uuid not null references public.professionals(id), gross_cents integer not null, commission_cents integer not null, rule_snapshot jsonb not null, status public.commission_status not null default 'forecast', paid_at timestamptz, reversed_at timestamptz, created_at timestamptz not null default now());
create table public.notifications (id uuid primary key default gen_random_uuid(), profile_id uuid references public.profiles(id), title text not null, body text not null, read_at timestamptz, created_at timestamptz not null default now());
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_profile_id uuid references public.profiles(id), integration_id text, operation text not null, entity_type text, entity_id uuid, request_summary jsonb, result text not null, error_code text, created_at timestamptz not null default now());

create or replace function public.current_role() returns public.user_role language sql stable security definer set search_path = public as $$ select role from public.profiles where id = auth.uid() $$;
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger customers_updated before update on public.customers for each row execute function public.touch_updated_at();
create trigger professionals_updated before update on public.professionals for each row execute function public.touch_updated_at();
create trigger services_updated before update on public.services for each row execute function public.touch_updated_at();
create trigger products_updated before update on public.products for each row execute function public.touch_updated_at();
create trigger appointments_updated before update on public.appointments for each row execute function public.touch_updated_at();

-- A função pública reaproveita cliente por telefone e delega a garantia de conflito ao exclusion constraint.
create or replace function public.create_public_appointment(customer_name text, customer_phone text, chosen_service uuid, chosen_professional uuid, start_time timestamptz, terms_accepted boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare customer_uuid uuid; appointment_uuid uuid; duration integer; price integer;
begin
  if not terms_accepted then raise exception 'terms_not_accepted' using errcode = '22023'; end if;
  select id into customer_uuid from public.customers where phone = customer_phone;
  if customer_uuid is null then insert into public.customers(name, phone) values (customer_name, customer_phone) returning id into customer_uuid; else update public.customers set name = customer_name where id = customer_uuid; end if;
  select duration_minutes, price_cents into duration, price from public.services where id = chosen_service and active;
  if duration is null then raise exception 'service_not_available' using errcode = '22023'; end if;
  insert into public.appointments(customer_id, professional_id, service_id, starts_at, ends_at, expected_price_cents, source) values (customer_uuid, chosen_professional, chosen_service, start_time, start_time + make_interval(mins => duration), price, 'instagram') returning id into appointment_uuid;
  insert into public.notifications(title, body) values ('Novo agendamento online', customer_name || ' agendou pelo link público.');
  return appointment_uuid;
end $$;

alter table public.profiles enable row level security; alter table public.customers enable row level security; alter table public.professionals enable row level security; alter table public.services enable row level security; alter table public.products enable row level security; alter table public.appointments enable row level security; alter table public.commands enable row level security; alter table public.command_items enable row level security; alter table public.payments enable row level security; alter table public.stock_movements enable row level security; alter table public.cash_sessions enable row level security; alter table public.cash_movements enable row level security; alter table public.commission_entries enable row level security; alter table public.notifications enable row level security; alter table public.audit_logs enable row level security;
create policy "staff read customers" on public.customers for select to authenticated using (public.current_role() in ('owner','admin','professional'));
create policy "office manage customers" on public.customers for all to authenticated using (public.current_role() in ('owner','admin')) with check (public.current_role() in ('owner','admin'));
create policy "staff read schedule" on public.appointments for select to authenticated using (public.current_role() in ('owner','admin') or professional_id in (select id from public.professionals where profile_id = auth.uid()));
create policy "office manage schedule" on public.appointments for all to authenticated using (public.current_role() in ('owner','admin')) with check (public.current_role() in ('owner','admin'));
create policy "staff read catalog" on public.services for select to authenticated using (true); create policy "office manage catalog" on public.services for all to authenticated using (public.current_role() in ('owner','admin')) with check (public.current_role() in ('owner','admin'));
create policy "staff read professionals" on public.professionals for select to authenticated using (true); create policy "owner manage professionals" on public.professionals for all to authenticated using (public.current_role() = 'owner') with check (public.current_role() = 'owner');
create policy "office manage financial" on public.commands for all to authenticated using (public.current_role() in ('owner','admin')) with check (public.current_role() in ('owner','admin'));
create policy "office read products" on public.products for select to authenticated using (public.current_role() in ('owner','admin')); create policy "office manage products" on public.products for all to authenticated using (public.current_role() in ('owner','admin')) with check (public.current_role() in ('owner','admin'));
create policy "own commission only" on public.commission_entries for select to authenticated using (public.current_role() in ('owner','admin') or professional_id in (select id from public.professionals where profile_id = auth.uid()));
create policy "own notifications" on public.notifications for select to authenticated using (profile_id is null or profile_id = auth.uid() or public.current_role() in ('owner','admin'));
create policy "owner audit read" on public.audit_logs for select to authenticated using (public.current_role() = 'owner');
grant execute on function public.create_public_appointment(text,text,uuid,uuid,timestamptz,boolean) to anon, authenticated;

-- Módulos de pacotes, empresa, cadastro completo de clientes e ajustes de comanda.
begin;

create table if not exists public.service_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) >= 2),
  description text,
  price_cents integer not null check (price_cents > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.service_package_items (
  package_id uuid not null references public.service_packages(id) on delete cascade,
  service_id uuid not null references public.services(id),
  quantity integer not null check (quantity > 0),
  primary key(package_id, service_id)
);
create table if not exists public.package_sales (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.service_packages(id),
  customer_id uuid not null references public.customers(id),
  amount_cents integer not null check (amount_cents > 0),
  method text not null check (method in ('cash','pix','debit','credit','other')),
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  sold_at timestamptz not null default now(),
  sold_by uuid references public.profiles(id)
);
create table if not exists public.package_sale_balances (
  sale_id uuid not null references public.package_sales(id) on delete cascade,
  service_id uuid not null references public.services(id),
  total integer not null check (total > 0),
  remaining integer not null check (remaining >= 0),
  primary key(sale_id, service_id),
  check (remaining <= total)
);
create table if not exists public.business_settings (
  id boolean primary key default true check (id),
  name text not null default 'Machado Barbearia',
  legal_name text,
  email text,
  phone text,
  postal_code text,
  street text,
  city text,
  state text,
  instagram text,
  website text,
  updated_at timestamptz not null default now()
);
insert into public.business_settings(id) values(true) on conflict(id) do nothing;

alter table public.cash_movements add column if not exists package_sale_id uuid references public.package_sales(id);
create unique index if not exists cash_sale_package_unique on public.cash_movements(package_sale_id) where package_sale_id is not null;
alter table public.service_packages enable row level security;
alter table public.service_package_items enable row level security;
alter table public.package_sales enable row level security;
alter table public.package_sale_balances enable row level security;
alter table public.business_settings enable row level security;

drop trigger if exists service_packages_updated on public.service_packages;
create trigger service_packages_updated before update on public.service_packages for each row execute function public.touch_updated_at();

create or replace function public.save_customer_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare customer_uuid uuid; clean_name text; clean_phone text; birth_value date;
begin
  perform public.require_office();
  customer_uuid := nullif(payload->>'id','')::uuid;
  clean_name := trim(payload->>'name');
  clean_phone := regexp_replace(payload->>'phone','\D','','g');
  birth_value := nullif(payload->>'birth_date','')::date;
  if length(coalesce(clean_name,''))<2 or length(coalesce(clean_phone,''))<10 then raise exception 'Nome e telefone válidos são obrigatórios.'; end if;
  if customer_uuid is null then
    insert into public.customers(name,phone,email,birth_date,notes,created_by)
      values(clean_name,clean_phone,nullif(trim(payload->>'email'),''),birth_value,nullif(trim(payload->>'notes'),''),auth.uid()) returning id into customer_uuid;
  else
    update public.customers set name=clean_name,phone=clean_phone,email=nullif(trim(payload->>'email'),''),birth_date=birth_value,notes=nullif(trim(payload->>'notes'),'') where id=customer_uuid;
  end if;
  return jsonb_build_object('id',customer_uuid);
end; $$;

create or replace function public.set_command_adjustments(command_id uuid, discount_cents integer default 0, surcharge_cents integer default 0) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_row public.commands%rowtype; subtotal integer;
begin
  perform public.require_office();
  select * into strict command_row from public.commands where id=command_id for update;
  if command_row.status not in ('open','awaiting_payment') then raise exception 'Esta comanda não aceita mais alterações.'; end if;
  if discount_cents < 0 or surcharge_cents < 0 then raise exception 'Desconto e gorjeta não podem ser negativos.'; end if;
  select coalesce(sum(unit_price_cents*quantity),0) into subtotal from public.command_items where command_id=command_row.id;
  if subtotal-discount_cents+surcharge_cents <= 0 then raise exception 'O total da comanda precisa ser maior que zero.'; end if;
  update public.commands set discount_cents=set_command_adjustments.discount_cents,surcharge_cents=set_command_adjustments.surcharge_cents where id=command_row.id;
  return jsonb_build_object('id',command_row.id);
end; $$;

create or replace function public.save_service_package(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare package_uuid uuid; package_name text; package_price integer; package_item jsonb; service_uuid uuid; item_quantity integer;
begin
  perform public.require_office();
  package_uuid := nullif(payload->>'id','')::uuid;
  package_name := trim(payload->>'name'); package_price := (payload->>'price')::integer;
  if length(coalesce(package_name,''))<2 or package_price is null or package_price<=0 then raise exception 'Informe nome e valor válidos para o pacote.'; end if;
  if jsonb_array_length(coalesce(payload->'items','[]'::jsonb))=0 then raise exception 'Inclua ao menos um serviço no pacote.'; end if;
  if package_uuid is null then
    insert into public.service_packages(name,description,price_cents,active)
      values(package_name,nullif(trim(payload->>'description'),''),package_price,coalesce((payload->>'active')::boolean,true)) returning id into package_uuid;
  else
    update public.service_packages set name=package_name,description=nullif(trim(payload->>'description'),''),price_cents=package_price,active=coalesce((payload->>'active')::boolean,true) where id=package_uuid;
    delete from public.service_package_items where package_id=package_uuid;
  end if;
  for package_item in select value from jsonb_array_elements(payload->'items') loop
    service_uuid := (package_item->>'service_id')::uuid; item_quantity := (package_item->>'quantity')::integer;
    if item_quantity is null or item_quantity<1 or not exists(select 1 from public.services where id=service_uuid) then raise exception 'Serviço ou quantidade inválida no pacote.'; end if;
    insert into public.service_package_items(package_id,service_id,quantity) values(package_uuid,service_uuid,item_quantity);
  end loop;
  return jsonb_build_object('id',package_uuid);
end; $$;

create or replace function public.sell_service_package(package_id uuid, customer_id uuid, payment_method text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare package_row public.service_packages%rowtype; cash_row public.cash_sessions%rowtype; sale_uuid uuid;
begin
  perform public.require_office();
  if payment_method not in ('cash','pix','debit','credit','other') then raise exception 'Forma de pagamento inválida.'; end if;
  select * into strict cash_row from public.cash_sessions where closed_at is null order by opened_at desc limit 1 for update;
  select * into strict package_row from public.service_packages where id=package_id and active for update;
  if not exists(select 1 from public.customers where id=customer_id) then raise exception 'Cliente não encontrado.'; end if;
  insert into public.package_sales(package_id,customer_id,amount_cents,method,sold_by)
    values(package_row.id,customer_id,package_row.price_cents,payment_method,auth.uid()) returning id into sale_uuid;
  insert into public.package_sale_balances(sale_id,service_id,total,remaining)
    select sale_uuid,service_id,quantity,quantity from public.service_package_items where package_id=package_row.id;
  if not found then raise exception 'Este pacote não possui serviços.'; end if;
  insert into public.cash_movements(session_id,type,amount_cents,payment_method,notes,created_by,package_sale_id)
    values(cash_row.id,'sale',package_row.price_cents,payment_method,'Venda de pacote',auth.uid(),sale_uuid);
  return jsonb_build_object('id',sale_uuid);
end; $$;

create or replace function public.redeem_package_service(package_sale_id uuid, service_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare remaining_total integer;
begin
  perform public.require_office();
  perform id from public.package_sales where id=package_sale_id and status='active' for update;
  if not found then raise exception 'Pacote indisponível para uso.'; end if;
  update public.package_sale_balances set remaining=remaining-1 where sale_id=package_sale_id and service_id=redeem_package_service.service_id and remaining>0;
  if not found then raise exception 'Não há sessão disponível para este serviço.'; end if;
  select coalesce(sum(remaining),0) into remaining_total from public.package_sale_balances where sale_id=package_sale_id;
  if remaining_total=0 then update public.package_sales set status='completed' where id=package_sale_id; end if;
  return jsonb_build_object('id',package_sale_id,'remaining',remaining_total);
end; $$;

create or replace function public.save_business_settings(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform public.require_office();
  if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Informe o nome da empresa.'; end if;
  insert into public.business_settings(id,name,legal_name,email,phone,postal_code,street,city,state,instagram,website,updated_at)
    values(true,trim(payload->>'name'),nullif(trim(payload->>'legal_name'),''),nullif(trim(payload->>'email'),''),nullif(trim(payload->>'phone'),''),nullif(trim(payload->>'postal_code'),''),nullif(trim(payload->>'street'),''),nullif(trim(payload->>'city'),''),nullif(trim(payload->>'state'),''),nullif(trim(payload->>'instagram'),''),nullif(trim(payload->>'website'),''),now())
  on conflict(id) do update set name=excluded.name,legal_name=excluded.legal_name,email=excluded.email,phone=excluded.phone,postal_code=excluded.postal_code,street=excluded.street,city=excluded.city,state=excluded.state,instagram=excluded.instagram,website=excluded.website,updated_at=now();
  return jsonb_build_object('id',true);
end; $$;

create or replace function public.office_snapshot() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform public.require_office();
  return jsonb_build_object(
    'appointments',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from (select a.*,c.name customer_name,c.phone customer_phone,p.name professional_name,s.name service_name from public.appointments a join public.customers c on c.id=a.customer_id join public.professionals p on p.id=a.professional_id join public.services s on s.id=a.service_id) x),'[]'::jsonb),
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

create or replace function public.delete_customer_record(customer_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform public.require_office();
  if exists(select 1 from public.appointments where customer_id=delete_customer_record.customer_id) then raise exception 'Remova os agendamentos deste cliente antes de excluí-lo.'; end if;
  if exists(select 1 from public.package_sales where customer_id=delete_customer_record.customer_id) then raise exception 'Cliente com pacote comprado não pode ser excluído.'; end if;
  delete from public.customers where id=delete_customer_record.customer_id;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  return jsonb_build_object('id',customer_id);
end; $$;

create or replace function public.reset_operational_data(confirmation text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare removed_appointments integer := 0; removed_customers integer := 0; removed_commands integer := 0; removed_sessions integer := 0; removed_packages integer := 0;
begin
  perform public.require_office();
  if public.current_role() <> 'owner' then raise exception 'Somente o proprietário pode zerar a operação.'; end if;
  if coalesce(confirmation,'') <> 'ZERAR OPERAÇÃO' then raise exception 'Digite ZERAR OPERAÇÃO para confirmar a limpeza.'; end if;
  delete from public.cash_movements where id is not null;
  delete from public.package_sale_balances where sale_id is not null;
  delete from public.package_sales where id is not null; get diagnostics removed_packages = row_count;
  delete from public.commission_entries where id is not null;
  delete from public.payments where id is not null;
  delete from public.command_items where id is not null;
  delete from public.commands where id is not null; get diagnostics removed_commands = row_count;
  delete from public.appointments where id is not null; get diagnostics removed_appointments = row_count;
  delete from public.cash_sessions where id is not null; get diagnostics removed_sessions = row_count;
  delete from public.customers where id is not null; get diagnostics removed_customers = row_count;
  insert into public.audit_logs(actor_profile_id,operation,entity_type,request_summary,result)
    values(auth.uid(),'reset_operational_data','operation',jsonb_build_object('appointments',removed_appointments,'customers',removed_customers,'commands',removed_commands,'cash_sessions',removed_sessions,'package_sales',removed_packages),'success');
  return jsonb_build_object('appointments',removed_appointments,'customers',removed_customers,'commands',removed_commands,'cash_sessions',removed_sessions,'package_sales',removed_packages);
end; $$;

revoke all on function public.save_customer_profile(jsonb), public.set_command_adjustments(uuid,integer,integer), public.save_service_package(jsonb), public.sell_service_package(uuid,uuid,text), public.redeem_package_service(uuid,uuid), public.save_business_settings(jsonb) from public, anon;
grant execute on function public.save_customer_profile(jsonb), public.set_command_adjustments(uuid,integer,integer), public.save_service_package(jsonb), public.sell_service_package(uuid,uuid,text), public.redeem_package_service(uuid,uuid), public.save_business_settings(jsonb) to authenticated;
revoke all on function public.office_snapshot(), public.delete_customer_record(uuid) from public, anon;
revoke all on function public.reset_operational_data(text) from public, anon;
grant execute on function public.office_snapshot(), public.delete_customer_record(uuid), public.reset_operational_data(text) to authenticated;

commit;

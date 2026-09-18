-- Operação integrada. Execute o arquivo inteiro: a transação evita atualização parcial.
begin;

alter table public.cash_movements add column if not exists command_id uuid references public.commands(id);
alter table public.cash_movements add column if not exists commission_entry_id uuid references public.commission_entries(id);
create unique index if not exists cash_sale_command_unique on public.cash_movements(command_id) where command_id is not null;
create unique index if not exists cash_commission_entry_unique on public.cash_movements(commission_entry_id) where commission_entry_id is not null;
alter table public.commission_entries add column if not exists paid_method text;

create or replace function public.require_office() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_access_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;
end $$;
revoke all on function public.require_office() from public, anon, authenticated;

-- Somente as funções transacionais abaixo escrevem nos lançamentos financeiros.
drop policy if exists "owner manages commission payments" on public.commission_entries;
create or replace function public.sync_appointment_command(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a public.appointments%rowtype; c uuid; item uuid; rate numeric; amount integer;
begin
  select * into strict a from public.appointments where id = p_id for update;
  if a.status in ('cancelled','no_show') then return null; end if;
  insert into public.commands(appointment_id, customer_id, status)
    values(a.id, a.customer_id, 'open') on conflict on constraint commands_appointment_id_key do nothing;
  select id into c from public.commands where appointment_id = a.id for update;
  select id into item from public.command_items where command_id = c and service_id = a.service_id limit 1;
  if item is null then
    select case when lower(trim(name)) = 'machado' then 0 else 40 end into rate from public.professionals where id = a.professional_id;
    amount := round(a.expected_price_cents * rate / 100.0);
    insert into public.command_items(command_id,type,service_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents)
      select c,'service',a.service_id,a.professional_id,s.name,a.expected_price_cents,1,'percent',rate,amount from public.services s where s.id=a.service_id returning id into item;
  end if;
  if a.status = 'completed' then
    update public.commands set status = 'awaiting_payment', closed_at=null where id=c and not exists(select 1 from public.payments where command_id=c and reversed_at is null);
    insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status)
      select i.id,i.professional_id,i.unit_price_cents*i.quantity,i.commission_cents,
        jsonb_build_object('rate_percent',i.commission_value,'barbershop_cents',i.unit_price_cents*i.quantity-i.commission_cents),'pending'
      from public.command_items i where i.id=item and i.commission_cents>0
      on conflict(command_item_id) do nothing;
  end if;
  return c;
end $$;
revoke all on function public.sync_appointment_command(uuid) from public, anon, authenticated;

create or replace function public.appointment_command_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('cancelled','no_show') then
    update public.commands set status='voided' where appointment_id=new.id and status in ('open','awaiting_payment');
  else
    perform public.sync_appointment_command(new.id);
  end if;
  return new;
end $$;
drop trigger if exists sync_appointment_command on public.appointments;
create trigger sync_appointment_command after insert or update of status on public.appointments for each row execute function public.appointment_command_trigger();

-- Evita desfazer no cliente um atendimento financeiro já consolidado.
create or replace function public.guard_completed_appointment() returns trigger
language plpgsql set search_path=public as $$
begin
  if old.status='completed' and (new.status<>old.status or new.expected_price_cents<>old.expected_price_cents or new.professional_id<>old.professional_id or new.service_id<>old.service_id) then
    raise exception 'Atendimento concluído não pode ser alterado. É necessário um estorno financeiro.';
  end if;
  return new;
end $$;
drop trigger if exists guard_completed_appointment on public.appointments;
create trigger guard_completed_appointment before update on public.appointments for each row execute function public.guard_completed_appointment();

create or replace function public.complete_appointment(appointment_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare a public.appointments%rowtype;
begin
  perform public.require_office();
  select * into strict a from public.appointments where id=$1 for update;
  if a.status in ('cancelled','no_show') then raise exception 'Atendimento cancelado ou ausente não pode gerar receita.'; end if;
  if a.status<>'completed' then update public.appointments set status='completed' where id=a.id; end if;
  perform public.sync_appointment_command(a.id);
end $$;
revoke all on function public.complete_appointment(uuid) from public, anon;
grant execute on function public.complete_appointment(uuid) to authenticated;

-- Reconcilia agendamentos existentes sem inventar pagamentos de clientes.
do $$ declare a record; begin
  for a in select id from public.appointments where status not in ('cancelled','no_show') loop perform public.sync_appointment_command(a.id); end loop;
end $$;

create or replace function public.office_snapshot() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform public.require_office();
  return jsonb_build_object(
    'appointments',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from (
      select a.*,c.name customer_name,c.phone customer_phone,p.name professional_name,s.name service_name
      from public.appointments a join public.customers c on c.id=a.customer_id join public.professionals p on p.id=a.professional_id join public.services s on s.id=a.service_id
    ) x),'[]'::jsonb),
    'customers',coalesce((select jsonb_agg(c order by c.name) from public.customers c),'[]'::jsonb),
    'commands',coalesce((select jsonb_agg(c order by c.created_at desc) from public.commands c),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(i) from public.command_items i),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(p) from public.payments p),'[]'::jsonb),
    'commissions',coalesce((select jsonb_agg(c) from public.commission_entries c),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(s order by s.opened_at desc) from public.cash_sessions s),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(m order by m.created_at desc) from public.cash_movements m),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(p order by p.name) from public.products p),'[]'::jsonb)
  );
end $$;
revoke all on function public.office_snapshot() from public, anon;
grant execute on function public.office_snapshot() to authenticated;

create or replace function public.office_action(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_id uuid; c public.commands%rowtype; a public.appointments%rowtype; s public.cash_sessions%rowtype;
  item record; total integer; amount integer; balance integer; method text; target public.appointment_status;
  customer_uuid uuid; pro_uuid uuid; service_row public.services%rowtype; customer_name text; v_phone text; start_at timestamptz;
begin
  perform public.require_office();
  v_id := nullif(payload->>'id','')::uuid;
  method := coalesce(payload->>'method','cash');
  if action in ('receive','pay_commissions','move_cash') then
    if method not in ('cash','pix','debit','credit','other') then raise exception 'Forma de pagamento inválida.'; end if;
    select * into s from public.cash_sessions where closed_at is null order by opened_at desc limit 1 for update;
    if s.id is null then raise exception 'Abra o caixa antes de registrar movimentações.'; end if;
  end if;
  if action='set_status' then
    target := (payload->>'status')::public.appointment_status;
    select * into strict a from public.appointments where id=v_id for update;
    if a.status='completed' and target<>'completed' then raise exception 'Atendimento já concluído.'; end if;
    if a.status in ('cancelled','no_show') then raise exception 'Crie um novo agendamento para este cliente.'; end if;
    if target='completed' then perform public.complete_appointment(v_id);
    else update public.appointments set status=target where id=v_id; end if;
  elsif action='receive' then
    select * into strict c from public.commands where id=v_id for update;
    if c.status='closed' then return jsonb_build_object('id',c.id); end if;
    if c.status<>'awaiting_payment' then raise exception 'Confirme a conclusão do atendimento antes de receber.'; end if;
    select coalesce(sum(unit_price_cents*quantity),0)-c.discount_cents+c.surcharge_cents into total from public.command_items where command_id=c.id;
    if total<=0 then raise exception 'Defina o valor do serviço antes de receber.'; end if;
    insert into public.payments(command_id,method,amount_cents,recorded_by) values(c.id,method,total,auth.uid());
    insert into public.cash_movements(session_id,type,amount_cents,payment_method,notes,created_by,command_id) values(s.id,'sale',total,method,'Recebimento de comanda',auth.uid(),c.id);
    update public.commands set status='closed',closed_at=now() where id=c.id;
  elsif action='pay_commissions' then
    -- Somente IDs visualizados e confirmados pelo operador; linhas travadas impedem pagamento duplicado.
    for item in select e.* from public.commission_entries e where e.professional_id=v_id and e.status='pending' and e.commission_cents>0 and e.id in (select jsonb_array_elements_text(payload->'entries')::uuid) for update loop
      if method='cash' then
        select s.opening_balance_cents+coalesce(sum(m.amount_cents) filter(where m.payment_method='cash'),0) into balance from public.cash_movements m where m.session_id=s.id;
        if balance<item.commission_cents then raise exception 'Dinheiro insuficiente no caixa para o repasse.'; end if;
      end if;
      insert into public.cash_movements(session_id,type,amount_cents,payment_method,notes,created_by,commission_entry_id) values(s.id,'withdrawal',-item.commission_cents,method,'Repasse ao profissional',auth.uid(),item.id);
      update public.commission_entries set status='paid',paid_at=now(),paid_method=method where id=item.id;
    end loop;
  elsif action='open_cash' then
    perform pg_advisory_xact_lock(180010);
    if exists(select 1 from public.cash_sessions where closed_at is null) then raise exception 'Já existe um caixa aberto.'; end if;
    amount := (payload->>'amount')::integer;
    if amount is null or amount<0 then raise exception 'Saldo inicial inválido.'; end if;
    insert into public.cash_sessions(opened_by,opening_balance_cents) values(auth.uid(),amount) returning id into v_id;
  elsif action='close_cash' then
    select * into strict s from public.cash_sessions where id=v_id for update;
    if s.closed_at is not null then raise exception 'Caixa já fechado.'; end if;
    amount := (payload->>'amount')::integer;
    if amount is null or amount<0 then raise exception 'Informe o dinheiro contado no caixa.'; end if;
    update public.cash_sessions set closed_at=now(),declared_balance_cents=amount,notes=payload->>'notes' where id=s.id;
  elsif action='move_cash' then
    if coalesce(payload->>'type','') not in ('expense','withdrawal','reinforcement') then raise exception 'Tipo de lançamento inválido.'; end if;
    amount := (payload->>'amount')::integer;
    if amount is null or amount<=0 or length(trim(coalesce(payload->>'notes','')))<3 then raise exception 'Informe valor positivo e descrição.'; end if;
    if payload->>'type'<>'reinforcement' then amount := -amount; end if;
    if method='cash' and amount<0 then
      select s.opening_balance_cents+coalesce(sum(m.amount_cents) filter(where m.payment_method='cash'),0) into balance from public.cash_movements m where m.session_id=s.id;
      if balance+amount<0 then raise exception 'Dinheiro insuficiente no caixa.'; end if;
    end if;
    insert into public.cash_movements(session_id,type,amount_cents,payment_method,notes,created_by) values(s.id,payload->>'type',amount,method,trim(payload->>'notes'),auth.uid());
  elsif action='save_customer' then
    customer_name := trim(payload->>'name'); v_phone := regexp_replace(payload->>'phone','\D','','g');
    if length(coalesce(customer_name,''))<2 or length(coalesce(v_phone,''))<10 then raise exception 'Nome e telefone válidos são obrigatórios.'; end if;
    if v_id is null then
      insert into public.customers(name,phone,created_by) values(customer_name,v_phone,auth.uid()) returning id into v_id;
    else update public.customers set name=customer_name,phone=v_phone,notes=payload->>'notes' where id=v_id; end if;
  elsif action='create_appointment' then
    customer_name := trim(payload->>'name'); v_phone := regexp_replace(payload->>'phone','\D','','g');
    if length(coalesce(customer_name,''))<2 or length(coalesce(v_phone,''))<10 then raise exception 'Nome e telefone válidos são obrigatórios.'; end if;
    pro_uuid := (payload->>'professional_id')::uuid;
    if not exists(select 1 from public.professionals where id=pro_uuid and active) then raise exception 'Profissional indisponível.'; end if;
    select * into strict service_row from public.services where id=(payload->>'service_id')::uuid and active;
    start_at := (payload->>'starts_at')::timestamptz;
    if start_at is null then raise exception 'Informe data e horário.'; end if;
    select id into customer_uuid from public.customers where regexp_replace(customers.phone,'\D','','g')=v_phone order by created_at limit 1;
    if customer_uuid is null then insert into public.customers(name,phone,created_by) values(customer_name,v_phone,auth.uid()) returning id into customer_uuid; end if;
    amount := coalesce((payload->>'amount')::integer,service_row.price_cents);
    if amount<0 then raise exception 'Valor inválido.'; end if;
    insert into public.appointments(customer_id,professional_id,service_id,starts_at,ends_at,expected_price_cents,source,created_by)
      values(customer_uuid,pro_uuid,service_row.id,start_at,start_at+make_interval(mins=>service_row.duration_minutes),amount,'panel',auth.uid()) returning id into v_id;
  elsif action='set_price' then
    select * into strict a from public.appointments where id=v_id for update;
    if a.status in ('completed','cancelled','no_show') then raise exception 'Altere o valor antes de concluir o atendimento.'; end if;
    amount := (payload->>'amount')::integer;
    if amount is null or amount<0 then raise exception 'Valor inválido.'; end if;
    update public.appointments set expected_price_cents=amount where id=a.id;
    update public.command_items i set unit_price_cents=amount,commission_cents=round(amount*i.commission_value/100.0) from public.commands cmd where i.command_id=cmd.id and cmd.appointment_id=a.id;
  elsif action='save_service' then
    if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Informe o nome do serviço.'; end if;
    if v_id is null then
      insert into public.services(name,description,price_cents,duration_minutes,color,active) values(trim(payload->>'name'),payload->>'description',(payload->>'price')::integer,(payload->>'duration')::integer,coalesce(payload->>'color','#203F20'),true) returning id into v_id;
    else update public.services set name=trim(payload->>'name'),description=payload->>'description',price_cents=(payload->>'price')::integer,duration_minutes=(payload->>'duration')::integer,active=coalesce((payload->>'active')::boolean,true) where id=v_id; end if;
    insert into public.professional_services(professional_id,service_id,commission_percent) select p.id,v_id,case when lower(trim(p.name))='machado' then 0 else 40 end from public.professionals p on conflict do nothing;
  elsif action='save_professional' then
    if public.current_role()<>'owner' then raise exception 'Somente o proprietário gerencia profissionais.'; end if;
    if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Informe o nome do profissional.'; end if;
    amount := case when lower(trim(payload->>'name'))='machado' then 0 else 40 end;
    if v_id is null then
      insert into public.professionals(name,phone,specialties,default_commission_percent,active) values(trim(payload->>'name'),payload->>'phone',payload->>'specialties',amount,true) returning id into v_id;
    else update public.professionals set name=trim(payload->>'name'),phone=payload->>'phone',specialties=payload->>'specialties',default_commission_percent=amount,active=coalesce((payload->>'active')::boolean,true) where id=v_id; end if;
    insert into public.professional_services(professional_id,service_id,commission_percent) select v_id,id,amount from public.services on conflict(professional_id,service_id) do update set commission_percent=excluded.commission_percent;
  elsif action='save_product' then
    if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Informe o nome.'; end if;
    if v_id is null then
      insert into public.products(name,category,sale_price_cents,cost_cents,minimum_quantity,quantity) values(trim(payload->>'name'),payload->>'category',(payload->>'price')::integer,coalesce((payload->>'cost')::integer,0),coalesce((payload->>'minimum')::integer,0),0) returning id into v_id;
    else update public.products set name=trim(payload->>'name'),category=payload->>'category',sale_price_cents=(payload->>'price')::integer,cost_cents=coalesce((payload->>'cost')::integer,0),minimum_quantity=coalesce((payload->>'minimum')::integer,0),active=coalesce((payload->>'active')::boolean,true) where id=v_id; end if;
  elsif action='adjust_stock' then
    select quantity into strict total from public.products where id=v_id for update;
    amount := (payload->>'delta')::integer;
    if amount is null or amount=0 or total+amount<0 then raise exception 'Ajuste de estoque inválido.'; end if;
    if length(trim(coalesce(payload->>'notes','')))<3 then raise exception 'Informe o motivo do ajuste.'; end if;
    insert into public.stock_movements(product_id,type,quantity_delta,reason,created_by) values(v_id,'adjustment',amount,payload->>'notes',auth.uid());
    update public.products set quantity=quantity+amount where id=v_id;
  else raise exception 'Operação desconhecida.';
  end if;
  return jsonb_build_object('id',v_id);
exception when exclusion_violation then raise exception 'Este profissional já tem atendimento nesse horário.';
  when unique_violation then raise exception 'Esse registro já existe. Atualize a página e confira os dados.';
end $$;
revoke all on function public.office_action(text,jsonb) from public, anon;
grant execute on function public.office_action(text,jsonb) to authenticated;

commit;

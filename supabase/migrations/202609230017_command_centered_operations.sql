-- Fluxo operacional centrado em comandas: balcão e agenda chegam ao mesmo caixa.
begin;

create or replace function public.open_manual_command(customer_name text, customer_phone text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare customer_uuid uuid; command_uuid uuid; clean_name text; clean_phone text;
begin
  perform public.require_office();
  clean_name := trim(customer_name);
  clean_phone := regexp_replace(customer_phone, '\\D', '', 'g');
  if length(coalesce(clean_name,'')) < 2 or length(coalesce(clean_phone,'')) < 10 then
    raise exception 'Informe nome e WhatsApp válidos.';
  end if;

  select id into customer_uuid
    from public.customers
   where regexp_replace(phone, '\\D', '', 'g') = clean_phone
   order by created_at
   limit 1
   for update;
  if customer_uuid is null then
    insert into public.customers(name, phone, created_by)
      values(clean_name, clean_phone, auth.uid()) returning id into customer_uuid;
  else
    update public.customers set name=clean_name where id=customer_uuid;
  end if;

  insert into public.commands(customer_id, status, opened_by)
    values(customer_uuid, 'open', auth.uid()) returning id into command_uuid;
  return jsonb_build_object('id', command_uuid, 'customer_id', customer_uuid);
end; $$;

create or replace function public.add_service_to_command(command_id uuid, service_id uuid, professional_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_row public.commands%rowtype; service_row public.services%rowtype;
  professional_row public.professionals%rowtype; rate numeric; commission integer; item_uuid uuid;
begin
  perform public.require_office();
  select * into strict command_row from public.commands where id=command_id for update;
  if command_row.status <> 'open' or command_row.appointment_id is not null then
    raise exception 'Serviços extras só podem ser incluídos em uma comanda de balcão em aberto.';
  end if;
  select * into strict service_row from public.services where id=service_id and active;
  select * into strict professional_row from public.professionals where id=professional_id and active;
  select coalesce(ps.commission_percent, professional_row.default_commission_percent, 40)
    into rate from public.professional_services ps
   where ps.professional_id=professional_row.id and ps.service_id=service_row.id;
  rate := case when lower(trim(professional_row.name))='machado' then 0 else coalesce(rate, 40) end;
  commission := round(service_row.price_cents * rate / 100.0);

  insert into public.command_items(command_id,type,service_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents)
    values(command_row.id,'service',service_row.id,professional_row.id,service_row.name,service_row.price_cents,1,'percent',rate,commission)
    returning id into item_uuid;
  return jsonb_build_object('id', item_uuid);
end; $$;

create or replace function public.add_product_to_command(command_id uuid, product_id uuid, item_quantity integer default 1) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_row public.commands%rowtype; product_row public.products%rowtype; item_uuid uuid;
begin
  perform public.require_office();
  if item_quantity is null or item_quantity < 1 then raise exception 'Informe uma quantidade válida.'; end if;
  select * into strict command_row from public.commands where id=command_id for update;
  if command_row.status <> 'awaiting_payment' and not (command_row.status='open' and command_row.appointment_id is null) then
    raise exception 'Produtos só podem ser adicionados em comandas de balcão abertas ou prontas para receber.';
  end if;
  select * into strict product_row from public.products where id=product_id and active for update;
  if product_row.quantity < item_quantity then raise exception 'Estoque insuficiente para este produto.'; end if;

  select id into item_uuid from public.command_items where command_id=command_row.id and product_id=product_row.id for update;
  if item_uuid is null then
    insert into public.command_items(command_id,type,product_id,description,unit_price_cents,quantity,commission_cents)
      values(command_row.id,'product',product_row.id,product_row.name,product_row.sale_price_cents,item_quantity,0)
      returning id into item_uuid;
  else
    update public.command_items set quantity=quantity+item_quantity where id=item_uuid;
  end if;
  update public.products set quantity=quantity-item_quantity where id=product_row.id;
  insert into public.stock_movements(product_id,type,quantity_delta,reference_id,reason,created_by)
    values(product_row.id,'sale',-item_quantity,command_row.id,'Adicionado à comanda',auth.uid());
  return jsonb_build_object('id',item_uuid);
end; $$;

create or replace function public.remove_command_item(command_item_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare item_row public.command_items%rowtype; command_row public.commands%rowtype;
begin
  perform public.require_office();
  select * into strict item_row from public.command_items where id=command_item_id for update;
  select * into strict command_row from public.commands where id=item_row.command_id for update;
  if command_row.status <> 'open' or command_row.appointment_id is not null then
    raise exception 'Itens só podem ser removidos de comandas de balcão em aberto.';
  end if;
  if item_row.product_id is not null then
    update public.products set quantity=quantity+item_row.quantity where id=item_row.product_id;
    insert into public.stock_movements(product_id,type,quantity_delta,reference_id,reason,created_by)
      values(item_row.product_id,'return',item_row.quantity,command_row.id,'Removido da comanda',auth.uid());
  end if;
  delete from public.commission_entries where command_item_id=item_row.id;
  delete from public.command_items where id=item_row.id;
  return jsonb_build_object('id',item_row.id);
end; $$;

create or replace function public.mark_command_ready(command_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_row public.commands%rowtype; item_count integer;
begin
  perform public.require_office();
  select * into strict command_row from public.commands where id=command_id for update;
  if command_row.status <> 'open' or command_row.appointment_id is not null then
    raise exception 'Apenas comandas de balcão em aberto podem ser enviadas para receber.';
  end if;
  select count(*) into item_count from public.command_items where command_id=command_row.id;
  if item_count=0 then raise exception 'Inclua ao menos um serviço ou produto antes de enviar para receber.'; end if;
  update public.commands set status='awaiting_payment', closed_at=null where id=command_row.id;
  insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status)
    select i.id,i.professional_id,i.unit_price_cents*i.quantity,i.commission_cents,
      jsonb_build_object('rate_percent',i.commission_value,'barbershop_cents',i.unit_price_cents*i.quantity-i.commission_cents),'pending'
      from public.command_items i
     where i.command_id=command_row.id and i.type='service' and i.commission_cents>0
  on conflict(command_item_id) do nothing;
  return jsonb_build_object('id',command_row.id);
end; $$;

revoke all on function public.open_manual_command(text,text) from public, anon;
revoke all on function public.add_service_to_command(uuid,uuid,uuid) from public, anon;
revoke all on function public.add_product_to_command(uuid,uuid,integer) from public, anon;
revoke all on function public.remove_command_item(uuid) from public, anon;
revoke all on function public.mark_command_ready(uuid) from public, anon;
grant execute on function public.open_manual_command(text,text), public.add_service_to_command(uuid,uuid,uuid), public.add_product_to_command(uuid,uuid,integer), public.remove_command_item(uuid), public.mark_command_ready(uuid) to authenticated;

commit;

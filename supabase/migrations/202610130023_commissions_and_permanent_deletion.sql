-- Percentuais padrão para serviços/produtos, exceções por profissional e exclusão em cascata.
begin;

alter table public.professionals
  alter column default_commission_percent drop default,
  add column if not exists default_product_commission_percent numeric(5,2)
    check (default_product_commission_percent between 0 and 100);
alter table public.services
  alter column default_commission_percent set default 50;
alter table public.products
  alter column commission_percent set default 20;
update public.services set default_commission_percent=50 where default_commission_percent is null;
update public.products set commission_percent=20 where commission_percent is null;
update public.professionals set default_commission_percent=null;
alter table public.cash_sessions alter column opened_by drop not null;

create or replace function public.save_service_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare service_uuid uuid; rate numeric(5,2);
begin
  perform public.require_office();
  service_uuid:=nullif(payload->>'id','')::uuid;
  if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Informe o nome do serviço.'; end if;
  if coalesce((payload->>'price')::integer,-1)<0 then raise exception 'Informe um valor válido.'; end if;
  if coalesce((payload->>'duration')::integer,0)<5 then raise exception 'A duração mínima é de cinco minutos.'; end if;
  rate:=coalesce((payload->>'commission')::numeric,50);
  if rate<0 or rate>100 then raise exception 'A comissão deve estar entre zero e cem por cento.'; end if;
  if service_uuid is null then
    insert into public.services(name,description,price_cents,duration_minutes,color,active,default_commission_percent)
      values(trim(payload->>'name'),nullif(trim(payload->>'description'),''),(payload->>'price')::integer,(payload->>'duration')::integer,coalesce(nullif(payload->>'color',''),'#203F20'),coalesce((payload->>'active')::boolean,true),rate)
      returning id into service_uuid;
  else
    update public.services s set name=trim(payload->>'name'),description=nullif(trim(payload->>'description'),''),price_cents=(payload->>'price')::integer,duration_minutes=(payload->>'duration')::integer,color=coalesce(nullif(payload->>'color',''),s.color),active=coalesce((payload->>'active')::boolean,true),default_commission_percent=rate where s.id=service_uuid;
    if not found then raise exception 'Serviço não encontrado.'; end if;
  end if;
  insert into public.professional_services(professional_id,service_id,commission_percent)
    select p.id,service_uuid,null from public.professionals p
    on conflict(professional_id,service_id) do update set commission_percent=null;
  return jsonb_build_object('id',service_uuid);
end; $$;

create or replace function public.save_professional_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare professional_uuid uuid; professional_name text; service_rate numeric(5,2); product_rate numeric(5,2); is_new boolean:=false;
begin
  perform public.require_office();
  if public.current_role()<>'owner' then raise exception 'Somente o proprietário gerencia profissionais.'; end if;
  professional_uuid:=nullif(payload->>'id','')::uuid;
  professional_name:=trim(payload->>'name');
  if length(coalesce(professional_name,''))<2 then raise exception 'Informe o nome do profissional.'; end if;
  service_rate:=nullif(payload->>'service_commission','')::numeric;
  product_rate:=nullif(payload->>'product_commission','')::numeric;
  if service_rate is not null and (service_rate<0 or service_rate>100) then raise exception 'A comissão de serviços deve ficar entre zero e cem por cento.'; end if;
  if product_rate is not null and (product_rate<0 or product_rate>100) then raise exception 'A comissão de produtos deve ficar entre zero e cem por cento.'; end if;
  if professional_uuid is null then
    is_new:=true;
    insert into public.professionals(name,phone,specialties,default_commission_percent,default_product_commission_percent,photo_url,active)
      values(professional_name,nullif(trim(payload->>'phone'),''),nullif(trim(payload->>'specialties'),''),service_rate,product_rate,nullif(payload->>'photo_url',''),coalesce((payload->>'active')::boolean,true)) returning id into professional_uuid;
  else
    update public.professionals p set name=professional_name,phone=nullif(trim(payload->>'phone'),''),specialties=nullif(trim(payload->>'specialties'),''),default_commission_percent=service_rate,default_product_commission_percent=product_rate,photo_url=nullif(payload->>'photo_url',''),active=coalesce((payload->>'active')::boolean,true) where p.id=professional_uuid;
    if not found then raise exception 'Profissional não encontrado.'; end if;
  end if;
  if is_new then
    insert into public.professional_services(professional_id,service_id,commission_percent)
      select professional_uuid,s.id,null from public.services s
      on conflict(professional_id,service_id) do nothing;
  end if;
  return jsonb_build_object('id',professional_uuid);
end; $$;

create or replace function public.save_product_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare product_uuid uuid; rate numeric(5,2);
begin
  perform public.require_office();
  product_uuid:=nullif(payload->>'id','')::uuid;
  if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Informe o nome do produto.'; end if;
  rate:=coalesce((payload->>'commission')::numeric,20);
  if rate<0 or rate>100 then raise exception 'A comissão deve ficar entre zero e cem por cento.'; end if;
  if product_uuid is null then
    insert into public.products(name,category,sale_price_cents,cost_cents,minimum_quantity,quantity,photo_url,commission_percent,active)
      values(trim(payload->>'name'),nullif(trim(payload->>'category'),''),(payload->>'price')::integer,coalesce((payload->>'cost')::integer,0),coalesce((payload->>'minimum')::integer,0),0,nullif(payload->>'photo_url',''),rate,coalesce((payload->>'active')::boolean,true)) returning id into product_uuid;
  else
    update public.products p set name=trim(payload->>'name'),category=nullif(trim(payload->>'category'),''),sale_price_cents=(payload->>'price')::integer,cost_cents=coalesce((payload->>'cost')::integer,0),minimum_quantity=coalesce((payload->>'minimum')::integer,0),photo_url=nullif(payload->>'photo_url',''),commission_percent=rate,active=coalesce((payload->>'active')::boolean,true) where p.id=product_uuid;
    if not found then raise exception 'Produto não encontrado.'; end if;
  end if;
  return jsonb_build_object('id',product_uuid);
end; $$;

create or replace function public.sync_appointment_command(p_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare a public.appointments%rowtype; command_uuid uuid; item_uuid uuid; rate numeric; amount integer; package_sale_uuid uuid;
begin
  select * into strict a from public.appointments ap where ap.id=p_id for update;
  if a.status in ('cancelled','no_show') then return null; end if;
  insert into public.commands(appointment_id,customer_id,status) values(a.id,a.customer_id,'open') on conflict on constraint commands_appointment_id_key do nothing;
  select c.id into command_uuid from public.commands c where c.appointment_id=a.id for update;
  select i.id into item_uuid from public.command_items i where i.command_id=command_uuid and i.service_id=a.service_id limit 1;
  if item_uuid is null then
    select coalesce(p.default_commission_percent,s.default_commission_percent,50) into rate
      from public.professionals p cross join public.services s where p.id=a.professional_id and s.id=a.service_id;
    amount:=round(a.expected_price_cents*rate/100.0);
    insert into public.command_items(command_id,type,service_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents)
      select command_uuid,'service',a.service_id,a.professional_id,s.name,a.expected_price_cents,1,'percent',rate,amount from public.services s where s.id=a.service_id returning id into item_uuid;
  end if;
  if a.status='completed' then
    select r.sale_id into package_sale_uuid from public.package_redemptions r where r.command_item_id=item_uuid;
    if package_sale_uuid is null then
      select ps.id into package_sale_uuid from public.package_sales ps join public.package_sale_balances b on b.sale_id=ps.id where ps.customer_id=a.customer_id and ps.status='active' and b.service_id=a.service_id and b.remaining>0 order by ps.sold_at,ps.id limit 1 for update of ps,b;
      if package_sale_uuid is not null then
        update public.package_sale_balances b set remaining=b.remaining-1 where b.sale_id=package_sale_uuid and b.service_id=a.service_id and b.remaining>0;
        insert into public.package_redemptions(sale_id,service_id,command_item_id,redeemed_by) values(package_sale_uuid,a.service_id,item_uuid,auth.uid());
        if not exists(select 1 from public.package_sale_balances b where b.sale_id=package_sale_uuid and b.remaining>0) then update public.package_sales ps set status='completed' where ps.id=package_sale_uuid; end if;
      end if;
    end if;
    if package_sale_uuid is not null then update public.command_items i set unit_price_cents=0 where i.id=item_uuid; end if;
    update public.commands c set status='awaiting_payment',closed_at=null where c.id=command_uuid and not exists(select 1 from public.payments p where p.command_id=command_uuid and p.reversed_at is null);
    insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status)
      select i.id,i.professional_id,a.expected_price_cents,i.commission_cents,jsonb_build_object('rate_percent',i.commission_value,'barbershop_cents',a.expected_price_cents-i.commission_cents,'package_sale_id',package_sale_uuid),'pending' from public.command_items i where i.id=item_uuid and i.commission_cents>0 on conflict(command_item_id) do nothing;
  end if;
  return command_uuid;
end; $$;

create or replace function public.add_service_to_command(command_id uuid,service_id uuid,professional_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_row public.commands%rowtype; service_row public.services%rowtype; professional_row public.professionals%rowtype; rate numeric; commission integer; item_uuid uuid;
begin
  perform public.require_office();
  select * into strict command_row from public.commands c where c.id=add_service_to_command.command_id for update;
  if command_row.status not in ('open','awaiting_payment') then raise exception 'Esta comanda não aceita novos serviços.'; end if;
  select * into strict service_row from public.services s where s.id=add_service_to_command.service_id and s.active;
  select * into strict professional_row from public.professionals p where p.id=add_service_to_command.professional_id and p.active;
  rate:=coalesce(professional_row.default_commission_percent,service_row.default_commission_percent,50);
  commission:=round(service_row.price_cents*rate/100.0);
  insert into public.command_items(command_id,type,service_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents)
    values(command_row.id,'service',service_row.id,professional_row.id,service_row.name,service_row.price_cents,1,'percent',rate,commission) returning id into item_uuid;
  if command_row.status='awaiting_payment' and commission>0 then
    insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status) values(item_uuid,professional_row.id,service_row.price_cents,commission,jsonb_build_object('rate_percent',rate,'barbershop_cents',service_row.price_cents-commission),'pending') on conflict(command_item_id) do nothing;
  end if;
  return jsonb_build_object('id',item_uuid);
end; $$;

drop function if exists public.add_product_to_command(uuid,uuid,integer);
create or replace function public.add_product_to_command(command_id uuid,product_id uuid,item_quantity integer,professional_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_row public.commands%rowtype; product_row public.products%rowtype; professional_row public.professionals%rowtype; item_uuid uuid; rate numeric; commission integer;
begin
  perform public.require_office();
  if item_quantity is null or item_quantity<1 then raise exception 'Informe uma quantidade válida.'; end if;
  select * into strict command_row from public.commands c where c.id=add_product_to_command.command_id for update;
  if command_row.status not in ('open','awaiting_payment') then raise exception 'Esta comanda não aceita novos produtos.'; end if;
  select * into strict product_row from public.products p where p.id=add_product_to_command.product_id and p.active for update;
  select * into strict professional_row from public.professionals p where p.id=add_product_to_command.professional_id and p.active;
  if product_row.quantity<item_quantity then raise exception 'Estoque insuficiente para este produto.'; end if;
  rate:=coalesce(professional_row.default_product_commission_percent,product_row.commission_percent,20);
  commission:=round(product_row.sale_price_cents*rate/100.0);
  select i.id into item_uuid from public.command_items i where i.command_id=command_row.id and i.product_id=product_row.id and i.professional_id=professional_row.id for update;
  if item_uuid is null then
    insert into public.command_items(command_id,type,product_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents)
      values(command_row.id,'product',product_row.id,professional_row.id,product_row.name,product_row.sale_price_cents,item_quantity,'percent',rate,commission) returning id into item_uuid;
  else
    update public.command_items i set quantity=i.quantity+item_quantity,commission_cents=commission*(i.quantity+item_quantity),commission_value=rate where i.id=item_uuid;
  end if;
  update public.products p set quantity=p.quantity-item_quantity where p.id=product_row.id;
  insert into public.stock_movements(product_id,type,quantity_delta,reference_id,reason,created_by) values(product_row.id,'sale',-item_quantity,command_row.id,'Adicionado à comanda',auth.uid());
  if command_row.status='awaiting_payment' and commission>0 then
    insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status) select i.id,professional_row.id,i.unit_price_cents*i.quantity,i.commission_cents,jsonb_build_object('rate_percent',rate,'barbershop_cents',i.unit_price_cents*i.quantity-i.commission_cents,'type','product'),'pending' from public.command_items i where i.id=item_uuid on conflict(command_item_id) do update set gross_cents=excluded.gross_cents,commission_cents=excluded.commission_cents,rule_snapshot=excluded.rule_snapshot;
  end if;
  return jsonb_build_object('id',item_uuid);
end; $$;

create or replace function public.mark_command_ready(command_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_row public.commands%rowtype;
begin
  perform public.require_office();
  select * into strict command_row from public.commands c where c.id=mark_command_ready.command_id for update;
  if command_row.status<>'open' or command_row.appointment_id is not null then raise exception 'Apenas comandas de balcão em aberto podem ser enviadas para receber.'; end if;
  if not exists(select 1 from public.command_items i where i.command_id=command_row.id) then raise exception 'Inclua ao menos um serviço ou produto antes de enviar para receber.'; end if;
  update public.commands c set status='awaiting_payment',closed_at=null where c.id=command_row.id;
  insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status)
    select i.id,i.professional_id,i.unit_price_cents*i.quantity,i.commission_cents,jsonb_build_object('rate_percent',i.commission_value,'barbershop_cents',i.unit_price_cents*i.quantity-i.commission_cents,'type',i.type),'pending'
      from public.command_items i where i.command_id=command_row.id and i.professional_id is not null and i.commission_cents>0
    on conflict(command_item_id) do nothing;
  return jsonb_build_object('id',command_row.id);
end; $$;

create or replace function public.delete_command_record(command_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_row public.commands%rowtype; item_row public.command_items%rowtype; redemption_row public.package_redemptions%rowtype;
begin
  perform public.require_office();
  select * into strict command_row from public.commands c where c.id=delete_command_record.command_id for update;
  for item_row in select * from public.command_items i where i.command_id=command_row.id for update loop
    if command_row.status in ('open','awaiting_payment') and item_row.product_id is not null then
      update public.products p set quantity=p.quantity+item_row.quantity where p.id=item_row.product_id;
    end if;
    select * into redemption_row from public.package_redemptions r where r.command_item_id=item_row.id for update;
    if found then
      update public.package_sale_balances b set remaining=least(b.total,b.remaining+1) where b.sale_id=redemption_row.sale_id and b.service_id=redemption_row.service_id;
      update public.package_sales ps set status='active' where ps.id=redemption_row.sale_id;
      delete from public.package_redemptions r where r.id=redemption_row.id;
    end if;
  end loop;
  delete from public.cash_movements m where m.command_id=command_row.id or m.commission_entry_id in (select e.id from public.commission_entries e join public.command_items i on i.id=e.command_item_id where i.command_id=command_row.id);
  delete from public.stock_movements m where m.reference_id=command_row.id;
  delete from public.payments p where p.command_id=command_row.id;
  delete from public.commission_entries e where e.command_item_id in (select i.id from public.command_items i where i.command_id=command_row.id);
  delete from public.command_items i where i.command_id=command_row.id;
  delete from public.commands c where c.id=command_row.id;
  if command_row.appointment_id is not null then delete from public.appointments a where a.id=command_row.appointment_id; end if;
  return jsonb_build_object('id',command_row.id);
end; $$;

create or replace function public.delete_appointment_record(appointment_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_uuid uuid;
begin
  perform public.require_office();
  perform 1 from public.appointments a where a.id=delete_appointment_record.appointment_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  select c.id into command_uuid from public.commands c where c.appointment_id=delete_appointment_record.appointment_id;
  if command_uuid is not null then perform public.delete_command_record(command_uuid); end if;
  delete from public.appointments a where a.id=delete_appointment_record.appointment_id;
  return jsonb_build_object('id',delete_appointment_record.appointment_id);
end; $$;

create or replace function public.delete_customer_record(customer_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_uuid uuid; sale_uuid uuid;
begin
  perform public.require_office();
  perform 1 from public.customers c where c.id=delete_customer_record.customer_id for update;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  for command_uuid in select c.id from public.commands c where c.customer_id=delete_customer_record.customer_id loop
    perform public.delete_command_record(command_uuid);
  end loop;
  delete from public.appointments a where a.customer_id=delete_customer_record.customer_id;
  for sale_uuid in select ps.id from public.package_sales ps where ps.customer_id=delete_customer_record.customer_id loop
    delete from public.cash_movements m where m.package_sale_id=sale_uuid;
    delete from public.package_redemptions r where r.sale_id=sale_uuid;
    delete from public.package_sales ps where ps.id=sale_uuid;
  end loop;
  delete from public.customers c where c.id=delete_customer_record.customer_id;
  return jsonb_build_object('id',delete_customer_record.customer_id);
end; $$;

create or replace function public.delete_product_record(product_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_uuid uuid;
begin
  perform public.require_office();
  perform 1 from public.products p where p.id=delete_product_record.product_id for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  for command_uuid in select distinct i.command_id from public.command_items i where i.product_id=delete_product_record.product_id loop
    perform public.delete_command_record(command_uuid);
  end loop;
  delete from public.stock_movements m where m.product_id=delete_product_record.product_id;
  delete from public.products p where p.id=delete_product_record.product_id;
  return jsonb_build_object('id',delete_product_record.product_id);
end; $$;

create or replace function public.delete_professional_record(professional_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_uuid uuid; profile_uuid uuid;
begin
  perform public.require_office();
  if public.current_role()<>'owner' then raise exception 'Somente o proprietário pode excluir profissionais.'; end if;
  select p.profile_id into profile_uuid from public.professionals p where p.id=delete_professional_record.professional_id for update;
  if not found then raise exception 'Profissional não encontrado.'; end if;
  if profile_uuid=auth.uid() then raise exception 'O proprietário não pode excluir o próprio acesso.'; end if;
  for command_uuid in
    select distinct c.id from public.commands c left join public.command_items i on i.command_id=c.id left join public.appointments a on a.id=c.appointment_id
     where i.professional_id=delete_professional_record.professional_id or a.professional_id=delete_professional_record.professional_id
  loop
    perform public.delete_command_record(command_uuid);
  end loop;
  delete from public.appointments a where a.professional_id=delete_professional_record.professional_id;
  delete from public.schedule_blocks b where b.professional_id=delete_professional_record.professional_id;
  delete from public.commission_entries e where e.professional_id=delete_professional_record.professional_id;
  delete from public.professionals p where p.id=delete_professional_record.professional_id;
  if profile_uuid is not null then
    update public.customers set created_by=null where created_by=profile_uuid;
    update public.appointments set created_by=null where created_by=profile_uuid;
    update public.commands set opened_by=null where opened_by=profile_uuid;
    update public.payments set recorded_by=null where recorded_by=profile_uuid;
    update public.stock_movements set created_by=null where created_by=profile_uuid;
    update public.cash_sessions set opened_by=null where opened_by=profile_uuid;
    update public.cash_movements set created_by=null where created_by=profile_uuid;
    update public.notifications set profile_id=null where profile_id=profile_uuid;
    update public.audit_logs set actor_profile_id=null where actor_profile_id=profile_uuid;
    update public.package_sales set sold_by=null where sold_by=profile_uuid;
    update public.package_redemptions set redeemed_by=null where redeemed_by=profile_uuid;
    update public.schedule_blocks set created_by=null where created_by=profile_uuid;
    delete from auth.users u where u.id=profile_uuid;
  end if;
  return jsonb_build_object('id',delete_professional_record.professional_id);
end; $$;

revoke all on function public.save_service_profile(jsonb),public.save_professional_profile(jsonb),public.save_product_profile(jsonb),public.delete_command_record(uuid),public.delete_appointment_record(uuid),public.delete_customer_record(uuid),public.delete_product_record(uuid),public.delete_professional_record(uuid) from public,anon;
grant execute on function public.save_service_profile(jsonb),public.save_professional_profile(jsonb),public.save_product_profile(jsonb),public.delete_command_record(uuid),public.delete_appointment_record(uuid),public.delete_customer_record(uuid),public.delete_product_record(uuid),public.delete_professional_record(uuid) to authenticated;
revoke all on function public.add_service_to_command(uuid,uuid,uuid),public.add_product_to_command(uuid,uuid,integer,uuid),public.mark_command_ready(uuid) from public,anon;
grant execute on function public.add_service_to_command(uuid,uuid,uuid),public.add_product_to_command(uuid,uuid,integer,uuid),public.mark_command_ready(uuid) to authenticated;

commit;

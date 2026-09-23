-- Comissão pertence à combinação serviço + profissional; o perfil não define porcentagem.
begin;

drop policy if exists "office reads service commissions" on public.professional_services;
create policy "office reads service commissions" on public.professional_services
for select to authenticated using (public.current_role() in ('owner','admin'));

create or replace function public.save_service_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_id uuid; commission_row record;
begin
  perform public.require_office();
  v_id:=nullif(payload->>'id','')::uuid;
  if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Informe o nome do serviço.'; end if;
  if coalesce((payload->>'price')::integer,-1)<0 then raise exception 'Informe um valor válido.'; end if;
  if coalesce((payload->>'duration')::integer,0)<5 then raise exception 'A duração mínima é de cinco minutos.'; end if;
  for commission_row in
    select * from jsonb_to_recordset(coalesce(payload->'commissions','[]'::jsonb)) as x(professional_id uuid,commission_percent numeric)
  loop
    if commission_row.commission_percent is null or commission_row.commission_percent<0 or commission_row.commission_percent>100 then
      raise exception 'A comissão deve estar entre zero e cem por cento.';
    end if;
  end loop;
  if v_id is null then
    insert into public.services(name,description,price_cents,duration_minutes,color,active)
      values(trim(payload->>'name'),nullif(trim(payload->>'description'),''),(payload->>'price')::integer,(payload->>'duration')::integer,coalesce(nullif(payload->>'color',''),'#203F20'),coalesce((payload->>'active')::boolean,true))
      returning id into v_id;
  else
    update public.services s set name=trim(payload->>'name'),description=nullif(trim(payload->>'description'),''),price_cents=(payload->>'price')::integer,duration_minutes=(payload->>'duration')::integer,color=coalesce(nullif(payload->>'color',''),s.color),active=coalesce((payload->>'active')::boolean,true) where s.id=v_id;
    if not found then raise exception 'Serviço não encontrado.'; end if;
  end if;
  insert into public.professional_services(professional_id,service_id,commission_percent)
    select p.id,v_id,coalesce(x.commission_percent,0)
      from public.professionals p
      left join jsonb_to_recordset(coalesce(payload->'commissions','[]'::jsonb)) as x(professional_id uuid,commission_percent numeric) on x.professional_id=p.id
     where p.active
    on conflict(professional_id,service_id) do update set commission_percent=excluded.commission_percent;
  return jsonb_build_object('id',v_id);
end; $$;

create or replace function public.save_professional_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_name text; is_new boolean:=false;
begin
  perform public.require_office();
  if public.current_role()<>'owner' then raise exception 'Somente o proprietário gerencia profissionais.'; end if;
  v_id:=nullif(payload->>'id','')::uuid;
  v_name:=trim(payload->>'name');
  if length(coalesce(v_name,''))<2 then raise exception 'Informe o nome do profissional.'; end if;
  if v_id is null then
    is_new:=true;
    insert into public.professionals(name,phone,specialties,default_commission_percent,photo_url,active)
      values(v_name,nullif(trim(payload->>'phone'),''),nullif(trim(payload->>'specialties'),''),0,nullif(payload->>'photo_url',''),coalesce((payload->>'active')::boolean,true)) returning id into v_id;
  else
    update public.professionals p set name=v_name,phone=nullif(trim(payload->>'phone'),''),specialties=nullif(trim(payload->>'specialties'),''),default_commission_percent=0,photo_url=nullif(payload->>'photo_url',''),active=coalesce((payload->>'active')::boolean,true) where p.id=v_id;
    if not found then raise exception 'Profissional não encontrado.'; end if;
  end if;
  if is_new then
    insert into public.professional_services(professional_id,service_id,commission_percent)
      select v_id,s.id,0 from public.services s
      on conflict(professional_id,service_id) do nothing;
  end if;
  return jsonb_build_object('id',v_id);
end; $$;

create or replace function public.sync_appointment_command(p_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare a public.appointments%rowtype; command_uuid uuid; item_uuid uuid; rate numeric; amount integer; package_sale_uuid uuid;
begin
  select * into strict a from public.appointments ap where ap.id=p_id for update;
  if a.status in ('cancelled','no_show') then return null; end if;
  insert into public.commands(appointment_id,customer_id,status)
    values(a.id,a.customer_id,'open') on conflict on constraint commands_appointment_id_key do nothing;
  select c.id into command_uuid from public.commands c where c.appointment_id=a.id for update;
  select i.id into item_uuid from public.command_items i where i.command_id=command_uuid and i.service_id=a.service_id limit 1;
  if item_uuid is null then
    select coalesce(ps.commission_percent,0) into rate
      from public.professionals p left join public.professional_services ps on ps.professional_id=p.id and ps.service_id=a.service_id
     where p.id=a.professional_id;
    rate:=coalesce(rate,0);
    amount:=round(a.expected_price_cents*rate/100.0);
    insert into public.command_items(command_id,type,service_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents)
      select command_uuid,'service',a.service_id,a.professional_id,s.name,a.expected_price_cents,1,'percent',rate,amount from public.services s where s.id=a.service_id returning id into item_uuid;
  end if;
  if a.status='completed' then
    select r.sale_id into package_sale_uuid from public.package_redemptions r where r.command_item_id=item_uuid;
    if package_sale_uuid is null then
      select ps.id into package_sale_uuid
        from public.package_sales ps join public.package_sale_balances b on b.sale_id=ps.id
       where ps.customer_id=a.customer_id and ps.status='active' and b.service_id=a.service_id and b.remaining>0
       order by ps.sold_at,ps.id limit 1 for update of ps,b;
      if package_sale_uuid is not null then
        update public.package_sale_balances b set remaining=b.remaining-1 where b.sale_id=package_sale_uuid and b.service_id=a.service_id and b.remaining>0;
        insert into public.package_redemptions(sale_id,service_id,command_item_id,redeemed_by) values(package_sale_uuid,a.service_id,item_uuid,auth.uid());
        if not exists(select 1 from public.package_sale_balances b where b.sale_id=package_sale_uuid and b.remaining>0) then update public.package_sales ps set status='completed' where ps.id=package_sale_uuid; end if;
      end if;
    end if;
    if package_sale_uuid is not null then update public.command_items i set unit_price_cents=0 where i.id=item_uuid; end if;
    update public.commands c set status='awaiting_payment',closed_at=null where c.id=command_uuid and not exists(select 1 from public.payments p where p.command_id=command_uuid and p.reversed_at is null);
    insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status)
      select i.id,i.professional_id,a.expected_price_cents,i.commission_cents,jsonb_build_object('rate_percent',i.commission_value,'barbershop_cents',a.expected_price_cents-i.commission_cents,'package_sale_id',package_sale_uuid),'pending'
      from public.command_items i where i.id=item_uuid and i.commission_cents>0 on conflict(command_item_id) do nothing;
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
  select coalesce(ps.commission_percent,0) into rate from public.professional_services ps where ps.professional_id=professional_row.id and ps.service_id=service_row.id;
  rate:=coalesce(rate,0);
  commission:=round(service_row.price_cents*rate/100.0);
  insert into public.command_items(command_id,type,service_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents)
    values(command_row.id,'service',service_row.id,professional_row.id,service_row.name,service_row.price_cents,1,'percent',rate,commission) returning id into item_uuid;
  if command_row.status='awaiting_payment' and commission>0 then
    insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status)
      values(item_uuid,professional_row.id,service_row.price_cents,commission,jsonb_build_object('rate_percent',rate,'barbershop_cents',service_row.price_cents-commission),'pending')
      on conflict(command_item_id) do nothing;
  end if;
  return jsonb_build_object('id',item_uuid);
end; $$;

revoke all on function public.save_service_profile(jsonb) from public,anon;
grant execute on function public.save_service_profile(jsonb) to authenticated;

commit;

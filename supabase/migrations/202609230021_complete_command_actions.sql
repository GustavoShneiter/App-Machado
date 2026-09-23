-- Completa a operação da comanda: serviços, produtos e exclusão segura.
begin;

create or replace function public.add_service_to_command(command_id uuid, service_id uuid, professional_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_row public.commands%rowtype; service_row public.services%rowtype; professional_row public.professionals%rowtype; rate numeric; commission integer; item_uuid uuid;
begin
  perform public.require_office();
  select * into strict command_row from public.commands c where c.id=add_service_to_command.command_id for update;
  if command_row.status not in ('open','awaiting_payment') then raise exception 'Esta comanda não aceita novos serviços.'; end if;
  select * into strict service_row from public.services s where s.id=add_service_to_command.service_id and s.active;
  select * into strict professional_row from public.professionals p where p.id=add_service_to_command.professional_id and p.active;
  select coalesce(ps.commission_percent,professional_row.default_commission_percent,40) into rate from public.professional_services ps where ps.professional_id=professional_row.id and ps.service_id=service_row.id;
  rate:=case when lower(trim(professional_row.name))='machado' then 0 else coalesce(rate,40) end;
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

create or replace function public.add_product_to_command(command_id uuid, product_id uuid, item_quantity integer default 1) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_row public.commands%rowtype; product_row public.products%rowtype; item_uuid uuid;
begin
  perform public.require_office();
  if item_quantity is null or item_quantity<1 then raise exception 'Informe uma quantidade válida.'; end if;
  select * into strict command_row from public.commands c where c.id=add_product_to_command.command_id for update;
  if command_row.status not in ('open','awaiting_payment') then raise exception 'Esta comanda não aceita novos produtos.'; end if;
  select * into strict product_row from public.products p where p.id=add_product_to_command.product_id and p.active for update;
  if product_row.quantity<item_quantity then raise exception 'Estoque insuficiente para este produto.'; end if;
  select i.id into item_uuid from public.command_items i where i.command_id=command_row.id and i.product_id=product_row.id for update;
  if item_uuid is null then
    insert into public.command_items(command_id,type,product_id,description,unit_price_cents,quantity,commission_cents)
      values(command_row.id,'product',product_row.id,product_row.name,product_row.sale_price_cents,item_quantity,0) returning id into item_uuid;
  else
    update public.command_items i set quantity=i.quantity+item_quantity where i.id=item_uuid;
  end if;
  update public.products p set quantity=p.quantity-item_quantity where p.id=product_row.id;
  insert into public.stock_movements(product_id,type,quantity_delta,reference_id,reason,created_by)
    values(product_row.id,'sale',-item_quantity,command_row.id,'Adicionado à comanda',auth.uid());
  return jsonb_build_object('id',item_uuid);
end; $$;

create or replace function public.delete_command_record(command_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_row public.commands%rowtype; item_row public.command_items%rowtype; redemption_row public.package_redemptions%rowtype;
begin
  perform public.require_office();
  select * into strict command_row from public.commands c where c.id=delete_command_record.command_id for update;
  if command_row.status='closed' or exists(select 1 from public.payments p where p.command_id=command_row.id and p.reversed_at is null) then
    raise exception 'Comanda paga não pode ser excluída.';
  end if;
  for item_row in select * from public.command_items i where i.command_id=command_row.id for update loop
    if item_row.product_id is not null then
      update public.products p set quantity=p.quantity+item_row.quantity where p.id=item_row.product_id;
      insert into public.stock_movements(product_id,type,quantity_delta,reference_id,reason,created_by)
        values(item_row.product_id,'return',item_row.quantity,command_row.id,'Comanda excluída',auth.uid());
    end if;
    select * into redemption_row from public.package_redemptions r where r.command_item_id=item_row.id for update;
    if found then
      update public.package_sale_balances b set remaining=least(b.total,b.remaining+1) where b.sale_id=redemption_row.sale_id and b.service_id=redemption_row.service_id;
      update public.package_sales ps set status='active' where ps.id=redemption_row.sale_id;
      delete from public.package_redemptions r where r.id=redemption_row.id;
    end if;
  end loop;
  delete from public.commission_entries e where e.command_item_id in (select i.id from public.command_items i where i.command_id=command_row.id);
  delete from public.command_items i where i.command_id=command_row.id;
  if command_row.appointment_id is not null then update public.appointments a set status='cancelled' where a.id=command_row.appointment_id; end if;
  delete from public.commands c where c.id=command_row.id;
  return jsonb_build_object('id',command_row.id);
end; $$;

revoke all on function public.delete_command_record(uuid) from public,anon;
grant execute on function public.delete_command_record(uuid) to authenticated;

commit;

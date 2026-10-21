-- Serviços usam primeiro a comissão da combinação serviço + profissional.
-- Não recalcula itens nem pagamentos históricos; mantém o percentual padrão quando não há regra específica.

CREATE OR REPLACE FUNCTION public.sync_appointment_command(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.appointments%rowtype; command_uuid uuid; item_uuid uuid; rate numeric; amount integer; package_sale_uuid uuid;
begin
  select * into strict a from public.appointments ap where ap.id=p_id for update;
  if a.status in ('cancelled','no_show') then return null; end if;
  insert into public.commands(appointment_id,customer_id,status) values(a.id,a.customer_id,'open') on conflict on constraint commands_appointment_id_key do nothing;
  select c.id into command_uuid from public.commands c where c.appointment_id=a.id for update;
  select i.id into item_uuid from public.command_items i where i.command_id=command_uuid and i.service_id=a.service_id limit 1;
  if item_uuid is null then
    select coalesce(ps.commission_percent,p.default_commission_percent,s.default_commission_percent,50) into rate
      from public.professionals p cross join public.services s
      left join public.professional_services ps on ps.professional_id=p.id and ps.service_id=s.id
      where p.id=a.professional_id and s.id=a.service_id;
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
end; $function$
;

CREATE OR REPLACE FUNCTION public.add_service_to_command(command_id uuid, service_id uuid, professional_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare command_row public.commands%rowtype; service_row public.services%rowtype; professional_row public.professionals%rowtype; rate numeric; commission integer; item_uuid uuid;
begin
  perform public.require_office();
  select * into strict command_row from public.commands c where c.id=add_service_to_command.command_id for update;
  if command_row.status not in ('open','awaiting_payment') then raise exception 'Esta comanda não aceita novos serviços.'; end if;
  select * into strict service_row from public.services s where s.id=add_service_to_command.service_id and s.active;
  select * into strict professional_row from public.professionals p where p.id=add_service_to_command.professional_id and p.active;
  rate:=coalesce((select ps.commission_percent from public.professional_services ps where ps.professional_id=professional_row.id and ps.service_id=service_row.id),professional_row.default_commission_percent,service_row.default_commission_percent,50);
  commission:=round(service_row.price_cents*rate/100.0);
  insert into public.command_items(command_id,type,service_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents)
    values(command_row.id,'service',service_row.id,professional_row.id,service_row.name,service_row.price_cents,1,'percent',rate,commission) returning id into item_uuid;
  if command_row.status='awaiting_payment' and commission>0 then
    insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status) values(item_uuid,professional_row.id,service_row.price_cents,commission,jsonb_build_object('rate_percent',rate,'barbershop_cents',service_row.price_cents-commission),'pending') on conflict(command_item_id) do nothing;
  end if;
  return jsonb_build_object('id',item_uuid);
end; $function$
;

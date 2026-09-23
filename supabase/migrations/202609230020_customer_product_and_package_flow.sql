-- Corrige cadastros, permite remover produtos e integra planos às comandas por cliente e serviço.
begin;

create table if not exists public.package_redemptions (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.package_sales(id),
  service_id uuid not null references public.services(id),
  command_item_id uuid not null unique references public.command_items(id),
  redeemed_at timestamptz not null default now(),
  redeemed_by uuid references public.profiles(id)
);
create index if not exists package_redemptions_sale_idx on public.package_redemptions(sale_id,redeemed_at);
alter table public.package_redemptions enable row level security;
drop policy if exists "staff read package redemptions" on public.package_redemptions;
create policy "staff read package redemptions" on public.package_redemptions for select to authenticated using (public.current_role() in ('owner','admin','professional'));
drop policy if exists "office manage package redemptions" on public.package_redemptions;
create policy "office manage package redemptions" on public.package_redemptions for all to authenticated using (public.current_role() in ('owner','admin')) with check (public.current_role() in ('owner','admin'));

create or replace function public.delete_customer_record(customer_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform public.require_office();
  if exists(select 1 from public.appointments a where a.customer_id=delete_customer_record.customer_id) then raise exception 'Remova os agendamentos deste cliente antes de excluí-lo.'; end if;
  if exists(select 1 from public.package_sales ps where ps.customer_id=delete_customer_record.customer_id) then raise exception 'Cliente com pacote comprado não pode ser excluído.'; end if;
  delete from public.customers c where c.id=delete_customer_record.customer_id;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  return jsonb_build_object('id',delete_customer_record.customer_id);
end; $$;

create or replace function public.delete_product_record(product_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform public.require_office();
  update public.products p set active=false where p.id=delete_product_record.product_id and p.active;
  if not found then raise exception 'Produto não encontrado.'; end if;
  return jsonb_build_object('id',delete_product_record.product_id);
end; $$;

create or replace function public.redeem_package_service(package_sale_id uuid, service_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare remaining_total integer;
begin
  perform public.require_office();
  perform pg_advisory_xact_lock(hashtextextended(redeem_package_service.package_sale_id::text,0));
  perform ps.id from public.package_sales ps where ps.id=redeem_package_service.package_sale_id and ps.status='active' for update;
  if not found then raise exception 'Pacote indisponível para uso.'; end if;
  update public.package_sale_balances b set remaining=b.remaining-1 where b.sale_id=redeem_package_service.package_sale_id and b.service_id=redeem_package_service.service_id and b.remaining>0;
  if not found then raise exception 'Não há sessão disponível para este serviço.'; end if;
  select coalesce(sum(b.remaining),0) into remaining_total from public.package_sale_balances b where b.sale_id=redeem_package_service.package_sale_id;
  if remaining_total=0 then update public.package_sales ps set status='completed' where ps.id=redeem_package_service.package_sale_id; end if;
  return jsonb_build_object('id',redeem_package_service.package_sale_id,'remaining',remaining_total);
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
    select case when lower(trim(p.name))='machado' then 0 else coalesce(ps.commission_percent,p.default_commission_percent,40) end
      into rate from public.professionals p left join public.professional_services ps on ps.professional_id=p.id and ps.service_id=a.service_id where p.id=a.professional_id;
    rate:=coalesce(rate,40); amount:=round(a.expected_price_cents*rate/100.0);
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

create or replace function public.close_package_command(command_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_row public.commands%rowtype; total integer;
begin
  perform public.require_office();
  select * into strict command_row from public.commands c where c.id=close_package_command.command_id for update;
  if command_row.status='closed' then return jsonb_build_object('id',command_row.id); end if;
  if command_row.status<>'awaiting_payment' then raise exception 'Finalize o atendimento antes de concluir a comanda.'; end if;
  if not exists(select 1 from public.package_redemptions r join public.command_items i on i.id=r.command_item_id where i.command_id=command_row.id) then raise exception 'Esta comanda não possui sessão de plano aplicada.'; end if;
  select coalesce(sum(i.unit_price_cents*i.quantity),0)-command_row.discount_cents+command_row.surcharge_cents into total from public.command_items i where i.command_id=command_row.id;
  if total<>0 then raise exception 'Ainda existem itens para receber nesta comanda.'; end if;
  update public.commands c set status='closed',closed_at=now() where c.id=command_row.id;
  return jsonb_build_object('id',command_row.id);
end; $$;

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
    'packageRedemptions',coalesce((select jsonb_agg(to_jsonb(x) order by x.redeemed_at desc) from (select r.*,p.name package_name from public.package_redemptions r join public.package_sales ps on ps.id=r.sale_id join public.service_packages p on p.id=ps.package_id) x),'[]'::jsonb),
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
  delete from public.package_redemptions where id is not null;
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

revoke all on function public.delete_product_record(uuid),public.close_package_command(uuid) from public,anon;
grant execute on function public.delete_product_record(uuid),public.close_package_command(uuid) to authenticated;

commit;

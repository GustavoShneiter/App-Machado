-- Controles administrativos: fotos, comissão configurável, exclusões seguras e reset compatível.
begin;

alter table public.professionals add column if not exists photo_url text;
alter table public.products add column if not exists photo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('machado-media', 'machado-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "machado media public read" on storage.objects;
create policy "machado media public read" on storage.objects for select using (bucket_id = 'machado-media');
drop policy if exists "machado media admin insert" on storage.objects;
create policy "machado media admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'machado-media' and public.can_access_admin());
drop policy if exists "machado media admin update" on storage.objects;
create policy "machado media admin update" on storage.objects for update to authenticated using (bucket_id = 'machado-media' and public.can_access_admin()) with check (bucket_id = 'machado-media' and public.can_access_admin());
drop policy if exists "machado media admin delete" on storage.objects;
create policy "machado media admin delete" on storage.objects for delete to authenticated using (bucket_id = 'machado-media' and public.can_access_admin());

create or replace function public.save_professional_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; rate numeric(5,2); v_name text;
begin
  perform public.require_office();
  if public.current_role() <> 'owner' then raise exception 'Somente o proprietário gerencia profissionais.'; end if;
  v_id := nullif(payload->>'id','')::uuid;
  v_name := trim(payload->>'name');
  rate := coalesce((payload->>'commission')::numeric,40);
  if length(coalesce(v_name,'')) < 2 then raise exception 'Informe o nome do profissional.'; end if;
  if rate < 0 or rate > 100 then raise exception 'A comissão deve estar entre zero e cem por cento.'; end if;
  if v_id is null then
    insert into public.professionals(name,phone,specialties,default_commission_percent,photo_url,active)
      values(v_name,nullif(trim(payload->>'phone'),''),nullif(trim(payload->>'specialties'),''),rate,nullif(payload->>'photo_url',''),coalesce((payload->>'active')::boolean,true)) returning id into v_id;
  else
    update public.professionals set name=v_name,phone=nullif(trim(payload->>'phone'),''),specialties=nullif(trim(payload->>'specialties'),''),default_commission_percent=rate,photo_url=nullif(payload->>'photo_url',''),active=coalesce((payload->>'active')::boolean,true) where id=v_id;
    if not found then raise exception 'Profissional não encontrado.'; end if;
  end if;
  insert into public.professional_services(professional_id,service_id,commission_percent)
    select v_id,id,rate from public.services
    on conflict(professional_id,service_id) do update set commission_percent=excluded.commission_percent;
  return jsonb_build_object('id',v_id);
end $$;
revoke all on function public.save_professional_profile(jsonb) from public, anon;
grant execute on function public.save_professional_profile(jsonb) to authenticated;

create or replace function public.save_product_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.require_office();
  v_id := nullif(payload->>'id','')::uuid;
  if length(trim(coalesce(payload->>'name',''))) < 2 then raise exception 'Informe o nome do produto.'; end if;
  if v_id is null then
    insert into public.products(name,category,sale_price_cents,cost_cents,minimum_quantity,quantity,photo_url,active)
      values(trim(payload->>'name'),nullif(trim(payload->>'category'),''),(payload->>'price')::integer,coalesce((payload->>'cost')::integer,0),coalesce((payload->>'minimum')::integer,0),0,nullif(payload->>'photo_url',''),coalesce((payload->>'active')::boolean,true)) returning id into v_id;
  else
    update public.products set name=trim(payload->>'name'),category=nullif(trim(payload->>'category'),''),sale_price_cents=(payload->>'price')::integer,cost_cents=coalesce((payload->>'cost')::integer,0),minimum_quantity=coalesce((payload->>'minimum')::integer,0),photo_url=nullif(payload->>'photo_url',''),active=coalesce((payload->>'active')::boolean,true) where id=v_id;
    if not found then raise exception 'Produto não encontrado.'; end if;
  end if;
  return jsonb_build_object('id',v_id);
end $$;
revoke all on function public.save_product_profile(jsonb) from public, anon;
grant execute on function public.save_product_profile(jsonb) to authenticated;

create or replace function public.delete_customer_record(customer_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_office();
  if exists(select 1 from public.appointments where customer_id = delete_customer_record.customer_id) then
    raise exception 'Remova os agendamentos deste cliente antes de excluí-lo.';
  end if;
  delete from public.customers where id = delete_customer_record.customer_id;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  return jsonb_build_object('id',customer_id);
end $$;
revoke all on function public.delete_customer_record(uuid) from public, anon;
grant execute on function public.delete_customer_record(uuid) to authenticated;

-- O WHERE explícito é necessário no ambiente com proteção contra exclusões amplas.
create or replace function public.reset_operational_data(confirmation text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare removed_appointments integer := 0; removed_customers integer := 0; removed_commands integer := 0; removed_sessions integer := 0;
begin
  perform public.require_office();
  if public.current_role() <> 'owner' then raise exception 'Somente o proprietário pode zerar a operação.'; end if;
  if coalesce(confirmation,'') <> 'ZERAR OPERAÇÃO' then raise exception 'Digite ZERAR OPERAÇÃO para confirmar a limpeza.'; end if;
  delete from public.cash_movements where id is not null;
  delete from public.commission_entries where id is not null;
  delete from public.payments where id is not null;
  delete from public.command_items where id is not null;
  delete from public.commands where id is not null; get diagnostics removed_commands = row_count;
  delete from public.appointments where id is not null; get diagnostics removed_appointments = row_count;
  delete from public.cash_sessions where id is not null; get diagnostics removed_sessions = row_count;
  delete from public.customers where id is not null; get diagnostics removed_customers = row_count;
  insert into public.audit_logs(actor_profile_id,operation,entity_type,request_summary,result)
    values(auth.uid(),'reset_operational_data','operation',jsonb_build_object('appointments',removed_appointments,'customers',removed_customers,'commands',removed_commands,'cash_sessions',removed_sessions),'success');
  return jsonb_build_object('appointments',removed_appointments,'customers',removed_customers,'commands',removed_commands,'cash_sessions',removed_sessions);
end $$;
revoke all on function public.reset_operational_data(text) from public, anon;
grant execute on function public.reset_operational_data(text) to authenticated;

commit;

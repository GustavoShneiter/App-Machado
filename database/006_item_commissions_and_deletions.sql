-- Preserve existing percentages as item rules. Never recalculate historical items.
CREATE TABLE IF NOT EXISTS public.professional_products (
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  commission_percent numeric(5,2) NOT NULL CHECK (commission_percent BETWEEN 0 AND 100),
  PRIMARY KEY (professional_id, product_id)
);
CREATE INDEX IF NOT EXISTS professional_products_product_idx ON public.professional_products(product_id);
ALTER TABLE public.professional_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.professional_products FROM PUBLIC;

-- Legacy columns are cleared only after copying their effective rules. Idempotent.
INSERT INTO public.professional_services(professional_id,service_id,commission_percent)
  SELECT p.id,s.id,p.default_commission_percent FROM public.professionals p CROSS JOIN public.services s
  WHERE p.default_commission_percent IS NOT NULL
  ON CONFLICT(professional_id,service_id) DO UPDATE
    SET commission_percent=coalesce(professional_services.commission_percent,excluded.commission_percent);
INSERT INTO public.professional_products(professional_id,product_id,commission_percent)
  SELECT p.id,pr.id,p.default_product_commission_percent FROM public.professionals p CROSS JOIN public.products pr
  WHERE p.default_product_commission_percent IS NOT NULL
  ON CONFLICT(professional_id,product_id) DO NOTHING;
UPDATE public.professionals SET default_commission_percent=NULL,default_product_commission_percent=NULL
  WHERE default_commission_percent IS NOT NULL OR default_product_commission_percent IS NOT NULL;

CREATE OR REPLACE FUNCTION public.save_service_profile(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE service_uuid uuid; rate numeric; rule jsonb; professional_uuid uuid; override_rate numeric;
BEGIN
  PERFORM public.require_office();
  service_uuid:=nullif(payload->>'id','')::uuid;
  IF length(trim(coalesce(payload->>'name','')))<2 THEN RAISE EXCEPTION 'Informe o nome do serviço.'; END IF;
  IF coalesce((payload->>'price')::integer,-1)<0 THEN RAISE EXCEPTION 'Informe um valor válido.'; END IF;
  IF coalesce((payload->>'duration')::integer,0)<5 THEN RAISE EXCEPTION 'A duração mínima é de cinco minutos.'; END IF;
  rate:=coalesce((payload->>'commission')::numeric,(SELECT s.default_commission_percent FROM public.services s WHERE s.id=service_uuid),50);
  IF rate<0 OR rate>100 THEN RAISE EXCEPTION 'A comissão deve estar entre zero e cem por cento.'; END IF;
  IF service_uuid IS NULL THEN
    INSERT INTO public.services(name,description,price_cents,duration_minutes,color,active,default_commission_percent)
      VALUES(trim(payload->>'name'),nullif(trim(payload->>'description'),''),(payload->>'price')::integer,(payload->>'duration')::integer,coalesce(nullif(payload->>'color',''),'#203F20'),coalesce((payload->>'active')::boolean,true),rate)
      RETURNING id INTO service_uuid;
  ELSE
    UPDATE public.services s SET name=trim(payload->>'name'),description=nullif(trim(payload->>'description'),''),price_cents=(payload->>'price')::integer,duration_minutes=(payload->>'duration')::integer,color=coalesce(nullif(payload->>'color',''),s.color),active=coalesce((payload->>'active')::boolean,true),default_commission_percent=rate WHERE s.id=service_uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Serviço não encontrado.'; END IF;
  END IF;
  INSERT INTO public.professional_services(professional_id,service_id)
    SELECT p.id,service_uuid FROM public.professionals p ON CONFLICT DO NOTHING;
  IF payload ? 'commissions' THEN
    IF jsonb_typeof(payload->'commissions')<>'array' THEN RAISE EXCEPTION 'Lista de comissões inválida.'; END IF;
    UPDATE public.professional_services ps SET commission_percent=NULL WHERE ps.service_id=service_uuid;
    FOR rule IN SELECT value FROM jsonb_array_elements(payload->'commissions') LOOP
      professional_uuid:=(rule->>'professional_id')::uuid;
      override_rate:=(rule->>'commission_percent')::numeric;
      IF professional_uuid IS NULL OR NOT EXISTS(SELECT 1 FROM public.professionals p WHERE p.id=professional_uuid) THEN RAISE EXCEPTION 'Profissional não encontrado.'; END IF;
      IF override_rate IS NULL OR override_rate<0 OR override_rate>100 THEN RAISE EXCEPTION 'Comissão inválida.'; END IF;
      UPDATE public.professional_services ps SET commission_percent=override_rate WHERE ps.professional_id=professional_uuid AND ps.service_id=service_uuid;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('id',service_uuid);
END $$;

CREATE OR REPLACE FUNCTION public.delete_service_record(service_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE command_uuid uuid; package_uuid uuid; sale_uuid uuid;
BEGIN
  PERFORM public.require_office();
  PERFORM 1 FROM public.services s WHERE s.id=delete_service_record.service_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Serviço não encontrado.'; END IF;
  FOR command_uuid IN
    SELECT DISTINCT c.id FROM public.commands c LEFT JOIN public.command_items i ON i.command_id=c.id LEFT JOIN public.appointments a ON a.id=c.appointment_id
    WHERE i.service_id=delete_service_record.service_id OR a.service_id=delete_service_record.service_id
  LOOP PERFORM public.delete_command_record(command_uuid); END LOOP;
  DELETE FROM public.appointments a WHERE a.service_id=delete_service_record.service_id;
  -- A sold plan is a single purchase. Remove linked plans as a whole, not orphan balances.
  FOR package_uuid IN
    SELECT i.package_id FROM public.service_package_items i WHERE i.service_id=delete_service_record.service_id
    UNION SELECT ps.package_id FROM public.package_sales ps JOIN public.package_sale_balances b ON b.sale_id=ps.id WHERE b.service_id=delete_service_record.service_id
  LOOP
    FOR sale_uuid IN SELECT ps.id FROM public.package_sales ps WHERE ps.package_id=package_uuid LOOP
      FOR command_uuid IN SELECT DISTINCT i.command_id FROM public.package_redemptions r JOIN public.command_items i ON i.id=r.command_item_id WHERE r.sale_id=sale_uuid
      LOOP PERFORM public.delete_command_record(command_uuid); END LOOP;
      DELETE FROM public.cash_movements m WHERE m.package_sale_id=sale_uuid;
      DELETE FROM public.package_redemptions r WHERE r.sale_id=sale_uuid;
      DELETE FROM public.package_sale_balances b WHERE b.sale_id=sale_uuid;
      DELETE FROM public.package_sales ps WHERE ps.id=sale_uuid;
    END LOOP;
    DELETE FROM public.service_package_items i WHERE i.package_id=package_uuid;
    DELETE FROM public.service_packages p WHERE p.id=package_uuid;
  END LOOP;
  DELETE FROM public.package_sale_balances b WHERE b.service_id=delete_service_record.service_id;
  DELETE FROM public.package_redemptions r WHERE r.service_id=delete_service_record.service_id;
  DELETE FROM public.services s WHERE s.id=delete_service_record.service_id;
  RETURN jsonb_build_object('id',delete_service_record.service_id);
END $$;

-- Old clients must also use the same permanent deletion semantics.
CREATE OR REPLACE FUNCTION public.remove_agenda_appointment(appointment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN public.delete_appointment_record(appointment_id); END $$;


CREATE OR REPLACE FUNCTION public.save_professional_profile(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare professional_uuid uuid; professional_name text; service_rate numeric(5,2); product_rate numeric(5,2); is_new boolean:=false;
begin
  perform public.require_office();
  professional_uuid:=nullif(payload->>'id','')::uuid;
  professional_name:=trim(payload->>'name');
  if length(coalesce(professional_name,''))<2 then raise exception 'Informe o nome do profissional.'; end if;
  service_rate:=null; product_rate:=null;
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
end; $function$;

CREATE OR REPLACE FUNCTION public.save_product_profile(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare product_uuid uuid; rate numeric; rule jsonb; professional_uuid uuid; override_rate numeric;
begin
  perform public.require_office();
  product_uuid:=nullif(payload->>'id','')::uuid;
  if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Informe o nome do produto.'; end if;
  rate:=coalesce((payload->>'commission')::numeric,(select p.commission_percent from public.products p where p.id=product_uuid),20);
  if rate<0 or rate>100 then raise exception 'A comissão deve ficar entre zero e cem por cento.'; end if;
  if product_uuid is null then
    insert into public.products(name,category,sale_price_cents,cost_cents,minimum_quantity,quantity,photo_url,commission_percent,active)
      values(trim(payload->>'name'),nullif(trim(payload->>'category'),''),(payload->>'price')::integer,coalesce((payload->>'cost')::integer,0),coalesce((payload->>'minimum')::integer,0),0,nullif(payload->>'photo_url',''),rate,coalesce((payload->>'active')::boolean,true)) returning id into product_uuid;
  else
    update public.products p set name=trim(payload->>'name'),category=nullif(trim(payload->>'category'),''),sale_price_cents=(payload->>'price')::integer,cost_cents=coalesce((payload->>'cost')::integer,0),minimum_quantity=coalesce((payload->>'minimum')::integer,0),photo_url=nullif(payload->>'photo_url',''),commission_percent=rate,active=coalesce((payload->>'active')::boolean,true) where p.id=product_uuid;
    if not found then raise exception 'Produto não encontrado.'; end if;
  end if;
  if coalesce((payload->>'price')::integer,-1)<0 or coalesce((payload->>'cost')::integer,0)<0 or coalesce((payload->>'minimum')::integer,0)<0 then raise exception 'Valores do produto inválidos.'; end if;
  if payload ? 'commissions' then
    if jsonb_typeof(payload->'commissions')<>'array' then raise exception 'Lista de comissões inválida.'; end if;
    delete from public.professional_products pp where pp.product_id=product_uuid;
    for rule in select value from jsonb_array_elements(payload->'commissions') loop
      professional_uuid:=(rule->>'professional_id')::uuid;
      override_rate:=(rule->>'commission_percent')::numeric;
      if professional_uuid is null or not exists(select 1 from public.professionals p where p.id=professional_uuid) then raise exception 'Profissional não encontrado.'; end if;
      if override_rate is null or override_rate<0 or override_rate>100 then raise exception 'Comissão inválida.'; end if;
      insert into public.professional_products(professional_id,product_id,commission_percent) values(professional_uuid,product_uuid,override_rate);
    end loop;
  end if;
  return jsonb_build_object('id',product_uuid);
end; $function$;

CREATE OR REPLACE FUNCTION public.add_product_to_command(command_id uuid, product_id uuid, item_quantity integer, professional_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare command_row public.commands%rowtype; product_row public.products%rowtype; professional_row public.professionals%rowtype; item_uuid uuid; rate numeric; commission integer;
begin
  perform public.require_office();
  if item_quantity is null or item_quantity<1 then raise exception 'Informe uma quantidade válida.'; end if;
  select * into strict command_row from public.commands c where c.id=add_product_to_command.command_id for update;
  if command_row.status not in ('open','awaiting_payment') then raise exception 'Esta comanda não aceita novos produtos.'; end if;
  select * into strict product_row from public.products p where p.id=add_product_to_command.product_id and p.active for update;
  select * into strict professional_row from public.professionals p where p.id=add_product_to_command.professional_id and p.active;
  if product_row.quantity<item_quantity then raise exception 'Estoque insuficiente para este produto.'; end if;
  rate:=coalesce((select pp.commission_percent from public.professional_products pp where pp.professional_id=professional_row.id and pp.product_id=product_row.id),product_row.commission_percent,20);
  commission:=round(product_row.sale_price_cents*rate/100.0);
  select i.id into item_uuid from public.command_items i where i.command_id=command_row.id and i.product_id=product_row.id and i.professional_id=professional_row.id and i.commission_value=rate and i.unit_price_cents=product_row.sale_price_cents order by i.id limit 1 for update;
  if item_uuid is null then
    insert into public.command_items(command_id,type,product_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents)
      values(command_row.id,'product',product_row.id,professional_row.id,product_row.name,product_row.sale_price_cents,item_quantity,'percent',rate,commission*item_quantity) returning id into item_uuid;
  else
    update public.command_items i set quantity=i.quantity+item_quantity,commission_cents=commission*(i.quantity+item_quantity),commission_value=rate where i.id=item_uuid;
  end if;
  update public.products p set quantity=p.quantity-item_quantity where p.id=product_row.id;
  insert into public.stock_movements(product_id,type,quantity_delta,reference_id,reason,created_by) values(product_row.id,'sale',-item_quantity,command_row.id,'Adicionado à comanda',auth.uid());
  if command_row.status='awaiting_payment' and commission>0 then
    insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status) select i.id,professional_row.id,i.unit_price_cents*i.quantity,i.commission_cents,jsonb_build_object('rate_percent',rate,'barbershop_cents',i.unit_price_cents*i.quantity-i.commission_cents,'type','product'),'pending' from public.command_items i where i.id=item_uuid on conflict(command_item_id) do update set gross_cents=excluded.gross_cents,commission_cents=excluded.commission_cents,rule_snapshot=excluded.rule_snapshot;
  end if;
  return jsonb_build_object('id',item_uuid);
end; $function$;

CREATE OR REPLACE FUNCTION public.office_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'products',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('commissions',coalesce((select jsonb_object_agg(pp.professional_id::text,pp.commission_percent) from public.professional_products pp where pp.product_id=p.id),'{}'::jsonb)) order by p.name) from public.products p),'[]'::jsonb),
    'packages',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (select p.*,coalesce((select jsonb_agg(jsonb_build_object('service_id',i.service_id,'service_name',s.name,'quantity',i.quantity) order by s.name) from public.service_package_items i join public.services s on s.id=i.service_id where i.package_id=p.id),'[]'::jsonb) items from public.service_packages p) x),'[]'::jsonb),
    'packageSales',coalesce((select jsonb_agg(to_jsonb(x) order by x.sold_at desc) from (select ps.*,p.name package_name,c.name customer_name,coalesce((select jsonb_agg(jsonb_build_object('service_id',b.service_id,'service_name',s.name,'total',b.total,'remaining',b.remaining) order by s.name) from public.package_sale_balances b join public.services s on s.id=b.service_id where b.sale_id=ps.id),'[]'::jsonb) balances from public.package_sales ps join public.service_packages p on p.id=ps.package_id join public.customers c on c.id=ps.customer_id) x),'[]'::jsonb),
    'packageRedemptions',coalesce((select jsonb_agg(to_jsonb(x) order by x.redeemed_at desc) from (select r.*,p.name package_name from public.package_redemptions r join public.package_sales ps on ps.id=r.sale_id join public.service_packages p on p.id=ps.package_id) x),'[]'::jsonb),
    'business',coalesce((select jsonb_agg(b) from public.business_settings b),'[]'::jsonb)
  );
end; $function$;

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
    select coalesce(ps.commission_percent,s.default_commission_percent,50) into rate
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
  rate:=coalesce((select ps.commission_percent from public.professional_services ps where ps.professional_id=professional_row.id and ps.service_id=service_row.id),service_row.default_commission_percent,50);
  commission:=round(service_row.price_cents*rate/100.0);
  insert into public.command_items(command_id,type,service_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents)
    values(command_row.id,'service',service_row.id,professional_row.id,service_row.name,service_row.price_cents,1,'percent',rate,commission) returning id into item_uuid;
  if command_row.status='awaiting_payment' and commission>0 then
    insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status) values(item_uuid,professional_row.id,service_row.price_cents,commission,jsonb_build_object('rate_percent',rate,'barbershop_cents',service_row.price_cents-commission),'pending') on conflict(command_item_id) do nothing;
  end if;
  return jsonb_build_object('id',item_uuid);
end; $function$
;

CREATE OR REPLACE FUNCTION public.delete_professional_record(professional_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare command_uuid uuid; profile_uuid uuid;
begin
  perform public.require_office();
  select p.profile_id into profile_uuid from public.professionals p where p.id=delete_professional_record.professional_id for update;
  if not found then raise exception 'Profissional não encontrado.'; end if;
  if profile_uuid=auth.uid() or exists(select 1 from public.profiles p where p.id=profile_uuid and p.role in ('owner','admin')) then raise exception 'Não é possível excluir um profissional vinculado ao acesso administrativo. Desvincule o acesso primeiro.'; end if;
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
    update public.cash_sessions set opened_by=auth.uid() where opened_by=profile_uuid;
    update public.cash_movements set created_by=null where created_by=profile_uuid;
    update public.notifications set profile_id=null where profile_id=profile_uuid;
    update public.audit_logs set actor_profile_id=null where actor_profile_id=profile_uuid;
    update public.package_sales set sold_by=null where sold_by=profile_uuid;
    update public.package_redemptions set redeemed_by=null where redeemed_by=profile_uuid;
    update public.schedule_blocks set created_by=null where created_by=profile_uuid;
    delete from public.auth_user u where u.id=profile_uuid::text;
    delete from public.profiles p where p.id=profile_uuid;
    delete from auth.users u where u.id=profile_uuid;
  end if;
  return jsonb_build_object('id',delete_professional_record.professional_id);
end; $function$;

-- Qualify the package column to avoid collision with the argument.
CREATE OR REPLACE FUNCTION public.sell_service_package(package_id uuid, customer_id uuid, payment_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select sale_uuid,i.service_id,i.quantity,i.quantity from public.service_package_items i where i.package_id=package_row.id;
  if not found then raise exception 'Este pacote não possui serviços.'; end if;
  insert into public.cash_movements(session_id,type,amount_cents,payment_method,notes,created_by,package_sale_id)
    values(cash_row.id,'sale',package_row.price_cents,payment_method,'Venda de pacote',auth.uid(),sale_uuid);
  return jsonb_build_object('id',sale_uuid);
end; $function$
;

REVOKE ALL ON FUNCTION public.delete_service_record(uuid) FROM PUBLIC;

-- New item modes preserve existing item-specific rules and financial snapshots.
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS commission_mode text NOT NULL DEFAULT 'custom' CHECK(commission_mode IN ('professional','uniform','custom'));
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS commission_mode text NOT NULL DEFAULT 'custom' CHECK(commission_mode IN ('professional','uniform','custom'));
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS is_fit_in boolean NOT NULL DEFAULT false;
ALTER TABLE public.schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_no_overlap;
CREATE UNIQUE INDEX IF NOT EXISTS schedule_blocks_exact_period_idx ON public.schedule_blocks(professional_id,starts_at,ends_at);
UPDATE public.professionals p SET default_commission_percent=coalesce((SELECT min(ps.commission_percent) FROM public.professional_services ps WHERE ps.professional_id=p.id HAVING min(ps.commission_percent)=max(ps.commission_percent)),50) WHERE default_commission_percent IS NULL;
UPDATE public.professionals p SET default_product_commission_percent=coalesce((SELECT min(pp.commission_percent) FROM public.professional_products pp WHERE pp.professional_id=p.id HAVING min(pp.commission_percent)=max(pp.commission_percent)),20) WHERE default_product_commission_percent IS NULL;
DELETE FROM public.business_hours;
INSERT INTO public.business_hours(weekday,opens_at,closes_at) SELECT d,'06:00'::time,'23:00'::time FROM generate_series(1,7) d;

CREATE TABLE IF NOT EXISTS public.recurring_schedule_blocks(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  starts_on date NOT NULL,
  until_on date CHECK(until_on IS NULL OR until_on>=starts_on),
  weekdays smallint[] NOT NULL CHECK(cardinality(weekdays)>0 AND weekdays<@ARRAY[1,2,3,4,5,6,7]::smallint[]),
  start_time time NOT NULL,
  end_time time NOT NULL CHECK(end_time>start_time),
  reason text NOT NULL DEFAULT 'Agenda bloqueada',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recurring_blocks_professional_dates_idx ON public.recurring_schedule_blocks(professional_id,starts_on,until_on);
ALTER TABLE public.recurring_schedule_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recurring_schedule_blocks FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.item_commission_rate(item_type text,p_professional uuid,p_item uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN item_type='service' THEN
    (SELECT CASE s.commission_mode WHEN 'professional' THEN coalesce(p.default_commission_percent,s.default_commission_percent,50)
      WHEN 'uniform' THEN coalesce(s.default_commission_percent,50)
      ELSE coalesce(ps.commission_percent,s.default_commission_percent,50) END
      FROM public.services s CROSS JOIN public.professionals p LEFT JOIN public.professional_services ps ON ps.professional_id=p.id AND ps.service_id=s.id WHERE p.id=p_professional AND s.id=p_item)
  ELSE
    (SELECT CASE pr.commission_mode WHEN 'professional' THEN coalesce(p.default_product_commission_percent,pr.commission_percent,20)
      WHEN 'uniform' THEN coalesce(pr.commission_percent,20)
      ELSE coalesce(pp.commission_percent,pr.commission_percent,20) END
      FROM public.products pr CROSS JOIN public.professionals p LEFT JOIN public.professional_products pp ON pp.professional_id=p.id AND pp.product_id=pr.id WHERE p.id=p_professional AND pr.id=p_item)
  END;
$$;

CREATE OR REPLACE FUNCTION public.rule_overlaps(rule public.recurring_schedule_blocks,p_start timestamptz,p_end timestamptz) RETURNS boolean
LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM generate_series((p_start AT TIME ZONE 'America/Sao_Paulo')::date::timestamp,(p_end AT TIME ZONE 'America/Sao_Paulo')::date::timestamp,interval '1 day') d
    WHERE d::date>=rule.starts_on AND (rule.until_on IS NULL OR d::date<=rule.until_on)
      AND extract(isodow FROM d)::smallint=ANY(rule.weekdays)
      AND ((d::date+rule.start_time) AT TIME ZONE 'America/Sao_Paulo')<p_end
      AND ((d::date+rule.end_time) AT TIME ZONE 'America/Sao_Paulo')>p_start);
$$;

CREATE OR REPLACE FUNCTION public.schedule_is_blocked(p_professional uuid,p_start timestamptz,p_end timestamptz) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.schedule_blocks b WHERE b.professional_id=p_professional AND b.starts_at<p_end AND b.ends_at>p_start)
    OR EXISTS(SELECT 1 FROM public.recurring_schedule_blocks r WHERE r.professional_id=p_professional
      AND r.starts_on<=(p_end AT TIME ZONE 'America/Sao_Paulo')::date AND (r.until_on IS NULL OR r.until_on>=(p_start AT TIME ZONE 'America/Sao_Paulo')::date)
      AND public.rule_overlaps(r,p_start,p_end));
$$;

CREATE OR REPLACE FUNCTION public.public_booking_slots(chosen_service uuid,booking_day date,preferred_professional uuid DEFAULT NULL)
RETURNS TABLE(slot_time time,professional_id uuid,available boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH candidates AS (
    SELECT candidate::time slot_time,candidate local_start,s.duration_minutes
    FROM public.business_hours h CROSS JOIN public.services s CROSS JOIN LATERAL generate_series(
      (booking_day+h.opens_at)::timestamp,(booking_day+h.closes_at)::timestamp-make_interval(mins=>s.duration_minutes),interval '40 minutes') candidate
    WHERE s.id=chosen_service AND s.active AND h.weekday=extract(isodow FROM booking_day)
      AND candidate>=(now() AT TIME ZONE 'America/Sao_Paulo')+interval '5 minutes'
  ) SELECT c.slot_time,free.id,free.id IS NOT NULL FROM candidates c LEFT JOIN LATERAL (
    SELECT p.id FROM public.professionals p JOIN public.professional_services ps ON ps.professional_id=p.id AND ps.service_id=chosen_service
    WHERE p.active AND (preferred_professional IS NULL OR p.id=preferred_professional)
      AND NOT EXISTS(SELECT 1 FROM public.appointments a WHERE a.professional_id=p.id AND a.status NOT IN ('cancelled','no_show')
        AND a.starts_at<((c.local_start+make_interval(mins=>c.duration_minutes)) AT TIME ZONE 'America/Sao_Paulo') AND a.ends_at>(c.local_start AT TIME ZONE 'America/Sao_Paulo'))
      AND NOT public.schedule_is_blocked(p.id,c.local_start AT TIME ZONE 'America/Sao_Paulo',(c.local_start+make_interval(mins=>c.duration_minutes)) AT TIME ZONE 'America/Sao_Paulo')
    ORDER BY p.name,p.id LIMIT 1
  ) free ON true ORDER BY c.slot_time;
$$;
CREATE OR REPLACE FUNCTION public.public_available_slots(chosen_service uuid,booking_day date,preferred_professional uuid DEFAULT NULL)
RETURNS TABLE(slot_time time,professional_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.slot_time,s.professional_id FROM public.public_booking_slots(chosen_service,booking_day,preferred_professional) s WHERE s.available;
$$;

CREATE OR REPLACE FUNCTION public.ensure_appointment_not_blocked() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF new.status NOT IN ('cancelled','no_show') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(new.professional_id::text,0));
    IF public.schedule_is_blocked(new.professional_id,new.starts_at,new.ends_at) THEN RAISE EXCEPTION 'Este horário está bloqueado na agenda.' USING errcode='23P01'; END IF;
  END IF;
  RETURN new;
END $$;

CREATE OR REPLACE FUNCTION public.create_schedule_block(professional_id uuid,starts_at timestamptz,ends_at timestamptz,reason text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result_id uuid;
BEGIN
  PERFORM public.require_office();
  IF NOT EXISTS(SELECT 1 FROM public.professionals p WHERE p.id=create_schedule_block.professional_id AND p.active) THEN RAISE EXCEPTION 'Profissional indisponível.'; END IF;
  IF starts_at IS NULL OR ends_at IS NULL OR NOT isfinite(starts_at) OR NOT isfinite(ends_at) OR ends_at<=starts_at OR ends_at-starts_at>interval '10 years' THEN RAISE EXCEPTION 'Período de bloqueio inválido.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(professional_id::text,0));
  IF EXISTS(SELECT 1 FROM public.appointments a WHERE a.professional_id=create_schedule_block.professional_id AND a.status NOT IN ('cancelled','no_show') AND a.starts_at<create_schedule_block.ends_at AND a.ends_at>create_schedule_block.starts_at) THEN RAISE EXCEPTION 'Há atendimentos neste período. Ajuste as datas e horários.'; END IF;
  SELECT b.id INTO result_id FROM public.schedule_blocks b WHERE b.professional_id=create_schedule_block.professional_id AND b.starts_at=create_schedule_block.starts_at AND b.ends_at=create_schedule_block.ends_at;
  IF result_id IS NOT NULL THEN RETURN jsonb_build_object('id',result_id); END IF;
  INSERT INTO public.schedule_blocks(professional_id,starts_at,ends_at,reason,created_by) VALUES(professional_id,starts_at,ends_at,coalesce(nullif(trim(reason),''),'Agenda bloqueada'),auth.uid()) RETURNING id INTO result_id;
  RETURN jsonb_build_object('id',result_id);
END $$;

CREATE OR REPLACE FUNCTION public.create_recurring_schedule_block(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.recurring_schedule_blocks%rowtype;
BEGIN
  PERFORM public.require_office();
  r.id:=gen_random_uuid();r.professional_id:=(payload->>'professional_id')::uuid;r.starts_on:=(payload->>'starts_on')::date;r.until_on:=nullif(payload->>'until_on','')::date;
  r.start_time:=(payload->>'start_time')::time;r.end_time:=(payload->>'end_time')::time;r.reason:=coalesce(nullif(trim(payload->>'reason'),''),'Agenda bloqueada');r.created_by:=auth.uid();
  SELECT array_agg(DISTINCT value::smallint ORDER BY value::smallint) INTO r.weekdays FROM jsonb_array_elements_text(payload->'weekdays');
  IF r.starts_on IS NULL OR NOT isfinite(r.starts_on) OR (r.until_on IS NOT NULL AND (NOT isfinite(r.until_on) OR r.until_on<r.starts_on)) OR coalesce(cardinality(r.weekdays),0)=0 OR NOT r.weekdays<@ARRAY[1,2,3,4,5,6,7]::smallint[] OR r.start_time IS NULL OR r.end_time IS NULL OR r.end_time<=r.start_time THEN RAISE EXCEPTION 'Confira dias, período e horários da recorrência.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.professionals p WHERE p.id=r.professional_id AND p.active) THEN RAISE EXCEPTION 'Profissional indisponível.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(r.professional_id::text,0));
  IF EXISTS(SELECT 1 FROM public.appointments a WHERE a.professional_id=r.professional_id AND a.status NOT IN ('cancelled','no_show') AND a.ends_at>(r.starts_on::timestamp AT TIME ZONE 'America/Sao_Paulo') AND (r.until_on IS NULL OR a.starts_at<((r.until_on+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')) AND public.rule_overlaps(r,a.starts_at,a.ends_at)) THEN RAISE EXCEPTION 'Já há atendimentos nos horários desta recorrência. Ajuste o bloqueio.'; END IF;
  INSERT INTO public.recurring_schedule_blocks(id,professional_id,starts_on,until_on,weekdays,start_time,end_time,reason,created_by) VALUES(r.id,r.professional_id,r.starts_on,r.until_on,r.weekdays,r.start_time,r.end_time,r.reason,r.created_by);
  RETURN jsonb_build_object('id',r.id);
END $$;
CREATE OR REPLACE FUNCTION public.delete_recurring_schedule_block(block_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.require_office();DELETE FROM public.recurring_schedule_blocks r WHERE r.id=block_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recorrência não encontrada.'; END IF;
  RETURN jsonb_build_object('id',block_id);
END $$;

CREATE OR REPLACE FUNCTION public.create_office_appointment(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE customer_uuid uuid; pro_uuid uuid; service_row public.services%rowtype; customer_name text; clean_phone text; start_at timestamptz; local_start timestamp; end_at timestamptz; minutes integer; price integer; result_id uuid; fitting boolean;
BEGIN
  PERFORM public.require_office();
  customer_name:=trim(payload->>'name');clean_phone:=regexp_replace(payload->>'phone','\D','','g');
  IF clean_phone ~ '^55[0-9]{10,11}$' THEN clean_phone:=substring(clean_phone FROM 3); END IF;
  IF length(coalesce(customer_name,''))<2 OR clean_phone IS NULL OR clean_phone!~'^[1-9][0-9]{9,10}$' THEN RAISE EXCEPTION 'Nome e telefone válidos são obrigatórios.'; END IF;
  pro_uuid:=(payload->>'professional_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.professionals p WHERE p.id=pro_uuid AND p.active) THEN RAISE EXCEPTION 'Profissional indisponível.'; END IF;
  SELECT * INTO STRICT service_row FROM public.services s WHERE s.id=(payload->>'service_id')::uuid AND s.active;
  start_at:=(payload->>'starts_at')::timestamptz;fitting:=coalesce((payload->>'fit_in')::boolean,false);
  minutes:=CASE WHEN fitting THEN coalesce((payload->>'duration')::integer,service_row.duration_minutes) ELSE service_row.duration_minutes END;
  IF start_at IS NULL OR NOT isfinite(start_at) OR start_at<now() OR minutes<5 OR minutes>480 THEN RAISE EXCEPTION 'Informe data, horário e duração válidos.'; END IF;
  local_start:=start_at AT TIME ZONE 'America/Sao_Paulo';end_at:=start_at+make_interval(mins=>minutes);
  IF local_start::time<'06:00'::time OR (end_at AT TIME ZONE 'America/Sao_Paulo')::date<>local_start::date OR (end_at AT TIME ZONE 'America/Sao_Paulo')::time>'23:00'::time THEN RAISE EXCEPTION 'O atendimento deve acontecer entre 06h e 23h.'; END IF;
  IF payload ? 'fit_in' AND NOT fitting AND mod(extract(hour FROM local_start)::integer*60+extract(minute FROM local_start)::integer-360,40)<>0 THEN RAISE EXCEPTION 'Escolha um horário de 40 em 40 minutos ou use Criar encaixe.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(pro_uuid::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended(clean_phone,1));
  SELECT c.id INTO customer_uuid FROM public.customers c WHERE regexp_replace(c.phone,'\D','','g')=clean_phone ORDER BY c.created_at LIMIT 1;
  IF customer_uuid IS NULL THEN INSERT INTO public.customers(name,phone,created_by) VALUES(customer_name,clean_phone,auth.uid()) RETURNING id INTO customer_uuid; END IF;
  price:=coalesce((payload->>'amount')::integer,service_row.price_cents);
  IF price<0 THEN RAISE EXCEPTION 'Valor inválido.'; END IF;
  INSERT INTO public.appointments(customer_id,professional_id,service_id,starts_at,ends_at,expected_price_cents,source,created_by,is_fit_in) VALUES(customer_uuid,pro_uuid,service_row.id,start_at,end_at,price,'panel',auth.uid(),fitting) RETURNING id INTO result_id;
  RETURN jsonb_build_object('id',result_id);
END $$;

-- Generated replacements: complete standalone definitions, no runtime dependency on local files.
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
  service_rate:=coalesce(nullif(payload->>'service_commission','')::numeric,(select p.default_commission_percent from public.professionals p where p.id=professional_uuid),50);
  product_rate:=coalesce(nullif(payload->>'product_commission','')::numeric,(select p.default_product_commission_percent from public.professionals p where p.id=professional_uuid),20);
  if service_rate<0 or service_rate>100 or product_rate<0 or product_rate>100 then raise exception 'As comissões devem ficar entre zero e cem por cento.'; end if;
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

CREATE OR REPLACE FUNCTION public.save_service_profile(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  UPDATE public.services SET commission_mode=payload->>'commission_mode' WHERE id=service_uuid AND payload ? 'commission_mode';
  RETURN jsonb_build_object('id',service_uuid);
END $function$;

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
  update public.products set commission_mode=payload->>'commission_mode' where id=product_uuid and payload ? 'commission_mode';
  return jsonb_build_object('id',product_uuid);
end; $function$;

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
    select public.item_commission_rate('service',a.professional_id,a.service_id) into rate;
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
end; $function$;

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
  rate:=public.item_commission_rate('service',professional_row.id,service_row.id);
  commission:=round(service_row.price_cents*rate/100.0);
  insert into public.command_items(command_id,type,service_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents)
    values(command_row.id,'service',service_row.id,professional_row.id,service_row.name,service_row.price_cents,1,'percent',rate,commission) returning id into item_uuid;
  if command_row.status='awaiting_payment' and commission>0 then
    insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status) values(item_uuid,professional_row.id,service_row.price_cents,commission,jsonb_build_object('rate_percent',rate,'barbershop_cents',service_row.price_cents-commission),'pending') on conflict(command_item_id) do nothing;
  end if;
  return jsonb_build_object('id',item_uuid);
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
  rate:=public.item_commission_rate('product',professional_row.id,product_row.id);
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
    'recurringBlocks',coalesce((select jsonb_agg(r order by r.starts_on,r.id) from public.recurring_schedule_blocks r),'[]'::jsonb),
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

CREATE OR REPLACE FUNCTION public.office_action(action text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; c public.commands%rowtype; a public.appointments%rowtype; s public.cash_sessions%rowtype;
  item record; total integer; amount integer; balance integer; method text; target public.appointment_status;
  customer_uuid uuid; pro_uuid uuid; service_row public.services%rowtype; customer_name text; v_phone text; start_at timestamptz;
begin
  perform public.require_office();
  if action='create_appointment' then return public.create_office_appointment(payload); end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.reset_operational_data(confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  delete from public.recurring_schedule_blocks;
  delete from public.schedule_blocks where id is not null; get diagnostics removed_blocks=row_count;
  delete from public.cash_sessions where id is not null; get diagnostics removed_sessions=row_count;
  delete from public.customers where id is not null; get diagnostics removed_customers=row_count;
  insert into public.audit_logs(actor_profile_id,operation,entity_type,request_summary,result) values(auth.uid(),'reset_operational_data','operation',jsonb_build_object('appointments',removed_appointments,'blocks',removed_blocks,'customers',removed_customers,'commands',removed_commands,'cash_sessions',removed_sessions,'package_sales',removed_packages),'success');
  return jsonb_build_object('appointments',removed_appointments,'blocks',removed_blocks,'customers',removed_customers,'commands',removed_commands,'cash_sessions',removed_sessions,'package_sales',removed_packages);
end; $function$;
REVOKE ALL ON FUNCTION public.item_commission_rate(text,uuid,uuid),public.rule_overlaps(public.recurring_schedule_blocks,timestamptz,timestamptz),public.schedule_is_blocked(uuid,timestamptz,timestamptz),public.create_recurring_schedule_block(jsonb),public.delete_recurring_schedule_block(uuid),public.create_office_appointment(jsonb) FROM PUBLIC;

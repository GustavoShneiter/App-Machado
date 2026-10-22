-- Área do profissional: identidade própria, preferências e ações limitadas à sua agenda.
CREATE TABLE IF NOT EXISTS public.professional_preferences (
 professional_id uuid PRIMARY KEY REFERENCES public.professionals(id) ON DELETE CASCADE,
 weekly_commission_goal_cents integer NOT NULL DEFAULT 0 CHECK (weekly_commission_goal_cents BETWEEN 0 AND 100000000),
 weekly_service_goal integer NOT NULL DEFAULT 0 CHECK (weekly_service_goal BETWEEN 0 AND 10000),
 weekly_customer_goal integer NOT NULL DEFAULT 0 CHECK (weekly_customer_goal BETWEEN 0 AND 10000),
 visible_cards text[] NOT NULL DEFAULT ARRAY['earned','pending','paid','services','customers'],
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.professional_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.professional_preferences FROM PUBLIC;
CREATE INDEX IF NOT EXISTS commission_professional_created_idx ON public.commission_entries(professional_id,created_at);
CREATE INDEX IF NOT EXISTS command_items_professional_idx ON public.command_items(professional_id,command_id);

CREATE OR REPLACE FUNCTION public.require_schedule_access(professional_uuid uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.can_access_admin() THEN RETURN; END IF;
 IF auth.uid() IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.professionals p JOIN public.profiles u ON u.id=p.profile_id
  WHERE p.id=professional_uuid AND p.active AND u.active AND u.role='professional' AND u.id=auth.uid()
 ) THEN RAISE EXCEPTION 'Você só pode acessar a sua própria agenda.' USING errcode='42501'; END IF;
END $$;

-- Mesmas regras de horário e concorrência do administrador, com autorização própria.
CREATE OR REPLACE FUNCTION public.professional_create_appointment(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE customer_uuid uuid; pro_uuid uuid; service_row public.services%rowtype; customer_name text; clean_phone text;
 start_at timestamptz; local_start timestamp; end_at timestamptz; minutes integer; price integer; result_id uuid; fitting boolean;
BEGIN
 pro_uuid:=(payload->>'professional_id')::uuid;
 PERFORM public.require_schedule_access(pro_uuid);
 customer_name:=trim(payload->>'name'); clean_phone:=regexp_replace(payload->>'phone','\D','','g');
 IF clean_phone ~ '^55[0-9]{10,11}$' THEN clean_phone:=substring(clean_phone FROM 3); END IF;
 IF length(coalesce(customer_name,''))<2 OR length(customer_name)>160 OR clean_phone IS NULL OR clean_phone!~'^[1-9][0-9]{9,10}$' THEN RAISE EXCEPTION 'Nome e telefone válidos são obrigatórios.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.professionals p WHERE p.id=pro_uuid AND p.active) THEN RAISE EXCEPTION 'Profissional indisponível.'; END IF;
 SELECT s.* INTO service_row FROM public.services s JOIN public.professional_services ps ON ps.service_id=s.id AND ps.professional_id=pro_uuid
 WHERE s.id=(payload->>'service_id')::uuid AND s.active;
 IF service_row.id IS NULL THEN RAISE EXCEPTION 'Serviço indisponível para este profissional.'; END IF;
 start_at:=(payload->>'starts_at')::timestamptz; fitting:=coalesce((payload->>'fit_in')::boolean,false);
 minutes:=CASE WHEN fitting THEN coalesce((payload->>'duration')::integer,service_row.duration_minutes) ELSE service_row.duration_minutes END;
 IF start_at IS NULL OR NOT isfinite(start_at) OR start_at<now() OR minutes<5 OR minutes>480 THEN RAISE EXCEPTION 'Informe data, horário e duração válidos.'; END IF;
 local_start:=start_at AT TIME ZONE 'America/Sao_Paulo'; end_at:=start_at+make_interval(mins=>minutes);
 IF local_start::time<'06:00'::time OR (end_at AT TIME ZONE 'America/Sao_Paulo')::date<>local_start::date OR (end_at AT TIME ZONE 'America/Sao_Paulo')::time>'23:00'::time THEN RAISE EXCEPTION 'O atendimento deve acontecer entre 06h e 23h.'; END IF;
 IF NOT fitting AND mod(extract(hour FROM local_start)::integer*60+extract(minute FROM local_start)::integer-360,40)<>0 THEN RAISE EXCEPTION 'Escolha um horário de 40 em 40 minutos ou use Criar encaixe.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(pro_uuid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(clean_phone,1));
 SELECT c.id INTO customer_uuid FROM public.customers c WHERE regexp_replace(c.phone,'\D','','g')=clean_phone ORDER BY c.created_at LIMIT 1;
 IF customer_uuid IS NULL THEN INSERT INTO public.customers(name,phone,created_by) VALUES(customer_name,clean_phone,auth.uid()) RETURNING id INTO customer_uuid; END IF;
 price:=coalesce((payload->>'amount')::integer,service_row.price_cents);
 IF price<0 OR price>100000000 THEN RAISE EXCEPTION 'Valor inválido.'; END IF;
 INSERT INTO public.appointments(customer_id,professional_id,service_id,starts_at,ends_at,expected_price_cents,source,created_by,is_fit_in)
 VALUES(customer_uuid,pro_uuid,service_row.id,start_at,end_at,price,'panel',auth.uid(),fitting) RETURNING id INTO result_id;
 RETURN jsonb_build_object('id',result_id);
END $$;

CREATE OR REPLACE FUNCTION public.professional_schedule_action(action text,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pro_uuid uuid; target_id uuid; a public.appointments%rowtype; target public.appointment_status; r public.recurring_schedule_blocks%rowtype;
 block_start timestamptz; block_end timestamptz; reason_text text; result_id uuid;
BEGIN
 pro_uuid:=(payload->>'professional_id')::uuid;
 PERFORM public.require_schedule_access(pro_uuid);
 IF action='create_appointment' THEN RETURN public.professional_create_appointment(payload); END IF;
 target_id:=nullif(payload->>'id','')::uuid;
 IF action IN ('set_status','set_price','cancel_appointment') THEN
  SELECT ap.* INTO a FROM public.appointments ap WHERE ap.id=target_id AND ap.professional_id=pro_uuid FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Agendamento não encontrado na sua agenda.' USING errcode='42501'; END IF;
  IF a.status IN ('completed','cancelled','no_show') THEN RAISE EXCEPTION 'Este atendimento já foi encerrado. Fale com a administração.'; END IF;
  IF EXISTS(SELECT 1 FROM public.commands c WHERE c.appointment_id=a.id AND (c.status IN ('closed','refunded') OR EXISTS(SELECT 1 FROM public.payments p WHERE p.command_id=c.id AND p.reversed_at IS NULL))) THEN RAISE EXCEPTION 'Este atendimento já tem movimentação financeira. Fale com a administração.'; END IF;
  IF action='set_price' THEN
   IF coalesce((payload->>'amount')::integer,0)<=0 OR (payload->>'amount')::integer>100000000 THEN RAISE EXCEPTION 'Informe um valor válido.'; END IF;
   UPDATE public.appointments SET expected_price_cents=(payload->>'amount')::integer WHERE id=a.id;
   UPDATE public.command_items i SET unit_price_cents=(payload->>'amount')::integer,commission_cents=round((payload->>'amount')::integer*i.commission_value/100.0)
   FROM public.commands c WHERE c.appointment_id=a.id AND i.command_id=c.id AND i.service_id=a.service_id AND i.professional_id=pro_uuid;
  ELSE
   target:=CASE WHEN action='cancel_appointment' THEN 'cancelled'::public.appointment_status ELSE (payload->>'status')::public.appointment_status END;
   IF target IS NULL OR target NOT IN ('arrived','in_service','completed','no_show','cancelled') THEN RAISE EXCEPTION 'Situação inválida.'; END IF;
   IF target='completed' AND a.expected_price_cents<=0 THEN RAISE EXCEPTION 'Informe o valor do serviço antes de concluir.'; END IF;
   UPDATE public.appointments SET status=target WHERE id=a.id;
  END IF;
  RETURN jsonb_build_object('id',a.id);
 ELSIF action='create_schedule_block' THEN
  block_start:=(payload->>'starts_at')::timestamptz; block_end:=(payload->>'ends_at')::timestamptz;
  IF block_start IS NULL OR block_end IS NULL OR NOT isfinite(block_start) OR NOT isfinite(block_end) OR block_end<=block_start OR block_end-block_start>interval '10 years' THEN RAISE EXCEPTION 'Período de bloqueio inválido.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(pro_uuid::text,0));
  IF EXISTS(SELECT 1 FROM public.appointments ap WHERE ap.professional_id=pro_uuid AND ap.status NOT IN ('cancelled','no_show') AND ap.starts_at<block_end AND ap.ends_at>block_start) THEN RAISE EXCEPTION 'Há atendimentos neste período. Ajuste as datas e horários.'; END IF;
  reason_text:=coalesce(nullif(left(trim(payload->>'reason'),200),''),'Agenda bloqueada');
  INSERT INTO public.schedule_blocks(professional_id,starts_at,ends_at,reason,created_by) VALUES(pro_uuid,block_start,block_end,reason_text,auth.uid()) RETURNING id INTO result_id;
 ELSIF action='create_recurring_block' THEN
  r.id:=gen_random_uuid(); r.professional_id:=pro_uuid; r.starts_on:=(payload->>'starts_on')::date; r.until_on:=nullif(payload->>'until_on','')::date;
  r.start_time:=(payload->>'start_time')::time; r.end_time:=(payload->>'end_time')::time; r.reason:=coalesce(nullif(left(trim(payload->>'reason'),200),''),'Agenda bloqueada');
  SELECT array_agg(DISTINCT value::smallint ORDER BY value::smallint) INTO r.weekdays FROM jsonb_array_elements_text(payload->'weekdays');
  IF r.starts_on IS NULL OR NOT isfinite(r.starts_on) OR (r.until_on IS NOT NULL AND (NOT isfinite(r.until_on) OR r.until_on<r.starts_on)) OR coalesce(cardinality(r.weekdays),0)=0 OR NOT r.weekdays<@ARRAY[1,2,3,4,5,6,7]::smallint[] OR r.start_time IS NULL OR r.end_time IS NULL OR r.end_time<=r.start_time THEN RAISE EXCEPTION 'Confira dias, período e horários da recorrência.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(pro_uuid::text,0));
  IF EXISTS(SELECT 1 FROM public.appointments ap WHERE ap.professional_id=pro_uuid AND ap.status NOT IN ('cancelled','no_show') AND ap.ends_at>(r.starts_on::timestamp AT TIME ZONE 'America/Sao_Paulo') AND (r.until_on IS NULL OR ap.starts_at<((r.until_on+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')) AND public.rule_overlaps(r,ap.starts_at,ap.ends_at)) THEN RAISE EXCEPTION 'Já há atendimentos nos horários desta recorrência.'; END IF;
  INSERT INTO public.recurring_schedule_blocks(id,professional_id,starts_on,until_on,weekdays,start_time,end_time,reason,created_by) VALUES(r.id,pro_uuid,r.starts_on,r.until_on,r.weekdays,r.start_time,r.end_time,r.reason,auth.uid());
  result_id:=r.id;
 ELSIF action='delete_schedule_block' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(pro_uuid::text,0));
  DELETE FROM public.schedule_blocks b WHERE b.id=target_id AND b.professional_id=pro_uuid RETURNING b.id INTO result_id;
  IF result_id IS NULL THEN RAISE EXCEPTION 'Bloqueio não encontrado na sua agenda.' USING errcode='42501'; END IF;
 ELSIF action='delete_recurring_block' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(pro_uuid::text,0));
  DELETE FROM public.recurring_schedule_blocks b WHERE b.id=target_id AND b.professional_id=pro_uuid RETURNING b.id INTO result_id;
  IF result_id IS NULL THEN RAISE EXCEPTION 'Recorrência não encontrada na sua agenda.' USING errcode='42501'; END IF;
 ELSE RAISE EXCEPTION 'Operação não disponível para profissionais.' USING errcode='42501';
 END IF;
 RETURN jsonb_build_object('id',result_id);
END $$;
REVOKE ALL ON FUNCTION public.require_schedule_access(uuid),public.professional_create_appointment(jsonb),public.professional_schedule_action(text,jsonb) FROM PUBLIC;

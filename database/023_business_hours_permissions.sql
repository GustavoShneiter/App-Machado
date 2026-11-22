SET LOCAL lock_timeout='5s';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_manage_business_hours boolean NOT NULL DEFAULT false;
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS hours_revision integer NOT NULL DEFAULT 0;

-- Apply the requested default once to every existing unit, without touching visits.
DELETE FROM public.business_hours WHERE tenant_id IN(SELECT id FROM public.business_units);
INSERT INTO public.business_hours(tenant_id,weekday,opens_at,closes_at)
 SELECT u.id,d,'08:00'::time,'22:00'::time FROM public.business_units u CROSS JOIN generate_series(1,6) d;

CREATE OR REPLACE FUNCTION public.business_hours_allow(p_start timestamptz,p_end timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT isfinite(p_start) AND isfinite(p_end) AND p_end>p_start
 AND (p_start AT TIME ZONE 'America/Sao_Paulo')::date=(p_end AT TIME ZONE 'America/Sao_Paulo')::date
 AND EXISTS(SELECT FROM business_hours h WHERE h.weekday=extract(isodow FROM p_start AT TIME ZONE 'America/Sao_Paulo')
 AND (p_start AT TIME ZONE 'America/Sao_Paulo')::time>=h.opens_at AND (p_end AT TIME ZONE 'America/Sao_Paulo')::time<=h.closes_at);
$$;
CREATE OR REPLACE FUNCTION public.business_slot_aligned(p_start timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT FROM business_hours h WHERE h.weekday=extract(isodow FROM p_start AT TIME ZONE 'America/Sao_Paulo')
 AND (p_start AT TIME ZONE 'America/Sao_Paulo')::time>=h.opens_at
 AND mod(extract(epoch FROM ((p_start AT TIME ZONE 'America/Sao_Paulo')::time-h.opens_at))::integer,2400)=0);
$$;
CREATE OR REPLACE FUNCTION public.appointment_business_hours_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status IN('cancelled','no_show') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.starts_at=OLD.starts_at AND NEW.ends_at=OLD.ends_at AND NEW.professional_id=OLD.professional_id THEN RETURN NEW; END IF;
 IF NOT business_hours_allow(NEW.starts_at,NEW.ends_at) THEN
  RAISE EXCEPTION 'A barbearia está fechada neste dia ou horário. Consulte o horário de funcionamento no Menu.' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS appointment_business_hours ON public.appointments;
CREATE TRIGGER appointment_business_hours BEFORE INSERT OR UPDATE OF starts_at,ends_at,professional_id ON public.appointments
 FOR EACH ROW EXECUTE FUNCTION public.appointment_business_hours_guard();

DO $$ DECLARE signature regprocedure; definition text; original text; BEGIN
 FOR signature IN SELECT unnest(ARRAY['public.create_office_appointment(jsonb)'::regprocedure,'public.professional_create_appointment(jsonb)'::regprocedure]) LOOP
  definition:=pg_get_functiondef(signature);original:=definition;
  definition:=regexp_replace(definition,'IF local_start::time<''06:00''::time OR [^\n]+END IF;',
   'IF NOT public.business_hours_allow(start_at,end_at) THEN RAISE EXCEPTION ''A barbearia está fechada neste dia ou horário.''; END IF;');
  definition:=replace(definition,'mod(extract(hour FROM local_start)::integer*60+extract(minute FROM local_start)::integer-360,40)<>0','NOT public.business_slot_aligned(start_at)');
  IF definition=original OR position('06h e 23h' IN definition)>0 THEN RAISE EXCEPTION 'Unexpected scheduling function: %',signature; END IF;
  EXECUTE definition;
 END LOOP;
 definition:=pg_get_functiondef('public.provision_workspace_owner(jsonb)'::regprocedure);
 IF position('SELECT day,''06:00''::time,''23:00''::time,unit_id FROM generate_series(1,7) day' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected unit provisioning function'; END IF;
 EXECUTE replace(definition,'SELECT day,''06:00''::time,''23:00''::time,unit_id FROM generate_series(1,7) day','SELECT day,''08:00''::time,''22:00''::time,unit_id FROM generate_series(1,6) day');
 -- Additional services still allow overlap, but follow the unit opening hours.
 definition:=pg_get_functiondef('public.sync_shared_command_agenda(uuid)'::regprocedure);
 original:=substring(definition FROM 'IF \(c.occurred_at AT TIME ZONE[\s\S]*?THEN RAISE EXCEPTION ''Os serviços precisam caber entre 06h e 23h.''; END IF;');
 IF original IS NULL THEN RAISE EXCEPTION 'Unexpected shared service hours guard'; END IF;
 EXECUTE replace(definition,original,'IF NOT public.business_hours_allow(c.occurred_at,c.occurred_at+make_interval(mins=>minutes)) THEN RAISE EXCEPTION ''Os serviços precisam caber no horário de funcionamento da barbearia.''; END IF;');
END $$;
REVOKE ALL ON FUNCTION public.business_hours_allow(timestamptz,timestamptz),public.business_slot_aligned(timestamptz),public.appointment_business_hours_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_hours_allow(timestamptz,timestamptz),public.business_slot_aligned(timestamptz),public.appointment_business_hours_guard() TO machado_runtime;

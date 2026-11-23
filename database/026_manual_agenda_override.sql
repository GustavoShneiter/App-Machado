BEGIN;
SET LOCAL lock_timeout='5s';

-- The public booking flow still requires a future free slot. Only authenticated
-- office/professional actions may record earlier visits or override a block.
DO $$
DECLARE signature regprocedure; definition text;
BEGIN
 FOR signature IN SELECT unnest(ARRAY[
  'public.create_office_appointment(jsonb)'::regprocedure,
  'public.professional_create_appointment(jsonb)'::regprocedure
 ]) LOOP
  definition:=pg_get_functiondef(signature);
  IF position('start_at<now() OR' IN definition)=0 THEN
   RAISE EXCEPTION 'Unexpected manual appointment validation in %',signature;
  END IF;
  EXECUTE replace(definition,'start_at<now() OR ','');
 END LOOP;
END $$;

-- A deliberate manual fit-in may overlap. Ordinary bookings remain mutually
-- exclusive and must also respect manual fit-ins and shared services.
ALTER TABLE public.appointments DROP CONSTRAINT appointments_professional_id_tstzrange_excl;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_professional_id_tstzrange_excl
 EXCLUDE USING gist(professional_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&)
 WHERE(status NOT IN ('cancelled','no_show') AND NOT is_additional_service AND NOT (source='panel' AND is_fit_in));

CREATE OR REPLACE FUNCTION public.guard_additional_service_overlap() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status IN ('cancelled','no_show') OR NEW.is_additional_service OR (NEW.source='panel' AND NEW.is_fit_in) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.professional_id=OLD.professional_id AND NEW.starts_at=OLD.starts_at
  AND NEW.ends_at=OLD.ends_at AND OLD.status NOT IN ('cancelled','no_show') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.professional_id::text,0));
 IF EXISTS(SELECT FROM public.appointments a WHERE a.professional_id=NEW.professional_id AND a.id<>NEW.id
  AND (a.is_additional_service OR (a.source='panel' AND a.is_fit_in)) AND a.status NOT IN ('cancelled','no_show')
  AND a.starts_at<NEW.ends_at AND a.ends_at>NEW.starts_at) THEN
  RAISE EXCEPTION 'Este profissional já tem atendimento neste horário. Use Criar encaixe.' USING errcode='23P01';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_appointment_not_blocked() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status IN ('cancelled','no_show') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.professional_id=OLD.professional_id AND NEW.starts_at=OLD.starts_at
  AND NEW.ends_at=OLD.ends_at AND OLD.status NOT IN ('cancelled','no_show') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.professional_id::text,0));
 IF NEW.source<>'panel' AND public.schedule_is_blocked(NEW.professional_id,NEW.starts_at,NEW.ends_at) THEN
  RAISE EXCEPTION 'Este horário está bloqueado na agenda.' USING errcode='23P01';
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER additional_service_overlap ON public.appointments;
CREATE TRIGGER additional_service_overlap BEFORE INSERT OR UPDATE OF professional_id,starts_at,ends_at,status,is_fit_in,source
 ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.guard_additional_service_overlap();
DROP TRIGGER appointments_block_guard ON public.appointments;
CREATE TRIGGER appointments_block_guard BEFORE INSERT OR UPDATE OF professional_id,starts_at,ends_at,status,is_fit_in,source
 ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.ensure_appointment_not_blocked();
REVOKE ALL ON FUNCTION public.guard_additional_service_overlap(),public.ensure_appointment_not_blocked() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_additional_service_overlap(),public.ensure_appointment_not_blocked() TO machado_runtime;
COMMIT;

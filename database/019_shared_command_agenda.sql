-- Only additional services may overlap. Ordinary reservations still respect all bookings.
ALTER TABLE public.appointments ADD COLUMN is_additional_service boolean NOT NULL DEFAULT false;
ALTER TABLE public.appointments DROP CONSTRAINT appointments_professional_id_tstzrange_excl;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_professional_id_tstzrange_excl
 EXCLUDE USING gist(professional_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&)
 WHERE(status NOT IN ('cancelled','no_show') AND NOT is_additional_service);
CREATE FUNCTION public.guard_additional_service_overlap() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.professional_id::text,0));
 IF NOT NEW.is_additional_service AND NEW.status NOT IN ('cancelled','no_show') AND EXISTS(
  SELECT FROM appointments a WHERE a.professional_id=NEW.professional_id AND a.id<>NEW.id
   AND a.is_additional_service AND a.status NOT IN ('cancelled','no_show') AND a.starts_at<NEW.ends_at AND a.ends_at>NEW.starts_at
 ) THEN RAISE EXCEPTION 'Este profissional já tem um serviço adicional neste horário.' USING errcode='23P01'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER additional_service_overlap BEFORE INSERT OR UPDATE OF professional_id,starts_at,ends_at,status
 ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.guard_additional_service_overlap();
REVOKE ALL ON FUNCTION public.guard_additional_service_overlap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_additional_service_overlap() TO machado_runtime;

-- Shared visits reserve a real appointment for each participating professional.
-- The existing deferred appointment FK lets us link the command before INSERT,
-- so the standard appointment trigger reuses its items instead of duplicating them.
CREATE FUNCTION public.sync_shared_command_agenda(command_uuid uuid) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE c commands%rowtype; a appointments%rowtype; first_service uuid; minutes integer; amount integer; booking uuid;
BEGIN
 SELECT * INTO c FROM commands WHERE id=command_uuid FOR UPDATE;
 IF c.id IS NULL OR c.group_id=c.id OR c.status NOT IN ('open','awaiting_payment') THEN RETURN; END IF;
 IF NOT can_access_admin() AND NOT EXISTS(
  SELECT FROM professionals p WHERE p.profile_id=auth.uid() AND p.active AND
   (p.id=c.professional_id OR p.id=(SELECT professional_id FROM commands WHERE id=c.group_id))
 ) THEN RAISE EXCEPTION 'Você não pode alterar este atendimento.' USING errcode='42501'; END IF;
 SELECT (array_agg(i.service_id ORDER BY i.id))[1],
        sum(s.duration_minutes*i.quantity)::integer,sum(i.unit_price_cents*i.quantity)::integer
 INTO first_service,minutes,amount FROM command_items i JOIN services s ON s.id=i.service_id
 WHERE i.command_id=c.id AND i.type='service';
 IF first_service IS NULL THEN
  IF c.appointment_id IS NOT NULL THEN
   UPDATE commands SET appointment_id=NULL WHERE id=c.id;
   DELETE FROM appointments WHERE id=c.appointment_id;
  END IF;
  RETURN;
 END IF;
 IF minutes<5 OR minutes>1020 THEN RAISE EXCEPTION 'Confira a duração dos serviços deste profissional.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(c.professional_id::text,0));
 IF (c.occurred_at AT TIME ZONE 'America/Sao_Paulo')::time<'06:00' OR
    ((c.occurred_at+make_interval(mins=>minutes)) AT TIME ZONE 'America/Sao_Paulo')::date<>(c.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date OR
    ((c.occurred_at+make_interval(mins=>minutes)) AT TIME ZONE 'America/Sao_Paulo')::time>'23:00'
 THEN RAISE EXCEPTION 'Os serviços precisam caber entre 06h e 23h.'; END IF;
 IF c.appointment_id IS NULL THEN
  booking:=gen_random_uuid();
  UPDATE commands SET appointment_id=booking WHERE id=c.id;
  INSERT INTO appointments(id,customer_id,professional_id,service_id,starts_at,ends_at,expected_price_cents,status,source,is_fit_in,is_additional_service,attendee_name,created_by)
   VALUES(booking,c.customer_id,c.professional_id,first_service,c.occurred_at,c.occurred_at+make_interval(mins=>minutes),amount,
    CASE WHEN c.status='awaiting_payment' THEN 'completed'::appointment_status ELSE 'scheduled'::appointment_status END,
    'panel',true,true,c.attendee_name,auth.uid());
 ELSE
  SELECT * INTO STRICT a FROM appointments WHERE id=c.appointment_id;
  IF a.status IN ('cancelled','no_show') THEN RAISE EXCEPTION 'Este horário foi cancelado. Crie um novo atendimento.'; END IF;
  UPDATE appointments SET
   ends_at=starts_at+make_interval(mins=>minutes),
   service_id=CASE WHEN status='completed' THEN service_id ELSE first_service END,
   expected_price_cents=CASE WHEN status='completed' THEN expected_price_cents ELSE amount END
   WHERE id=a.id;
 END IF;
EXCEPTION WHEN exclusion_violation THEN
 RAISE EXCEPTION 'Não foi possível reservar este horário na agenda.' USING errcode='23P01';
END $$;

CREATE FUNCTION public.shared_command_item_schedule() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  PERFORM sync_shared_command_agenda(OLD.command_id); RETURN OLD;
 END IF;
 PERFORM sync_shared_command_agenda(NEW.command_id);
 RETURN NEW;
END $$;
CREATE TRIGGER shared_command_item_schedule AFTER INSERT OR UPDATE OF service_id,unit_price_cents,quantity OR DELETE
 ON public.command_items FOR EACH ROW EXECUTE FUNCTION public.shared_command_item_schedule();

-- Completing a visit must accrue all services/products on this barber's command.
ALTER FUNCTION public.sync_appointment_command(uuid) RENAME TO sync_appointment_command_base;
CREATE FUNCTION public.sync_appointment_command(p_id uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE result uuid;
BEGIN
 result:=sync_appointment_command_base(p_id);
 IF EXISTS(SELECT FROM appointments WHERE id=p_id AND status='completed') THEN
  INSERT INTO commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status)
   SELECT i.id,i.professional_id,i.unit_price_cents*i.quantity,i.commission_cents,
    jsonb_build_object('rate_percent',i.commission_value,'type',i.type),'pending'
   FROM command_items i WHERE i.command_id=result AND i.commission_cents>0
   ON CONFLICT(command_item_id) DO NOTHING;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.sync_shared_command_agenda(uuid),public.shared_command_item_schedule(),public.sync_appointment_command(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_shared_command_agenda(uuid),public.shared_command_item_schedule(),public.sync_appointment_command(uuid),public.sync_appointment_command_base(uuid) TO machado_runtime;

-- Agenda labels follow the actual services in each separate command.
DO $$ BEGIN
 EXECUTE replace(pg_get_functiondef('public.office_snapshot()'::regprocedure),
  's.name service_name',
  'coalesce((select string_agg(i.description,'' + '' order by i.id) from commands cmd join command_items i on i.command_id=cmd.id where cmd.appointment_id=a.id and cmd.group_id<>cmd.id and i.type=''service''),s.name) service_name');
END $$;

-- One payable command per professional, sharing the same visit/customer.
ALTER TABLE public.commands ADD COLUMN professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL;
ALTER TABLE public.commands ADD COLUMN group_id uuid;
ALTER TABLE public.commands ADD COLUMN occurred_at timestamptz;
ALTER TABLE public.commands ADD COLUMN attendee_name text;
UPDATE public.commands c SET group_id=c.id,occurred_at=coalesce(a.starts_at,c.created_at),professional_id=a.professional_id,attendee_name=nullif(a.attendee_name,'')
 FROM public.appointments a WHERE a.id=c.appointment_id;
UPDATE public.commands c SET group_id=c.id,occurred_at=c.created_at WHERE group_id IS NULL;
UPDATE public.commands c SET professional_id=x.professional_id FROM
 (SELECT command_id,(array_agg(DISTINCT professional_id))[1] professional_id FROM public.command_items
  WHERE professional_id IS NOT NULL GROUP BY command_id HAVING count(DISTINCT professional_id)=1) x
 WHERE x.command_id=c.id AND c.professional_id IS NULL;
CREATE INDEX commands_group_professional ON public.commands(tenant_id,group_id,professional_id);

CREATE FUNCTION public.initialize_command_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 NEW.group_id:=coalesce(NEW.group_id,NEW.id);
 IF NEW.appointment_id IS NOT NULL THEN
  SELECT coalesce(NEW.professional_id,a.professional_id),coalesce(NEW.occurred_at,a.starts_at)
   INTO NEW.professional_id,NEW.occurred_at FROM appointments a WHERE a.id=NEW.appointment_id;
  SELECT coalesce(NEW.attendee_name,nullif(a.attendee_name,'')) INTO NEW.attendee_name FROM appointments a WHERE a.id=NEW.appointment_id;
 END IF;
 NEW.occurred_at:=coalesce(NEW.occurred_at,NEW.created_at,now());
 RETURN NEW;
END $$;
CREATE TRIGGER command_identity BEFORE INSERT ON public.commands FOR EACH ROW EXECUTE FUNCTION public.initialize_command_identity();

CREATE FUNCTION public.command_for_professional(source_id uuid,target_id uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE source public.commands%rowtype; destination uuid;
BEGIN
 SELECT * INTO STRICT source FROM commands WHERE id=source_id;
 IF NOT can_access_admin() THEN PERFORM require_schedule_access(source.professional_id); END IF;
 IF source.status NOT IN ('open','awaiting_payment') OR EXISTS(SELECT FROM payments WHERE command_id=source.id AND reversed_at IS NULL)
  THEN RAISE EXCEPTION 'Esta comanda não aceita novos itens.'; END IF;
 IF NOT EXISTS(SELECT FROM professionals WHERE id=target_id AND active) THEN RAISE EXCEPTION 'Profissional indisponível.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(source.group_id::text,17));
 SELECT * INTO STRICT source FROM commands WHERE id=source_id FOR UPDATE;
 IF source.status NOT IN ('open','awaiting_payment') OR EXISTS(SELECT FROM payments WHERE command_id=source.id AND reversed_at IS NULL)
  THEN RAISE EXCEPTION 'Esta comanda não aceita novos itens.'; END IF;
 IF source.professional_id=target_id THEN RETURN source.id; END IF;
 IF source.professional_id IS NULL AND NOT EXISTS(SELECT FROM command_items WHERE command_id=source.id AND professional_id IS DISTINCT FROM target_id) THEN
  UPDATE commands SET professional_id=target_id WHERE id=source.id; RETURN source.id;
 END IF;
 SELECT id INTO destination FROM commands WHERE group_id=source.group_id AND professional_id=target_id
  AND status IN ('open','awaiting_payment') AND NOT EXISTS(SELECT FROM payments WHERE command_id=commands.id AND reversed_at IS NULL)
  ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 IF destination IS NULL THEN
  INSERT INTO commands(customer_id,professional_id,group_id,occurred_at,attendee_name,status,opened_by)
   VALUES(source.customer_id,target_id,source.group_id,source.occurred_at,source.attendee_name,'open',auth.uid()) RETURNING id INTO destination;
 END IF;
 RETURN destination;
END $$;

ALTER FUNCTION public.add_service_to_command(uuid,uuid,uuid) RENAME TO add_service_to_assigned_command;
DO $$ BEGIN EXECUTE replace(pg_get_functiondef('public.add_service_to_assigned_command(uuid,uuid,uuid)'::regprocedure),'add_service_to_command.','add_service_to_assigned_command.'); END $$;
CREATE FUNCTION public.add_service_to_command(command_id uuid,service_id uuid,professional_id uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE destination uuid; result jsonb;
BEGIN
 PERFORM require_office();
 destination:=command_for_professional(command_id,professional_id);
 result:=add_service_to_assigned_command(destination,service_id,professional_id);
 RETURN result||jsonb_build_object('command_id',destination,'separate_command',destination<>command_id);
END $$;
ALTER FUNCTION public.add_product_to_command(uuid,uuid,integer,uuid) RENAME TO add_product_to_assigned_command;
DO $$ BEGIN EXECUTE replace(pg_get_functiondef('public.add_product_to_assigned_command(uuid,uuid,integer,uuid)'::regprocedure),'add_product_to_command.','add_product_to_assigned_command.'); END $$;
CREATE FUNCTION public.add_product_to_command(command_id uuid,product_id uuid,item_quantity integer,professional_id uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE destination uuid;
BEGIN
 PERFORM require_office();
 destination:=command_for_professional(command_id,professional_id);
 RETURN add_product_to_assigned_command(destination,product_id,item_quantity,professional_id)||jsonb_build_object('command_id',destination,'separate_command',destination<>command_id);
END $$;

REVOKE ALL ON FUNCTION public.command_for_professional(uuid,uuid),public.add_service_to_command(uuid,uuid,uuid),public.add_product_to_command(uuid,uuid,integer,uuid),public.initialize_command_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.command_for_professional(uuid,uuid),public.add_service_to_command(uuid,uuid,uuid),public.add_product_to_command(uuid,uuid,integer,uuid),public.initialize_command_identity() TO machado_runtime;

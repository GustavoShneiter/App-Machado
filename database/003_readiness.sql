CREATE TABLE recovery_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 code_hash text NOT NULL UNIQUE, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE request_limits (key text PRIMARY KEY, bucket timestamptz NOT NULL, requests integer NOT NULL DEFAULT 1);
CREATE TABLE backup_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), pathname text NOT NULL, sha256 text NOT NULL, bytes integer NOT NULL, tables_count integer NOT NULL);
CREATE OR REPLACE FUNCTION public.current_role() RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.profiles WHERE id=auth.uid() AND active $$;

CREATE OR REPLACE FUNCTION public.public_catalog() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT jsonb_build_object(
  'services',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'price_cents',price_cents,'duration_minutes',duration_minutes,'color',color,'active',active) order by name) from services where active),'[]'::jsonb),
  'professionals',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active,'specialties',specialties,'photo_url',photo_url) order by name) from professionals where active),'[]'::jsonb),
  'links',coalesce((select jsonb_agg(jsonb_build_object('professional_id',ps.professional_id,'service_id',ps.service_id)) from professional_services ps join professionals p on p.id=ps.professional_id join services s on s.id=ps.service_id where p.active and s.active),'[]'::jsonb),
  'business',(select jsonb_build_object('name',name,'phone',phone,'email',email,'street',street,'city',city,'state',state,'website',website) from business_settings where id=true)
 )
$$;

CREATE OR REPLACE FUNCTION public.create_public_appointment(customer_name text,customer_phone text,chosen_service uuid,chosen_professional uuid,start_time timestamptz,terms_accepted boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE customer_uuid uuid; appointment_uuid uuid; duration integer; price integer; local_start timestamp; clean_name text; clean_phone text;
BEGIN
 clean_name:=trim(customer_name); clean_phone:=regexp_replace(customer_phone,'\D','','g');
 IF clean_phone ~ '^55[0-9]{10,11}$' THEN clean_phone:=substring(clean_phone from 3); END IF;
 IF terms_accepted IS DISTINCT FROM true OR clean_name IS NULL OR char_length(clean_name) NOT BETWEEN 3 AND 100 OR clean_phone IS NULL OR clean_phone !~ '^[1-9][0-9]{9,10}$' THEN
  RAISE EXCEPTION 'Confira nome, telefone e aceite da política de privacidade.' USING errcode='22023';
 END IF;
 IF chosen_service IS NULL OR chosen_professional IS NULL OR start_time IS NULL OR start_time<now()+interval '5 minutes' OR start_time>now()+interval '90 days' THEN
  RAISE EXCEPTION 'Escolha um horário nos próximos 90 dias.' USING errcode='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(chosen_professional::text,0));
 local_start:=start_time AT TIME ZONE 'America/Sao_Paulo';
 IF NOT EXISTS(select 1 from public_available_slots(chosen_service,local_start::date,chosen_professional) where slot_time=local_start::time) THEN
  RAISE EXCEPTION 'slot_not_available' USING errcode='22023';
 END IF;
 SELECT duration_minutes,price_cents INTO STRICT duration,price FROM services WHERE id=chosen_service AND active;
 PERFORM pg_advisory_xact_lock(hashtextextended(clean_phone,1));
 SELECT id INTO customer_uuid FROM customers WHERE phone=clean_phone;
 IF customer_uuid IS NULL THEN INSERT INTO customers(name,phone) VALUES(clean_name,clean_phone) RETURNING id INTO customer_uuid; END IF;
 INSERT INTO appointments(customer_id,professional_id,service_id,starts_at,ends_at,expected_price_cents,source)
 VALUES(customer_uuid,chosen_professional,chosen_service,start_time,start_time+make_interval(mins=>duration),price,'instagram') RETURNING id INTO appointment_uuid;
 INSERT INTO notifications(title,body) VALUES('Novo agendamento online',clean_name||' agendou pelo link público.');
 RETURN appointment_uuid;
END $$;

CREATE OR REPLACE FUNCTION public.delete_identity_after_profile() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN DELETE FROM auth_user WHERE id=old.id::text; RETURN old; END $$;
CREATE TRIGGER delete_migrated_identity AFTER DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION delete_identity_after_profile();

DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.tablename);
 END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

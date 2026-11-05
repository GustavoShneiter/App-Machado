-- Keep the sixth argument for older clients, but do not require or record an
-- acceptance that the customer was not asked to give. New clients omit it.
CREATE OR REPLACE FUNCTION public.create_public_appointment(
 customer_name text, customer_phone text, chosen_service uuid,
 chosen_professional uuid, start_time timestamptz, terms_accepted boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE customer_uuid uuid; appointment_uuid uuid; duration integer; price integer; local_start timestamp; clean_name text; clean_phone text;
BEGIN
 clean_name:=trim(customer_name); clean_phone:=regexp_replace(customer_phone,'\D','','g');
 IF clean_phone ~ '^55[0-9]{10,11}$' THEN clean_phone:=substring(clean_phone from 3); END IF;
 IF clean_name IS NULL OR char_length(clean_name) NOT BETWEEN 3 AND 100 OR clean_phone IS NULL OR clean_phone !~ '^[1-9][0-9]{9,10}$' THEN
  RAISE EXCEPTION 'Confira nome e telefone.' USING errcode='22023';
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

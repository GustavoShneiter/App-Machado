-- The phone identifies the customer/contact, not necessarily the person served.
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS attendee_name text;
ALTER TABLE public.appointments ADD CONSTRAINT appointment_attendee_name_length
 CHECK (attendee_name IS NULL OR char_length(trim(attendee_name)) BETWEEN 3 AND 100);

DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.create_public_appointment(text,text,uuid,uuid,timestamp with time zone,boolean)'::regprocedure) INTO definition;
 IF position('expected_price_cents,source)' in definition)=0 OR position('price,''instagram'')' in definition)=0 THEN
  RAISE EXCEPTION 'Unexpected public appointment definition; review before migration';
 END IF;
 definition:=replace(definition,'expected_price_cents,source)','expected_price_cents,source,attendee_name)');
 definition:=replace(definition,'price,''instagram'')','price,''instagram'',clean_name)');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.office_snapshot()'::regprocedure) INTO definition;
 IF position('a.*,c.name customer_name' in definition)=0 THEN
  RAISE EXCEPTION 'Unexpected office snapshot definition; review before migration';
 END IF;
 definition:=replace(definition,'a.*,c.name customer_name','a.*,coalesce(nullif(a.attendee_name,''''),c.name) customer_name');
 EXECUTE definition;
END $migration$;

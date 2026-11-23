SET LOCAL lock_timeout='5s';

-- One interval per unit. Existing and newly provisioned units start at 15 minutes.
ALTER TABLE public.business_settings
 ADD COLUMN IF NOT EXISTS slot_interval_minutes integer NOT NULL DEFAULT 15
 CHECK (slot_interval_minutes BETWEEN 5 AND 120);

CREATE OR REPLACE FUNCTION public.business_slot_aligned(p_start timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(
  SELECT FROM business_hours h CROSS JOIN business_settings b
  WHERE b.id=true
   AND h.weekday=extract(isodow FROM p_start AT TIME ZONE 'America/Sao_Paulo')
   AND (p_start AT TIME ZONE 'America/Sao_Paulo')::time>=h.opens_at
   AND mod(extract(epoch FROM ((p_start AT TIME ZONE 'America/Sao_Paulo')::time-h.opens_at))::integer,b.slot_interval_minutes*60)=0
 );
$$;

CREATE OR REPLACE FUNCTION public.public_booking_slots(chosen_service uuid,booking_day date,preferred_professional uuid DEFAULT NULL)
RETURNS TABLE(slot_time time,professional_id uuid,available boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET row_security=on AS $$
 WITH candidates AS (
  SELECT candidate::time slot_time,candidate local_start,s.duration_minutes
  FROM public.business_hours h CROSS JOIN public.services s CROSS JOIN public.business_settings b
  CROSS JOIN LATERAL generate_series(
   (booking_day+h.opens_at)::timestamp,
   (booking_day+h.closes_at)::timestamp-make_interval(mins=>s.duration_minutes),
   make_interval(mins=>b.slot_interval_minutes)) candidate
  WHERE b.id=true AND s.id=chosen_service AND s.active
   AND h.weekday=extract(isodow FROM booking_day)
   AND candidate>=(now() AT TIME ZONE 'America/Sao_Paulo')+interval '5 minutes'
 ) SELECT c.slot_time,free.id,free.id IS NOT NULL
 FROM candidates c LEFT JOIN LATERAL (
  SELECT p.id FROM public.professionals p
  JOIN public.professional_services ps ON ps.professional_id=p.id AND ps.service_id=chosen_service
  WHERE p.active AND (preferred_professional IS NULL OR p.id=preferred_professional)
   AND NOT EXISTS(SELECT 1 FROM public.appointments a WHERE a.professional_id=p.id AND a.status NOT IN ('cancelled','no_show')
    AND a.starts_at<((c.local_start+make_interval(mins=>c.duration_minutes)) AT TIME ZONE 'America/Sao_Paulo')
    AND a.ends_at>(c.local_start AT TIME ZONE 'America/Sao_Paulo'))
   AND NOT public.schedule_is_blocked(p.id,c.local_start AT TIME ZONE 'America/Sao_Paulo',
    (c.local_start+make_interval(mins=>c.duration_minutes)) AT TIME ZONE 'America/Sao_Paulo')
  ORDER BY p.name,p.id LIMIT 1
 ) free ON true ORDER BY c.slot_time;
$$;

REVOKE ALL ON FUNCTION public.business_slot_aligned(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_slot_aligned(timestamptz) TO machado_runtime;

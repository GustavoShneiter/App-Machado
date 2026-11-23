-- Run inside a transaction that is rolled back. Never persist QA appointments.
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM public.profiles WHERE role='owner' AND active LIMIT 1),true);
SELECT set_config('request.business_id',(SELECT tenant_id::text FROM public.profiles WHERE role='owner' AND active LIMIT 1),true);
SET LOCAL ROLE machado_runtime;

DO $$
DECLARE pro uuid; pro_actor uuid; service uuid; past_booking uuid; past_fit uuid;
        future_fit uuid; blocked_booking uuid; block_id uuid;
BEGIN
 SELECT p.id,p.profile_id,ps.service_id INTO STRICT pro,pro_actor,service
 FROM public.professionals p JOIN public.profiles u ON u.id=p.profile_id
 JOIN public.professional_services ps ON ps.professional_id=p.id
 JOIN public.services s ON s.id=ps.service_id
 WHERE p.name='Machado' AND p.active AND u.active AND u.role='professional' AND s.active AND s.duration_minutes=15
 ORDER BY s.name LIMIT 1;

 past_booking:=(public.create_office_appointment(jsonb_build_object(
  'name','QA Agenda retroativa','phone','11987654321','professional_id',pro,'service_id',service,
  'starts_at','2025-03-10T08:00:00-03:00','fit_in',false))->>'id')::uuid;
 IF NOT EXISTS(SELECT FROM public.appointments WHERE id=past_booking AND starts_at<'2026-11-23'::timestamptz) THEN
  RAISE EXCEPTION 'QA: manual past booking was not saved'; END IF;

 PERFORM set_config('request.jwt.claim.sub',pro_actor::text,true);
 past_fit:=(public.professional_schedule_action('create_appointment',jsonb_build_object(
  'name','QA Encaixe retroativo','phone','11987654322','professional_id',pro,'service_id',service,
  'starts_at','2025-03-10T08:00:00-03:00','fit_in',true,'duration',15))->>'id')::uuid;
 IF NOT EXISTS(SELECT FROM public.appointments WHERE id=past_fit AND is_fit_in) THEN
  RAISE EXCEPTION 'QA: professional past overlapping fit-in was not saved'; END IF;
 IF EXISTS(SELECT FROM public.agent_outbox WHERE appointment_id IN(past_booking,past_fit) AND kind IN('confirmation','reminder')) THEN
  RAISE EXCEPTION 'QA: retroactive visit queued agent messages'; END IF;

 PERFORM set_config('request.jwt.claim.sub',(SELECT id::text FROM public.profiles WHERE role='owner' AND active LIMIT 1),true);
 block_id:=(public.create_schedule_block(pro,
  '2098-03-10T09:00:00-03:00','2098-03-10T10:00:00-03:00','QA bloqueio')->>'id')::uuid;
 IF block_id IS NULL OR EXISTS(SELECT FROM public.public_booking_slots(service,'2098-03-10',pro)
   WHERE slot_time='09:00' AND available) THEN RAISE EXCEPTION 'QA: public blocked slot became available'; END IF;
 blocked_booking:=(public.create_office_appointment(jsonb_build_object(
  'name','QA Atendimento no bloqueio','phone','11987654323','professional_id',pro,'service_id',service,
  'starts_at','2098-03-10T09:00:00-03:00','fit_in',false))->>'id')::uuid;
 IF blocked_booking IS NULL THEN RAISE EXCEPTION 'QA: manual blocked slot was rejected'; END IF;

 future_fit:=(public.create_office_appointment(jsonb_build_object(
  'name','QA Encaixe sobreposto','phone','11987654324','professional_id',pro,'service_id',service,
  'starts_at','2098-03-10T11:00:00-03:00','fit_in',true,'duration',15))->>'id')::uuid;
 IF future_fit IS NULL THEN RAISE EXCEPTION 'QA: future fit-in was rejected'; END IF;
 BEGIN
  PERFORM public.create_office_appointment(jsonb_build_object(
   'name','QA Reserva em encaixe','phone','11987654325','professional_id',pro,'service_id',service,
   'starts_at','2098-03-10T11:00:00-03:00','fit_in',false));
  RAISE EXCEPTION 'QA: ordinary booking overlapped fit-in';
 EXCEPTION WHEN exclusion_violation THEN NULL; END;
 IF EXISTS(SELECT FROM public.public_booking_slots(service,'2098-03-10',pro)
   WHERE slot_time='11:00' AND available) THEN RAISE EXCEPTION 'QA: fit-in did not block public slot'; END IF;
 RAISE NOTICE 'Manual agenda override QA passed; roll back this transaction.';
END $$;

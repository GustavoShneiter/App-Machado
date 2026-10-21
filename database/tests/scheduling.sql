DO $$
DECLARE actor uuid; p uuid; p2 uuid; s uuid; pr uuid; a uuid; fit uuid; rule uuid; forever uuid; period uuid; d date; far_date date; r jsonb;
BEGIN
 SELECT id INTO STRICT actor FROM public.profiles WHERE role='owner' AND active LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 BEGIN
  p:=(public.save_professional_profile('{"name":"QA Agenda profissional","service_commission":70,"product_commission":25}')->>'id')::uuid;
  p2:=(public.save_professional_profile('{"name":"QA Agenda segundo","service_commission":60,"product_commission":30}')->>'id')::uuid;
  s:=(public.save_service_profile('{"name":"QA Agenda corte","price":5000,"duration":40,"commission":50,"commission_mode":"professional"}')->>'id')::uuid;
  pr:=(public.save_product_profile('{"name":"QA Agenda produto","price":3000,"commission":20,"commission_mode":"professional"}')->>'id')::uuid;
  IF public.item_commission_rate('service',p,s)<>70 OR public.item_commission_rate('service',p2,s)<>60 OR public.item_commission_rate('product',p,pr)<>25 OR public.item_commission_rate('product',p2,pr)<>30 THEN RAISE EXCEPTION 'TEST: percentuais dos perfis incorretos'; END IF;
  PERFORM public.save_service_profile(jsonb_build_object('id',s,'name','QA Agenda corte','price',5000,'duration',40,'commission',35,'commission_mode','uniform','commissions',jsonb_build_array(jsonb_build_object('professional_id',p,'commission_percent',90))));
  IF public.item_commission_rate('service',p,s)<>35 OR public.item_commission_rate('service',p2,s)<>35 THEN RAISE EXCEPTION 'TEST: regra igual para todos incorreta'; END IF;
  PERFORM public.save_service_profile(jsonb_build_object('id',s,'name','QA Agenda corte','price',5000,'duration',40,'commission',45,'commission_mode','custom','commissions',jsonb_build_array(jsonb_build_object('professional_id',p,'commission_percent',55))));
  IF public.item_commission_rate('service',p,s)<>55 OR public.item_commission_rate('service',p2,s)<>45 THEN RAISE EXCEPTION 'TEST: exceções por profissional incorretas'; END IF;
  PERFORM public.save_service_profile(jsonb_build_object('id',s,'name','QA Agenda corte','price',5000,'duration',40,'commission_mode','professional'));
  PERFORM public.save_product_profile(jsonb_build_object('id',pr,'name','QA Agenda produto','price',3000,'commission',12.5,'commission_mode','uniform','commissions',jsonb_build_array(jsonb_build_object('professional_id',p,'commission_percent',90))));
  IF public.item_commission_rate('product',p,pr)<>12.5 OR public.item_commission_rate('product',p2,pr)<>12.5 THEN RAISE EXCEPTION 'TEST: produtos com percentual igual incorretos'; END IF;
  PERFORM public.save_product_profile(jsonb_build_object('id',pr,'name','QA Agenda produto','price',3000,'commission',20,'commission_mode','custom','commissions',jsonb_build_array(jsonb_build_object('professional_id',p,'commission_percent',25),jsonb_build_object('professional_id',p2,'commission_percent',0))));
  IF public.item_commission_rate('product',p,pr)<>25 OR public.item_commission_rate('product',p2,pr)<>0 THEN RAISE EXCEPTION 'TEST: exceção zero de produto foi ignorada'; END IF;
  d:=date '2099-01-02'+((5-extract(isodow FROM date '2099-01-02')::integer+7)%7);
  IF (SELECT count(*) FROM public.public_booking_slots(s,d,p))<>25 OR NOT EXISTS(SELECT 1 FROM public.public_booking_slots(s,d,p) WHERE slot_time='06:00' AND available) OR NOT EXISTS(SELECT 1 FROM public.public_booking_slots(s,d,p) WHERE slot_time='06:40' AND available) OR EXISTS(SELECT 1 FROM public.public_booking_slots(s,d,p) WHERE slot_time='06:15') THEN RAISE EXCEPTION 'TEST: grade não respeita 06h–23h e 40 minutos'; END IF;
  a:=(public.create_office_appointment(jsonb_build_object('name','QA Agenda cliente','phone','4500000701','professional_id',p,'service_id',s,'starts_at',d::text||'T06:40:00-03:00','fit_in',false))->>'id')::uuid;
  PERFORM public.office_action('set_status',jsonb_build_object('id',a,'status','completed'));
  IF NOT EXISTS(SELECT 1 FROM public.commission_entries e JOIN public.command_items i ON i.id=e.command_item_id JOIN public.commands c ON c.id=i.command_id WHERE c.appointment_id=a AND e.commission_cents=3500 AND e.status='pending') THEN RAISE EXCEPTION 'TEST: comissão do perfil não chegou ao Caixa'; END IF;
  fit:=(public.create_office_appointment(jsonb_build_object('name','QA Agenda encaixe','phone','4500000702','professional_id',p,'service_id',s,'starts_at',d::text||'T07:25:00-03:00','fit_in',true,'duration',15))->>'id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.appointments WHERE id=fit AND is_fit_in AND ends_at-starts_at=interval '15 minutes') THEN RAISE EXCEPTION 'TEST: encaixe sem duração própria'; END IF;
  BEGIN
   PERFORM public.create_office_appointment(jsonb_build_object('name','QA Agenda conflito','phone','4500000703','professional_id',p,'service_id',s,'starts_at',d::text||'T07:30:00-03:00','fit_in',true,'duration',10));
   RAISE EXCEPTION 'TEST: encaixe sobreposto permitido';
  EXCEPTION WHEN exclusion_violation THEN NULL; END;
  BEGIN
   PERFORM public.create_recurring_schedule_block(jsonb_build_object('professional_id',p,'starts_on',d,'until_on',d+30,'weekdays',jsonb_build_array(5),'start_time','06:00','end_time','08:00'));
   RAISE EXCEPTION 'TEST: bloqueio apagou ou sobrepôs atendimento';
  EXCEPTION WHEN raise_exception THEN IF sqlerrm LIKE 'TEST:%' THEN RAISE; END IF; END;
  rule:=(public.create_recurring_schedule_block(jsonb_build_object('professional_id',p,'starts_on',d+7,'until_on',d+interval '2 months','weekdays',jsonb_build_array(5),'start_time','07:00','end_time','08:00'))->>'id')::uuid;
  IF EXISTS(SELECT 1 FROM public.public_available_slots(s,d+7,p) WHERE slot_time IN ('06:40','07:20')) OR NOT EXISTS(SELECT 1 FROM public.public_available_slots(s,d+7,p) WHERE slot_time='08:00') THEN RAISE EXCEPTION 'TEST: recorrência não bloqueou o intervalo correto'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.public_booking_slots(s,d+7,NULL) WHERE slot_time='07:20' AND available AND professional_id<>p) THEN RAISE EXCEPTION 'TEST: qualquer profissional ignorou a alternativa livre'; END IF;
  BEGIN
   PERFORM public.create_office_appointment(jsonb_build_object('name','QA Agenda bloqueado','phone','4500000704','professional_id',p,'service_id',s,'starts_at',(d+7)::text||'T07:25:00-03:00','fit_in',true,'duration',15));
   RAISE EXCEPTION 'TEST: encaixe furou bloqueio recorrente';
  EXCEPTION WHEN exclusion_violation THEN NULL; END;
  forever:=(public.create_recurring_schedule_block(jsonb_build_object('professional_id',p,'starts_on',d+1,'until_on',NULL,'weekdays',jsonb_build_array(6),'start_time','00:00','end_time','24:00'))->>'id')::uuid;
  far_date:=d+3650;far_date:=far_date+((6-extract(isodow FROM far_date)::integer+7)%7);
  IF EXISTS(SELECT 1 FROM public.public_available_slots(s,far_date,p)) THEN RAISE EXCEPTION 'TEST: recorrência permanente deixou de valer no futuro'; END IF;
  period:=(public.create_schedule_block(p2,(d+100)::timestamp AT TIME ZONE 'America/Sao_Paulo',(d+107)::timestamp AT TIME ZONE 'America/Sao_Paulo','QA uma semana')->>'id')::uuid;
  IF EXISTS(SELECT 1 FROM public.public_available_slots(s,d+103,p2)) THEN RAISE EXCEPTION 'TEST: bloqueio de uma semana deixou horários disponíveis'; END IF;
  IF (public.create_schedule_block(p2,(d+100)::timestamp AT TIME ZONE 'America/Sao_Paulo',(d+107)::timestamp AT TIME ZONE 'America/Sao_Paulo','QA repetido')->>'id')::uuid<>period THEN RAISE EXCEPTION 'TEST: bloqueio duplicado'; END IF;
  PERFORM public.create_schedule_block(p,(d+14)::timestamp AT TIME ZONE 'America/Sao_Paulo',(d+21)::timestamp AT TIME ZONE 'America/Sao_Paulo','QA férias com fechamento recorrente');
  IF EXISTS(SELECT 1 FROM public.public_available_slots(s,d+15,p)) THEN RAISE EXCEPTION 'TEST: bloqueio por período e recorrência não se combinaram'; END IF;
  r:=public.office_snapshot();
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'recurringBlocks') x WHERE x->>'id'=forever::text) THEN RAISE EXCEPTION 'TEST: recorrência não chegou ao aplicativo'; END IF;
  PERFORM public.delete_recurring_schedule_block(forever);
  IF NOT EXISTS(SELECT 1 FROM public.public_available_slots(s,far_date,p)) THEN RAISE EXCEPTION 'TEST: exclusão da recorrência não liberou horários'; END IF;
  PERFORM public.delete_schedule_block(period);
  PERFORM public.delete_recurring_schedule_block(rule);
  IF NOT EXISTS(SELECT 1 FROM public.public_available_slots(s,d+7,p) WHERE slot_time='07:20') THEN RAISE EXCEPTION 'TEST: exclusão não liberou recorrência semanal'; END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE EXCEPTION SQLSTATE 'ZX707' USING MESSAGE='SCHEDULING_PASSED_ROLLBACK';
 EXCEPTION WHEN SQLSTATE 'ZX707' THEN NULL;
 END;
END $$;

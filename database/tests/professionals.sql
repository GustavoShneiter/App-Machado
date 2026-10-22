DO $$
DECLARE owner_uuid uuid; user_uuid uuid:=gen_random_uuid(); pro uuid; other_pro uuid; service uuid; a uuid; b uuid; rec uuid; result jsonb;
BEGIN
 SELECT id INTO STRICT owner_uuid FROM profiles WHERE role='owner' AND active LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',owner_uuid::text,true);
 BEGIN
  INSERT INTO auth.users(id,email) VALUES(user_uuid,'qa-scope-'||user_uuid||'@example.invalid');
  INSERT INTO profiles(id,name,role) VALUES(user_uuid,'QA isolamento profissional','professional');
  pro:=(save_professional_profile('{"name":"QA Profissional escopo"}')->>'id')::uuid;
  other_pro:=(save_professional_profile('{"name":"QA Profissional outro"}')->>'id')::uuid;
  UPDATE professionals SET profile_id=user_uuid WHERE id=pro;
  service:=(save_service_profile('{"name":"QA Escopo corte","price":5000,"duration":40,"commission_mode":"professional"}')->>'id')::uuid;
  PERFORM set_config('request.jwt.claim.sub',user_uuid::text,true);
  PERFORM require_schedule_access(pro);
  BEGIN PERFORM require_schedule_access(other_pro); RAISE EXCEPTION 'TEST: agenda alheia autorizada'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM office_snapshot(); RAISE EXCEPTION 'TEST: caixa administrativo exposto'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  a:=(professional_create_appointment(jsonb_build_object('professional_id',pro,'service_id',service,'name','QA Cliente profissional','phone','4500000881','starts_at','2098-03-10T06:40:00-03:00','fit_in',false))->>'id')::uuid;
  BEGIN PERFORM professional_create_appointment(jsonb_build_object('professional_id',pro,'service_id',service,'name','QA Cliente conflito','phone','4500000882','starts_at','2098-03-10T06:45:00-03:00','fit_in',true,'duration',15)); RAISE EXCEPTION 'TEST: sobreposição permitida'; EXCEPTION WHEN exclusion_violation THEN NULL; END;
  PERFORM professional_schedule_action('set_status',jsonb_build_object('professional_id',pro,'id',a,'status','completed'));
  IF NOT EXISTS(SELECT 1 FROM commission_entries e JOIN command_items i ON i.id=e.command_item_id JOIN commands c ON c.id=i.command_id WHERE c.appointment_id=a AND e.professional_id=pro AND e.commission_cents=2500 AND e.status='pending') THEN RAISE EXCEPTION 'TEST: comissão ou integração com Caixa incorreta'; END IF;
  BEGIN PERFORM professional_schedule_action('cancel_appointment',jsonb_build_object('professional_id',pro,'id',a)); RAISE EXCEPTION 'TEST: atendimento financeiro cancelado'; EXCEPTION WHEN raise_exception THEN IF sqlerrm LIKE 'TEST:%' THEN RAISE; END IF; END;
  BEGIN PERFORM professional_schedule_action('receive',jsonb_build_object('professional_id',pro,'id',a)); RAISE EXCEPTION 'TEST: recebimento administrativo permitido'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  b:=(professional_schedule_action('create_schedule_block',jsonb_build_object('professional_id',pro,'starts_at','2098-03-11T06:00:00-03:00','ends_at','2098-03-12T06:00:00-03:00','reason','QA bloqueio'))->>'id')::uuid;
  BEGIN PERFORM professional_create_appointment(jsonb_build_object('professional_id',pro,'service_id',service,'name','QA Cliente bloqueado','phone','4500000883','starts_at','2098-03-11T07:20:00-03:00','fit_in',false)); RAISE EXCEPTION 'TEST: bloqueio ignorado'; EXCEPTION WHEN exclusion_violation THEN NULL; END;
  rec:=(professional_schedule_action('create_recurring_block',jsonb_build_object('professional_id',pro,'starts_on','2098-03-15','until_on',null,'weekdays',jsonb_build_array(6),'start_time','00:00','end_time','24:00'))->>'id')::uuid;
  BEGIN PERFORM professional_schedule_action('delete_recurring_block',jsonb_build_object('professional_id',other_pro,'id',rec)); RAISE EXCEPTION 'TEST: recorrência alheia removida'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM professional_schedule_action('delete_recurring_block',jsonb_build_object('professional_id',pro,'id',rec));
  PERFORM professional_schedule_action('delete_schedule_block',jsonb_build_object('professional_id',pro,'id',b));
  UPDATE professionals SET active=false WHERE id=pro;
  BEGIN PERFORM require_schedule_access(pro); RAISE EXCEPTION 'TEST: profissional inativo autorizado'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE EXCEPTION 'ROLLBACK_QA_PROFESSIONAL';
 EXCEPTION WHEN raise_exception THEN IF sqlerrm<>'ROLLBACK_QA_PROFESSIONAL' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claim.sub',owner_uuid::text,true);
END $$;

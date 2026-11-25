BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM profiles WHERE role='owner' AND active LIMIT 1),true);
SELECT set_config('request.business_id',(SELECT tenant_id::text FROM profiles WHERE role='owner' AND active LIMIT 1),true);
SET LOCAL ROLE machado_runtime;
DO $$
DECLARE customer uuid;pro uuid;service uuid;package uuid;sale uuid;cmd uuid;booking uuid;entry record;
BEGIN
 SELECT ps.professional_id,ps.service_id INTO pro,service FROM professional_services ps JOIN services s ON s.id=ps.service_id WHERE s.active LIMIT 1;
 customer:=(save_customer_profile('{"name":"QA Plano integrado","phone":"11987659001"}')->>'id')::uuid;
 package:=(save_service_package(jsonb_build_object('name','QA Duas sessões','price',6800,'active',true,'items',jsonb_build_array(jsonb_build_object('service_id',service,'quantity',2))))->>'id')::uuid;
 sale:=(sell_service_package(package,customer,'pix')->>'id')::uuid;
 booking:=(create_office_appointment(jsonb_build_object('customer_id',customer,'professional_id',pro,'service_id',service,'starts_at','2026-11-24T10:00:00-03:00','fit_in',true))->>'id')::uuid;
 SELECT id INTO cmd FROM commands WHERE appointment_id=booking;
 IF (SELECT unit_price_cents FROM command_items WHERE command_id=cmd AND service_id=service)<>3400 THEN RAISE EXCEPTION 'QA booking quote: expected R$ 34,00 before redemption';END IF;
 IF (SELECT remaining FROM package_sale_balances WHERE sale_id=sale AND service_id=service)<>2 THEN RAISE EXCEPTION 'QA quote must not reserve or consume package balance';END IF;
 cmd:=(record_package_visit(jsonb_build_object('sale_id',sale,'service_id',service,'professional_id',pro,'starts_at','2026-11-24T10:00:00-03:00'))->>'id')::uuid;
 IF (SELECT remaining FROM package_sale_balances WHERE sale_id=sale AND service_id=service)<>1 THEN RAISE EXCEPTION 'QA balance'; END IF;
 IF (SELECT sum(unit_price_cents*quantity) FROM command_items WHERE command_id=cmd)<>3400 THEN RAISE EXCEPTION 'QA package service value: expected R$ 34,00';END IF;
 IF (SELECT sum(i.unit_price_cents*i.quantity) FROM command_items i WHERE i.command_id=cmd AND NOT EXISTS(SELECT 1 FROM package_redemptions r WHERE r.command_item_id=i.id))<>0 THEN RAISE EXCEPTION 'QA package must not create a second charge';END IF;
 FOR entry IN SELECT e.* FROM commission_entries e JOIN command_items i ON i.id=e.command_item_id WHERE i.command_id=cmd LOOP
  IF entry.gross_cents<>3400 THEN RAISE EXCEPTION 'QA commission basis: %',entry.gross_cents; END IF;
 END LOOP;
 PERFORM record_package_visit(jsonb_build_object('sale_id',sale,'service_id',service,'professional_id',pro,'starts_at','2026-11-24T10:00:00-03:00'));
 IF (SELECT remaining FROM package_sale_balances WHERE sale_id=sale AND service_id=service)<>1 THEN RAISE EXCEPTION 'QA duplicate use';END IF;
 SELECT appointment_id INTO booking FROM commands WHERE id=cmd;
 IF EXISTS(SELECT FROM agent_outbox WHERE appointment_id=booking AND status='pending') THEN RAISE EXCEPTION 'QA retroactive notification';END IF;
 PERFORM close_package_command(cmd);
 PERFORM reopen_command(cmd);
 IF (SELECT status FROM commands WHERE id=cmd)<>'awaiting_payment' THEN RAISE EXCEPTION 'QA reopen';END IF;
 RAISE NOTICE 'PASS package session value, zero extra charge, commission base, idempotence, agent and reopening';
END $$;
ROLLBACK;

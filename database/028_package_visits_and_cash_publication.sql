BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION public.record_package_visit(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=on AS $$
DECLARE sale package_sales%rowtype; a appointments%rowtype; cmd uuid; item uuid; aid uuid;
 sid uuid:=(payload->>'service_id')::uuid; pro uuid:=(payload->>'professional_id')::uuid;
 starts timestamptz:=(payload->>'starts_at')::timestamptz;
BEGIN
 PERFORM require_office();
 SELECT * INTO STRICT sale FROM package_sales WHERE id=(payload->>'sale_id')::uuid FOR UPDATE;
 SELECT * INTO a FROM appointments WHERE customer_id=sale.customer_id AND professional_id=pro
  AND service_id=sid AND starts_at=starts AND status NOT IN('cancelled','no_show') ORDER BY created_at LIMIT 1 FOR UPDATE;
 IF a.id IS NULL THEN
  aid:=(create_office_appointment(jsonb_build_object('customer_id',sale.customer_id,'professional_id',pro,'service_id',sid,'starts_at',starts,'fit_in',true))->>'id')::uuid;
 ELSE aid:=a.id; END IF;
 SELECT id INTO STRICT cmd FROM commands WHERE appointment_id=aid FOR UPDATE;
 SELECT id INTO STRICT item FROM command_items WHERE command_id=cmd AND service_id=sid ORDER BY id LIMIT 1 FOR UPDATE;
 IF EXISTS(SELECT FROM package_redemptions WHERE command_item_id=item) THEN RETURN jsonb_build_object('id',cmd,'already_applied',true); END IF;
 IF EXISTS(SELECT FROM commands WHERE id=cmd AND status NOT IN('open','awaiting_payment')) THEN RAISE EXCEPTION 'Reabra a comanda antes de aplicar uma sessão.'; END IF;
 IF sale.status<>'active' THEN RAISE EXCEPTION 'Plano sem sessões disponíveis.'; END IF;
 UPDATE package_sale_balances SET remaining=remaining-1 WHERE sale_id=sale.id AND service_id=sid AND remaining>0;
 IF NOT FOUND THEN RAISE EXCEPTION 'Não há sessão disponível para este serviço.'; END IF;
 INSERT INTO package_redemptions(sale_id,service_id,command_item_id,redeemed_by) VALUES(sale.id,sid,item,auth.uid());
 IF NOT EXISTS(SELECT FROM package_sale_balances WHERE sale_id=sale.id AND remaining>0) THEN UPDATE package_sales SET status='completed' WHERE id=sale.id; END IF;
 UPDATE command_items SET unit_price_cents=0 WHERE id=item;
 PERFORM complete_appointment(aid);
 RETURN jsonb_build_object('id',cmd,'appointment_id',aid);
END $$;
REVOKE ALL ON FUNCTION public.record_package_visit(jsonb) FROM PUBLIC;
ALTER FUNCTION public.record_package_visit(jsonb) OWNER TO neondb_owner;
GRANT EXECUTE ON FUNCTION public.record_package_visit(jsonb) TO machado_runtime;
ALTER TABLE public.spreadsheet_connections ADD COLUMN publish_on_cash_close boolean NOT NULL DEFAULT true;
CREATE FUNCTION public.reopen_command(command_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=on AS $$
DECLARE c commands%rowtype; drawer uuid; receipt record;
BEGIN
 SELECT id INTO drawer FROM cash_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1 FOR UPDATE;
 SELECT * INTO STRICT c FROM commands WHERE id=reopen_command.command_id FOR UPDATE;
 IF NOT can_access_admin() THEN
  PERFORM require_schedule_access(c.professional_id);
  IF EXISTS(SELECT FROM command_items WHERE command_items.command_id=c.id AND professional_id IS DISTINCT FROM c.professional_id) THEN RAISE EXCEPTION 'Procure a gestão para revisar esta comanda.'; END IF;
 END IF;
 IF c.status<>'closed' THEN RAISE EXCEPTION 'Somente comandas pagas podem ser reabertas.'; END IF;
 IF EXISTS(SELECT FROM commission_entries e JOIN command_items i ON i.id=e.command_item_id WHERE i.command_id=c.id AND e.status='paid') THEN RAISE EXCEPTION 'Esta comanda tem comissão já repassada. Revise o repasse antes de reabrir.'; END IF;
 IF drawer IS NULL AND EXISTS(SELECT FROM payments WHERE payments.command_id=c.id AND reversed_at IS NULL) THEN RAISE EXCEPTION 'Abra o caixa para registrar o estorno do recebimento antes de reabrir.'; END IF;
 FOR receipt IN SELECT * FROM payments WHERE payments.command_id=c.id AND reversed_at IS NULL FOR UPDATE LOOP
  UPDATE payments SET reversed_at=now() WHERE id=receipt.id;
  INSERT INTO cash_movements(session_id,type,amount_cents,payment_method,notes,created_by,command_id)
   VALUES(drawer,'expense',-receipt.amount_cents,receipt.method,'Estorno para reabertura de comanda',auth.uid(),c.id);
 END LOOP;
 UPDATE commands SET status='awaiting_payment',closed_at=NULL WHERE id=c.id;
 INSERT INTO audit_logs(actor_profile_id,operation,entity_type,request_summary,result)
  VALUES(auth.uid(),'reopen_command','command',jsonb_build_object('id',c.id),'success');
 RETURN jsonb_build_object('id',c.id);
END $$;
REVOKE ALL ON FUNCTION public.reopen_command(uuid) FROM PUBLIC;
ALTER FUNCTION public.reopen_command(uuid) OWNER TO neondb_owner;
GRANT EXECUTE ON FUNCTION public.reopen_command(uuid) TO machado_runtime;
COMMIT;

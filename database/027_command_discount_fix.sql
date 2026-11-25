BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION public.set_command_adjustments(command_id uuid,discount_cents integer DEFAULT 0,surcharge_cents integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE command_row public.commands%rowtype; subtotal bigint;
BEGIN
 PERFORM public.require_office();
 SELECT c.* INTO STRICT command_row FROM public.commands c
  WHERE c.id=set_command_adjustments.command_id FOR UPDATE;
 IF command_row.status NOT IN('open','awaiting_payment') THEN RAISE EXCEPTION 'Esta comanda não aceita mais alterações.'; END IF;
 IF coalesce(set_command_adjustments.discount_cents,-1)<0 OR coalesce(set_command_adjustments.surcharge_cents,-1)<0 THEN
  RAISE EXCEPTION 'Desconto e gorjeta não podem ser negativos.'; END IF;
 SELECT coalesce(sum(i.unit_price_cents::bigint*i.quantity),0) INTO subtotal
  FROM public.command_items i WHERE i.command_id=command_row.id;
 IF subtotal-set_command_adjustments.discount_cents+set_command_adjustments.surcharge_cents<=0 THEN
  RAISE EXCEPTION 'O total da comanda precisa ser maior que zero.'; END IF;
 UPDATE public.commands c SET discount_cents=set_command_adjustments.discount_cents,
  surcharge_cents=set_command_adjustments.surcharge_cents WHERE c.id=command_row.id;
 RETURN jsonb_build_object('id',command_row.id);
END $$;

REVOKE ALL ON FUNCTION public.set_command_adjustments(uuid,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_command_adjustments(uuid,integer,integer) TO machado_runtime;
COMMIT;

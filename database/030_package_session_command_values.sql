BEGIN;
SET LOCAL lock_timeout='5s';

-- A covered appointment keeps the package's per-session service value on its
-- command item. Receiving logic excludes redeemed rows, so this is informative
-- and commissionable without charging the customer twice.
DO $$ DECLARE def text; old text; BEGIN
 def:=pg_get_functiondef('public.sync_appointment_command_base(uuid)'::regprocedure);
 old:='update public.command_items i set unit_price_cents=0,commission_cents=round(amount*i.commission_value/100.0) where i.id=item_uuid;';
 IF position(old IN def)=0 THEN RAISE EXCEPTION 'Unexpected package value sync function'; END IF;
 def:=replace(def,old,'update public.command_items i set unit_price_cents=amount,commission_cents=round(amount*coalesce(i.commission_value,0)/100.0) where i.id=item_uuid;');
 old:='from public.command_items i where i.id=item_uuid and i.commission_cents>0 on conflict(command_item_id) do nothing;';
 IF position(old IN def)=0 THEN RAISE EXCEPTION 'Unexpected package commission insert'; END IF;
 def:=replace(def,old,'from public.command_items i where i.id=item_uuid and i.commission_cents>0 on conflict(command_item_id) do update set gross_cents=excluded.gross_cents,commission_cents=excluded.commission_cents,rule_snapshot=excluded.rule_snapshot where commission_entries.status=''pending'';');
 EXECUTE def;
END $$;

DO $$ DECLARE def text; old text; BEGIN
 def:=pg_get_functiondef('public.record_package_visit(jsonb)'::regprocedure);
 old:='UPDATE command_items SET unit_price_cents=0 WHERE id=item;';
 IF position(old IN def)=0 THEN RAISE EXCEPTION 'Unexpected package visit value update'; END IF;
 def:=replace(def,old,'UPDATE command_items i SET unit_price_cents=round(s.amount_cents::numeric/nullif(b.total,0))::integer,commission_cents=round(round(s.amount_cents::numeric/nullif(b.total,0))*coalesce(i.commission_value,0)/100.0) FROM package_sales s CROSS JOIN LATERAL (SELECT sum(total)::numeric total FROM package_sale_balances WHERE sale_id=s.id) b WHERE i.id=item AND s.id=sale.id;');
 EXECUTE def;
END $$;

DO $$ DECLARE def text; old text; BEGIN
 def:=pg_get_functiondef('public.close_package_command(uuid)'::regprocedure);
 old:='select coalesce(sum(i.unit_price_cents*i.quantity),0)-command_row.discount_cents+command_row.surcharge_cents into total from public.command_items i where i.command_id=command_row.id;';
 IF position(old IN def)=0 THEN RAISE EXCEPTION 'Unexpected package close total'; END IF;
 def:=replace(def,old,'select coalesce(sum(i.unit_price_cents*i.quantity) filter(where not exists(select 1 from public.package_redemptions r where r.command_item_id=i.id)),0)-command_row.discount_cents+command_row.surcharge_cents into total from public.command_items i where i.command_id=command_row.id;');
 EXECUTE def;
END $$;

DO $$ DECLARE def text; old text; BEGIN
 def:=pg_get_functiondef('public.office_action(text,jsonb)'::regprocedure);
 old:='select coalesce(sum(unit_price_cents*quantity),0)-c.discount_cents+c.surcharge_cents into total from public.command_items where command_id=c.id;';
 IF position(old IN def)=0 THEN RAISE EXCEPTION 'Unexpected office receive total'; END IF;
 def:=replace(def,old,'select coalesce(sum(i.unit_price_cents*i.quantity) filter(where not exists(select 1 from public.package_redemptions r where r.command_item_id=i.id)),0)-c.discount_cents+c.surcharge_cents into total from public.command_items i where i.command_id=c.id;');
 EXECUTE def;
END $$;

-- Repair previously redeemed package services. The paid amount is divided by
-- all sessions on that sale (R$ 68 / 2 = R$ 34). Never alter a commission that
-- has already been paid; its cash movement is an immutable financial record.
WITH session_values AS (
 SELECT r.command_item_id,r.sale_id,
  round(ps.amount_cents::numeric/nullif(sum(b.total),0))::integer amount_cents
 FROM public.package_redemptions r
 JOIN public.package_sales ps ON ps.id=r.sale_id
 JOIN public.package_sale_balances b ON b.sale_id=ps.id
 GROUP BY r.command_item_id,r.sale_id,ps.amount_cents
 HAVING sum(b.total)>0
)
UPDATE public.command_items i
 SET unit_price_cents=v.amount_cents,
     commission_cents=CASE WHEN EXISTS(SELECT 1 FROM public.commission_entries e WHERE e.command_item_id=i.id AND e.status='paid')
       THEN i.commission_cents ELSE round(v.amount_cents*coalesce(i.commission_value,0)/100.0)::integer END
FROM session_values v
WHERE i.id=v.command_item_id;

WITH session_values AS (
 SELECT r.command_item_id,r.sale_id,
  round(ps.amount_cents::numeric/nullif(sum(b.total),0))::integer amount_cents
 FROM public.package_redemptions r
 JOIN public.package_sales ps ON ps.id=r.sale_id
 JOIN public.package_sale_balances b ON b.sale_id=ps.id
 GROUP BY r.command_item_id,r.sale_id,ps.amount_cents
 HAVING sum(b.total)>0
)
UPDATE public.commission_entries e
SET gross_cents=v.amount_cents,
    commission_cents=round(v.amount_cents*coalesce(i.commission_value,0)/100.0)::integer,
    rule_snapshot=e.rule_snapshot||jsonb_build_object('package_sale_id',v.sale_id,'package_session_cents',v.amount_cents,'barbershop_cents',v.amount_cents-round(v.amount_cents*coalesce(i.commission_value,0)/100.0)::integer)
FROM session_values v JOIN public.command_items i ON i.id=v.command_item_id
WHERE e.command_item_id=v.command_item_id AND e.status='pending';

COMMIT;

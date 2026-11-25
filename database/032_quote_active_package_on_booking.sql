BEGIN;
SET LOCAL lock_timeout='5s';

DO $$ DECLARE def text; old text; replacement text; BEGIN
 def:=pg_get_functiondef('public.sync_appointment_command_base(uuid)'::regprocedure);
 old:=$old$if a.status='completed' then
    select r.sale_id into package_sale_uuid from public.package_redemptions r where r.command_item_id=item_uuid;$old$;
 replacement:=$new$if a.status<>'completed' then
    amount:=a.expected_price_cents;
    select ps.id into package_sale_uuid from public.package_sales ps join public.package_sale_balances b on b.sale_id=ps.id
      where ps.customer_id=a.customer_id and ps.status='active' and (ps.expires_at IS NULL OR ps.expires_at>=a.starts_at)
       and b.service_id=a.service_id and b.remaining>0 order by ps.sold_at,ps.id limit 1 for update of ps,b;
    if package_sale_uuid is not null then
      select round(ps.amount_cents::numeric/nullif((select sum(b.total) from public.package_sale_balances b where b.sale_id=ps.id),0))::integer into amount from public.package_sales ps where ps.id=package_sale_uuid;
    end if;
    update public.command_items i set unit_price_cents=amount,commission_cents=round(amount*coalesce(i.commission_value,0)/100.0) where i.id=item_uuid;
  end if;
  if a.status='completed' then
    select r.sale_id into package_sale_uuid from public.package_redemptions r where r.command_item_id=item_uuid;$new$;
 IF position(old IN def)=0 THEN RAISE EXCEPTION 'Unexpected appointment quote function'; END IF;
 def:=replace(def,old,replacement);
 old:=$old$ if package_sale_uuid is not null then
  select round(ps.amount_cents::numeric/nullif((select sum(b.total) from public.package_sale_balances b where b.sale_id=ps.id),0))::integer into amount from public.package_sales ps where ps.id=package_sale_uuid;
  update public.command_items i set unit_price_cents=amount,commission_cents=round(amount*coalesce(i.commission_value,0)/100.0) where i.id=item_uuid;
 end if;$old$;
 replacement:=$new$ if package_sale_uuid is not null then
  select round(ps.amount_cents::numeric/nullif((select sum(b.total) from public.package_sale_balances b where b.sale_id=ps.id),0))::integer into amount from public.package_sales ps where ps.id=package_sale_uuid;
 else
  amount:=a.expected_price_cents;
 end if;
 update public.command_items i set unit_price_cents=amount,commission_cents=round(amount*coalesce(i.commission_value,0)/100.0) where i.id=item_uuid;$new$;
 IF position(old IN def)=0 THEN RAISE EXCEPTION 'Unexpected appointment completion price block'; END IF;
 def:=replace(def,old,replacement);
 EXECUTE def;
END $$;

-- Existing upcoming bookings with a valid plan display that plan's session
-- value immediately. The balance remains untouched until the service happens.
WITH eligible AS (
 SELECT DISTINCT ON (i.id) i.id,ps.amount_cents,totals.total
 FROM public.command_items i
 JOIN public.commands c ON c.id=i.command_id AND c.status='open'
 JOIN public.appointments a ON a.id=c.appointment_id AND a.status NOT IN('cancelled','no_show','completed')
 JOIN public.package_sales ps ON ps.customer_id=a.customer_id AND ps.status='active'
   AND (ps.expires_at IS NULL OR ps.expires_at>=a.starts_at)
 JOIN public.package_sale_balances b ON b.sale_id=ps.id AND b.service_id=a.service_id AND b.remaining>0
 JOIN LATERAL(SELECT sum(x.total)::numeric total FROM public.package_sale_balances x WHERE x.sale_id=ps.id) totals ON totals.total>0
 WHERE i.service_id=a.service_id
  AND NOT EXISTS(SELECT 1 FROM public.package_redemptions r WHERE r.command_item_id=i.id)
 ORDER BY i.id,ps.sold_at,ps.id
)
UPDATE public.command_items i SET unit_price_cents=round(e.amount_cents::numeric/e.total)::integer,
 commission_cents=round(round(e.amount_cents::numeric/e.total)*coalesce(i.commission_value,0)/100.0)::integer
FROM eligible e WHERE i.id=e.id;

COMMIT;

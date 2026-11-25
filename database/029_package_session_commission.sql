BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ DECLARE def text; original text; BEGIN
 def:=pg_get_functiondef('public.sync_appointment_command_base(uuid)'::regprocedure);
 original:='if package_sale_uuid is not null then update public.command_items i set unit_price_cents=0 where i.id=item_uuid; end if;';
 IF position(original IN def)=0 THEN RAISE EXCEPTION 'Unexpected package commission function'; END IF;
 def:=replace(def,original,'amount:=a.expected_price_cents;
 if package_sale_uuid is not null then
  select round(ps.amount_cents::numeric/nullif((select sum(b.total) from public.package_sale_balances b where b.sale_id=ps.id),0))::integer into amount from public.package_sales ps where ps.id=package_sale_uuid;
  update public.command_items i set unit_price_cents=0,commission_cents=round(amount*i.commission_value/100.0) where i.id=item_uuid;
 end if;');
 def:=replace(def,'i.professional_id,a.expected_price_cents,i.commission_cents','i.professional_id,amount,i.commission_cents');
 def:=replace(def,'''barbershop_cents'',a.expected_price_cents-i.commission_cents','''barbershop_cents'',amount-i.commission_cents');
 EXECUTE def;
END $$;
ALTER FUNCTION public.record_package_visit(jsonb) OWNER TO neondb_owner;
ALTER FUNCTION public.reopen_command(uuid) OWNER TO neondb_owner;
COMMIT;

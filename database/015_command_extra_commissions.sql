-- Completion creates the booked service's commission (including any package).
-- Also post the remaining lines that were added while the appointment was open.
CREATE FUNCTION public.post_additional_command_commissions() RETURNS trigger
LANGUAGE plpgsql SET search_path TO public,pg_temp AS $$
BEGIN
  INSERT INTO commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status)
    SELECT i.id,i.professional_id,i.unit_price_cents*i.quantity,i.commission_cents,
      jsonb_build_object('rate_percent',i.commission_value,'barbershop_cents',i.unit_price_cents*i.quantity-i.commission_cents,'type',i.type),'pending'
    FROM command_items i
    WHERE i.command_id=NEW.id AND i.commission_cents>0
      AND NOT EXISTS (SELECT FROM commission_entries e WHERE e.command_item_id=i.id)
    ON CONFLICT(command_item_id) DO NOTHING;
  RETURN NULL;
END $$;

-- After the completing statement has posted the primary service, including plans.
CREATE CONSTRAINT TRIGGER post_additional_command_commissions
AFTER UPDATE ON public.commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
WHEN (OLD.status='open' AND NEW.status='awaiting_payment' AND NEW.appointment_id IS NOT NULL)
EXECUTE FUNCTION public.post_additional_command_commissions();

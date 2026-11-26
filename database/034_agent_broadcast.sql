-- Manual WhatsApp campaigns share the existing audited outbox and unit isolation.
ALTER TABLE public.agent_outbox DROP CONSTRAINT agent_outbox_kind_check;
ALTER TABLE public.agent_outbox ADD CONSTRAINT agent_outbox_kind_check
 CHECK (kind IN ('confirmation','reminder','birthday','reactivation','broadcast'));

-- Strengthen relationships introduced after the original unit migration.
ALTER TABLE public.commands DROP CONSTRAINT commands_professional_id_fkey;
ALTER TABLE public.commands ADD CONSTRAINT commands_professional_id_fkey
 FOREIGN KEY(tenant_id,professional_id) REFERENCES public.professionals(tenant_id,id) ON DELETE SET NULL(professional_id);
ALTER TABLE public.spreadsheet_connections DROP CONSTRAINT spreadsheet_connections_created_by_fkey;
ALTER TABLE public.spreadsheet_connections ADD CONSTRAINT spreadsheet_connections_created_by_fkey
 FOREIGN KEY(tenant_id,created_by) REFERENCES public.profiles(tenant_id,id);
-- A workbook must never receive automatic feeds from two units or annual connections.
ALTER TABLE public.spreadsheet_connections ADD CONSTRAINT spreadsheet_connections_document_key UNIQUE(spreadsheet_id);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['agent_settings','agent_contacts','agent_booking_drafts','agent_outbox','agent_runtime_status','agent_delivery_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tab);
 END LOOP;
END $$;

-- Contract 2.1. Run in a transaction after 012. No historical broadcasts.
SET LOCAL lock_timeout='5s';
ALTER TABLE agent_integrations ADD COLUMN permissions text[] NOT NULL DEFAULT ARRAY['capabilities','settings','catalog','availability','prepare_booking','pending_booking','confirm_booking','opt_out','enqueue_campaigns','enqueue_reminders','claim_notification','ack_notification','delivery_update','heartbeat'];
CREATE TABLE agent_settings (
 tenant_id uuid PRIMARY KEY REFERENCES business_units(id) ON DELETE CASCADE DEFAULT current_business_id(),
 config jsonb NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agent_contacts (
 tenant_id uuid NOT NULL DEFAULT current_business_id() REFERENCES business_units(id) ON DELETE CASCADE,
 phone text NOT NULL, marketing_opt_in boolean NOT NULL DEFAULT false, opted_out boolean NOT NULL DEFAULT false,
 consent_note text, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,phone)
);
ALTER TABLE appointments ADD COLUMN appointment_notification_revision integer NOT NULL DEFAULT 1;
ALTER TABLE appointments ADD COLUMN notification_cycle_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE agent_booking_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL DEFAULT current_business_id() REFERENCES business_units(id) ON DELETE CASCADE,
 phone text NOT NULL, customer_name text NOT NULL, service_id uuid NOT NULL, professional_id uuid NOT NULL,
 starts_at timestamptz NOT NULL, source_message_id text NOT NULL, payload_hash text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes', appointment_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,source_message_id),
 FOREIGN KEY(tenant_id,service_id) REFERENCES services(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,professional_id) REFERENCES professionals(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX agent_drafts_phone ON agent_booking_drafts(tenant_id,phone,created_at DESC);
CREATE TABLE agent_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL DEFAULT current_business_id() REFERENCES business_units(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN('confirmation','reminder','birthday','reactivation')), event_key text NOT NULL,
 customer_id uuid NOT NULL, appointment_id uuid, appointment_revision integer, reminder_index integer CHECK(reminder_index IN(1,2)),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','sent','delivered','read','failed','uncertain','suppressed')),
 due_at timestamptz NOT NULL, available_at timestamptz NOT NULL, expires_at timestamptz,
 claim_token uuid, integration_id uuid, claimed_at timestamptz, sent_at timestamptz, delivered_at timestamptz, read_at timestamptz,
 attempts integer NOT NULL DEFAULT 0, last_error_code text, last_error text, provider_message_id text,
 message_text text, settings_revision integer, template_revision integer, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,event_key),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,integration_id) REFERENCES agent_integrations(tenant_id,id)
);
CREATE INDEX agent_outbox_pending ON agent_outbox(tenant_id,available_at) WHERE status='pending';
CREATE INDEX agent_outbox_provider ON agent_outbox(tenant_id,integration_id,provider_message_id);
CREATE TABLE agent_runtime_status (
 tenant_id uuid NOT NULL DEFAULT current_business_id() REFERENCES business_units(id) ON DELETE CASCADE,
 integration_id uuid PRIMARY KEY, state jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,integration_id) REFERENCES agent_integrations(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE agent_delivery_events (
 tenant_id uuid NOT NULL DEFAULT current_business_id() REFERENCES business_units(id) ON DELETE CASCADE,
 integration_id uuid NOT NULL, event_id text NOT NULL, provider_message_id text NOT NULL,
 status text NOT NULL CHECK(status IN('delivered','read','failed')), occurred_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,integration_id,event_id),
 FOREIGN KEY(tenant_id,integration_id) REFERENCES agent_integrations(tenant_id,id) ON DELETE CASCADE
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['agent_settings','agent_contacts','agent_booking_drafts','agent_outbox','agent_runtime_status','agent_delivery_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY unit_scope ON %I TO machado_runtime USING(tenant_id=(SELECT current_business_id())) WITH CHECK(tenant_id=(SELECT current_business_id()))',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO machado_runtime',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP;
END $$;
CREATE FUNCTION agent_schedule_appointment() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE relevant boolean:=false; cfg jsonb; delay_min integer;
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.notification_cycle_at:=now(); relevant:=true;
 ELSE
  relevant:=NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.professional_id IS DISTINCT FROM OLD.professional_id OR NEW.service_id IS DISTINCT FROM OLD.service_id OR (OLD.status IN('cancelled','no_show') AND NEW.status NOT IN('cancelled','no_show','completed'));
  IF relevant THEN NEW.appointment_notification_revision:=OLD.appointment_notification_revision+1; NEW.notification_cycle_at:=now(); END IF;
  IF relevant OR NEW.status IN('cancelled','no_show','completed') THEN
   UPDATE agent_outbox SET status='suppressed',last_error_code='appointment_changed' WHERE appointment_id=NEW.id AND status='pending';
  END IF;
 END IF;
 -- BEFORE trigger only adjusts revision. AFTER trigger can reference the new row.
 RETURN NEW;
END $$;
CREATE TRIGGER agent_appointment_revision BEFORE INSERT OR UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION agent_schedule_appointment();
CREATE FUNCTION agent_queue_confirmation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE cfg jsonb; due timestamptz;
BEGIN
 IF TG_OP='UPDATE' AND NEW.appointment_notification_revision=OLD.appointment_notification_revision THEN RETURN NEW; END IF;
 SELECT config INTO cfg FROM agent_settings WHERE tenant_id=NEW.tenant_id;
 IF NEW.status NOT IN('cancelled','no_show','completed') AND NEW.starts_at>now() AND coalesce((cfg->>'confirmations_enabled')::boolean,false) THEN
  due:=NEW.notification_cycle_at+make_interval(mins=>coalesce((cfg->>'confirmation_delay_minutes')::integer,0));
  INSERT INTO agent_outbox(tenant_id,kind,event_key,customer_id,appointment_id,appointment_revision,due_at,available_at,expires_at,status,last_error_code)
  VALUES(NEW.tenant_id,'confirmation','confirmation:'||NEW.id||':'||NEW.appointment_notification_revision,NEW.customer_id,NEW.id,NEW.appointment_notification_revision,due,due,NEW.starts_at,CASE WHEN due>=NEW.starts_at THEN 'suppressed' ELSE 'pending' END,CASE WHEN due>=NEW.starts_at THEN 'after_appointment' END)
  ON CONFLICT(tenant_id,event_key) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER agent_confirmation AFTER INSERT OR UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION agent_queue_confirmation();
REVOKE ALL ON FUNCTION agent_schedule_appointment(),agent_queue_confirmation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agent_schedule_appointment(),agent_queue_confirmation() TO machado_runtime;
CREATE FUNCTION agent_forget_contact() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 DELETE FROM agent_contacts WHERE tenant_id=OLD.tenant_id AND phone=OLD.phone;
 DELETE FROM agent_booking_drafts WHERE tenant_id=OLD.tenant_id AND phone=OLD.phone;
 RETURN OLD;
END $$;
CREATE TRIGGER agent_customer_deleted AFTER DELETE ON customers FOR EACH ROW EXECUTE FUNCTION agent_forget_contact();
REVOKE ALL ON FUNCTION agent_forget_contact() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agent_forget_contact() TO machado_runtime;

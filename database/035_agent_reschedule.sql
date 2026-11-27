-- Keep each confirmed WhatsApp reschedule idempotent within its business unit.
SET LOCAL lock_timeout='5s';

CREATE TABLE public.agent_reschedule_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL DEFAULT current_business_id() REFERENCES business_units(id) ON DELETE CASCADE,
 source_message_id text NOT NULL CHECK(length(source_message_id) BETWEEN 1 AND 255),
 appointment_id uuid NOT NULL,
 phone text NOT NULL,
 expected_starts_at timestamptz NOT NULL,
 new_starts_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,source_message_id),
 FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX agent_reschedule_appointment_idx ON public.agent_reschedule_requests(tenant_id,appointment_id,created_at DESC);
ALTER TABLE public.agent_reschedule_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY unit_scope ON public.agent_reschedule_requests TO machado_runtime
 USING(tenant_id=(SELECT current_business_id())) WITH CHECK(tenant_id=(SELECT current_business_id()));
GRANT SELECT,INSERT ON public.agent_reschedule_requests TO machado_runtime;
REVOKE ALL ON public.agent_reschedule_requests FROM PUBLIC;

ALTER TABLE public.agent_integrations ALTER COLUMN permissions SET DEFAULT ARRAY[
 'capabilities','settings','catalog','customer_context','availability','prepare_booking',
 'pending_booking','confirm_booking','reschedule_options','reschedule_appointment',
 'opt_out','enqueue_campaigns','enqueue_reminders','claim_notification',
 'ack_notification','delivery_update','heartbeat'
];
UPDATE public.agent_integrations SET permissions=
 CASE WHEN permissions @> ARRAY['reschedule_options'] THEN permissions ELSE array_append(permissions,'reschedule_options') END ||
 CASE WHEN permissions @> ARRAY['reschedule_appointment'] THEN ARRAY[]::text[] ELSE ARRAY['reschedule_appointment'] END
 WHERE NOT permissions @> ARRAY['reschedule_options','reschedule_appointment'];

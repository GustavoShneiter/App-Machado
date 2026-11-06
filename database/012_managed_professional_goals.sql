-- Metas são definidas pela administração; preferências visuais continuam individuais.
ALTER TABLE public.professional_preferences
 ADD COLUMN IF NOT EXISTS goals_managed_by_admin boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS goals_assigned_by uuid,
 ADD COLUMN IF NOT EXISTS goals_updated_at timestamptz;

UPDATE public.professional_preferences SET goals_managed_by_admin=true
 WHERE goals_managed_by_admin IS DISTINCT FROM true;

ALTER TABLE public.backup_runs
 ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.business_units(id);
CREATE INDEX IF NOT EXISTS backup_runs_tenant_created_idx ON public.backup_runs(tenant_id,created_at DESC);

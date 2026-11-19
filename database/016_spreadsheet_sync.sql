CREATE TABLE public.spreadsheet_connections (
  tenant_id uuid PRIMARY KEY DEFAULT current_business_id() REFERENCES business_units(id),
  spreadsheet_id text NOT NULL, year integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  starts_on date NOT NULL, created_by uuid NOT NULL REFERENCES profiles(id),
  enabled boolean NOT NULL DEFAULT true, token_hash text NOT NULL UNIQUE,
  baseline jsonb NOT NULL, mappings jsonb NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 1, connected_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz, last_status jsonb, resume_cells jsonb NOT NULL DEFAULT '[]'
);
ALTER TABLE public.spreadsheet_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spreadsheet_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY spreadsheet_unit ON public.spreadsheet_connections TO machado_runtime
 USING(tenant_id=(SELECT current_business_id()))
 WITH CHECK(tenant_id=(SELECT current_business_id()));
REVOKE ALL ON public.spreadsheet_connections FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.spreadsheet_connections TO machado_runtime;

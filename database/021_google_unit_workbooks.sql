CREATE TABLE public.spreadsheet_installations(
 tenant_id uuid PRIMARY KEY DEFAULT current_business_id() REFERENCES business_units(id),
 created_by uuid NOT NULL,google_email text NOT NULL,token_hash text NOT NULL UNIQUE,connected_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,created_by) REFERENCES profiles(tenant_id,id));
CREATE TABLE public.spreadsheet_authorizations(
 tenant_id uuid PRIMARY KEY DEFAULT current_business_id() REFERENCES business_units(id),
 created_by uuid NOT NULL,grant_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,used_at timestamptz,
 FOREIGN KEY(tenant_id,created_by) REFERENCES profiles(tenant_id,id));
CREATE TABLE public.spreadsheet_creation_jobs(
 tenant_id uuid NOT NULL DEFAULT current_business_id() REFERENCES business_units(id),year integer NOT NULL CHECK(year BETWEEN 2020 AND 2100),
 created_by uuid NOT NULL,spreadsheet_id text,credential_cipher text,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 PRIMARY KEY(tenant_id,year),FOREIGN KEY(tenant_id,created_by) REFERENCES profiles(tenant_id,id));
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['spreadsheet_installations','spreadsheet_authorizations','spreadsheet_creation_jobs'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tab);
 EXECUTE format('CREATE POLICY unit_scope ON public.%I TO machado_runtime USING(tenant_id=(SELECT current_business_id())) WITH CHECK(tenant_id=(SELECT current_business_id()))',tab);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',tab);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO machado_runtime',tab);
 END LOOP;
END $$;

-- Execute atomically in an explicit transaction. Backfill preserves every row
-- and UUID; all existing data belongs to the original Machado unit.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = public,pg_catalog;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='machado_runtime') THEN
    CREATE ROLE machado_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='machado_runtime' AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreaterole OR rolcreatedb)) THEN
    RAISE EXCEPTION 'machado_runtime must be an unprivileged NOLOGIN/NOBYPASSRLS role';
  END IF;
  EXECUTE format('GRANT machado_runtime TO %I',current_user);
END $$;

CREATE TABLE IF NOT EXISTS public.business_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  is_primary boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS business_units_one_primary ON public.business_units(is_primary) WHERE is_primary;
INSERT INTO public.business_units(id,slug,name,is_primary)
SELECT 'eac86d12-32df-4b45-916a-000000000001','machado',coalesce((SELECT name FROM public.business_settings WHERE id=true),'Machado Barbearia'),true
WHERE NOT EXISTS (SELECT 1 FROM public.business_units WHERE is_primary);

CREATE TEMP TABLE _machado_unit_tables(schema_name text NOT NULL,table_name text NOT NULL,PRIMARY KEY(schema_name,table_name)) ON COMMIT DROP;
INSERT INTO _machado_unit_tables VALUES
 ('auth','users'),('public','auth_user'),('public','auth_account'),
 ('public','profiles'),('public','customers'),('public','professionals'),('public','services'),('public','products'),
 ('public','professional_services'),('public','professional_products'),('public','professional_preferences'),
 ('public','appointments'),('public','commands'),('public','command_items'),('public','payments'),
 ('public','stock_movements'),('public','cash_sessions'),('public','cash_movements'),('public','commission_entries'),
 ('public','business_settings'),('public','business_hours'),('public','schedule_blocks'),('public','recurring_schedule_blocks'),
 ('public','service_packages'),('public','service_package_items'),('public','package_sales'),('public','package_sale_balances'),('public','package_redemptions'),
 ('public','notifications'),('public','audit_logs'),('public','agent_integrations'),('public','agent_rate_buckets'),('public','recovery_codes');

DO $$ DECLARE t record; primary_id uuid; BEGIN
  SELECT id INTO STRICT primary_id FROM public.business_units WHERE is_primary;
  FOR t IN SELECT * FROM _machado_unit_tables LOOP
    -- Constant fast-default backfill does NOT fire the existing updated_at
    -- triggers. Historical timestamps remain byte-for-byte unchanged.
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS tenant_id uuid DEFAULT %L::uuid',t.schema_name,t.table_name,primary_id);
    EXECUTE format('UPDATE %I.%I SET tenant_id=$1 WHERE tenant_id IS NULL',t.schema_name,t.table_name) USING primary_id;
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN tenant_id SET NOT NULL',t.schema_name,t.table_name);
  END LOOP;
END $$;

-- Bootstrap trust boundary. The privileged owner can inspect profiles without
-- recursively invoking their RLS policy. This no-argument function returns only
-- the verified scope; it never reads operational/financial data.
-- Missing GUC supports the OLD deployed server during the short migration-first
-- rollout: infer the active actor's unit, or the primary unit for anonymous calls.
-- A nonempty, conflicting GUC is always denied; new HTTP code rejects bad slugs.
CREATE OR REPLACE FUNCTION public.current_business_id() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE selected_id uuid; actor_id uuid; actor_unit uuid;
BEGIN
  selected_id:=nullif(current_setting('request.business_id',true),'')::uuid;
  actor_id:=auth.uid();
  IF actor_id IS NOT NULL THEN
    SELECT p.tenant_id INTO actor_unit FROM public.profiles p JOIN public.business_units b ON b.id=p.tenant_id
      WHERE p.id=actor_id AND p.active AND b.active;
    IF actor_unit IS NULL OR (selected_id IS NOT NULL AND selected_id<>actor_unit) THEN RETURN NULL; END IF;
    RETURN actor_unit;
  END IF;
  IF selected_id IS NULL THEN SELECT id INTO selected_id FROM public.business_units WHERE is_primary AND active; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.business_units WHERE id=selected_id AND active) THEN RETURN NULL; END IF;
  RETURN selected_id;
END $$;
ALTER FUNCTION public.current_business_id() OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION public.current_business_id() FROM PUBLIC;

DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT * FROM _machado_unit_tables LOOP
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN tenant_id SET DEFAULT public.current_business_id()',t.schema_name,t.table_name);
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=format('%I.%I',t.schema_name,t.table_name)::regclass AND conname=t.table_name||'_tenant_id_fkey') THEN
      EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY(tenant_id) REFERENCES public.business_units(id) ON DELETE CASCADE',t.schema_name,t.table_name,t.table_name||'_tenant_id_fkey');
    END IF;
    IF t.schema_name='public' AND t.table_name IN ('business_settings','business_hours') THEN
      -- Their new primary keys below already start with tenant_id.
      NULL;
    ELSIF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=format('%I.%I',t.schema_name,t.table_name)::regclass AND attname='id' AND NOT attisdropped) THEN
      EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I.%I(tenant_id,id)',t.table_name||'_tenant_identity_idx',t.schema_name,t.table_name);
    ELSE
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.%I(tenant_id)',t.table_name||'_tenant_idx',t.schema_name,t.table_name);
    END IF;
  END LOOP;
END $$;

-- These were single-business uniqueness rules. Identity e-mails, UUIDs, and
-- one-to-one professional/profile links intentionally remain globally unique.
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_phone_key;
ALTER TABLE public.customers ADD CONSTRAINT customers_phone_key UNIQUE(tenant_id,phone);
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_internal_code_key;
ALTER TABLE public.products ADD CONSTRAINT products_internal_code_key UNIQUE(tenant_id,internal_code);
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_barcode_key;
ALTER TABLE public.products ADD CONSTRAINT products_barcode_key UNIQUE(tenant_id,barcode);
ALTER TABLE public.agent_integrations DROP CONSTRAINT IF EXISTS agent_integrations_name_key;
ALTER TABLE public.agent_integrations ADD CONSTRAINT agent_integrations_name_key UNIQUE(tenant_id,name);
ALTER TABLE public.business_settings DROP CONSTRAINT IF EXISTS business_settings_pkey;
ALTER TABLE public.business_settings ADD CONSTRAINT business_settings_pkey PRIMARY KEY(tenant_id,id);
ALTER TABLE public.business_hours DROP CONSTRAINT IF EXISTS business_hours_pkey;
ALTER TABLE public.business_hours ADD CONSTRAINT business_hours_pkey PRIMARY KEY(tenant_id,weekday,opens_at);

-- Every relationship between scoped tables carries the same unit. This closes
-- foreign-UUID writes even when a caller guesses an ID from another unit.
DO $$ DECLARE c record; definition text; child_columns text; BEGIN
  FOR c IN
    SELECT k.oid,k.conname,k.conrelid,k.confrelid,pg_get_constraintdef(k.oid) definition,k.conkey
    FROM pg_constraint k
    JOIN _machado_unit_tables src ON format('%I.%I',src.schema_name,src.table_name)::regclass=k.conrelid
    JOIN _machado_unit_tables dst ON format('%I.%I',dst.schema_name,dst.table_name)::regclass=k.confrelid
    WHERE k.contype='f' AND NOT EXISTS(SELECT 1 FROM unnest(k.conkey) n JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=n WHERE a.attname='tenant_id')
  LOOP
    SELECT string_agg(quote_ident(a.attname),', ' ORDER BY n.ord) INTO child_columns
      FROM unnest(c.conkey) WITH ORDINALITY n(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=n.num;
    definition:=regexp_replace(c.definition,'^FOREIGN KEY \(','FOREIGN KEY (tenant_id, ');
    definition:=regexp_replace(definition,'REFERENCES ([^(]+)\(','REFERENCES \1(tenant_id, ');
    definition:=replace(definition,'ON DELETE SET NULL','ON DELETE SET NULL ('||child_columns||')');
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',c.conrelid::regclass,c.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',c.conrelid::regclass,c.conname,definition);
  END LOOP;
END $$;

-- The one existing upsert targeting the old singleton key must match its new
-- composite uniqueness rule. Other upserts target globally unique UUIDs/pairs.
DO $$ DECLARE definition text; BEGIN
  SELECT pg_get_functiondef('public.save_business_settings(jsonb)'::regprocedure) INTO definition;
  definition:=regexp_replace(definition,'on conflict\s*\(id\)','on conflict(tenant_id,id)','ig');
  EXECUTE definition;
END $$;

-- Fresh account creation is SERVER-INTERNAL only. The HTTP route validates and
-- hashes the password with Better Auth; raw recovery codes never reach SQL.
CREATE OR REPLACE FUNCTION public.provision_workspace_owner(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE user_id uuid; account_id uuid; unit_id uuid; unit_name text; owner_name text; owner_email text; password_hash text; unit_slug text; entry jsonb;
BEGIN
  IF current_user='machado_runtime' THEN RAISE EXCEPTION 'Server-owned registration required' USING ERRCODE='42501'; END IF;
  user_id:=(payload->>'id')::uuid; account_id:=(payload->>'account_id')::uuid;
  owner_name:=trim(payload->>'name'); unit_name:=trim(payload->>'business_name'); owner_email:=lower(trim(payload->>'email')); password_hash:=payload->>'password_hash';
  IF user_id IS NULL OR account_id IS NULL OR owner_name IS NULL OR unit_name IS NULL OR char_length(owner_name) NOT BETWEEN 2 AND 80 OR char_length(unit_name) NOT BETWEEN 2 AND 120
     OR owner_email IS NULL OR char_length(owner_email)>254 OR position('@' IN owner_email)<2 OR password_hash IS NULL OR char_length(password_hash) NOT BETWEEN 64 AND 1024
     OR jsonb_typeof(payload->'recovery_codes')<>'array' OR jsonb_array_length(payload->'recovery_codes')<>3 THEN
    RAISE EXCEPTION 'Cadastro inválido.' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(DISTINCT item->>'code_hash') FROM jsonb_array_elements(payload->'recovery_codes') item WHERE item->>'code_hash' ~ '^[a-f0-9]{64}$')<>3 THEN
    RAISE EXCEPTION 'Códigos de recuperação inválidos.' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_email,9));
  IF EXISTS(SELECT 1 FROM public.auth_user WHERE lower(email)=owner_email) THEN RAISE EXCEPTION 'Este e-mail já tem uma conta.' USING ERRCODE='23505'; END IF;
  unit_id:=gen_random_uuid();
  unit_slug:=trim(both '-' FROM regexp_replace(lower(translate(unit_name,'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn')),'[^a-z0-9]+','-','g'));
  unit_slug:=left(coalesce(nullif(unit_slug,''),'machado'),48)||'-'||replace(left(unit_id::text,13),'-','');
  INSERT INTO public.business_units(id,slug,name) VALUES(unit_id,unit_slug,unit_name);
  PERFORM set_config('request.business_id',unit_id::text,true);
  PERFORM set_config('request.jwt.claim.sub','',true);
  INSERT INTO auth.users(id,email,tenant_id) VALUES(user_id,owner_email,unit_id);
  INSERT INTO public.profiles(id,name,role,active,tenant_id) VALUES(user_id,owner_name,'owner',true,unit_id);
  INSERT INTO public.auth_user(id,name,email,"emailVerified","createdAt","updatedAt",tenant_id) VALUES(user_id::text,owner_name,owner_email,false,now(),now(),unit_id);
  INSERT INTO public.auth_account(id,"accountId","providerId","userId",password,"createdAt","updatedAt",tenant_id) VALUES(account_id::text,user_id::text,'credential',user_id::text,password_hash,now(),now(),unit_id);
  -- Login e-mail is private account data, not an automatic public contact.
  INSERT INTO public.business_settings(id,name,tenant_id) VALUES(true,unit_name,unit_id);
  INSERT INTO public.business_hours(weekday,opens_at,closes_at,tenant_id) SELECT day,'06:00'::time,'23:00'::time,unit_id FROM generate_series(1,7) day;
  FOR entry IN SELECT value FROM jsonb_array_elements(payload->'recovery_codes') LOOP
    INSERT INTO public.recovery_codes(user_id,code_hash,tenant_id) VALUES(user_id::text,entry->>'code_hash',unit_id);
  END LOOP;
  INSERT INTO public.audit_logs(actor_profile_id,operation,entity_type,result,tenant_id) VALUES(user_id,'register_unit','account','success',unit_id);
  RETURN jsonb_build_object('id',user_id,'name',owner_name,'email',owner_email,'business_id',unit_id,'business_name',unit_name,'business_slug',unit_slug);
END $$;
REVOKE ALL ON FUNCTION public.provision_workspace_owner(jsonb) FROM PUBLIC;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE,CREATE ON SCHEMA public TO machado_runtime;
GRANT USAGE ON SCHEMA auth TO machado_runtime;
GRANT EXECUTE ON FUNCTION auth.uid() TO machado_runtime;
GRANT USAGE ON TYPE public.user_role,public.appointment_status,public.command_status,public.commission_status TO machado_runtime;

DO $$ DECLARE t record; policy_row record; f record; BEGIN
  FOR t IN SELECT * FROM _machado_unit_tables LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',t.schema_name,t.table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',t.schema_name,t.table_name);
    FOR policy_row IN SELECT policyname FROM pg_policies WHERE schemaname=t.schema_name AND tablename=t.table_name LOOP
      EXECUTE format('DROP POLICY %I ON %I.%I',policy_row.policyname,t.schema_name,t.table_name);
    END LOOP;
    EXECUTE format('CREATE POLICY unit_scope ON %I.%I TO machado_runtime USING(tenant_id=(SELECT public.current_business_id())) WITH CHECK(tenant_id=(SELECT public.current_business_id()))',t.schema_name,t.table_name);
    EXECUTE format('REVOKE ALL ON %I.%I FROM PUBLIC,machado_runtime',t.schema_name,t.table_name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I.%I TO machado_runtime',t.schema_name,t.table_name);
  END LOOP;
  -- Extension implementation functions are deliberately left with their
  -- extension owner. No operational SECURITY DEFINER may retain BYPASSRLS.
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef AND p.proname<>'current_business_id'
    AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO machado_runtime',f.signature);
    EXECUTE format('ALTER FUNCTION %s SET search_path TO public,pg_temp',f.signature);
    EXECUTE format('ALTER FUNCTION %s SET row_security TO on',f.signature);
  END LOOP;
END $$;

ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_units FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unit_scope ON public.business_units;
CREATE POLICY unit_scope ON public.business_units TO machado_runtime USING(id=(SELECT public.current_business_id()));
REVOKE ALL ON public.business_units FROM PUBLIC,machado_runtime;
GRANT SELECT ON public.business_units TO machado_runtime;

ALTER TABLE public.auth_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_session FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unit_auth_sessions ON public.auth_session;
CREATE POLICY unit_auth_sessions ON public.auth_session TO machado_runtime
  USING("userId" IN(SELECT id FROM public.auth_user WHERE tenant_id=(SELECT public.current_business_id())));
REVOKE ALL ON public.auth_session FROM machado_runtime;
GRANT DELETE ON public.auth_session TO machado_runtime;
GRANT SELECT("userId") ON public.auth_session TO machado_runtime;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO machado_runtime;
REVOKE ALL ON FUNCTION public.provision_workspace_owner(jsonb) FROM PUBLIC,machado_runtime;
REVOKE CREATE ON SCHEMA public FROM machado_runtime;

-- No TRUNCATE privilege: reset_operational_data uses ordinary DELETE statements
-- under the unit policy. Backups/authentication remain privileged server paths.

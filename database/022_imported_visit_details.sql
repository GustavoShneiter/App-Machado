-- Preserve expiry dates on imported package credits; existing packages remain
-- unlimited when expires_at is null. No historical prices or balances change.
ALTER TABLE public.package_sales ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.package_sales ADD COLUMN IF NOT EXISTS import_metadata jsonb;

DO $$ DECLARE definition text; original text; BEGIN
 original:=pg_get_functiondef('public.sync_appointment_command_base(uuid)'::regprocedure);
 definition:=replace(original,
  'ps.status=''active'' and b.service_id=a.service_id',
  'ps.status=''active'' and (ps.expires_at IS NULL OR ps.expires_at>=a.starts_at) and b.service_id=a.service_id');
 IF definition=original AND position('ps.expires_at' in original)=0 THEN
  RAISE EXCEPTION 'Package redemption function differs; review before migration.';
 END IF;
 IF definition<>original THEN EXECUTE definition; END IF;

 -- Every visit can contain several services, including the root command.
 original:=pg_get_functiondef('public.office_snapshot()'::regprocedure);
 definition:=replace(original,' and cmd.group_id<>cmd.id','');
 IF position('string_agg(i.description' in definition)=0 THEN
  RAISE EXCEPTION 'Agenda service label differs; review before migration.';
 END IF;
 IF definition<>original THEN EXECUTE definition; END IF;
END $$;

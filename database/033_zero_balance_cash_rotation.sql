-- Keep the existing office_action implementation and change only cash opening.
DO $migration$
DECLARE
  definition text;
  old_branch text := $old$
  elsif action='open_cash' then
    perform pg_advisory_xact_lock(180010);
    if exists(select 1 from public.cash_sessions where closed_at is null) then raise exception 'Já existe um caixa aberto.'; end if;
    amount := (payload->>'amount')::integer;
    if amount is null or amount<0 then raise exception 'Saldo inicial inválido.'; end if;
    insert into public.cash_sessions(opened_by,opening_balance_cents) values(auth.uid(),amount) returning id into v_id;
  elsif action='close_cash' then$old$;
  new_branch text := $new$
  elsif action='open_cash' then
    perform pg_advisory_xact_lock(180010);
    update public.cash_sessions
      set closed_at=now(), declared_balance_cents=null,
          notes=concat_ws(E'\n',nullif(notes,''),'Fechado automaticamente ao abrir novo caixa; sem contagem física.')
      where tenant_id=public.current_business_id() and closed_at is null;
    insert into public.cash_sessions(opened_by,opening_balance_cents,tenant_id)
      values(auth.uid(),0,public.current_business_id()) returning id into v_id;
  elsif action='close_cash' then$new$;
BEGIN
  SELECT pg_get_functiondef('public.office_action(text,jsonb)'::regprocedure) INTO definition;
  IF position(new_branch in definition)>0 THEN RETURN; END IF;
  IF position(old_branch in definition)=0 THEN
    RAISE EXCEPTION 'O fluxo atual de abertura do caixa mudou; migração cancelada.';
  END IF;
  EXECUTE replace(definition,old_branch,new_branch);
END $migration$;

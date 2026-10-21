do $$
declare actor uuid; pro uuid; service uuid; appointment uuid; absent uuid; removed uuid; command uuid; response jsonb;
begin
  select id into strict actor from public.profiles where role='owner' and active limit 1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  begin
    insert into public.professionals(name,active,default_commission_percent) values('QA Agenda 1.20',true,40) returning id into pro;
    insert into public.services(name,price_cents,duration_minutes,active) values('QA Corte 1.20',5000,30,true) returning id into service;
    insert into public.professional_services(professional_id,service_id,commission_percent) values(pro,service,35);
    response:=public.office_action('create_appointment',jsonb_build_object('name','QA Presença','phone','4500000120','professional_id',pro,'service_id',service,'starts_at','2099-01-05T09:00:00-03:00'));
    appointment:=(response->>'id')::uuid;
    perform public.office_action('set_status',jsonb_build_object('id',appointment,'status','completed'));
    perform public.office_action('set_status',jsonb_build_object('id',appointment,'status','completed'));
    select id into strict command from public.commands where appointment_id=appointment;
    if (select status from public.commands where id=command)<>'awaiting_payment' then raise exception 'TEST: presença não seguiu para recebimento'; end if;
    if exists(select 1 from public.payments where command_id=command) then raise exception 'TEST: presença registrou pagamento antes de receber'; end if;
    if (select sum(commission_cents) from public.command_items where command_id=command)<>1750 then raise exception 'TEST: presença ignorou a comissão do serviço'; end if;
    if not exists(select 1 from public.cash_sessions where closed_at is null) then perform public.office_action('open_cash','{"amount":0}'); end if;
    perform public.office_action('receive',jsonb_build_object('id',command,'method','pix'));
    perform public.remove_agenda_appointment(appointment);
    if exists(select 1 from public.appointments where id=appointment) then raise exception 'TEST: remoção apenas ocultou presença'; end if;
    if exists(select 1 from public.payments where command_id=command) then raise exception 'TEST: remoção deixou pagamento'; end if;
    if exists(select 1 from public.command_items where command_id=command) then raise exception 'TEST: remoção deixou comissão'; end if;
    perform public.office_action('create_appointment',jsonb_build_object('name','QA Horário após exclusão','phone','4500000121','professional_id',pro,'service_id',service,'starts_at','2099-01-05T09:15:00-03:00'));
    response:=public.office_action('create_appointment',jsonb_build_object('name','QA Ausência','phone','4500000122','professional_id',pro,'service_id',service,'starts_at','2099-01-05T10:00:00-03:00'));
    absent:=(response->>'id')::uuid;
    perform public.office_action('set_status',jsonb_build_object('id',absent,'status','no_show'));
    perform public.remove_agenda_appointment(absent);
    if exists(select 1 from public.appointments where id=absent) then raise exception 'TEST: não excluiu ausência'; end if;
    response:=public.office_action('create_appointment',jsonb_build_object('name','QA Remoção','phone','4500000123','professional_id',pro,'service_id',service,'starts_at','2099-01-05T10:00:00-03:00'));
    removed:=(response->>'id')::uuid;
    perform public.remove_agenda_appointment(removed);
    if exists(select 1 from public.appointments where id=removed) then raise exception 'TEST: não excluiu reserva pendente'; end if;
    perform public.office_action('create_appointment',jsonb_build_object('name','QA Horário liberado','phone','4500000124','professional_id',pro,'service_id',service,'starts_at','2099-01-05T10:00:00-03:00'));
    perform set_config('request.jwt.claim.sub','',true);
    begin
      perform public.remove_agenda_appointment(appointment);
      raise exception 'TEST: remoção anônima permitida';
    exception when insufficient_privilege then null; end;
    raise exception sqlstate 'ZX120' using message='AGENDA_PASSED_ROLLBACK';
  exception when sqlstate 'ZX120' then null;
  end;
end $$;

-- Executado no SQL Editor com sessão administrativa. Todas as fixtures são revertidas.
do $$
declare owner_id uuid; pro uuid; machado uuid; service uuid; appt uuid; appt2 uuid; command uuid; item uuid; entry uuid; session_id uuid; response jsonb; count_rows integer; product_id uuid; booking_slot record; public_appt uuid;
begin
  begin
    select id into strict owner_id from public.profiles where role='owner' and active limit 1;
    perform set_config('request.jwt.claim.sub',owner_id::text,true);
    insert into public.professionals(name,active,default_commission_percent) values('TESTE integração Araújo',true,40) returning id into pro;
    insert into public.professionals(name,active,default_commission_percent) values('Machado',true,0) returning id into machado;
    insert into public.services(name,price_cents,duration_minutes,active) values('TESTE integração corte',4000,30,true) returning id into service;
    response := public.office_action('create_appointment',jsonb_build_object('name','TESTE cliente integração','phone','119'||lpad(floor(random()*100000000)::bigint::text,8,'0'),'professional_id',pro,'service_id',service,'starts_at','2099-01-05T09:00:00-03:00'));
    appt := (response->>'id')::uuid;
    select id into strict command from public.commands where appointment_id=appt;
    if not exists(select 1 from jsonb_array_elements(public.office_snapshot()->'appointments') a where a->>'id'=appt::text and a->>'professional_name'='TESTE integração Araújo' and a->>'service_name'='TESTE integração corte' and a->>'customer_name'='TESTE cliente integração') then raise exception 'TEST FAIL: identidade na agenda'; end if;
    perform public.office_action('set_status',jsonb_build_object('id',appt,'status','completed'));
    perform public.office_action('set_status',jsonb_build_object('id',appt,'status','completed'));
    select id into strict item from public.command_items where command_id=command;
    select id into strict entry from public.commission_entries where command_item_id=item and commission_cents=1600 and status='pending';
    if (select count(*) from public.command_items where command_id=command)<>1 then raise exception 'TEST FAIL: comanda duplicada'; end if;
    if (select status from public.commands where id=command)<>'awaiting_payment' then raise exception 'TEST FAIL: conclusão registrou pagamento inexistente'; end if;
    select id into session_id from public.cash_sessions where closed_at is null limit 1;
    if session_id is null then response:=public.office_action('open_cash','{"amount":0}'); session_id:=(response->>'id')::uuid; end if;
    perform public.office_action('receive',jsonb_build_object('id',command,'method','pix'));
    perform public.office_action('receive',jsonb_build_object('id',command,'method','pix'));
    if (select sum(amount_cents) from public.payments where command_id=command)<>4000 then raise exception 'TEST FAIL: recebimento duplicado'; end if;
    if (select sum(amount_cents) from public.cash_movements where command_id=command)<>4000 then raise exception 'TEST FAIL: entrada no caixa'; end if;
    perform public.office_action('pay_commissions',jsonb_build_object('id',pro,'method','pix','entries',jsonb_build_array(entry)));
    perform public.office_action('pay_commissions',jsonb_build_object('id',pro,'method','pix','entries',jsonb_build_array(entry)));
    if (select sum(amount_cents) from public.cash_movements where commission_entry_id=entry)<>-1600 then raise exception 'TEST FAIL: repasse duplicado'; end if;
    if (select status from public.commission_entries where id=entry)<>'paid' then raise exception 'TEST FAIL: baixa do repasse'; end if;
    begin
      perform public.office_action('set_status',jsonb_build_object('id',appt,'status','cancelled'));
      raise exception 'TEST FAIL: cancelou serviço concluído';
    exception when raise_exception then if sqlerrm like 'TEST FAIL:%' then raise; end if; end;
    response := public.office_action('create_appointment',jsonb_build_object('name','TESTE Machado','phone','119'||lpad(floor(random()*100000000)::bigint::text,8,'0'),'professional_id',machado,'service_id',service,'starts_at','2099-01-05T09:00:00-03:00'));
    appt2 := (response->>'id')::uuid;
    perform public.office_action('set_status',jsonb_build_object('id',appt2,'status','completed'));
    if exists(select 1 from public.commission_entries where professional_id=machado) then raise exception 'TEST FAIL: Machado ganhou comissão'; end if;
    response:=public.office_action('save_service',jsonb_build_object('name','TESTE serviço público','price',5000,'duration',30));
    service:=(response->>'id')::uuid;
    if not exists(select 1 from public.professional_services where professional_id=pro and service_id=service) then raise exception 'TEST FAIL: serviço não vinculado'; end if;
    select d::date booking_day, slots.slot_time into strict booking_slot from generate_series(current_date+1,current_date+7,interval '1 day') d cross join lateral public.public_available_slots(service,d::date,pro) slots order by d,slots.slot_time limit 1;
    public_appt:=public.create_public_appointment('TESTE cliente público','119'||lpad(floor(random()*100000000)::bigint::text,8,'0'),service,pro,(booking_slot.booking_day+booking_slot.slot_time) at time zone 'America/Sao_Paulo',true);
    if not exists(select 1 from public.commands where appointment_id=public_appt) then raise exception 'TEST FAIL: reserva pública sem comanda'; end if;
    if not exists(select 1 from jsonb_array_elements(public.office_snapshot()->'appointments') a where a->>'id'=public_appt::text and a->>'customer_name'='TESTE cliente público' and a->>'professional_name'='TESTE integração Araújo') then raise exception 'TEST FAIL: reserva pública fora da agenda'; end if;
    begin
      perform public.create_public_appointment('TESTE conflito','119'||lpad(floor(random()*100000000)::bigint::text,8,'0'),service,pro,(booking_slot.booking_day+booking_slot.slot_time) at time zone 'America/Sao_Paulo',true);
      raise exception 'TEST FAIL: horário duplicado';
    exception when invalid_parameter_value or exclusion_violation then null; end;
    perform public.office_action('set_status',jsonb_build_object('id',public_appt,'status','cancelled'));
    if exists(select 1 from public.commission_entries e join public.command_items i on i.id=e.command_item_id join public.commands c on c.id=i.command_id where c.appointment_id=public_appt) then raise exception 'TEST FAIL: cancelado gerou comissão'; end if;
    response:=public.office_action('save_product',jsonb_build_object('name','TESTE pomada','price',3500,'cost',1000,'minimum',2));
    product_id:=(response->>'id')::uuid;
    perform public.office_action('adjust_stock',jsonb_build_object('id',product_id,'delta',5,'notes','Teste reposição'));
    perform public.office_action('adjust_stock',jsonb_build_object('id',product_id,'delta',-2,'notes','Teste ajuste'));
    if (select quantity from public.products where id=product_id)<>3 then raise exception 'TEST FAIL: estoque'; end if;
    perform public.office_action('move_cash',jsonb_build_object('type','expense','method','pix','amount',500,'notes','TESTE despesa'));
    if not exists(select 1 from public.cash_movements where notes='TESTE despesa' and amount_cents=-500) then raise exception 'TEST FAIL: despesa'; end if;
    perform set_config('request.jwt.claim.sub','',true);
    begin
      perform public.office_snapshot();
      raise exception 'TEST FAIL: dados administrativos públicos';
    exception when insufficient_privilege then null; end;
    -- Este código de exceção desfaz somente as fixtures e mantém a migração externa.
    raise exception sqlstate 'ZX001' using message='TESTS_PASSED_ROLLBACK_FIXTURES';
  exception when sqlstate 'ZX001' then null;
  end;
end $$;

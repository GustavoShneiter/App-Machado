-- Every fixture is reverted by the enclosing exception block.
DO $$
DECLARE actor uuid; admin_actor uuid; linked_profile uuid; pro uuid; pro2 uuid; zero_pro uuid; service uuid; product uuid; command uuid; customer uuid; item uuid; entry uuid; appt uuid; pkg uuid; sale uuid; response jsonb; snap jsonb; total_commission integer;
BEGIN
  SELECT id INTO STRICT actor FROM public.profiles WHERE role='owner' AND active LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  BEGIN
    pro:=(public.save_professional_profile('{"name":"QA Final Araújo","service_commission":99,"product_commission":99}')->>'id')::uuid;
    pro2:=(public.save_professional_profile('{"name":"QA Final outro"}')->>'id')::uuid;
    zero_pro:=(public.save_professional_profile('{"name":"QA Final zero"}')->>'id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.professionals WHERE id=pro AND default_commission_percent=99 AND default_product_commission_percent=99) THEN RAISE EXCEPTION 'TEST: percentuais do perfil não foram salvos'; END IF;
    service:=(public.save_service_profile(jsonb_build_object('name','QA Final corte','price',4000,'duration',30,'commission',50,'commissions',jsonb_build_array(jsonb_build_object('professional_id',pro,'commission_percent',50),jsonb_build_object('professional_id',pro2,'commission_percent',60),jsonb_build_object('professional_id',zero_pro,'commission_percent',0))))->>'id')::uuid;
    IF (SELECT commission_percent FROM public.professional_services WHERE professional_id=pro2 AND service_id=service)<>60 THEN RAISE EXCEPTION 'TEST: comissão por serviço não salvou'; END IF;
    -- Editing basic fields without the commissions key preserves the rules.
    PERFORM public.save_service_profile(jsonb_build_object('id',service,'name','QA Final corte editado','price',4000,'duration',30));
    IF (SELECT commission_percent FROM public.professional_services WHERE professional_id=pro2 AND service_id=service)<>60 THEN RAISE EXCEPTION 'TEST: edição apagou comissão'; END IF;
    product:=(public.save_product_profile(jsonb_build_object('name','QA Final pomada','price',3500,'cost',1000,'minimum',1,'commission',20,'commissions',jsonb_build_array(jsonb_build_object('professional_id',pro2,'commission_percent',30),jsonb_build_object('professional_id',zero_pro,'commission_percent',0))))->>'id')::uuid;
    PERFORM public.office_action('adjust_stock',jsonb_build_object('id',product,'delta',20,'notes','QA Final estoque'));
    response:=public.open_manual_command('QA Final cliente','4500000619'); command:=(response->>'id')::uuid;
    SELECT customer_id INTO STRICT customer FROM public.commands WHERE id=command;
    PERFORM public.add_service_to_command(command,service,pro);
    PERFORM public.add_service_to_command(command,service,pro2);
    PERFORM public.add_service_to_command(command,service,zero_pro);
    IF (SELECT sum(commission_cents) FROM public.command_items WHERE command_id=command)<>4400 THEN RAISE EXCEPTION 'TEST: 50/60/0 por serviço incorretos'; END IF;
    item:=(public.add_product_to_command(command,product,2,pro)->>'id')::uuid;
    IF (SELECT commission_cents FROM public.command_items WHERE id=item)<>1400 THEN RAISE EXCEPTION 'TEST: quantidade inicial de produto incorreta'; END IF;
    PERFORM public.add_product_to_command(command,product,1,pro);
    IF (SELECT commission_cents FROM public.command_items WHERE id=item)<>2100 THEN RAISE EXCEPTION 'TEST: incremento de quantidade incorreto'; END IF;
    PERFORM public.add_product_to_command(command,product,2,pro2);
    PERFORM public.add_product_to_command(command,product,1,zero_pro);
    IF (SELECT sum(commission_cents) FROM public.command_items WHERE command_id=command AND type='product')<>4200 THEN RAISE EXCEPTION 'TEST: comissão de produtos por profissional incorreta'; END IF;
    PERFORM public.mark_command_ready(command);
    SELECT sum(commission_cents) INTO total_commission FROM public.commission_entries WHERE command_item_id IN (SELECT id FROM public.command_items WHERE command_id=command);
    IF total_commission<>8600 THEN RAISE EXCEPTION 'TEST: repasse total incorreto'; END IF;
    snap:=public.office_snapshot();
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'products') p WHERE p->>'id'=product::text AND (p->'commissions'->>pro2::text)::numeric=30) THEN RAISE EXCEPTION 'TEST: produto sem comissão no retorno ao Caixa'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.cash_sessions WHERE closed_at IS NULL) THEN PERFORM public.office_action('open_cash','{"amount":0}'); END IF;
    PERFORM public.office_action('receive',jsonb_build_object('id',command,'method','pix'));
    IF (SELECT sum(amount_cents) FROM public.payments WHERE command_id=command)<>33000 THEN RAISE EXCEPTION 'TEST: recebimento não corresponde aos itens'; END IF;
    SELECT id INTO STRICT entry FROM public.commission_entries WHERE command_item_id=item;
    PERFORM public.office_action('pay_commissions',jsonb_build_object('id',pro,'method','pix','entries',jsonb_build_array(entry)));
    PERFORM public.delete_command_record(command);
    IF EXISTS(SELECT 1 FROM public.commands WHERE id=command) OR EXISTS(SELECT 1 FROM public.payments WHERE command_id=command) OR EXISTS(SELECT 1 FROM public.cash_movements WHERE command_id=command OR commission_entry_id=entry) OR EXISTS(SELECT 1 FROM public.commission_entries WHERE id=entry) THEN RAISE EXCEPTION 'TEST: exclusão deixou histórico financeiro'; END IF;

    response:=public.office_action('create_appointment',jsonb_build_object('name','QA Final agenda','phone','4500000620','professional_id',pro,'service_id',service,'starts_at','2099-01-05T09:00:00-03:00')); appt:=(response->>'id')::uuid;
    PERFORM public.office_action('set_status',jsonb_build_object('id',appt,'status','completed'));
    SELECT id INTO STRICT command FROM public.commands WHERE appointment_id=appt;
    PERFORM public.office_action('receive',jsonb_build_object('id',command,'method','pix'));
    PERFORM public.remove_agenda_appointment(appt);
    IF EXISTS(SELECT 1 FROM public.appointments WHERE id=appt) OR EXISTS(SELECT 1 FROM public.commands WHERE id=command) OR EXISTS(SELECT 1 FROM public.payments WHERE command_id=command) THEN RAISE EXCEPTION 'TEST: agenda apenas ocultou registro'; END IF;

    -- Product deletion removes linked commands, payments and inventory movements.
    command:=(public.open_manual_command('QA Final produto cliente','4500000621')->>'id')::uuid;
    PERFORM public.add_product_to_command(command,product,1,pro2);
    PERFORM public.mark_command_ready(command);
    PERFORM public.office_action('receive',jsonb_build_object('id',command,'method','pix'));
    PERFORM public.delete_product_record(product);
    IF EXISTS(SELECT 1 FROM public.products WHERE id=product) OR EXISTS(SELECT 1 FROM public.commands WHERE id=command) OR EXISTS(SELECT 1 FROM public.stock_movements WHERE product_id=product) OR EXISTS(SELECT 1 FROM public.professional_products WHERE product_id=product) THEN RAISE EXCEPTION 'TEST: exclusão de produto incompleta'; END IF;

    -- Service deletion includes sold plans and their balances.
    pkg:=(public.save_service_package(jsonb_build_object('name','QA Final plano','price',10000,'items',jsonb_build_array(jsonb_build_object('service_id',service,'quantity',3))))->>'id')::uuid;
    sale:=(public.sell_service_package(pkg,customer,'pix')->>'id')::uuid;
    PERFORM public.delete_service_record(service);
    IF EXISTS(SELECT 1 FROM public.services WHERE id=service) OR EXISTS(SELECT 1 FROM public.service_packages WHERE id=pkg) OR EXISTS(SELECT 1 FROM public.package_sales WHERE id=sale) OR EXISTS(SELECT 1 FROM public.cash_movements WHERE package_sale_id=sale) THEN RAISE EXCEPTION 'TEST: exclusão de serviço incompleta'; END IF;
    PERFORM public.delete_customer_record(customer);
    IF EXISTS(SELECT 1 FROM public.customers WHERE id=customer) THEN RAISE EXCEPTION 'TEST: cliente não excluído'; END IF;

    service:=(public.save_service_profile('{"name":"QA Final outro serviço","price":4000,"duration":30}')->>'id')::uuid;
    command:=(public.open_manual_command('QA Final excluir cliente','4500000623')->>'id')::uuid;
    SELECT customer_id INTO STRICT customer FROM public.commands WHERE id=command;
    PERFORM public.add_service_to_command(command,service,pro);
    PERFORM public.mark_command_ready(command);
    PERFORM public.office_action('receive',jsonb_build_object('id',command,'method','pix'));
    pkg:=(public.save_service_package(jsonb_build_object('name','QA Final plano cliente','price',10000,'items',jsonb_build_array(jsonb_build_object('service_id',service,'quantity',3))))->>'id')::uuid;
    sale:=(public.sell_service_package(pkg,customer,'pix')->>'id')::uuid;
    PERFORM public.delete_customer_record(customer);
    IF EXISTS(SELECT 1 FROM public.customers WHERE id=customer) OR EXISTS(SELECT 1 FROM public.commands WHERE id=command) OR EXISTS(SELECT 1 FROM public.payments WHERE command_id=command) OR EXISTS(SELECT 1 FROM public.package_sales WHERE id=sale) OR EXISTS(SELECT 1 FROM public.package_sale_balances WHERE sale_id=sale) OR EXISTS(SELECT 1 FROM public.cash_movements WHERE package_sale_id=sale) THEN RAISE EXCEPTION 'TEST: exclusão de cliente incompleta'; END IF;

    response:=public.office_action('create_appointment',jsonb_build_object('name','QA Final profissional cliente','phone','4500000622','professional_id',pro2,'service_id',service,'starts_at','2099-01-05T10:00:00-03:00')); appt:=(response->>'id')::uuid;
    PERFORM public.office_action('set_status',jsonb_build_object('id',appt,'status','completed'));
    SELECT id INTO STRICT command FROM public.commands WHERE appointment_id=appt;
    PERFORM public.office_action('receive',jsonb_build_object('id',command,'method','pix'));
    PERFORM public.delete_professional_record(pro2);
    IF EXISTS(SELECT 1 FROM public.professionals WHERE id=pro2) OR EXISTS(SELECT 1 FROM public.appointments WHERE id=appt) OR EXISTS(SELECT 1 FROM public.commands WHERE id=command) OR EXISTS(SELECT 1 FROM public.payments WHERE command_id=command) OR EXISTS(SELECT 1 FROM public.commission_entries WHERE professional_id=pro2) THEN RAISE EXCEPTION 'TEST: profissional apenas desativado'; END IF;
    linked_profile:=gen_random_uuid();
    INSERT INTO auth.users(id,email) VALUES(linked_profile,linked_profile::text||'@example.invalid');
    INSERT INTO public.profiles(id,name,role) VALUES(linked_profile,'QA Final acesso profissional','professional');
    INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES(linked_profile::text,'QA Final acesso profissional',linked_profile::text||'@example.invalid',true);
    UPDATE public.professionals SET profile_id=linked_profile WHERE id=zero_pro;
    INSERT INTO public.cash_sessions(opened_by,opening_balance_cents,closed_at,declared_balance_cents) VALUES(linked_profile,0,now(),0);
    PERFORM public.delete_professional_record(zero_pro);
    IF EXISTS(SELECT 1 FROM public.profiles WHERE id=linked_profile) OR EXISTS(SELECT 1 FROM public.auth_user WHERE id=linked_profile::text) OR EXISTS(SELECT 1 FROM auth.users WHERE id=linked_profile) THEN RAISE EXCEPTION 'TEST: exclusão deixou acesso profissional'; END IF;
    SELECT id INTO admin_actor FROM public.profiles WHERE role='admin' AND active LIMIT 1;
    IF admin_actor IS NOT NULL THEN
      PERFORM set_config('request.jwt.claim.sub',admin_actor::text,true);
      pro2:=(public.save_professional_profile('{"name":"QA Final administrador"}')->>'id')::uuid;
      PERFORM public.delete_professional_record(pro2);
      PERFORM set_config('request.jwt.claim.sub',actor::text,true);
    END IF;
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION SQLSTATE 'ZX619' USING MESSAGE='FINAL_ADJUSTMENTS_PASSED_ROLLBACK';
  EXCEPTION WHEN SQLSTATE 'ZX619' THEN NULL;
  END;
END $$;

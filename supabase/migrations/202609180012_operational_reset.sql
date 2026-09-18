-- Reset operacional protegido. Preserva catálogo, profissionais, produtos e estoque.
-- Apaga somente dados de operação: agenda, clientes, comandas, caixa, pagamentos e repasses.
begin;

create or replace function public.reset_operational_data(confirmation text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  removed_appointments integer := 0;
  removed_customers integer := 0;
  removed_commands integer := 0;
  removed_sessions integer := 0;
begin
  perform public.require_office();
  if public.current_role() <> 'owner' then
    raise exception 'Somente o proprietário pode zerar a operação.';
  end if;
  if coalesce(confirmation,'') <> 'ZERAR OPERAÇÃO' then
    raise exception 'Digite ZERAR OPERAÇÃO para confirmar a limpeza.';
  end if;

  -- Mantém serviços, profissionais, produtos e estoque. A ordem respeita as chaves estrangeiras.
  delete from public.cash_movements;
  delete from public.commission_entries;
  delete from public.payments;
  delete from public.command_items;
  delete from public.commands; get diagnostics removed_commands = row_count;
  delete from public.appointments; get diagnostics removed_appointments = row_count;
  delete from public.cash_sessions; get diagnostics removed_sessions = row_count;
  delete from public.customers; get diagnostics removed_customers = row_count;

  insert into public.audit_logs(actor_profile_id,operation,entity_type,request_summary,result)
    values(auth.uid(),'reset_operational_data','operation',jsonb_build_object('appointments',removed_appointments,'customers',removed_customers,'commands',removed_commands,'cash_sessions',removed_sessions),'success');
  return jsonb_build_object('appointments',removed_appointments,'customers',removed_customers,'commands',removed_commands,'cash_sessions',removed_sessions);
end $$;

revoke all on function public.reset_operational_data(text) from public, anon;
grant execute on function public.reset_operational_data(text) to authenticated;

commit;

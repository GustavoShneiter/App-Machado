begin;
create or replace function public.complete_appointment(appointment_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare a public.appointments%rowtype;
begin
  perform public.require_office();
  select * into strict a from public.appointments where id=$1 for update;
  if a.status in ('cancelled','no_show') then raise exception 'Atendimento cancelado ou ausente não pode gerar receita.'; end if;
  if a.expected_price_cents<=0 then raise exception 'Informe o valor combinado na comanda antes de concluir o atendimento.'; end if;
  if a.status<>'completed' then update public.appointments set status='completed' where id=a.id; end if;
  perform public.sync_appointment_command(a.id);
end $$;
revoke all on function public.complete_appointment(uuid) from public, anon;
grant execute on function public.complete_appointment(uuid) to authenticated;
commit;

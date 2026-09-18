-- O proprietário pode registrar o pagamento de valores a receber pelos profissionais.
create policy "owner manages commission payments"
on public.commission_entries
for all
to authenticated
using (public.current_role() = 'owner')
with check (public.current_role() = 'owner');

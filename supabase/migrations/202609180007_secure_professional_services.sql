-- Somente o proprietário pode definir os serviços atendidos por cada profissional.
alter table public.professional_services enable row level security;

create policy "owner manages professional service assignments"
on public.professional_services
for all
to authenticated
using (public.current_role() = 'owner')
with check (public.current_role() = 'owner');

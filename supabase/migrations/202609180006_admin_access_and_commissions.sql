-- O painel administrativo só pode ser aberto por perfis owner ou admin ativos.
create or replace function public.can_access_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and role in ('owner', 'admin')
  );
$$;

revoke all on function public.can_access_admin() from public;
grant execute on function public.can_access_admin() to authenticated;

-- Garante que a conta já existente do proprietário seja reconhecida como dona.
insert into public.profiles (id, name, role, active)
select id, coalesce(raw_user_meta_data ->> 'name', split_part(email, '@', 1)), 'owner'::public.user_role, true
from auth.users
where lower(email) = 'dionemachado0000@gmail.com'
on conflict (id) do update set role = 'owner', active = true;

-- Machado não recebe comissão; todos os demais profissionais usam 40% por padrão.
alter table public.professionals
  alter column default_commission_percent set default 40;

update public.professionals
set default_commission_percent = case when lower(trim(name)) = 'machado' then 0 else 40 end;

update public.professional_services ps
set commission_percent = case when lower(trim(p.name)) = 'machado' then 0 else 40 end
from public.professionals p
where p.id = ps.professional_id;

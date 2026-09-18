-- Cria o perfil automaticamente na primeira autenticação.
-- Somente o e-mail do proprietário recebe papel de owner.
create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    case when lower(new.email) = 'dionemachado0000@gmail.com' then 'owner'::public.user_role else 'professional'::public.user_role end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

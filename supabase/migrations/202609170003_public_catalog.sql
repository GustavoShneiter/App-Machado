-- O formulário público só recebe o catálogo ativo; dados financeiros continuam protegidos por RLS.
create policy "public read active services" on public.services for select to anon using (active = true);
create policy "public read active professionals" on public.professionals for select to anon using (active = true);

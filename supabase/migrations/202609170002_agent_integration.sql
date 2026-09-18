create table public.agent_integrations (
  id uuid primary key default gen_random_uuid(), name text not null unique, token_hash text not null unique,
  active boolean not null default true, rate_limit_per_minute integer not null default 30 check (rate_limit_per_minute between 1 and 300), created_at timestamptz not null default now()
);
create table public.agent_rate_buckets (
  integration_id uuid not null references public.agent_integrations(id) on delete cascade,
  bucket_start timestamptz not null, request_count integer not null default 0 check (request_count >= 0),
  primary key (integration_id, bucket_start)
);
alter table public.agent_integrations enable row level security;
alter table public.agent_rate_buckets enable row level security;
create policy "owner manages agent integrations" on public.agent_integrations for all to authenticated using (public.current_role() = 'owner') with check (public.current_role() = 'owner');

-- Crie o token fora do frontend e armazene apenas seu SHA-256 hexadecimal:
-- insert into public.agent_integrations(name, token_hash) values ('agente-producao', encode(digest('TOKEN_SECRETO', 'sha256'), 'hex'));

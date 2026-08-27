begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.worker_leases (
  name text primary key,
  owner uuid not null,
  locked_until timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.worker_state (
  id smallint primary key default 1 check (id = 1),
  run_id uuid,
  source text not null default 'unknown',
  status text not null default 'idle' check (status in ('idle', 'running', 'succeeded', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  last_success_at timestamptz,
  last_error text not null default '',
  last_result jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.worker_state (id)
values (1)
on conflict (id) do nothing;

alter table public.worker_leases enable row level security;
alter table public.worker_state enable row level security;

revoke all on table public.worker_leases from anon, authenticated;
revoke all on table public.worker_state from anon, authenticated;

create or replace function public.claim_worker_lease(
  p_name text,
  p_owner uuid,
  p_lease_seconds integer default 240
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  acquired boolean;
begin
  insert into public.worker_leases as lease (name, owner, locked_until, updated_at)
  values (
    p_name,
    p_owner,
    now() + make_interval(secs => greatest(30, least(p_lease_seconds, 600))),
    now()
  )
  on conflict (name) do update
  set owner = excluded.owner,
      locked_until = excluded.locked_until,
      updated_at = now()
  where lease.locked_until <= now()
  returning true into acquired;

  return coalesce(acquired, false);
end;
$$;

create or replace function public.release_worker_lease(p_name text, p_owner uuid)
returns void
language sql
security definer
set search_path = public, pg_catalog
as $$
  delete from public.worker_leases
  where name = p_name and owner = p_owner;
$$;

revoke all on function public.claim_worker_lease(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_worker_lease(text, uuid) from public, anon, authenticated;

create or replace function public.invoke_vercel_publisher()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, pg_catalog
as $$
declare
  worker_url text;
  scheduler_secret text;
  request_id bigint;
begin
  select decrypted_secret into worker_url
  from vault.decrypted_secrets
  where name = 'publisher_worker_url';

  select decrypted_secret into scheduler_secret
  from vault.decrypted_secrets
  where name = 'publisher_scheduler_secret';

  if worker_url is null or scheduler_secret is null then
    raise exception 'Configure publisher_worker_url and publisher_scheduler_secret in Supabase Vault.';
  end if;

  select net.http_post(
    url := worker_url,
    body := jsonb_build_object('source', 'supabase-cron', 'requestedAt', now()),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Scheduler-Secret', scheduler_secret
    ),
    timeout_milliseconds := 290000
  ) into request_id;

  return request_id;
end;
$$;

create or replace function public.install_remote_publisher_schedule()
returns bigint
language plpgsql
security definer
set search_path = public, cron, vault, pg_catalog
as $$
declare
  existing_job record;
  scheduled_job_id bigint;
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'publisher_worker_url'
  ) or not exists (
    select 1 from vault.decrypted_secrets where name = 'publisher_scheduler_secret'
  ) then
    raise exception 'Configure the publisher secrets in Supabase Vault first.';
  end if;

  for existing_job in
    select jobid from cron.job where jobname = 'instagram-publisher-every-minute'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  select cron.schedule(
    'instagram-publisher-every-minute',
    '* * * * *',
    'select public.invoke_vercel_publisher();'
  ) into scheduled_job_id;

  return scheduled_job_id;
end;
$$;

revoke all on function public.invoke_vercel_publisher() from public, anon, authenticated;
revoke all on function public.install_remote_publisher_schedule() from public, anon, authenticated;

commit;

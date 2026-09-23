begin;

-- The database checks the minute boundary locally; only work wakes Vercel.
alter table public.worker_state
  add column if not exists next_maintenance_at timestamptz not null default now();

create index if not exists posts_scheduled_due_idx
  on public.posts (scheduled_for, next_attempt_at)
  where status = 'scheduled';

create index if not exists posts_publishing_expiry_idx
  on public.posts (next_attempt_at)
  where status = 'publishing';

create index if not exists posts_published_at_idx
  on public.posts (published_at)
  where status = 'published';

create or replace function public.next_publisher_story_id()
returns uuid
language sql stable
security definer
set search_path = public, pg_catalog
as $$
  select id
  from public.posts
  where status = 'published'
    and design #>> '{story,status}' in ('pending', 'failed', 'publishing')
    and coalesce((design #>> '{story,retryCount}')::integer, 0) < 5
    and coalesce((design #>> '{story,nextAttemptAt}')::timestamptz, '-infinity'::timestamptz) <= now()
  order by published_at, id
  limit 1;
$$;

create or replace function public.next_publisher_insight_id()
returns uuid
language sql stable
security definer
set search_path = public, pg_catalog
as $$
  select id
  from public.posts
  where status = 'published'
    and instagram_media_id is not null
    and published_at <= now() - interval '15 minutes'
    and coalesce((design #>> '{performance,checkedAt}')::timestamptz, '-infinity'::timestamptz)
        <= now() - interval '6 hours'
  order by coalesce((design #>> '{performance,checkedAt}')::timestamptz, published_at), id
  limit 1;
$$;

create or replace function public.publisher_work_due()
returns boolean
language sql stable
security definer
set search_path = public, pg_catalog
as $$
  select
    exists (select 1 from public.worker_state where id = 1 and next_maintenance_at <= now())
    or exists (
      select 1 from public.posts
      where status = 'publishing' and next_attempt_at <= now()
    )
    or exists (
      select 1 from public.posts
      where status = 'scheduled'
        and scheduled_for <= now()
        and (next_attempt_at is null or next_attempt_at <= now())
        and exists (select 1 from public.app_settings where id = 1 and autopilot)
    )
    or public.next_publisher_story_id() is not null;
$$;

revoke all on function public.next_publisher_story_id() from public, anon, authenticated;
revoke all on function public.next_publisher_insight_id() from public, anon, authenticated;
revoke all on function public.publisher_work_due() from public, anon, authenticated;

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
  maintenance_due boolean;
begin
  select decrypted_secret into worker_url
  from vault.decrypted_secrets where name = 'publisher_worker_url';
  select decrypted_secret into scheduler_secret
  from vault.decrypted_secrets where name = 'publisher_scheduler_secret';
  if worker_url is null or scheduler_secret is null then
    raise exception 'Configure publisher_worker_url and publisher_scheduler_secret in Supabase Vault.';
  end if;

  select next_maintenance_at <= now() into maintenance_due
  from public.worker_state where id = 1;
  maintenance_due := coalesce(maintenance_due, true);
  if maintenance_due then
    -- If the HTTP request fails, retry maintenance in 15 minutes, not every minute.
    update public.worker_state
    set next_maintenance_at = now() + interval '15 minutes'
    where id = 1;
  end if;

  select net.http_post(
    url := worker_url,
    body := jsonb_build_object('source', 'supabase-cron', 'maintenance', maintenance_due),
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
  if not exists (select 1 from vault.decrypted_secrets where name = 'publisher_worker_url')
    or not exists (select 1 from vault.decrypted_secrets where name = 'publisher_scheduler_secret') then
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
    'select public.invoke_vercel_publisher() where public.publisher_work_due();'
  ) into scheduled_job_id;
  return scheduled_job_id;
end;
$$;

revoke all on function public.invoke_vercel_publisher() from public, anon, authenticated;
revoke all on function public.install_remote_publisher_schedule() from public, anon, authenticated;

-- Existing installations switch to the conditional job as part of this migration.
select public.install_remote_publisher_schedule();

commit;

begin;

create or replace function public.publisher_work_due()
returns boolean
language sql stable
security definer
set search_path = public, pg_catalog
as $$
  select
    not exists (
      select 1 from public.worker_leases
      where name = 'instagram-publisher' and locked_until > now()
    )
    and not exists (
      select 1 from public.worker_state
      where id = 1 and status = 'failed'
        and finished_at > now() - interval '15 minutes'
        and (
          last_error like 'Instagram: autentificare expirată sau invalidă.%'
          or last_error like 'Error validating access token:%'
        )
    )
    and (
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
      or public.next_publisher_story_id() is not null
    );
$$;

revoke all on function public.publisher_work_due() from public, anon, authenticated;

commit;

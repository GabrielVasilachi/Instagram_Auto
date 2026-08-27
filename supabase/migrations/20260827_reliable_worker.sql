begin;

alter table public.posts
  add column if not exists retry_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz;

alter table public.posts
  drop constraint if exists posts_retry_count_range;

alter table public.posts
  add constraint posts_retry_count_range
  check (retry_count between 0 and 20);

create index if not exists posts_worker_due_idx
  on public.posts (status, next_attempt_at, scheduled_for);

commit;

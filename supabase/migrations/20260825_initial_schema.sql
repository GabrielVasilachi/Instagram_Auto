begin;

create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  schema_version integer not null default 3,
  autopilot boolean not null default false,
  post_time time not null default '11:00',
  reel_time time not null default '15:30',
  timezone text not null default 'Europe/Chisinau',
  queue_days integer not null default 14,
  quote_cursor integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.posts (
  id uuid primary key,
  quote text not null,
  caption text not null default '',
  accent text not null default '#d9ff3f',
  format text not null check (format in ('reel', 'post')),
  status text not null check (status in ('scheduled', 'publishing', 'published', 'failed')),
  scheduled_for timestamptz not null,
  created_at timestamptz not null default now(),
  auto_generated boolean not null default false,
  media_url text,
  instagram_media_id text,
  published_at timestamptz,
  error text not null default ''
);

alter table public.app_settings enable row level security;
alter table public.posts enable row level security;

revoke all on table public.app_settings from anon, authenticated;
revoke all on table public.posts from anon, authenticated;

commit;

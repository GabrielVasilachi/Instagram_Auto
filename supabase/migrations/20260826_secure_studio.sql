begin;

alter table public.posts
  add column if not exists design jsonb not null default '{}'::jsonb;

alter table public.posts
  drop constraint if exists posts_design_is_object;

alter table public.posts
  add constraint posts_design_is_object check (jsonb_typeof(design) = 'object');

with ranked as (
  select id,
         format,
         row_number() over (order by scheduled_for, id) - 1 as position
  from public.posts
  where status = 'scheduled' and design = '{}'::jsonb
)
update public.posts as post
set design = jsonb_build_object(
  'template', (array['midnight', 'aurora', 'ember', 'ocean', 'monochrome', 'paper'])[(ranked.position % 6) + 1],
  'font', (array['sans', 'serif', 'mono'])[((ranked.position / 2) % 3) + 1],
  'textPosition', (array['top', 'center', 'bottom'])[((ranked.position / 3) % 3) + 1],
  'textAlign', (array['left', 'center', 'right'])[((ranked.position / 4) % 3) + 1],
  'fontSize', case when ranked.format = 'reel' then 76 else 64 end + (ranked.position % 4) * 8,
  'animation', (array['drift', 'zoom', 'slide', 'pulse', 'static'])[(ranked.position % 5) + 1],
  'duration', 7 + (ranked.position % 5),
  'music', (array['ambient', 'deep', 'focus', 'pulse', 'silent'])[(ranked.position % 5) + 1],
  'musicVolume', 42 + (ranked.position % 4) * 8
)
from ranked
where post.id = ranked.id;

update public.app_settings
set schema_version = 3,
    updated_at = now()
where id = 1;

alter table public.posts enable row level security;
alter table public.app_settings enable row level security;

revoke all on table public.posts from anon, authenticated;
revoke all on table public.app_settings from anon, authenticated;

create index if not exists posts_status_schedule_idx
  on public.posts (status, scheduled_for);

commit;

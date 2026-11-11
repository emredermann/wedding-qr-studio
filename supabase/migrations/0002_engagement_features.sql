-- =============================================================================
-- Mira — 0002: program schedule, photo challenges, hearts, co-hosts
-- =============================================================================
-- Run AFTER 0001_event_qr_drive.sql. Idempotent: safe to run more than once.
-- Purely additive: every new column has a default, so existing events and
-- media keep working exactly as before. Run this BEFORE deploying the code
-- that uses it (the current code ignores the new columns and tables).
--
-- Security model unchanged: RLS on, no policies, no grants to anon /
-- authenticated; only the server (service_role) reads and writes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Program schedule & photo challenges (optional, per event)
--   schedule:   [{ "id", "time": "HH:MM", "title", "category"? }]  (≤ 30)
--   challenges: [{ "id", "title" }]                                (≤ 20)
-- -----------------------------------------------------------------------------
alter table public.events add column if not exists schedule   jsonb not null default '[]'::jsonb;
alter table public.events add column if not exists challenges jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_schedule_is_array') then
    alter table public.events add constraint events_schedule_is_array
      check (jsonb_typeof(schedule) = 'array' and jsonb_array_length(schedule) <= 30);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_challenges_is_array') then
    alter table public.events add constraint events_challenges_is_array
      check (jsonb_typeof(challenges) = 'array' and jsonb_array_length(challenges) <= 20);
  end if;
end $$;

alter table public.media_items add column if not exists challenge_id text
  check (challenge_id is null or char_length(challenge_id) between 1 and 32);
create index if not exists media_items_event_challenge_idx
  on public.media_items (event_id, challenge_id, created_at desc)
  where challenge_id is not null;

-- -----------------------------------------------------------------------------
-- Hearts: one per guest session per media item; heart_count is denormalised
-- on media_items and maintained only by toggle_media_heart().
-- -----------------------------------------------------------------------------
alter table public.media_items add column if not exists heart_count integer not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'media_items_heart_count_nonneg') then
    alter table public.media_items add constraint media_items_heart_count_nonneg check (heart_count >= 0);
  end if;
end $$;
create index if not exists media_items_event_hearts_idx
  on public.media_items (event_id, heart_count desc, created_at desc);

create table if not exists public.media_hearts (
  media_id          uuid not null references public.media_items (id) on delete cascade,
  guest_session_id  text not null check (char_length(guest_session_id) between 1 and 64),
  created_at        timestamptz not null default now(),
  primary key (media_id, guest_session_id)
);
create index if not exists media_hearts_session_idx on public.media_hearts (guest_session_id);

drop function if exists public.toggle_media_heart(uuid, text);
create or replace function public.toggle_media_heart(p_media_id uuid, p_session text)
returns table (hearted boolean, heart_count integer)
language plpgsql
volatile
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_session text := left(coalesce(p_session, ''), 64);
  v_count   integer;
begin
  if v_session = '' then
    raise exception 'session required';
  end if;

  delete from public.media_hearts h
  where h.media_id = p_media_id and h.guest_session_id = v_session;

  if found then
    update public.media_items m
    set heart_count = greatest(m.heart_count - 1, 0)
    where m.id = p_media_id
    returning m.heart_count into v_count;
    return query select false, coalesce(v_count, 0);
    return;
  end if;

  insert into public.media_hearts (media_id, guest_session_id)
  values (p_media_id, v_session)
  on conflict do nothing;

  if found then
    update public.media_items m
    set heart_count = m.heart_count + 1
    where m.id = p_media_id
    returning m.heart_count into v_count;
  else
    select m.heart_count into v_count from public.media_items m where m.id = p_media_id;
  end if;
  return query select true, coalesce(v_count, 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- Co-hosts: other Mira accounts that may manage an event (never its Drive).
-- -----------------------------------------------------------------------------
create table if not exists public.event_cohosts (
  event_id    uuid not null references public.events (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  added_by    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_cohosts_user_idx on public.event_cohosts (user_id, created_at desc);

-- Username → account lookup for adding co-hosts. auth.users is not exposed
-- through the API, so the server calls this (service_role only).
drop function if exists public.find_user_id_by_email(text);
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(p_email) limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security & grants (same model as 0001)
-- -----------------------------------------------------------------------------
alter table public.media_hearts  enable row level security;
alter table public.event_cohosts enable row level security;

revoke all on public.media_hearts, public.event_cohosts from anon, authenticated;
grant all on public.media_hearts, public.event_cohosts to service_role;

revoke all on function public.toggle_media_heart(uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_media_heart(uuid, text) to service_role;

revoke all on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

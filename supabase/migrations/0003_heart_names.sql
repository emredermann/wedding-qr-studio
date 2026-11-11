-- =============================================================================
-- Mira — 0003: who hearted what (names), with a per-event privacy setting
-- =============================================================================
-- Run AFTER 0002_engagement_features.sql. Idempotent: safe to run more than once.
-- Purely additive: existing hearts keep working (they simply have no name).
--
-- * Every new heart stores the name the guest typed on the welcome screen,
--   whatever the event's setting is.
-- * events.hearts_named decides whether hosts may SEE those names
--   (default false = anonymous, the behaviour before this migration).
-- * media_hearts.name_visible is a snapshot of that setting at the moment of
--   the heart, so switching an event from anonymous to named never reveals
--   hearts that were given while it was anonymous.
-- =============================================================================

alter table public.events add column if not exists hearts_named boolean not null default false;

alter table public.media_hearts add column if not exists guest_name text;
alter table public.media_hearts add column if not exists name_visible boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'media_hearts_guest_name_len') then
    alter table public.media_hearts
      add constraint media_hearts_guest_name_len check (guest_name is null or char_length(guest_name) <= 80);
  end if;
end $$;

-- New 4-argument version. The 2-argument version from 0002 is kept so a
-- deployment that is still running the previous code keeps working.
drop function if exists public.toggle_media_heart(uuid, text, text, boolean);
create or replace function public.toggle_media_heart(
  p_media_id     uuid,
  p_session      text,
  p_name         text,
  p_name_visible boolean
)
returns table (hearted boolean, heart_count integer)
language plpgsql
volatile
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_session text := left(coalesce(p_session, ''), 64);
  v_name    text := nullif(left(btrim(coalesce(p_name, '')), 80), '');
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

  insert into public.media_hearts (media_id, guest_session_id, guest_name, name_visible)
  values (p_media_id, v_session, v_name, coalesce(p_name_visible, false))
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

revoke all on function public.toggle_media_heart(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.toggle_media_heart(uuid, text, text, boolean) to service_role;

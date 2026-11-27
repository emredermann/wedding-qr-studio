-- =============================================================================
-- Mira — 0007: event type presets, guest themes and module switches
-- =============================================================================
-- Run AFTER 0006_seating_plans.sql. Idempotent: safe to run more than once.
-- Purely additive and nullable. The app detects the columns at runtime, so
-- deploying the code before running this file is safe: events then keep the
-- legacy look (Mira minimal theme, every module with content shown) and the
-- type / theme / module choices are simply not stored until it has been run.
--
--   event_type  'wedding' | 'corporate' | 'party' | 'event'   (NULL = legacy)
--   theme_id    'minimal' | 'elegant' | 'night' | 'corporate' (NULL = minimal)
--   modules     {"schedule": bool, "challenges": bool}        (NULL = show what has content)
--
-- Existing columns (couple_names, theme_color, …) are unchanged.
-- =============================================================================

alter table public.events add column if not exists event_type text;
alter table public.events add column if not exists theme_id text;
alter table public.events add column if not exists modules jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_event_type_known') then
    alter table public.events
      add constraint events_event_type_known
      check (event_type is null or event_type in ('wedding', 'corporate', 'party', 'event'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_theme_id_known') then
    alter table public.events
      add constraint events_theme_id_known
      check (theme_id is null or theme_id in ('minimal', 'elegant', 'night', 'corporate'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_modules_object') then
    alter table public.events
      add constraint events_modules_object
      check (modules is null or jsonb_typeof(modules) = 'object');
  end if;
end $$;

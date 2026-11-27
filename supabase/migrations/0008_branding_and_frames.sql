-- =============================================================================
-- Mira — 0008: brand kit (Pro) and share frames
-- =============================================================================
-- Run AFTER 0007_event_presets.sql. Idempotent: safe to run more than once.
-- Purely additive and nullable. The app detects the columns at runtime, so
-- deploying the code first is safe: until this has been run, the brand kit
-- cannot be saved and share copies use the default frame.
--
--   branding     {"hasLogo", "sponsors": [{id,name}], "sponsorsLabel", "showOnLiveWall", "version"}
--                Small metadata only, so guest page loads stay light.
--   event_brand_assets  the logo images themselves (data URLs, resized in the
--                browser to ≤ 512 px), one row per logo; service role only.
--   share_frame  {"style": "none"|"classic"|"polaroid"|"band", "text", "guestShare", "showLogo"}
--
-- Frames are drawn only on share/download copies in the browser; the
-- original files in Google Drive are never modified.
-- Packages (free / pro) are NOT stored here: they live in Supabase Auth
-- app_metadata (npm run user -- plan <kullanici-adi> pro).
-- =============================================================================

alter table public.events add column if not exists branding jsonb;
alter table public.events add column if not exists share_frame jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_branding_object') then
    alter table public.events
      add constraint events_branding_object check (branding is null or jsonb_typeof(branding) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_share_frame_object') then
    alter table public.events
      add constraint events_share_frame_object check (share_frame is null or jsonb_typeof(share_frame) = 'object');
  end if;
end $$;

create table if not exists public.event_brand_assets (
  event_id   uuid not null references public.events(id) on delete cascade,
  asset      text not null check (asset ~ '^(logo|[a-z0-9]{4,16})$'),
  data       text not null check (char_length(data) <= 400000 and data like 'data:image/%'),
  updated_at timestamptz not null default now(),
  primary key (event_id, asset)
);

-- Only the server (service role) reads and writes logos.
alter table public.event_brand_assets enable row level security;

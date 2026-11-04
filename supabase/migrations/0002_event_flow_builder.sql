-- =============================================================================
-- Wedding QR Studio — 0002 Event Flow Builder & Super Admin Portal
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles (tracks platform super-admins and user display metadata)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text,
  display_name   text,
  is_super_admin boolean not null default false,
  created_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_self" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Super-admin flag can only be modified by service_role.
revoke insert, update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;
revoke all on public.profiles from anon;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Helper: checks whether current user is a super admin (via profile or JWT app_metadata)
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'is_super_admin')::boolean, false)
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_super_admin = true
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Alter albums: add theme_config & flow_config JSONB columns with defaults
-- -----------------------------------------------------------------------------
alter table public.albums
  add column if not exists theme_config jsonb not null default '{
    "primaryColor": "#b45309",
    "backgroundColor": "#fafaf9",
    "textColor": "#1c1917",
    "fontFamily": "serif",
    "logoUrl": null,
    "coverMediaUrl": null,
    "buttonStyle": "pill",
    "galleryLayout": "masonry"
  }'::jsonb,
  add column if not exists flow_config jsonb not null default '{
    "steps": [
      {
        "id": "step_welcome_splash",
        "type": "welcome_splash",
        "enabled": true,
        "title": "Welcome Splash",
        "settings": {
          "headline": "Welcome to Our Wedding",
          "subtitle": "Capture and share every candid moment with us tonight.",
          "ctaText": "Enter Celebration",
          "showEventDate": true
        }
      },
      {
        "id": "step_guest_registration",
        "type": "guest_registration",
        "enabled": true,
        "title": "Guest Sign-In",
        "settings": {
          "title": "Sign the Digital Guestbook",
          "subtitle": "Let us know who is sharing these memories.",
          "mandatory": false,
          "askName": true,
          "askContact": true,
          "contactLabel": "WhatsApp / Email (for your photo gallery link)",
          "askTableNumber": true,
          "submitText": "Continue",
          "skipText": "Skip for now"
        }
      },
      {
        "id": "step_biometric_opt_in",
        "type": "biometric_opt_in",
        "enabled": true,
        "title": "Instant Face Match",
        "settings": {
          "title": "Find Every Photo of Yourself",
          "subtitle": "Take a quick selfie to automatically filter the wedding gallery for photos you appear in.",
          "ctaScanText": "Scan My Face",
          "skipText": "Maybe later"
        }
      },
      {
        "id": "step_main_hub",
        "type": "main_hub",
        "enabled": true,
        "title": "Main Event Hub",
        "settings": {
          "welcomeBanner": "Share your photos, videos & voice toasts below",
          "uploadCtaText": "Add Photos & Videos"
        }
      }
    ],
    "features": {
      "enablePhotoUpload": true,
      "enableVideoUpload": true,
      "enableVoiceToasts": true,
      "enableFaceRecognition": true,
      "enableLiveSlideshow": true,
      "requireModerationBeforePublic": false,
      "maxUploadSizeMb": 250
    }
  }'::jsonb;

-- Allow authenticated owners/managers to insert and update theme_config & flow_config
grant insert (owner_id, slug, title, event_date, privacy_mode, reveal_at, theme_config, flow_config)
  on public.albums to authenticated;
grant update (slug, title, event_date, privacy_mode, reveal_at, theme_config, flow_config)
  on public.albums to authenticated;

-- Extend can_manage_album so super-admins can manage any event
create or replace function public.can_manage_album(p_album_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_super_admin()
  or exists (
    select 1 from public.albums a
    where a.id = p_album_id
      and (
        a.owner_id = (select auth.uid())
        or exists (
          select 1 from public.co_hosts c
          where c.album_id = a.id
            and c.email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
            and c.email <> ''
        )
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- guest_registrations (stores guest onboarding form submissions per album)
-- -----------------------------------------------------------------------------
create table if not exists public.guest_registrations (
  id               uuid primary key default gen_random_uuid(),
  album_id         uuid not null references public.albums (id) on delete cascade,
  guest_session_id text not null check (char_length(guest_session_id) between 1 and 64),
  guest_name       text check (guest_name is null or char_length(guest_name) <= 80),
  contact          text check (contact is null or char_length(contact) <= 160),
  table_number     text check (table_number is null or char_length(table_number) <= 32),
  created_at       timestamptz not null default now(),
  constraint guest_registrations_album_session_key unique (album_id, guest_session_id)
);

create index if not exists guest_registrations_album_id_idx on public.guest_registrations (album_id);

alter table public.guest_registrations enable row level security;

create policy "guest_registrations_select_managers" on public.guest_registrations
  for select to authenticated
  using (public.can_manage_album(album_id));

revoke all on public.guest_registrations from anon;

-- -----------------------------------------------------------------------------
-- Update get_public_album RPC to include theme_config & flow_config
-- -----------------------------------------------------------------------------
drop function if exists public.get_public_album(text);

create or replace function public.get_public_album(p_slug text)
returns table (
  id           uuid,
  slug         text,
  title        text,
  event_date   date,
  privacy_mode text,
  reveal_at    timestamptz,
  expires_at   timestamptz,
  theme_config jsonb,
  flow_config  jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.slug, a.title, a.event_date, a.privacy_mode,
         a.reveal_at, a.expires_at, a.theme_config, a.flow_config
  from public.albums a
  where a.slug = lower(btrim(p_slug)) and a.expires_at > now()
  limit 1;
$$;

revoke all on function public.get_public_album(text) from public;
grant execute on function public.get_public_album(text) to anon, authenticated, service_role;

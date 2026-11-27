-- =============================================================================
-- Mira — 0009: invitations and RSVP (Pro)
-- =============================================================================
-- Run AFTER 0008_branding_and_frames.sql. Idempotent: safe to run more than once.
-- Purely additive. The app detects these tables at runtime, so deploying the
-- code first is safe: until this has been run the Invitations module says
-- "not set up yet" and everything else keeps working.
--
--   invitation_settings  one row per event: the invitation design (jsonb),
--                        RSVP deadline, the optional open link and the state
--                        of the Google Sheets mirror in the host's Drive.
--   invitees             one row per invitation link (a person or a family)
--                        with its party limit and, once answered, the reply:
--                        attending, the names of everyone coming, dietary
--                        notes and a message. Replies can be changed until
--                        the deadline; the row keeps the latest one.
--
-- The database is the source of truth. The Google Sheet is a one-way copy
-- (Mira → Drive) rewritten after replies; editing the sheet changes nothing.
-- Only the server (service role) touches these tables.
-- =============================================================================

create table if not exists public.invitation_settings (
  event_id         uuid primary key references public.events(id) on delete cascade,
  design           jsonb not null default '{}'::jsonb,
  rsvp_deadline    date,
  accepting        boolean not null default true,
  open_token       text unique,
  open_enabled     boolean not null default false,
  open_max_party   integer not null default 2,
  sheet_id         text,
  sheet_dirty_at   timestamptz,
  sheet_synced_at  timestamptz,
  sheet_lock_until timestamptz,
  sheet_error      text,
  sheet_lang       text not null default 'tr',
  updated_at       timestamptz not null default now(),
  constraint invitation_settings_design_object check (jsonb_typeof(design) = 'object' and pg_column_size(design) <= 100000),
  constraint invitation_settings_open_token check (open_token is null or open_token ~ '^[A-Za-z0-9_-]{16,32}$'),
  constraint invitation_settings_open_max check (open_max_party between 1 and 20),
  constraint invitation_settings_sheet_error_len check (sheet_error is null or char_length(sheet_error) <= 500),
  constraint invitation_settings_sheet_lang check (sheet_lang in ('tr', 'en'))
);

create table if not exists public.invitees (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  token         text not null unique,
  name          text,
  group_name    text,
  max_party     integer not null default 1,
  host_note     text,
  via_open_link boolean not null default false,
  created_at    timestamptz not null default now(),
  -- latest reply (null until the guest answers)
  responded_at  timestamptz,
  attending     boolean,
  party         jsonb not null default '[]'::jsonb,
  dietary       text,
  message       text,
  reply_count   integer not null default 0,
  constraint invitees_token check (token ~ '^[A-Za-z0-9_-]{16,32}$'),
  constraint invitees_name_len check (name is null or char_length(name) between 1 and 80),
  constraint invitees_group_len check (group_name is null or char_length(group_name) <= 40),
  constraint invitees_max_party check (max_party between 1 and 20),
  constraint invitees_note_len check (host_note is null or char_length(host_note) <= 200),
  constraint invitees_party_array check (jsonb_typeof(party) = 'array' and jsonb_array_length(party) <= 20),
  constraint invitees_dietary_len check (dietary is null or char_length(dietary) <= 200),
  constraint invitees_message_len check (message is null or char_length(message) <= 1000)
);

create index if not exists invitees_event_created_idx on public.invitees (event_id, created_at);

alter table public.invitation_settings enable row level security;
alter table public.invitees enable row level security;

revoke all on table public.invitation_settings from anon, authenticated;
revoke all on table public.invitees from anon, authenticated;
grant all on table public.invitation_settings to service_role;
grant all on table public.invitees to service_role;

-- Short lease for the sheet writer, so concurrent replies never write the
-- sheet at the same time. Returns the settings row when the lease was taken,
-- nothing when another writer holds it.
create or replace function public.claim_invitation_sheet(p_event_id uuid, p_lease_seconds integer)
returns setof public.invitation_settings
language sql
volatile
set search_path = ''
as $$
  update public.invitation_settings s
  set sheet_lock_until = now() + make_interval(secs => greatest(5, least(p_lease_seconds, 300)))
  where s.event_id = p_event_id
    and (s.sheet_lock_until is null or s.sheet_lock_until < now())
  returning s.*;
$$;

revoke all on function public.claim_invitation_sheet(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_invitation_sheet(uuid, integer) to service_role;

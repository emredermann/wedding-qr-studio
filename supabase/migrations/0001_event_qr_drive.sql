-- =============================================================================
-- Mira — Google Drive storage schema (Supabase / Neon PostgreSQL)
-- =============================================================================
-- Idempotent: safe to run more than once in the Supabase SQL editor.
--
-- Security model
--   * Every table has Row Level Security enabled and NO policies for the
--     `anon` / `authenticated` roles: the browser never talks to these tables.
--   * The Next.js server is the only reader/writer and uses the
--     SUPABASE_SERVICE_ROLE_KEY (which bypasses RLS). Ownership, guest-session
--     and moderation checks live in the API layer.
--   * Media bytes live in the owner's Google Drive. Postgres stores metadata,
--     Drive file IDs and 128-d face descriptors only.
-- =============================================================================

create extension if not exists vector;

-- -----------------------------------------------------------------------------
-- events
-- -----------------------------------------------------------------------------
create table if not exists public.events (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null references auth.users (id) on delete cascade,
  slug                    text not null unique
                            check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$'),
  title                   text not null check (char_length(title) between 1 and 120),
  couple_names            text check (couple_names is null or char_length(couple_names) <= 120),
  event_date              date,
  welcome_message         text check (welcome_message is null or char_length(welcome_message) <= 500),
  theme_color             text not null default '#1f1d1a' check (theme_color ~ '^#[0-9a-fA-F]{6}$'),
  categories              text[] not null default array['Hazırlık', 'Nikah', 'İlk Dans', 'Yemek', 'After Party']::text[]
                            check (cardinality(categories) <= 30),
  uploads_enabled         boolean not null default true,
  require_approval        boolean not null default false,
  gallery_public          boolean not null default true,
  face_search_enabled     boolean not null default true,
  guestbook_enabled       boolean not null default true,
  drive_folder_id         text not null,
  drive_photos_folder_id  text not null,
  drive_videos_folder_id  text not null,
  drive_voice_folder_id   text not null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists events_owner_id_idx on public.events (owner_id, created_at desc);

-- Brand default accent (quiet ink) for new events.
alter table public.events alter column theme_color set default '#1f1d1a';

-- Which Google Drive stores the event: 'app' = platform Drive from the env
-- (GOOGLE_REFRESH_TOKEN), 'host' = the owner's own connected Drive.
alter table public.events
  add column if not exists drive_account text not null default 'app'
  check (drive_account in ('app', 'host'));

-- -----------------------------------------------------------------------------
-- drive_connections — a host's own Google Drive (OAuth2, scope drive.file).
-- The refresh token is AES-256-GCM encrypted by the server (APP_SECRET-derived
-- key) and never leaves the server.
-- -----------------------------------------------------------------------------
create table if not exists public.drive_connections (
  owner_id           uuid primary key references auth.users (id) on delete cascade,
  google_sub         text not null check (char_length(google_sub) between 1 and 255),
  google_email       text check (google_email is null or char_length(google_email) <= 320),
  refresh_token_enc  text not null check (char_length(refresh_token_enc) between 20 and 4096),
  root_folder_id     text not null check (char_length(root_folder_id) between 10 and 128),
  status             text not null default 'active' check (status in ('active', 'revoked')),
  connected_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- media_items (photos, videos, voice notes — all stored in Google Drive)
-- -----------------------------------------------------------------------------
create table if not exists public.media_items (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events (id) on delete cascade,
  drive_file_id     text not null unique check (char_length(drive_file_id) between 10 and 128),
  kind              text not null check (kind in ('photo', 'video', 'audio')),
  mime_type         text not null check (char_length(mime_type) between 3 and 127),
  size_bytes        bigint not null check (size_bytes > 0),
  original_name     text not null check (char_length(original_name) between 1 and 255),
  guest_name        text check (guest_name is null or char_length(guest_name) <= 80),
  guest_session_id  text check (guest_session_id is null or char_length(guest_session_id) <= 64),
  note              text check (note is null or char_length(note) <= 500),
  category          text check (category is null or char_length(category) <= 40),
  is_guestbook      boolean not null default false,
  status            text not null default 'approved' check (status in ('approved', 'pending', 'hidden')),
  width             integer check (width is null or width > 0),
  height            integer check (height is null or height > 0),
  face_count        integer not null default 0 check (face_count between 0 and 50),
  -- Set when the item becomes visible (approved). The live wall polls on it,
  -- so items approved later by the host still appear on the screen.
  published_at      timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.media_items add column if not exists published_at timestamptz;

create index if not exists media_items_event_created_idx on public.media_items (event_id, created_at desc);
-- Keyset pagination (created_at desc, id desc) — rows sharing a timestamp are not skipped.
create index if not exists media_items_event_created_id_idx on public.media_items (event_id, created_at desc, id desc);
create index if not exists media_items_event_status_idx on public.media_items (event_id, status, created_at desc);
create index if not exists media_items_event_published_idx on public.media_items (event_id, published_at)
  where published_at is not null;
create index if not exists media_items_session_idx on public.media_items (event_id, guest_session_id)
  where guest_session_id is not null;

-- -----------------------------------------------------------------------------
-- face_descriptors (128-d @vladmandic/face-api descriptors, computed in-browser)
-- -----------------------------------------------------------------------------
create table if not exists public.face_descriptors (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  media_id    uuid not null references public.media_items (id) on delete cascade,
  descriptor  vector(128) not null,
  created_at  timestamptz not null default now()
);

create index if not exists face_descriptors_event_idx on public.face_descriptors (event_id);
create index if not exists face_descriptors_media_idx on public.face_descriptors (media_id);

-- -----------------------------------------------------------------------------
-- guestbook_messages (written notes; audio/video notes are media_items with
-- is_guestbook = true)
-- -----------------------------------------------------------------------------
create table if not exists public.guestbook_messages (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events (id) on delete cascade,
  guest_name        text not null check (char_length(guest_name) between 1 and 80),
  guest_session_id  text check (guest_session_id is null or char_length(guest_session_id) <= 64),
  message           text not null check (char_length(message) between 1 and 1000),
  status            text not null default 'approved' check (status in ('approved', 'pending', 'hidden')),
  published_at      timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.guestbook_messages add column if not exists published_at timestamptz;

create index if not exists guestbook_messages_event_idx on public.guestbook_messages (event_id, created_at desc);

-- -----------------------------------------------------------------------------
-- rate_limits (serverless-safe fixed-window limiter)
-- -----------------------------------------------------------------------------
create table if not exists public.rate_limits (
  bucket        text not null check (char_length(bucket) between 1 and 200),
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (bucket, window_start)
);

-- -----------------------------------------------------------------------------
-- upload_quota — bytes/files RESERVED when an upload session is issued (per
-- guest session and per IP, per event). Reserving at session time (not at
-- confirm) also covers uploads that are sent to Drive but never confirmed.
-- -----------------------------------------------------------------------------
create table if not exists public.upload_quota (
  event_id  uuid not null references public.events (id) on delete cascade,
  subject   text not null check (char_length(subject) between 1 and 100),
  files     integer not null default 0,
  bytes     bigint not null default 0,
  primary key (event_id, subject)
);

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

drop trigger if exists drive_connections_touch_updated_at on public.drive_connections;
create trigger drive_connections_touch_updated_at
  before update on public.drive_connections
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security: deny everything to browser roles
-- -----------------------------------------------------------------------------
alter table public.events             enable row level security;
alter table public.media_items        enable row level security;
alter table public.face_descriptors   enable row level security;
alter table public.guestbook_messages enable row level security;
alter table public.rate_limits        enable row level security;
alter table public.upload_quota       enable row level security;
alter table public.drive_connections  enable row level security;

revoke all on public.events, public.media_items, public.face_descriptors,
              public.guestbook_messages, public.rate_limits, public.upload_quota,
              public.drive_connections
  from anon, authenticated;

grant all on public.events, public.media_items, public.face_descriptors,
             public.guestbook_messages, public.rate_limits, public.upload_quota,
             public.drive_connections
  to service_role;

-- -----------------------------------------------------------------------------
-- RPC: match_event_faces — Euclidean distance search inside one event.
-- face-api.js descriptors match the same person at distance < ~0.5–0.6.
-- Exact scan over one event's faces (a few thousand rows) is fast and
-- complete; an ANN index would post-filter by event and drop matches.
-- -----------------------------------------------------------------------------
-- Functions returning TABLE cannot change their row type with CREATE OR REPLACE
-- (older installs had different versions), so drop them first.
drop function if exists public.match_event_faces(uuid, vector, double precision, integer);
create or replace function public.match_event_faces(
  p_event_id      uuid,
  p_descriptor    vector(128),
  p_max_distance  double precision default 0.5,
  p_limit         integer default 200
)
returns table (media_id uuid, distance double precision)
language sql
stable
set search_path = public, extensions
as $$
  select best.media_id, best.distance
  from (
    select distinct on (f.media_id)
           f.media_id,
           (f.descriptor <-> p_descriptor)::double precision as distance
    from public.face_descriptors f
    where f.event_id = p_event_id
    order by f.media_id, f.descriptor <-> p_descriptor
  ) best
  where best.distance <= least(greatest(coalesce(p_max_distance, 0.5), 0.3), 0.7)
  order by best.distance asc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

revoke all on function public.match_event_faces(uuid, vector, double precision, integer) from public, anon, authenticated;
grant execute on function public.match_event_faces(uuid, vector, double precision, integer) to service_role;

-- -----------------------------------------------------------------------------
-- RPC: reserve_upload_quota — atomically checks and reserves one file of
-- p_bytes for both the guest session and the IP. Rows are always locked in
-- the same order (session, then IP), so concurrent calls cannot deadlock.
-- -----------------------------------------------------------------------------
drop function if exists public.reserve_upload_quota(uuid, text, text, bigint, integer, bigint, integer, bigint);
create or replace function public.reserve_upload_quota(
  p_event_id           uuid,
  p_session            text,
  p_ip                 text,
  p_bytes              bigint,
  p_session_max_files  integer,
  p_session_max_bytes  bigint,
  p_ip_max_files       integer,
  p_ip_max_bytes       bigint
)
returns table (allowed boolean, reason text)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_session_key text := 'sid:' || left(coalesce(p_session, ''), 64);
  v_ip_key      text := 'ip:' || left(coalesce(p_ip, 'unknown'), 64);
  v_s_files     integer;
  v_s_bytes     bigint;
  v_i_files     integer;
  v_i_bytes     bigint;
begin
  insert into public.upload_quota (event_id, subject)
  values (p_event_id, v_session_key), (p_event_id, v_ip_key)
  on conflict (event_id, subject) do nothing;

  select q.files, q.bytes into v_s_files, v_s_bytes
  from public.upload_quota q
  where q.event_id = p_event_id and q.subject = v_session_key
  for update;

  select q.files, q.bytes into v_i_files, v_i_bytes
  from public.upload_quota q
  where q.event_id = p_event_id and q.subject = v_ip_key
  for update;

  if v_s_files + 1 > p_session_max_files or v_s_bytes + p_bytes > p_session_max_bytes then
    return query select false, 'session'::text;
    return;
  end if;
  if v_i_files + 1 > p_ip_max_files or v_i_bytes + p_bytes > p_ip_max_bytes then
    return query select false, 'ip'::text;
    return;
  end if;

  update public.upload_quota q
  set files = q.files + 1, bytes = q.bytes + p_bytes
  where q.event_id = p_event_id and q.subject in (v_session_key, v_ip_key);

  return query select true, null::text;
end;
$$;

revoke all on function public.reserve_upload_quota(uuid, text, text, bigint, integer, bigint, integer, bigint) from public, anon, authenticated;
grant execute on function public.reserve_upload_quota(uuid, text, text, bigint, integer, bigint, integer, bigint) to service_role;

-- -----------------------------------------------------------------------------
-- RPC: consume_rate_limit — atomic fixed-window counter
-- -----------------------------------------------------------------------------
drop function if exists public.consume_rate_limit(text, integer, integer);
create or replace function public.consume_rate_limit(
  p_bucket          text,
  p_limit           integer,
  p_window_seconds  integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_window integer := least(greatest(coalesce(p_window_seconds, 60), 1), 86400);
  v_limit  integer := greatest(coalesce(p_limit, 1), 1);
  v_start  timestamptz := to_timestamp(floor(extract(epoch from now()) / v_window) * v_window);
  v_hits   integer;
begin
  insert into public.rate_limits as r (bucket, window_start, hits)
  values (left(p_bucket, 200), v_start, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Opportunistic cleanup of stale windows (cheap, bounded).
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return query select
    v_hits <= v_limit,
    case when v_hits <= v_limit then 0
         else greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => v_window) - now())))::integer)
    end;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- RPC: event_media_stats — dashboard counters aggregated in Postgres, so the
-- host panel no longer streams every media row into Node.js memory.
-- -----------------------------------------------------------------------------
drop function if exists public.event_media_stats(uuid);
create or replace function public.event_media_stats(p_event_id uuid)
returns table (
  total        bigint,
  photos       bigint,
  videos       bigint,
  audio        bigint,
  pending      bigint,
  hidden       bigint,
  total_bytes  bigint,
  guests       bigint
)
language sql
stable
set search_path = ''
as $$
  select
    count(*)                                                as total,
    count(*) filter (where m.kind = 'photo')                as photos,
    count(*) filter (where m.kind = 'video')                as videos,
    count(*) filter (where m.kind = 'audio')                as audio,
    count(*) filter (where m.status = 'pending')            as pending,
    count(*) filter (where m.status = 'hidden')             as hidden,
    coalesce(sum(m.size_bytes), 0)::bigint                  as total_bytes,
    count(distinct m.guest_session_id)                      as guests
  from public.media_items m
  where m.event_id = p_event_id;
$$;

revoke all on function public.event_media_stats(uuid) from public, anon, authenticated;
grant execute on function public.event_media_stats(uuid) to service_role;

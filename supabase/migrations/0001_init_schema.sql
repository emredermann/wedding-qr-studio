-- =============================================================================
-- Wedding QR Studio — 0001 initial schema
-- =============================================================================
-- Security model
--   * Couples (album owners) and co-hosts are authenticated Supabase users.
--     Owners are matched on auth.uid(); co-hosts on their verified JWT email.
--   * Guests are anonymous. They never INSERT or SELECT media directly: the
--     Next.js server validates requests and writes with the service-role key.
--     Guests may only discover photos containing their own face via the
--     verified `match_guest_faces` RPC.
--   * All media bytes live in Cloudflare R2; Postgres stores metadata only.
-- =============================================================================

create extension if not exists vector;

-- -----------------------------------------------------------------------------
-- albums
-- -----------------------------------------------------------------------------
create table public.albums (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  slug         text not null
                 constraint albums_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$'),
  title        text not null check (char_length(title) between 1 and 120),
  event_date   date,
  plan_tier    text not null default 'starter'
                 check (plan_tier in ('starter', 'pro', 'unlimited')),
  privacy_mode text not null default 'public'
                 check (privacy_mode in ('public', 'private')),
  -- Disposable Camera mode: guest gallery stays locked until reveal_at.
  reveal_at    timestamptz,
  is_paid      boolean not null default false,
  expires_at   timestamptz not null default (now() + interval '24 months'),
  created_at   timestamptz not null default now(),
  constraint albums_slug_key unique (slug) -- unique constraint = btree index on slug
);

create index albums_owner_id_idx on public.albums (owner_id);

-- -----------------------------------------------------------------------------
-- co_hosts
-- -----------------------------------------------------------------------------
create table public.co_hosts (
  id         uuid primary key default gen_random_uuid(),
  album_id   uuid not null references public.albums (id) on delete cascade,
  email      text not null
               check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  created_at timestamptz not null default now(),
  constraint co_hosts_album_email_key unique (album_id, email)
);

create index co_hosts_email_idx on public.co_hosts (email);

-- -----------------------------------------------------------------------------
-- media
-- -----------------------------------------------------------------------------
create table public.media (
  id               uuid primary key default gen_random_uuid(),
  album_id         uuid not null references public.albums (id) on delete cascade,
  file_key         text not null check (char_length(file_key) between 1 and 1024),
  file_url         text not null check (char_length(file_url) between 1 and 2048),
  media_type       text not null check (media_type in ('photo', 'video', 'audio')),
  -- Verified against R2 HEAD at registration; used for ZIP sizing and quotas.
  mime_type        text not null check (char_length(mime_type) between 3 and 127),
  size_bytes       bigint not null check (size_bytes > 0),
  guest_name       text check (guest_name is null or char_length(guest_name) between 1 and 80),
  guest_session_id text check (guest_session_id is null or char_length(guest_session_id) between 1 and 64),
  category         text not null default 'general'
                     check (category in ('getting_ready', 'ceremony', 'reception', 'party', 'venue', 'general')),
  -- 64-bit perceptual hash as 16 hex chars, used for duplicate detection.
  phash            text check (phash is null or phash ~ '^[0-9a-f]{16}$'),
  is_hidden        boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint media_file_key_key unique (file_key)
);

create index media_album_id_idx on public.media (album_id);
create index media_album_visible_created_idx on public.media (album_id, created_at desc) where not is_hidden;
create index media_album_session_idx on public.media (album_id, guest_session_id) where guest_session_id is not null;
create index media_album_phash_idx on public.media (album_id, phash) where phash is not null;

-- -----------------------------------------------------------------------------
-- media_faces
-- -----------------------------------------------------------------------------
create table public.media_faces (
  id         uuid primary key default gen_random_uuid(),
  album_id   uuid not null references public.albums (id) on delete cascade,
  media_id   uuid not null references public.media (id) on delete cascade,
  embedding  vector(128) not null,
  created_at timestamptz not null default now()
);

create index media_faces_album_id_idx on public.media_faces (album_id);
create index media_faces_media_id_idx on public.media_faces (media_id);

-- ANN index for global / ORDER BY ... LIMIT nearest-neighbour queries.
-- match_guest_faces() deliberately uses the album_id btree + an exact distance
-- filter instead: HNSW post-filters by album_id and would silently drop
-- matches, while an exact scan over one wedding's faces is fast and complete.
create index media_faces_embedding_hnsw_idx on public.media_faces
  using hnsw (embedding vector_cosine_ops);

-- =============================================================================
-- Authorisation helpers (SECURITY DEFINER avoids RLS recursion between tables)
-- =============================================================================
create or replace function public.is_album_owner(p_album_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.albums a
    where a.id = p_album_id and a.owner_id = (select auth.uid())
  );
$$;

create or replace function public.can_manage_album(p_album_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
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

-- Guest-visible: public, not expired, and revealed (Disposable Camera mode).
create or replace function public.is_album_publicly_visible(p_album_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.albums a
    where a.id = p_album_id
      and a.privacy_mode = 'public'
      and a.expires_at > now()
      and (a.reveal_at is null or a.reveal_at <= now())
  );
$$;

revoke all on function public.is_album_owner(uuid) from public;
revoke all on function public.can_manage_album(uuid) from public;
revoke all on function public.is_album_publicly_visible(uuid) from public;
grant execute on function public.is_album_owner(uuid) to anon, authenticated, service_role;
grant execute on function public.can_manage_album(uuid) to anon, authenticated, service_role;
grant execute on function public.is_album_publicly_visible(uuid) to anon, authenticated, service_role;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.albums      enable row level security;
alter table public.co_hosts    enable row level security;
alter table public.media       enable row level security;
alter table public.media_faces enable row level security;

-- albums -----------------------------------------------------------------------
create policy "albums_select_managers" on public.albums
  for select to authenticated
  using (public.can_manage_album(id));

create policy "albums_insert_owner" on public.albums
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and is_paid = false);

create policy "albums_update_owner" on public.albums
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "albums_delete_owner" on public.albums
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Billing-controlled columns (is_paid, plan_tier, expires_at) and ownership are
-- writable only by the service role (payment webhooks). Column privileges only
-- take effect once the table-level grant Supabase adds by default is revoked.
revoke insert, update on public.albums from authenticated;
grant insert (owner_id, slug, title, event_date, privacy_mode, reveal_at) on public.albums to authenticated;
grant update (slug, title, event_date, privacy_mode, reveal_at) on public.albums to authenticated;
revoke all on public.albums from anon;

-- co_hosts ---------------------------------------------------------------------
create policy "co_hosts_select_owner_or_self" on public.co_hosts
  for select to authenticated
  using (
    public.is_album_owner(album_id)
    or email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );

create policy "co_hosts_insert_owner" on public.co_hosts
  for insert to authenticated
  with check (public.is_album_owner(album_id));

create policy "co_hosts_delete_owner" on public.co_hosts
  for delete to authenticated
  using (public.is_album_owner(album_id));

revoke update on public.co_hosts from authenticated;
revoke all on public.co_hosts from anon;

-- media ------------------------------------------------------------------------
-- No INSERT policy and no public/guest SELECT policy: rows are created only by
-- the server after verifying the object in R2, and guests can only retrieve
-- photos containing their own face via `match_guest_faces`.
create policy "media_select_managers" on public.media
  for select to authenticated
  using (public.can_manage_album(album_id));

create policy "media_update_managers" on public.media
  for update to authenticated
  using (public.can_manage_album(album_id))
  with check (public.can_manage_album(album_id));

create policy "media_delete_managers" on public.media
  for delete to authenticated
  using (public.can_manage_album(album_id));

-- Managers may only moderate (hide) and re-categorise; storage pointers are immutable.
revoke insert, update on public.media from anon, authenticated;
grant update (is_hidden, category) on public.media to authenticated;
revoke all on public.media from anon;

-- media_faces ------------------------------------------------------------------
create policy "media_faces_select_managers" on public.media_faces
  for select to authenticated
  using (public.can_manage_album(album_id));

create policy "media_faces_delete_managers" on public.media_faces
  for delete to authenticated
  using (public.can_manage_album(album_id));

revoke insert, update on public.media_faces from anon, authenticated;
revoke all on public.media_faces from anon;

-- =============================================================================
-- RPC: get_public_album — safe album lookup for the guest QR landing page
-- =============================================================================
create or replace function public.get_public_album(p_slug text)
returns table (
  id           uuid,
  slug         text,
  title        text,
  event_date   date,
  privacy_mode text,
  reveal_at    timestamptz,
  expires_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.slug, a.title, a.event_date, a.privacy_mode, a.reveal_at, a.expires_at
  from public.albums a
  where a.slug = lower(btrim(p_slug)) and a.expires_at > now()
  limit 1;
$$;

revoke all on function public.get_public_album(text) from public;
grant execute on function public.get_public_album(text) to anon, authenticated, service_role;

-- =============================================================================
-- RPC: match_guest_faces — cosine similarity search within one album
-- Returns each visible media item once (its best-matching face), most similar
-- first. Similarity = 1 - cosine distance.
-- Access: album managers always; anyone else only if the album is publicly
-- visible (public + revealed + not expired). The service role bypasses checks.
-- =============================================================================
create or replace function public.match_guest_faces(
  query_embedding vector(128),
  target_album_id uuid,
  match_threshold double precision default 0.55,
  match_count     integer default 100
)
returns table (
  media_id   uuid,
  file_key   text,
  file_url   text,
  media_type text,
  category   text,
  guest_name text,
  created_at timestamptz,
  similarity double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_threshold double precision := least(greatest(coalesce(match_threshold, 0.55), -1), 1);
  v_count     integer := least(greatest(coalesce(match_count, 100), 1), 500);
  v_role      text := coalesce((select auth.role()), '');
begin
  if query_embedding is null or target_album_id is null then
    raise exception 'INVALID_ARGUMENTS' using errcode = 'P0001';
  end if;

  if v_role <> 'service_role'
     and not public.can_manage_album(target_album_id)
     and not public.is_album_publicly_visible(target_album_id) then
    raise exception 'ALBUM_NOT_ACCESSIBLE' using errcode = 'P0001';
  end if;

  return query
  with scored as (
    select f.media_id,
           1 - (f.embedding operator(public.<=>) query_embedding) as sim
    from public.media_faces f
    where f.album_id = target_album_id
  ),
  best as (
    select distinct on (s.media_id) s.media_id, s.sim
    from scored s
    where s.sim >= v_threshold
    order by s.media_id, s.sim desc
  )
  select m.id, m.file_key, m.file_url, m.media_type, m.category, m.guest_name, m.created_at, b.sim
  from best b
  join public.media m on m.id = b.media_id
  where m.album_id = target_album_id
    and not m.is_hidden
  order by b.sim desc, m.created_at desc
  limit v_count;
end;
$$;

revoke all on function public.match_guest_faces(vector, uuid, double precision, integer) from public;
grant execute on function public.match_guest_faces(vector, uuid, double precision, integer) to anon, authenticated, service_role;

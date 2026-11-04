-- =============================================================================
-- Wedding QR Studio — 0004 Private-by-default biometric gallery & abuse hardening
-- =============================================================================
-- Access model after this migration
--   * Hosts (owner, co-hosts, super-admins) read/moderate/download everything
--     through RLS (`can_manage_album`) or the authenticated Next.js API.
--   * Guests NEVER read `media` directly. All public/open anonymous policies
--     on `albums`, `media`, `media_faces` and `guest_registrations` require
--     `public.is_trusted_server()` (either `service_role` or the SHA-256
--     verified `x-wqr-server-key` header sent exclusively by the Next.js server).
--   * A guest only ever receives photos containing their own face: the Next.js
--     server verifies the signed guest-session cookie, rate-limits the caller,
--     enforces the album's face-search gates (privacy, Disposable Camera reveal,
--     expiry) and then calls `match_guest_faces`.
-- =============================================================================

create or replace function public.is_trusted_server()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_headers text;
  v_key     text;
begin
  if coalesce((select auth.role()), '') = 'service_role' then
    return true;
  end if;

  v_headers := current_setting('request.headers', true);
  if v_headers is null or v_headers = '' then
    return false;
  end if;

  v_key := (v_headers::jsonb) ->> 'x-wqr-server-key';
  if v_key is null or char_length(v_key) < 32 then
    return false;
  end if;

  return encode(sha256(convert_to(v_key, 'UTF8')), 'hex')
    = '0d1226778c8a120ec5852b60f330eb8bd89518fcb758d6eba6d8766e0983c38e';
exception when others then
  return false;
end;
$$;

revoke all on function public.is_trusted_server() from public;
grant execute on function public.is_trusted_server() to anon, authenticated, service_role;

grant select, insert, update, delete on public.media to anon;
alter policy "media_select_public_guests" on public.media
  to anon
  using (public.is_trusted_server());

create policy "media_trusted_server_write" on public.media
  for all to anon
  using (public.is_trusted_server())
  with check (public.is_trusted_server());

grant select, insert, update, delete on public.media_faces to anon;
create policy "media_faces_trusted_server_all" on public.media_faces
  for all to anon
  using (public.is_trusted_server())
  with check (public.is_trusted_server());

grant select, insert, update, delete on public.albums to anon;
alter policy "albums_select_non_expired" on public.albums
  to anon
  using (public.is_trusted_server());

create policy "albums_trusted_server_write" on public.albums
  for all to anon
  using (public.is_trusted_server())
  with check (public.is_trusted_server());

create or replace function public.guard_album_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.is_paid is distinct from old.is_paid
      or new.plan_tier is distinct from old.plan_tier
      or new.expires_at is distinct from old.expires_at) then
    if not public.is_trusted_server()
       and not public.is_super_admin() then
      raise exception 'FORBIDDEN_BILLING_UPDATE' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_album_billing_columns() from public, anon, authenticated;

revoke insert, update, delete on public.guest_registrations from authenticated;
grant select on public.guest_registrations to authenticated;
grant select, insert, update, delete on public.guest_registrations to anon;

alter policy "guest_registrations_insert_public" on public.guest_registrations
  to anon
  with check (public.is_trusted_server());

alter policy "guest_registrations_update_public" on public.guest_registrations
  to anon
  using (public.is_trusted_server())
  with check (public.is_trusted_server());

create policy "guest_registrations_select_trusted_server" on public.guest_registrations
  for select to anon
  using (public.is_trusted_server());

alter table public.guest_registrations
  add column if not exists contact_consent_at timestamptz;

alter table public.media
  add column if not exists faces_indexed_at timestamptz;

create or replace function public.enforce_media_faces_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.media_faces f where f.media_id = new.media_id) >= 25 then
    raise exception 'MEDIA_FACES_CAP_REACHED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_media_faces_cap() from public, anon, authenticated;

create or replace trigger trg_enforce_media_faces_cap
  before insert on public.media_faces
  for each row execute function public.enforce_media_faces_cap();

create or replace function public.match_guest_faces(
  query_embedding vector(128),
  target_album_id uuid,
  match_threshold double precision default 0.82,
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
  v_threshold double precision := least(greatest(coalesce(match_threshold, 0.82), 0.78), 0.99);
  v_count     integer := least(greatest(coalesce(match_count, 100), 1), 200);
begin
  if query_embedding is null or target_album_id is null then
    raise exception 'INVALID_ARGUMENTS' using errcode = 'P0001';
  end if;

  if not public.is_trusted_server() and not public.can_manage_album(target_album_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not public.can_manage_album(target_album_id)
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
  select m.id, m.file_key, m.file_url, m.media_type, m.category, null::text as guest_name, m.created_at, b.sim
  from best b
  join public.media m on m.id = b.media_id
  where m.album_id = target_album_id
    and m.media_type = 'photo'
    and not m.is_hidden
  order by b.sim desc, m.created_at desc
  limit v_count;
end;
$$;

revoke all on function public.match_guest_faces(vector, uuid, double precision, integer) from public;
grant execute on function public.match_guest_faces(vector, uuid, double precision, integer) to anon, authenticated, service_role;

create table if not exists public.api_rate_limits (
  bucket       text not null check (char_length(bucket) between 1 and 200),
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, window_start)
);

alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer
)
returns table (
  allowed             boolean,
  remaining           integer,
  retry_after_seconds integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window_seconds integer := least(greatest(coalesce(p_window_seconds, 60), 1), 86400);
  v_limit          integer := greatest(coalesce(p_limit, 1), 1);
  v_window_start   timestamptz;
  v_hits           integer;
begin
  if not public.is_trusted_server() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_bucket is null or char_length(p_bucket) = 0 then
    raise exception 'INVALID_ARGUMENTS' using errcode = 'P0001';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from now()) / v_window_seconds) * v_window_seconds);

  insert into public.api_rate_limits as r (bucket, window_start, hits)
  values (left(p_bucket, 200), v_window_start, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  return query select
    v_hits <= v_limit,
    greatest(v_limit - v_hits, 0),
    case
      when v_hits <= v_limit then 0
      else greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => v_window_seconds) - now())))::integer)
    end;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to anon, authenticated, service_role;

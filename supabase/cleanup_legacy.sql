-- =============================================================================
-- Wedding QR — OPTIONAL one-time cleanup of the OLD (R2 / "Lumina") schema.
-- =============================================================================
-- Run this ONLY on a database that previously had the old migrations
-- (albums / media / media_faces / profiles ...). It is NOT part of the normal
-- setup and is not needed on a fresh Supabase project.
--
-- WHY: the old 0004 migration granted the `anon` role read/write on several
-- tables behind `is_trusted_server()`, whose secret was hard-coded in the
-- public repository. Anyone with the (public) anon key could use it.
--
-- WHAT IT DELETES (permanently): the old tables albums, co_hosts, media,
-- media_faces, profiles, guest_registrations, api_rate_limits and their
-- functions/triggers. The new tables (events, media_items, face_descriptors,
-- guestbook_messages, drive_connections, ...) and auth.users are untouched.
-- Back up first if the old tables hold anything you want to keep:
--   Supabase → Database → Backups, or Table Editor → export CSV.
-- =============================================================================

begin;

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.media_faces cascade;
drop table if exists public.media cascade;
drop table if exists public.co_hosts cascade;
drop table if exists public.guest_registrations cascade;
drop table if exists public.albums cascade;
drop table if exists public.profiles cascade;
drop table if exists public.api_rate_limits cascade;

drop function if exists public.match_guest_faces(vector, uuid, double precision, integer);
drop function if exists public.get_public_album(text);
drop function if exists public.is_trusted_server();
drop function if exists public.can_manage_album(uuid);
drop function if exists public.is_album_owner(uuid);
drop function if exists public.is_album_publicly_visible(uuid);
drop function if exists public.is_super_admin();
drop function if exists public.handle_new_auth_user();
drop function if exists public.guard_album_billing_columns();
drop function if exists public.enforce_media_faces_cap();

commit;

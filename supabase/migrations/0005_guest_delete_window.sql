-- =============================================================================
-- Mira — 0005: guests may delete an upload only until they move on
-- =============================================================================
-- Run AFTER 0004_tables_and_live_hearts.sql. Idempotent: safe to run more than once.
--
-- A new upload is deletable by the guest who sent it while they are still on
-- the upload screen. As soon as they continue (pick new files, switch tab,
-- clear the list or leave the page) the app locks it (guest_can_delete =
-- false) and the guest can no longer delete it. Existing rows default to
-- locked. Hosts can always hide or delete anything.
-- =============================================================================

alter table public.media_items add column if not exists guest_can_delete boolean not null default false;

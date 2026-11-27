-- =============================================================================
-- Mira — 0004: table numbers on uploads, faster "recent hearts" for the live wall
-- =============================================================================
-- Run AFTER 0003_heart_names.sql. Idempotent: safe to run more than once.
-- Purely additive. The app detects the new column at runtime, so deploying
-- the code before running this file is safe (table numbers are simply not
-- stored until it has been run).
-- =============================================================================

-- Per-event switch: one QR per table (true) or a single QR for all (false, default).
alter table public.events add column if not exists table_numbers boolean not null default false;

-- Table the guest scanned (QR cards encode ?table=N when the switch is on). NULL = unknown.
alter table public.media_items add column if not exists table_no integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'media_items_table_no_range') then
    alter table public.media_items
      add constraint media_items_table_no_range check (table_no is null or table_no between 0 and 9999);
  end if;
end $$;
create index if not exists media_items_event_table_idx
  on public.media_items (event_id, table_no, created_at desc)
  where table_no is not null;

-- The live wall asks "which hearts arrived since …" every few seconds.
create index if not exists media_hearts_created_idx on public.media_hearts (created_at desc);

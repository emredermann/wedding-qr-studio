-- =============================================================================
-- Mira — 0006: seating planner (one plan per event)
-- =============================================================================
-- Run AFTER 0005_guest_delete_window.sql. Idempotent: safe to run more than once.
-- Purely additive: nothing existing changes, and until this file is run the
-- planner simply reports that it is not set up yet.
--
-- The plan (invited guests, tables, venue blocks and guest-to-seat
-- assignments) is one jsonb document, validated by src/lib/seating/schema.ts
-- on every read and write — the same pattern as events.schedule.
-- `version` increases on every save; a save that does not carry the current
-- version is rejected, so two people editing the same plan never silently
-- overwrite each other.
-- =============================================================================

create table if not exists public.seating_plans (
  event_id    uuid primary key references public.events (id) on delete cascade,
  plan        jsonb not null default '{"title":null,"guests":[],"tables":[],"venue":[]}'::jsonb,
  version     integer not null default 1 check (version >= 1),
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  -- ~2000 guests and 300 tables stay far below this; it only stops abuse.
  constraint seating_plans_size check (pg_column_size(plan) <= 2000000)
);

-- Row Level Security & grants (same model as 0001: the browser never reads
-- these tables directly; the server uses the service role).
alter table public.seating_plans enable row level security;
revoke all on public.seating_plans from anon, authenticated;
grant all on public.seating_plans to service_role;

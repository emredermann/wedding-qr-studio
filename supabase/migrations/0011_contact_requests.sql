-- =============================================================================
-- Mira — 0011: "contact us" requests from the website
-- =============================================================================
-- Run AFTER 0010 (or 0009). Idempotent: safe to run more than once. Purely
-- additive; until it has been run the contact form answers "not set up yet".
--
-- Requests are read in the Supabase dashboard (Table Editor → contact_requests)
-- or with `npm run contacts`. Only the server (service role) touches the table.
-- No IP address is stored.
-- =============================================================================

create table if not exists public.contact_requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  full_name   text not null,
  email       text not null,
  phone       text,
  note        text,
  lang        text not null default 'tr',
  source      text,
  consent_at  timestamptz not null,
  status      text not null default 'new',
  constraint contact_requests_name_len check (char_length(full_name) between 2 and 80),
  constraint contact_requests_email check (char_length(email) <= 160 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint contact_requests_phone check (phone is null or phone ~ '^[0-9]{8,15}$'),
  constraint contact_requests_note_len check (note is null or char_length(note) <= 2000),
  constraint contact_requests_lang check (lang in ('tr', 'en')),
  constraint contact_requests_source_len check (source is null or char_length(source) <= 40),
  constraint contact_requests_status check (status in ('new', 'contacted', 'closed'))
);

create index if not exists contact_requests_created_idx on public.contact_requests (created_at desc);

alter table public.contact_requests enable row level security;
revoke all on table public.contact_requests from anon, authenticated;
grant all on table public.contact_requests to service_role;

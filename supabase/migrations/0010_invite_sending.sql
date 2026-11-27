-- =============================================================================
-- Mira — 0010: sending invitations in bulk
-- =============================================================================
-- Run AFTER 0009_invitations.sql. Idempotent: safe to run more than once.
-- Purely additive. Until it has been run, invitations work as before; only
-- phone numbers, the "sent" tracking and the custom message are unavailable.
--
--   invitees.phone          optional number for SMS (digits, with
--                           country code, e.g. 905321234567)
--   invitees.sent_at        when the host last marked the invitation as sent
--   invitation_settings.message_template
--                           the text sent with each link; placeholders
--                           {isim} {cift} {link} {tarih}
-- =============================================================================

alter table public.invitees add column if not exists phone text;
alter table public.invitees add column if not exists sent_at timestamptz;
alter table public.invitation_settings add column if not exists message_template text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invitees_phone_format') then
    alter table public.invitees add constraint invitees_phone_format check (phone is null or phone ~ '^[0-9]{8,15}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invitation_settings_message_len') then
    alter table public.invitation_settings
      add constraint invitation_settings_message_len check (message_template is null or char_length(message_template) <= 1000);
  end if;
end $$;

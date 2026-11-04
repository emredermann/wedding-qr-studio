-- =============================================================================
-- Wedding QR Studio — 0003 Production Readiness & Super-Admin RLS Policies
-- =============================================================================

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

-- 1. Ensure anonymous role cannot enumerate albums or media directly;
--    public event landing pages (/e/[slug]) resolve album metadata via
--    get_public_album(p_slug) RPC or the server-side handler.
revoke all on public.albums from anon;
grant select on public.albums to authenticated;

-- 2. Allow Super-Admins to update any album (theme_config, flow_config, payment overrides)
create policy "albums_update_super_admin" on public.albums
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant update (is_paid, plan_tier, expires_at) on public.albums to authenticated;

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
    if coalesce((select auth.role()), '') <> 'service_role'
       and not public.is_super_admin() then
      raise exception 'FORBIDDEN_BILLING_UPDATE' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_album_billing_columns() from public, anon, authenticated;

create or replace trigger trg_guard_album_billing_columns
  before update on public.albums
  for each row execute function public.guard_album_billing_columns();

-- 3. Guest registrations are written strictly by the server after validating the
--    signed guest session and GDPR/KVKK consent; only album managers may SELECT.
revoke all on public.guest_registrations from anon;
revoke insert, update, delete on public.guest_registrations from authenticated;
grant select on public.guest_registrations to authenticated;

-- PWA install tracking (2026-09-18).
--
-- Context: UA-based install detection is dead — on modern iOS a home-screen
-- web app reports the exact same user agent as Safari (verified against a
-- real install on iPhone OS 18_7), and Android Chrome always has. The only
-- reliable signal is the app itself noticing it is running in standalone
-- display mode and phoning home.
--
-- staff.pwa_installed_at = first time we saw this person inside the
-- installed app. NULL = never confirmed. This is "confirmed as of", not the
-- actual install date, which is unknowable retroactively.
--
-- Idempotent by design so it can be pasted into the SQL editor now and also
-- picked up by Lovable's migration runner later without erroring.

alter table public.staff
  add column if not exists pwa_installed_at timestamptz;

comment on column public.staff.pwa_installed_at is
  'First time this user was seen running Pro Moves as an installed PWA (standalone display mode). Stamped by record_pwa_install(); NULL = install never confirmed.';

-- Stamps the calling user's own staff row, once. SECURITY DEFINER so it
-- works regardless of staff UPDATE policies, but scoped hard to auth.uid()
-- so a user can never stamp anyone else.
create or replace function public.record_pwa_install()
returns void
language sql
security definer
set search_path = public
as $$
  update public.staff
     set pwa_installed_at = now()
   where user_id = auth.uid()
     and pwa_installed_at is null;
$$;

revoke all on function public.record_pwa_install() from public;
grant execute on function public.record_pwa_install() to authenticated;

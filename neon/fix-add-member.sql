-- Incremental fix for Personnel + ADD MEMBER on Neon Auth (no Supabase Edge Functions).
-- Safe to re-run. Apply in Neon SQL editor if schema.sql was applied before this change.

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated with check (public.is_admin());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated using (public.is_admin());

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete to authenticated using (public.is_admin());

grant delete on table public.profiles to authenticated;

-- Better Auth admin.createUser requires neon_auth.user.role = 'admin'
-- (separate from public.profiles.is_admin). Promote every app Admin.
update neon_auth."user" u
set role = 'admin'
from public.profiles p
where u.id::text = p.id
  and p.is_admin = true
  and coalesce(u.role, '') <> 'admin';

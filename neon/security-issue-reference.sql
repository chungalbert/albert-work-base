-- Reference path on security_issues (post neon/security.sql).
-- Apply via psql; then Neon Console → Data API → Refresh schema cache if needed.

alter table public.security_issues
  add column if not exists reference_path text not null default '';

notify pgrst, 'reload schema';

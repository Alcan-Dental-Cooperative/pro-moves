-- LRM-11: multiple doctor blasts per week. Ariyana can now send as many
-- blasts as she needs in a week, so the week's hard one-row cap has to
-- relax to a one-OPEN-DRAFT cap instead (unlimited sent rows). See
-- docs/specs/lrm-11-multi-blast-week.md, "LRM-11: data model and edge
-- function".
--
-- Drops the table-level `unique (created_by, week_start_date)` constraint
-- added in supabase/migrations/20260825220000_lrm2_lead_week_blasts.sql
-- (its default-generated name, confirmed against the live schema) and
-- replaces it with a partial unique index that only applies to draft rows:
-- the DB itself still enforces "one open draft at a time" while allowing
-- any number of sent rows to accumulate. Relaxing a constraint is safe
-- ahead of the frontend deploy -- the currently deployed frontend can only
-- ever create one row per week anyway, so nothing changes in production
-- until the LRM-12 UI ships (see the db-ddl-must-lag-deploy rule; this is
-- the safe direction, a relaxation not a tightening). Idempotent, safe to
-- (re)run any time.

alter table public.lead_week_blasts
  drop constraint if exists lead_week_blasts_created_by_week_start_date_key;

create unique index if not exists idx_lead_week_blasts_one_open_draft
  on public.lead_week_blasts (created_by, week_start_date)
  where status = 'draft';

-- Sanity check: the old table-level unique constraint is gone and the new
-- partial unique index (drafts only) is in place.
do $$
declare
  v_old_constraint_exists boolean;
  v_new_index_exists boolean;
begin
  select exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_week_blasts'::regclass
      and conname = 'lead_week_blasts_created_by_week_start_date_key'
  ) into v_old_constraint_exists;
  if v_old_constraint_exists then
    raise exception 'lead_week_blasts: old per-week unique constraint is still present';
  end if;

  select exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'lead_week_blasts'
      and indexname = 'idx_lead_week_blasts_one_open_draft'
  ) into v_new_index_exists;
  if not v_new_index_exists then
    raise exception 'lead_week_blasts: one-open-draft partial unique index was not created';
  end if;

  raise notice 'lead_week_blasts: OK (per-week unique constraint dropped, one-open-draft partial index in place)';
end $$;

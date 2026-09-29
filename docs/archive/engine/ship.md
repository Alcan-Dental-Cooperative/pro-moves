# Extra ship steps for Pro Moves

The ship skill runs "Before landing" before the PR merges, and stops if a step
cannot be done or confirmed. "Steps" run after the merge, before John presses
Publish in Lovable.

## Before landing

- **Database migration, when the ticket has one.** Merging does not apply it,
  and the new code will fail against the live database without it. **Claude
  applies it** through the Supabase MCP (`apply_migration`), per John's
  standing preference (2026-09-28): safe, additive, QA-passed changes are run
  by Claude, not pasted by John. Tell John in one plain line before running
  it. Never run `supabase db push`: the CLI's migration history does not
  match this repo's, so it fails or does worse.
- **Stop and ask John first** when the change is destructive or cannot be
  undone: dropping or renaming a table or column, deleting or rewriting data.
  Those also wait until the code that stops using the thing has shipped.
  If the MCP is not connected, hand John the file path and full SQL for the
  **SQL Editor** instead, and wait for him to say it ran.
- Before applying, check the SQL is idempotent, so it is safe to run
  twice: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` before
  `CREATE POLICY`. If it is not, stop and send it back to build.
- After applying, confirm it is there (for example
  `select to_regclass('public.<table>');`) and run any post-apply checks the
  migration lists. Any test writes go inside a block that is rolled back
  (a `do $$ ... raise exception ... $$` works), so nothing is left in
  production.

## Steps

(none)

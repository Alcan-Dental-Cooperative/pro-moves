# Extra ship steps for Pro Moves

The ship skill runs "Before landing" before the PR merges, and stops if a step
cannot be done or confirmed. "Steps" run after the merge, before John presses
Publish in Lovable.

## Before landing

- **Database migration, when the ticket has one.** Merging does not apply it,
  and the new code will fail against the live database without it. Hand John
  the migration file's path and its full SQL, and wait for him to say it ran.
  He pastes it into the Supabase dashboard **SQL Editor** (or applies it
  through the Supabase MCP). Never run `supabase db push`: the CLI's migration
  history does not match this repo's, so it fails or does worse.
- Before handing it over, check the SQL is idempotent, so it is safe to run
  twice: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` before
  `CREATE POLICY`. If it is not, stop and send it back to build.
- Then ask John to confirm the change is there (for example
  `select to_regclass('public.<table>');` returns the table name).

## Steps

(none)

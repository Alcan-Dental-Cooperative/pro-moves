# /ship <ticket>

Pushes the branch, opens a PR, and prints John's checklist. Never merges.

## When to use

After `/qa` passes (ticket is at `stage:ready-to-review`).

## What this skill does

1. **Run `npm run check`** one final time. If it fails, fix before proceeding.

2. **Push the branch** to GitHub.

3. **Open a PR** with:
   - Title matching the ticket
   - Body containing:
     - Link to the spec
     - Build summary (what changed and why, in plain language)
     - QA report (pass/fail per acceptance item)
     - The full acceptance script, written for John
     - DB change notes if applicable

4. **Print John's human checklist:**

   ```
   Your checklist:
   1. Read the PR description on GitHub
   2. Wait for the green CI check
   3. Switch Lovable to branch [branch-name] to preview
   4. Walk the acceptance script as [persona(s)]
   5. Switch Lovable back to main
   6. Merge the PR on GitHub
   7. Verify Lovable re-syncs main
   8. Publish
   ```

   Adjust the checklist if there's a DB change (add the apply step and its
   ordering relative to deploy).

5. **Move the ticket** to `stage:ready-to-review`. John merges on GitHub;
   `/status` then syncs the board to `stage:merged` from GitHub state (see
   the status skill, step 5). John marks `stage:published` himself after
   Lovable Publish.

## Database changes

Merging does not apply a migration, and the new code fails against the live
database without it. So when the ticket has one, it is applied **after QA
passes and before John merges**:

- **Claude applies it** through the Supabase MCP (`apply_migration`), per
  John's standing preference (2026-09-28): safe, additive, QA-passed changes
  are run by Claude, not pasted by John. Tell John in one plain line before
  running it. Never run `supabase db push`: the CLI's migration history does
  not match this repo's, so it fails or does worse.
- **Stop and ask John first** when the change is destructive or cannot be
  undone: dropping or renaming a table or column, deleting or rewriting data.
  Those also wait until the code that stops using the thing has shipped.
  If the MCP is not connected, hand John the file path and full SQL for the
  **SQL Editor** instead, and wait for him to say it ran.
- Before applying, check the SQL is idempotent, so it is safe to run twice:
  `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` before
  `CREATE POLICY`. If it is not, stop and send it back to `/build`.
- After applying, confirm it is there (for example
  `select to_regclass('public.<table>');`) and run any post-apply checks the
  migration lists. Any test writes go inside a block that is rolled back
  (a `do $$ ... raise exception ... $$` works), so nothing is left in
  production.
- Say in the PR body and John's checklist that the migration is already
  applied.

## Rules

- Never merge. Never click Publish. Those are John's actions.
- Never push to `main`. Push to the feature/fix branch only.
- The PR description is written for John, not a developer. Outcomes, not diffs.
- No em dashes in any written output.

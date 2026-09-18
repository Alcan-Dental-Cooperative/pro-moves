# Session state — 2026-09-18 (rev 3, LRM-13 shipped to review)

## The job
Spec, build, QA, and ship LRM-13 (composer-first blast editor) after PR #123
(LRM-12) merged this morning.

## Done
- Spec written and approved (Gate 1, John, 2026-09-18):
  docs/specs/lrm-13-composer-first.md. All 7 locked decisions plus one
  addition made during review: a save-state indicator that tracks DIRTY
  STATE not the network request (muted "Saving…" while typing, one flip to
  green "Saved" per pause, "Not saved" on failure).
- Built by kit-builder on feature/lrm-13-composer-first (3 commits), then
  fresh-eyes QA PASS, then 3 QA fixes applied in a 4th commit (discard
  cancels the pending autosave timer, discard confirm gets a re-entry
  guard, blastTemplate.ts rejects nested/duplicated AI delimiters). Final
  gate green: 1201/1201 tests, clean build.
- PR #127 open, awaiting John's Gate 2:
  https://github.com/Alcan-Dental-Cooperative/pro-moves/pull/127
- Backend pre-deployed to prod per the approved spec's ordering (both
  backward compatible with the published app): lead_meetings.title column
  applied and verified; lead-week-blast edge function v11 deployed via
  Supabase MCP (index.ts + blastTemplate.ts + draftValidation.ts +
  htmlUtils.ts, verify_jwt true). Until Publish, the only visible prod
  change is that generated drafts use the new "Hey there!" template.
- Motion ticket tk_eBvzAvx6ifqPZbewGWoYxh at stage:ready-to-review.
- Dev server started for John's local testing: npm run dev on the feature
  branch, http://localhost:8080 (talks to real prod DB + edge fn v11).

## Next
- John is live-testing on localhost:8080 now and ALREADY HAS FEEDBACK AND
  BUGS he will bring to the next session. First action next session: take
  his list, reproduce each item against the code, and triage into
  fix-on-this-branch (pre-merge, commits onto
  feature/lrm-13-composer-first, PR #127 updates automatically) vs
  follow-up ticket. Do not merge anything until his items are resolved or
  explicitly deferred.
- After his items clear: John walks the PR #127 checklist (merge on
  GitHub, Lovable back on main, re-sync, Publish). No DB or edge fn steps
  remain for him.
- Then /status to sync the Motion board from GitHub state.

## Files that matter
`docs/specs/lrm-13-composer-first.md` — approved spec incl. acceptance script and QA manual-test list
`src/pages/training/MeetingsAndFocusTab.tsx` — composer, summarize modal, autosave wiring, discard
`src/lib/leadWeekBlastSaveState.ts` — save indicator dirty-state derivation (pure, tested)
`src/lib/leadMeetingsAndFocus.ts` — formatMeetingLabel ("Fri 9/14 · title")
`supabase/functions/lead-week-blast/blastTemplate.ts` — fixed template assembly + delimiter extraction
`supabase/functions/lead-week-blast/index.ts` — new draft/polish prompts (deployed as v11)
`src/hooks/useLeadWeekBlasts.tsx` — createBlast/generateDraft/updateBlastBody/deleteDraft
`supabase/migrations/20260918093000_lrm13_meeting_title.sql` — applied to prod already, do not re-apply

## Open questions
- John's live-test feedback and bug list (he has items already; contents
  unknown until next session).
- Mention to Ariyana: meetings now have an optional title field, reversing
  her 2026-09-14 decline because the picker needs disambiguation.

## Do not re-derive
- The LRM-13 backend is LIVE in prod (title column + edge fn v11). Do not
  re-apply the migration or redeploy the function unless code changes.
- QA hard rules: test send emails only the author; never complete a real
  Send; masquerade cannot see Ariyana's data (author-scoped RLS).
- The PR #116 persist-before-send guarantee is intact; QA traced it end to
  end including the type-then-Send race. needsSaveBeforeSend is the
  backstop under the new autosave.
- Kit gates: only two human gates (spec approval, merge). Roll /build into
  /qa without asking.
- Old "Regenerate" button was deliberately removed (Summarize + replace
  confirm covers it); shouldConfirmRegenerate is orphaned-but-tested dead
  code, left on purpose.
- The guard hook blocks any Bash command containing both "push" and
  "main", including innocent ones like `git log main..HEAD` chained after
  a push. Split such commands.
- The folder's checked-out branch is shared by every tab/session; it is on
  feature/lrm-13-composer-first with John's dev server running from it.
  Use a worktree for any parallel session, and do not switch this folder's
  branch while he is testing.
- supabase CLI deploy is permission-blocked in this harness; use the
  Supabase MCP deploy_edge_function tool (worked fine for v11).

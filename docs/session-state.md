# Session state — 2026-09-18 (refreshed 09-18, post PR #123 merge)

## The job
Build and ship LRM-13, the composer-first blast editor, from the approved
spec at docs/specs/lrm-13-composer-first.md. LRM-11 and LRM-12 (multiple
blasts per week) are done and live.

## Done
- LRM-11 (backend) shipped and LIVE: PR #122 merged, migration
  20260917160000 applied to prod, lead-week-blast edge function at v10.
- LRM-12 (UI) shipped: PR #123 merged 2026-09-18, John walked the
  acceptance script, Lovable published. Multi-blast-per-week is live for
  Ariyana end to end.
- LRM-13 spec written and APPROVED at Gate 1 (John, 2026-09-18):
  docs/specs/lrm-13-composer-first.md. Blank composer, meetings-only
  summarize modal with warn-and-replace, fixed focus-first template,
  autosave with a dirty-state indicator, optional meeting titles,
  relocated Discard.
- LRM-13 build steps 1 and 2 are COMMITTED ONLY on
  feature/lrm-13-composer-first, not yet live:
  - 20260918093000_lrm13_meeting_title.sql (additive nullable title)
    written but NOT applied to prod (verified 2026-09-18: the column
    does not exist yet).
  - blastTemplate.ts + tests + index.ts prompt rewrite committed, but
    the deployed function is still v10, i.e. NOT redeployed.

## Next
1. Apply the LRM-13 migration to prod (Supabase SQL editor, idempotent
   ADD COLUMN IF NOT EXISTS). Additive and safe ahead of the frontend.
2. Redeploy lead-week-blast via Supabase MCP deploy_edge_function
   (index.ts + blastTemplate.ts + draftValidation.ts + htmlUtils.ts,
   verify_jwt true). Backward compatible with the live UI.
3. Build step 3, the UI: blank-composer flow, summarize modal,
   debounced autosave + save-state indicator, title field on the
   meeting form, new day-abbrev labels, Discard relocation. All in
   src/pages/training/MeetingsAndFocusTab.tsx.
4. QA (no gate between build and QA), then PR, then John's Gate 2:
   the 7-step acceptance script in the spec, merge, Lovable Publish.
- Housekeeping: rebase feature/lrm-13-composer-first on main first;
  main moved ahead with PR #124 (PWA install tracking).

## Files that matter
`docs/specs/lrm-13-composer-first.md` — the live spec: decisions, build order, acceptance script
`supabase/functions/lead-week-blast/blastTemplate.ts` — new fixed template (committed, not deployed)
`supabase/migrations/20260918093000_lrm13_meeting_title.sql` — written, NOT yet applied to prod
`docs/specs/lrm-11-multi-blast-week.md` — shipped slot model LRM-13 builds on
`src/pages/training/MeetingsAndFocusTab.tsx` — all LRM-12 UI lives here (stack, picker, discard, recipient dialog)
`src/lib/leadWeekBlastSources.ts` — source picker pure state (new in LRM-12)
`src/lib/leadWeekBlasts.ts` — list-based slot state, countSentBlasts, badge labels
`src/hooks/useLeadWeekBlasts.tsx` — generateDraft(includeFocus/meetingIds), deleteDraft
`supabase/functions/lead-week-blast/draftValidation.ts` — strict payload parsing (deployed)
`supabase/migrations/20260917160000_lrm11_multi_blast_week.sql` — applied to prod already, do not re-apply

## Open questions
- None for building. LRM-13 direction is locked in the spec.

## Do not re-derive
- LRM-11/12 are fully live. Do not re-apply 20260917160000 or rebuild
  the slot model. The LRM-13 migration, by contrast, is NOT applied yet.
- Kit gates clarified 2026-09-17: only two human gates (spec approval,
  merge). Roll /build straight into /qa without asking John.
- supabase CLI function deploy is permission-blocked in this harness;
  use the Supabase MCP deploy_edge_function tool instead (pass index.ts
  + draftValidation.ts + htmlUtils.ts, verify_jwt true).
- Test send emails only the logged-in author, never doctors. QA hard
  rule: never complete a real Send anywhere.
- masquerade cannot see Ariyana's data (author-scoped RLS); QA authors
  its own focus/meetings/blasts.
- The PR #116 WYSIWYG guarantee (send the visible text or be disabled)
  is intact in LRM-12; needsSaveBeforeSend in leadWeekBlastHtml.ts is
  the mechanism.

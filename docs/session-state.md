# Session state — 2026-09-18

## The job
Build and ship the multiple-blasts-per-week feature: LRM-11 (backend) and
LRM-12 (UI), both from the approved spec at
docs/specs/lrm-11-multi-blast-week.md.

## Done
- LRM-11 built, QA PASS, PR #122 merged by John. Backend is fully LIVE:
  migration 20260917160000 applied to prod (verified: week unique
  constraint gone, one-open-draft partial index in place) and
  lead-week-blast edge function v10 deployed via Supabase MCP.
- LRM-12 built on feature/lrm-12-multi-blast-ui, fresh-eyes QA PASS,
  PR #123 open and awaiting John's Gate 2 (merge + Lovable Publish).
  All five spec items: blast stack + New blast button, source picker,
  discard draft, "2 sent" badge / list-aware month view, Select all/none
  recipients with live-count confirm copy.
- QA fixes applied on both branches before shipping: LRM-11 malformed
  payloads now 400 instead of coercing; LRM-12 got a synchronous ref
  guard against double-click double-draft and a neutral stale-draft
  message ("sent or discarded").
- Motion tickets: LRM-11 tk_LdZD7MGpr55WMfdv5gugpk and LRM-12
  tk_azGFnf7UCeGoGiXP7vRmJA both at stage:ready-to-review (LRM-11 is
  merged; /status will sync it to stage:merged).

## Next
- Waiting on John: review PR #123, walk the 8-step acceptance script on
  the Lovable branch preview (stop at the send confirm, never complete
  a real Send; Test send is the safe path), merge, switch Lovable to
  main, Publish.
- Then: /spec LRM-13 composer-first (John locked the direction
  2026-09-18, second pass):
  1. "Draft blast" opens a BLANK composer, no auto-generation. She
     writes herself, or clicks "Summarize meeting".
  2. Summarize opens a MEETINGS-ONLY modal (no focus checkbox; default
     to the single meeting when only one exists). If the editor already
     has text: confirm dialog "this will replace your text", then
     REPLACE. Never append (John decided; overrides earlier lean).
  3. Focus is ALWAYS part of the summary output, not a source option:
     fixed template opens "Hey there! This week's Lead RDA Focus is:
     {focus rephrased as complete plain-language aspirational
     statement}", then "At this week's Lead RDA meeting, we discussed:
     {bulleted summary of checked meetings}". Positioned so she can
     delete the focus block easily in one-off weeks.
  4. Two DELIBERATE prompt-rule reversals to state in the spec: the
     greeting ban is lifted for this fixed template opener, and focus
     items are REPHRASED (aspirational restatement), no longer quoted
     verbatim.
  5. Save draft button removed; debounced auto-save (save on idle +
     blur). The PR #116 persist-before-send guarantee stays regardless.
  6. Optional title on lead_meetings (nullable, additive migration);
     labels day abbrev + date + title ("Fri 9/14 · Meeting with
     Jenny"). Reverses Ariyana's 2026-09-14 decline (picker needs
     disambiguation); keep optional, mention to her.
  Polish unchanged. Builds on top of merged PR #123.
- If John reports a script failure on #123, open a fix branch off
  feature/lrm-12-multi-blast-ui scope, not a rebuild.

## Files that matter
`docs/specs/lrm-11-multi-blast-week.md` — the approved spec for both tickets, incl. acceptance script
`src/pages/training/MeetingsAndFocusTab.tsx` — all LRM-12 UI lives here (stack, picker, discard, recipient dialog)
`src/lib/leadWeekBlastSources.ts` — source picker pure state (new in LRM-12)
`src/lib/leadWeekBlasts.ts` — list-based slot state, countSentBlasts, badge labels
`src/hooks/useLeadWeekBlasts.tsx` — generateDraft(includeFocus/meetingIds), deleteDraft
`supabase/functions/lead-week-blast/draftValidation.ts` — strict payload parsing (deployed)
`supabase/migrations/20260917160000_lrm11_multi_blast_week.sql` — applied to prod already, do not re-apply

## Open questions
- None for building. John's live checks that code QA could not do:
  fast double-click the picker's Draft button (must not create two
  drafts), and the discard-during-send window's toast copy.

## Do not re-derive
- The LRM-11 backend is LIVE in prod and invisible until PR #123
  publishes. Do not re-apply the migration or redeploy the function.
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

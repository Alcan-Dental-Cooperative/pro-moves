# Session state — 2026-09-17

## The job
Diagnose Ariyana's two blast complaints (no Polish option, one blast per week)
and spec the fix. Done: spec approved, build is next.

## Done
- Diagnosed: both complaints are one situation. Her week-of-9/14 blast is
  already sent, so the week slot renders read-only. Polish shipped in LRM-8
  and works, but only renders on a draft. Verified against live DB.
- Confirmed the 1-per-week gate is deliberate and three-layered: DB unique
  constraint on (created_by, week_start_date), edge fn 409 on re-send, UI
  read-only sent view.
- Wrote and John approved `docs/specs/lrm-11-multi-blast-week.md` (Gate 1
  passed 2026-09-17).
- Created Motion tickets LRM-11 (tk_LdZD7MGpr55WMfdv5gugpk) and LRM-12
  (tk_azGFnf7UCeGoGiXP7vRmJA) on MyProMoves Dev Board, both now
  stage:spec-approved, lane:medium.

## Next
- Run `/build LRM-11` on a fresh branch off latest main
  (feature/lrm-11-multi-blast-week): migration dropping the week unique
  constraint + partial unique index (one draft per author per week where
  status='draft'), handleDraft gains include_focus + meeting_ids params,
  useLeadWeekBlasts returns all week rows + deleteDraft mutation.
- LRM-12 (UI) builds after LRM-11 on its own branch.

## Files that matter
`docs/specs/lrm-11-multi-blast-week.md` — the approved spec; read first
`supabase/functions/lead-week-blast/index.ts` — handleDraft (~line 187) amalgamates the week; handleSend already keyed by blast id, carries over
`supabase/migrations/20260825220000_lrm2_lead_week_blasts.sql` — the unique constraint to relax
`src/lib/leadWeekBlasts.ts` — pure slot-state helpers; deriveBlastSlotState must take a list
`src/pages/training/MeetingsAndFocusTab.tsx` — BlastSlot, composer, recipient dialog (all inline here)
`src/hooks/useLeadWeekBlasts.tsx` — already fetches a list; tab maps week to one row today

## Open questions
- None. All design choices locked in the spec's "Decisions locked" section.

## Do not re-derive
- Polish is live in prod; not a missing feature. Do not rebuild it.
- Test send emails only the logged-in author, never doctors. QA hard rule:
  never complete a real send; stop at the confirm dialog (in spec + LRM-12
  ticket).
- Migration apply order: constraint relax is the safe direction, apply
  before frontend deploy. Lovable owns migration filenames; ship SQL via
  dashboard SQL editor or land on main (see CLAUDE.md).
- masquerade cannot see Ariyana's data (author-scoped RLS); QA authors its
  own focus/meetings/blasts.
- Send must preserve the PR #116 WYSIWYG guarantee: send the visible text
  or be disabled.

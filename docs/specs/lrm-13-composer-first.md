# LRM-13: Composer-first blast editor

Status: APPROVED (Gate 1, John, 2026-09-18)
Date: 2026-09-18
Lane: medium (one ticket, internally ordered)

## What and why

LRM-11/12 gave Ariyana capacity (many blasts per week) and targeting (pick
sources and recipients), but the composer still leads with AI: "Draft blast"
generates a summary before she has typed a word, and the machinery around it
(source picker with a focus checkbox, a manual Save draft button, a discard
link she called "essentially invisible" in live testing) treats her as the
editor of the AI's text rather than the author of her own. LRM-13 flips that.
The composer opens blank and she writes, with "Summarize meeting" available
as a tool she reaches for, not a step she starts from. The summary itself
gets a fixed, warm template that always leads with the week's focus, restated
in plain aspirational language instead of quoted verbatim. Saving becomes
automatic, meetings get optional titles so the picker can tell "Fri 9/12" and
"Fri 9/12" apart, and Discard gets a findable home.

## Decisions locked (from John, 2026-09-18, second pass)

1. **Blank composer.** "Draft blast" opens an empty editor with no
   auto-generation. She writes herself, or clicks "Summarize meeting".
2. **Meetings-only summarize modal.** No focus checkbox. When the week has
   exactly one meeting, it comes pre-selected. If the editor already has
   text, a confirm dialog warns "this will replace your text", then the
   summary REPLACES the editor content. Never append (decided; overrides an
   earlier lean).
3. **Focus is always part of the summary output**, not a source option. Fixed
   template:
   > Hey there! This week's Lead RDA Focus is: {focus rephrased as a
   > complete plain-language aspirational statement}
   >
   > At this week's Lead RDA meeting, we discussed: {bulleted summary of the
   > checked meetings}
   The focus block sits at the top as its own unit so she can delete it in
   one gesture on off weeks.
4. **Two deliberate prompt-rule reversals**, stated here so the builder does
   not "fix" them: the greeting ban is lifted for this fixed opener ("Hey
   there!"), and focus items are REPHRASED as aspirational statements, no
   longer quoted verbatim.
5. **Save draft button removed.** Debounced autosave (save on idle and on
   blur). The PR #116 persist-before-send guarantee stays regardless.
6. **Optional meeting titles.** Nullable, additive `title` column on
   `lead_meetings`. Labels become day abbreviation + date + title, e.g.
   "Fri 9/14 · Meeting with Jenny"; just "Fri 9/14" when untitled. This
   reverses Ariyana's 2026-09-14 decline because the picker now needs
   disambiguation; keep it optional and mention the change to her.
7. **Relocate Discard draft.** The current quiet link below the action row
   (`MeetingsAndFocusTab.tsx:918`) is invisible in practice. Give it an
   obvious home in the redesigned composer: visible without scrolling
   whenever a draft is open, clearly quieter than Send, still behind the
   existing confirm dialog.

## How it works today (for the builder)

- "Draft blast" opens `SourcePickerDialog`
  (`src/pages/training/MeetingsAndFocusTab.tsx:1010`) with a focus checkbox
  plus one checkbox per meeting, then calls `generateDraft(weekStartDate,
  includeFocus, meetingIds)` (edge action `draft`) and inserts the result
  via `createBlast`. LRM-13 replaces this dialog with the meetings-only
  summarize modal and moves generation behind the "Summarize meeting"
  button; "Draft blast" just creates an empty draft and opens the composer.
- The generation prompt lives in
  `supabase/functions/lead-week-blast/index.ts`. Lines 267-269 demand focus
  items VERBATIM ("never paraphrase, reword, or summarize"); lines 275-276
  ban greetings and sign-offs. Both rules change per decision 4. The
  `HTML_OUTPUT_RULES` (lines 81-91: only `<p> <ul> <ol> <li> <strong> <em>
  <br>`) stay as they are; the fixed opener must be emitted within those
  tags.
- The `polish` action shares the greeting ban. It must be updated to
  preserve an existing "Hey there!" opener rather than stripping it,
  otherwise polish will undo the template.
- Saving is manual today: a Save draft button at
  `MeetingsAndFocusTab.tsx:869` calls `updateBlastBody`. The stale-content
  guard `needsSaveBeforeSend` (`src/lib/leadWeekBlastHtml.ts:185-197`,
  compares edited vs saved body/subject) auto-saves before Send/Test-send.
  Autosave layers on top: debounce on idle (roughly 1.5-2s after typing
  stops) and flush on blur, always through `updateBlastBody`, which already
  scopes to `status = 'draft'`. Keep `needsSaveBeforeSend` as the backstop.
- **Save-state indicator (added 2026-09-18).** A quiet indicator replaces
  the Save button's slot, and it tracks DIRTY STATE, not the network
  request, so it never flickers: the moment editor content diverges from
  the saved copy it shows a muted "Saving…", holds through typing and the
  debounce wait, and flips once to a green "Saved" (`--status-complete`
  token, never a hardcoded green) when the write lands. Default state on
  open is "Saved". If a save fails, show a non-green "Not saved" state;
  Send stays guarded by the `needsSaveBeforeSend` backstop either way.
- `lead_meetings` (`supabase/migrations/20260825210000_lrm1_lead_meetings.sql`)
  has no title column. Labels come from `formatDateForDisplay`
  (`src/lib/dateInputMask.ts:34`, MM/DD/YYYY). New label format needs day
  abbreviation + short date (+ title when present) and applies in
  `MeetingSlot` (line 411) and the summarize modal (today line 1047).
- The one-open-draft rule (LRM-11 partial index) is untouched: blank drafts
  count as the week's single open draft exactly like generated ones.
- Summarize replaces the BODY only. The subject keeps whatever she typed,
  or the existing default when empty.
- Edge `draft` payload (`draftValidation.ts`): `include_focus` and
  `meeting_ids` stay accepted for compatibility; the UI now always sends
  the checked `meeting_ids`, and the function includes the focus block
  whenever the week has a published focus (no published focus: omit the
  focus block entirely, no placeholder, and open with the meetings line).

## Build order (one ticket)

1. Migration: additive nullable `title text` on `lead_meetings`. Additive,
   so it may be applied to prod before the frontend publishes (old code
   ignores the new column). Apply via the Supabase SQL editor, idempotent
   (`ADD COLUMN IF NOT EXISTS`).
2. Edge function: new fixed-template prompt (rephrased focus, lifted
   greeting ban for the opener), polish-action compatibility, redeploy via
   Supabase MCP `deploy_edge_function` (index.ts + draftValidation.ts +
   htmlUtils.ts, verify_jwt true). Backward compatible with the live UI:
   the old picker's payloads still validate, only the generated text style
   changes ahead of the publish.
3. UI: blank-composer flow, summarize modal, autosave, title field on the
   meeting form, new labels, discard relocation.

## Acceptance script (for John, as the lead persona)

1. Open the training surface, pick a week with a published focus and at
   least one meeting. Click "Draft blast": the composer opens EMPTY. No AI
   text appears on its own.
2. Type a sentence: a muted "Saving…" appears and holds steadily while you
   type (no flickering). Stop typing for a few seconds: it flips once to a
   green "Saved". Reload the page: your sentence is still there. There is
   no Save draft button anywhere.
3. Click "Summarize meeting": a modal lists only meetings (no focus
   checkbox). With one meeting in the week it is already checked. Confirm:
   because the editor has your sentence, a dialog warns the summary will
   replace your text. Accept: the editor now shows "Hey there! This week's
   Lead RDA Focus is: …" with the focus restated in plain aspirational
   language (NOT the verbatim focus wording), then "At this week's Lead RDA
   meeting, we discussed:" with bullets. Your typed sentence is gone, not
   appended to.
4. Select and delete the focus block at the top in one gesture; the meeting
   summary below survives intact.
5. Log or edit a meeting: an optional Title field exists. Leave it blank on
   one meeting, set "Meeting with Jenny" on another. The meeting list and
   the summarize modal show "Fri 9/14 · Meeting with Jenny" and the untitled
   one as just its day + date.
6. With a draft open, find Discard without hunting: it is visible without
   scrolling, obviously quieter than Send, and still asks for confirmation.
7. Test send only (emails yourself). Never complete a real Send.

## Personas to test as

Lead (the authoring persona, Ariyana's surface). QA authors its own focus,
meetings, and blasts (author-scoped RLS; masquerade cannot see hers).

## Out of scope

- Recipient picker rework (LRM-6 grouping/search stays parked).
- Any change to send/recipients/one-open-draft backend behavior (LRM-11).
- Required titles or backfilling titles on existing meetings.
- Changes to meeting logging beyond the title field.
- Restyling the rest of the tab.

## DB impact

One additive migration: `lead_meetings.title text` nullable. Safe to apply
before the frontend ships. No backfill, no RLS change (existing policies
are row-scoped, column-agnostic). Not a versioned framework table, so no
`app.change_reason` needed.

## Docs the builder must read

- This spec, plus `docs/specs/lrm-11-multi-blast-week.md` for the shipped
  slot model it builds on.
- CLAUDE.md sections "Data model & terminology" and "Applying migrations"
  (db push does not work here; SQL editor or Lovable).
- `docs/management-model.md` for the coaching/lead surface.
- `docs/testing.md` for the Supabase test double; `docs/dev/lint-policy.md`.
- CLAUDE.md design system conventions (tokens, icon sizes, no hardcoded
  colors).

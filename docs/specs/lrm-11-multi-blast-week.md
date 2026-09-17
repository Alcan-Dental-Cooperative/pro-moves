# LRM-11 / LRM-12: Multiple doctor blasts per week

Status: awaiting approval (Gate 1)
Date: 2026-09-17
Lane: medium (two tickets, ordered)

## What and why

Ariyana is having more one-off Lead RDA meetings than the week-atom design
expected, and she wants to email doctors about them as they happen: sometimes
the whole cohort, sometimes just a couple of doctors tied to one meeting.
Today the system hard-gates her to one blast per week at three layers (a DB
unique constraint, an edge-function 409, and a read-only sent view), so once
the weekly blast goes out the surface is closed until Monday. The week stays
the atom: blasts still live inside their week and accumulate in the historical
record. What changes is capacity and targeting. She can send as many blasts as
she needs in a week (one open draft at a time), choose which of the week's
sources each draft draws from, and pick a small recipient list without
unchecking fourteen boxes. The surface stays valuable to us precisely because
she does this here instead of in her personal email: everything she sends
doctors is on the record in our system.

## Decisions locked (from John, 2026-09-17)

- Week remains the atom. Blasts anchor to their week and stack there.
- Unlimited sent blasts per week; exactly one unsent draft at a time. She
  finishes or discards the current draft before starting another.
- Draft source picker: when drafting, the week's published focus and each
  logged meeting appear as checkboxes, all checked by default. Unchecking
  down to one meeting produces a targeted draft. At least one source must
  stay checked.
- Recipient dialog keeps the existing exclusion model and checkbox list, and
  gains a Select all / Select none toggle so a two-doctor send is: Select
  none, check two names.
- No full audience-picker rework. LRM-6 style grouping/search stays parked.

## How it works today (for the builder)

- `lead_week_blasts` has `unique (created_by, week_start_date)`: the schema
  itself forbids a second blast row in a week
  (`supabase/migrations/20260825220000_lrm2_lead_week_blasts.sql`).
- `deriveBlastSlotState` in `src/lib/leadWeekBlasts.ts` treats the week's
  single row as the slot: `sent` is terminal and renders the read-only
  summary in `BlastSlot` (`src/pages/training/MeetingsAndFocusTab.tsx`).
- The edge function's `handleDraft`
  (`supabase/functions/lead-week-blast/index.ts`) always amalgamates the
  whole week: it loads the published focus plus every meeting transcript for
  `week_start_date`.
- `handleSend` is already keyed by blast id and atomically claims
  `status = 'sent'`; that logic carries over unchanged.
- The recipient review UI lives inside `MeetingsAndFocusTab.tsx`
  (`reviewOpen` / `recipients` / `excludedIds`) and stores exclusions in
  `excluded_staff_ids`.
- `useLeadWeekBlasts` already fetches a list of rows; the tab currently maps
  each week to at most one.

## Ticket breakdown

### LRM-11: data model and edge function (build first)

1. **Migration** `YYYYMMDDHHMMSS_lrm11_multi_blast_week.sql`:
   - Drop `unique (created_by, week_start_date)`.
   - Add a partial unique index on `(created_by, week_start_date)` where
     `status = 'draft'`: the DB itself enforces one-open-draft-at-a-time
     while allowing any number of sent rows.
   - Idempotent (`IF EXISTS` / `IF NOT EXISTS`), per CLAUDE.md migration
     rules. No `app.change_reason` needed (not a framework table).
2. **Edge function `handleDraft`** accepts optional `include_focus`
   (boolean, default true) and `meeting_ids` (uuid array, default all of the
   week's meetings). It loads only the selected sources, verifies each
   meeting id belongs to the caller and the week, and keeps the existing
   guard: at least one non-empty source or 400. The prompt already handles
   focus-only and meeting-only drafts.
3. **`useLeadWeekBlasts`** returns all of a week's rows; add a
   `deleteDraft` mutation (discarding a draft is now meaningful since a new
   one can follow). RLS already scopes deletes to the author; verify.

DB apply order: migration first, then deploy. Relaxing a constraint is safe
under the currently deployed frontend, which can only ever create one row
per week anyway (see the db-ddl-must-lag-deploy rule; this is the safe
direction).

### LRM-12: week slot UI (build after LRM-11)

1. **`BlastSlot` becomes a stack**: sent blasts render as the existing
   read-only summary cards, newest last, each with its sent line
   (`Sent <date> · N doctors`). Below the stack: the open draft's composer
   if one exists, else a "New blast" button (enabled by the same
   `canDraftBlast` rule). The composer keeps everything from LRM-4/8/10:
   subject, rich text, Polish, Regenerate, Save draft, Test send, Send, and
   the WYSIWYG persist-before-send guarantee from PR #116.
2. **Source picker**: starting a new draft (and Regenerate) shows the
   week's focus and meetings as labeled checkboxes, all checked, before
   calling the edge function. Meetings are labeled by their date. Disabled
   Draft button while zero sources are checked.
3. **Discard draft**: a quiet action on the composer so she can abandon a
   targeted draft without sending it. Confirm before discarding.
4. **Pipeline chip and month glyphs**: `deriveBlastSlotState` and friends
   now take the week's blast list. Chip shows the most advanced state
   (any sent -> completed); when more than one blast is sent, the badge
   label carries the count ("2 sent"). Month view glyphs must tolerate
   multiple rows without change in meaning.
5. **Recipient dialog**: Select all / Select none toggle above the list.
   Storage stays `excluded_staff_ids` (Select none = all excluded, then
   each check removes an exclusion). The confirm copy drops "It cannot be
   sent twice" and instead states the live included count.

## Acceptance script (for John)

Hard rule for QA: doctors must never receive email from testing. Test send
is safe by design (the edge function emails only the logged-in author's own
inbox, never the doctor list). The real Send button is the only path that
reaches doctors, so in prod the script stops at the confirm dialog and
never completes a real send. Ariyana's first real use is the final check.

1. Open /training as yourself, Meetings and Focus tab, current week.
2. With a published focus and at least two logged meetings in the week:
   click Draft blast. Expect a source picker listing the focus and both
   meetings, all checked.
3. Uncheck everything. Expect the Draft button to disable. Check one
   meeting only, draft. Expect the draft body to reference only that
   meeting, not the focus items.
4. Save the draft, then Send. In the recipient dialog, click Select none,
   then check exactly two doctors. Expect the confirm copy to say it will
   email 2 doctors. STOP at the confirm and cancel; never complete a real
   send during QA. Use Test send to verify delivery formatting (it emails
   only your own inbox).
5. After a blast is sent, expect the week to show the sent blast as a
   read-only card AND a "New blast" button below it.
6. Start a second draft, use Polish on it. Expect Polish to work exactly as
   on the first draft.
7. Discard the second draft. Expect a confirm, then the week returns to
   the sent card plus "New blast".
8. Check the week chip and Month view: a week with one or more sent blasts
   reads as complete; a week with two sent shows "2 sent" on the blast
   badge.

## Personas to test as

- Ariyana's persona (super-admin /training surface) as the primary. Note:
  masquerade cannot see her real data (author-scoped RLS), so QA walks the
  script with its own authored data.
- Doctor persona receives nothing new (email only); no doctor-surface
  changes.

## Out of scope

- Audience grouping, search, or location scoping in the recipient dialog
  (parked LRM-6 territory).
- Multiple simultaneous open drafts.
- Any change to the internal summary, focus, or meeting slots.
- Comms-rework delivery channels; this stays email via Resend.
- Doctor quick-note capture (parked separately with John).

## DB impact

One migration (LRM-11 step 1): drop the week unique constraint, add the
partial unique index for drafts. Apply before deploying the frontend.

## Docs the builder must read

| Area | Doc |
|---|---|
| This spec | `docs/specs/lrm-11-multi-blast-week.md` |
| Week-atom design | `docs/specs/lrm-lead-meeting-bulletin-and-doctor-roster.md` |
| Recipient review | `docs/specs/lrm-4-blast-recipient-review.md` |
| Slot presentation | `docs/specs/lrm-3-meetings-focus-polish.md` |
| Schema / migrations | CLAUDE.md "Applying migrations"; `supabase/migrations/2026082*_lrm*.sql` |
| Testing | `docs/testing.md`, `docs/dev/lint-policy.md` |
| Send-trap lesson | Any composer change must keep the persist-before-send guarantee (PR #116): a send action sends the visible text or is disabled. |

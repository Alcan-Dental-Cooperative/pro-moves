# Fix: Reports export should produce the staff review workbook on its own

**Lane:** feature + bug fixes
**Status:** spec, not started (written 2026-09-29)
**Main file:** `src/components/admin/eval-results-v2/EvaluationsExportTab.tsx` (EET)

## Why

For the Q3 2026 leadership staff review, the Admin > Reports export could not
produce what was needed, so the spreadsheet was pulled by hand from the
database. The goal: next quarter, John picks the quarter and scope in the
Reports tab and downloads one file that is ready for the meeting.

What the meeting needed (and what the hand-built file had), one workbook:

1. **Summary** tab, one row per person: Location, Name, Role, Completion %,
   On-Time %, Due, Submitted, On-Time, Late, Missing, Last Submission,
   eval status (Released / Submitted, not yet released / No eval), eval date,
   evaluator, Observer Avg, Self Avg, one "<Domain> Observer" column per domain.
2. **Competencies & Notes** tab, one row per evaluation item: Location, Name,
   Role, Domain, Competency, Observer Score, Self Score, Glow, Grow.
3. **About this data** tab explaining the definitions in plain language.

Evaluations = every SUBMITTED evaluation for the quarter, released or not.
Drafts never count. Notes = glows and grows only (`observer_glow`,
`observer_grow`); newer evals use these instead of `observer_note`.

## What is already right (verified against live data 2026-09-29)

- Participation math (`get_staff_submission_windows` +
  `calculateSubmissionStats`) is correct for quarter mode: every Q3 score
  matched a window, no submitted score was counted missing, excused weeks and
  excused submissions are removed. Keep this path.
- Competency averages already filter `status = 'submitted'` and include
  unreleased evals.
- Paused staff being left out is fine: paused = no longer with Alcan.

## Changes

1. **Add glow/grow notes** to the export (the Competencies & Notes tab).
2. **Drafts leak into domain averages.** `get_eval_distribution_metrics` has no
   `status = 'submitted'` filter (confirmed on the live function). Simplest
   fix: compute domain and overall averages client-side from the same raw
   `evaluation_items` query the competency file uses, and stop using the RPC
   for the export. This also removes the double rounding (RPC rounds each
   eval x domain to 1 decimal, export re-weights by COUNT(*) including N/A
   items and shows 2 decimals).
3. **Silent 1000-row cap.** The competency query (EET ~463-483) is not
   paginated; hosted PostgREST returns at most 1000 rows. Alcan Q3 was already
   720 items, so one more location or a bigger rubric silently drops rows.
   Paginate with `.range()` until a short page.
4. **Swallowed errors.** `const { data } = await supabase.rpc(...)` ignores
   `error` (EET ~412, ~449), so a failure shows as a blank rate. Surface it
   (toast + abort, or mark the row "error").
5. **One .xlsx with tabs** instead of two CSVs (the repo has no xlsx library
   today; `exceljs` or `xlsx` would be new, confirm the choice). Keep the CSV
   option if cheap.
6. **Baseline period exports all-time participation** because the disabled
   checkboxes stay true (EET ~390, ~803-818). Skip participation when Baseline
   is selected.
7. **Custom end date in the future is not capped at now** (EET ~398-400), so
   upcoming weeks count as Missing. Cap it like quarter mode does.
8. **Last Submission shows the UTC date.** Use Central (or location) date.
9. **Self-assessment per domain (asked for after the Q3 file was built).**
   The eval's "self" number is the weekly performance average stored per
   item in `evaluation_items.self_score_avg` with `self_score_sample_size`
   (the eval page shows it as "avg of N weekly submissions", only when
   N >= 1, with a caution tag at N = 1). `self_score` is just that value
   rounded to a whole number (all 513 Q3 Alcan items matched), so the Q3
   hand-built file's "Self Score" column is the rounded version. Export
   `self_score_avg` and N per competency, and a per-domain self average
   weighted by N, next to the observer domain columns.

## Decision for John before building

- **Backfilled weeks count as on time.** Entries made through the backfill
  feature are stored with `*_late = false` even when entered weeks later. In
  Q3 this only affected demo (Bluebird) accounts, so it did not change the
  review. Keep as is, or count them late / show them separately?

## Acceptance

- Reports tab, Quarter = 2026 Q3, scope = Alcan Pediatric Dental (Bluebird
  unselected), download: the workbook matches the hand-built
  `Pro Moves Q3 2026 Staff Review.xlsx` on headcount, every participation
  count, every competency score, and every glow/grow (spot check 5 people
  and total row counts).
- A draft eval with scores does not change any average.
- A scope with more than 1000 evaluation items exports all of them.
- Forcing an RPC error shows an error instead of blank cells.

// Pure helpers for the doctor blast slot (LRM-2), kept separate from React
// so the "can I draft" rule, slot-state derivation, and confirm-copy
// builders are unit-testable without touching Supabase, React Query, or the
// edge function. Mirrors the leadMeetingsAndFocus.ts pattern from LRM-1.

import type { LeadWeekBlastRow } from '@/types/leadWeekBlasts';
import type { BadgeStatus } from '@/components/ui/StatusBadge';
import { hasBlastBodyContent } from '@/lib/leadWeekBlastHtml';

/**
 * The one hard rule (see spec "Decisions locked"): a blast needs at least a
 * published focus or a logged meeting to draft from. Everything else about
 * the pipeline is shown, not enforced.
 */
export function canDraftBlast(hasPublishedFocus: boolean, meetingCount: number): boolean {
  return hasPublishedFocus || meetingCount > 0;
}

/** Blast slot state vocabulary, independent of how it's badged in the UI. */
export type BlastSlotState = 'none' | 'draftable' | 'draft' | 'sent';

/**
 * Derives the blast slot's state for a given week from what the week
 * contains (focus, meetings) and the week's blast rows.
 *
 * LRM-12: a week can now hold any number of sent blasts plus at most one
 * open draft (see the LRM-11 partial unique index), so this takes the
 * week's whole blast list rather than a single row. Any sent blast reads
 * as the most advanced state -- "sent" is terminal for the slot even while
 * a further targeted draft is open underneath it.
 */
export function deriveBlastSlotState(
  hasPublishedFocus: boolean,
  meetingCount: number,
  blasts: LeadWeekBlastRow[],
): BlastSlotState {
  if (blasts.some((b) => b.status === 'sent')) return 'sent';
  if (blasts.some((b) => b.status === 'draft')) return 'draft';
  return canDraftBlast(hasPublishedFocus, meetingCount) ? 'draftable' : 'none';
}

/** LRM-12: how many of a week's blasts have already been sent, for the
 * "2 sent" badge label. */
export function countSentBlasts(blasts: LeadWeekBlastRow[]): number {
  return blasts.filter((b) => b.status === 'sent').length;
}

/** LRM-12: all of a week's blast rows (unsorted), the input to the stacked
 * slot UI -- BlastSlot separates this into its sent cards and its one
 * possible open draft. */
export function blastsForWeek(blasts: LeadWeekBlastRow[], weekStartDate: string): LeadWeekBlastRow[] {
  return blasts.filter((b) => b.week_start_date === weekStartDate);
}

/**
 * Maps a blast slot state to the StatusBadge vocabulary per the ticket:
 * no draftable content -> locked, draftable but undrafted -> not_started,
 * draft saved -> draft, sent -> completed.
 */
export function blastSlotBadgeStatus(state: BlastSlotState): BadgeStatus {
  switch (state) {
    case 'none': return 'locked';
    case 'draftable': return 'not_started';
    case 'draft': return 'draft';
    case 'sent': return 'completed';
  }
}

/**
 * Body copy for the recipient review dialog's confirm description, with the
 * live included count built in (updates as she checks/unchecks doctors).
 * Kept as a pure function so the exact wording is unit-testable without
 * rendering the dialog.
 *
 * LRM-12: dropped "It cannot be sent twice" (a blast can now be followed by
 * another, so the line was no longer true) in favor of naming exactly who
 * this send reaches, since the count now changes live as she uses the
 * Select all / Select none toggle and per-doctor checkboxes.
 */
export function buildSendConfirmBody(includedCount: number): string {
  const doctorWord = includedCount === 1 ? 'doctor' : 'doctors';
  return `This will email ${includedCount} ${doctorWord}.`;
}

/**
 * QA fix: a week with zero eligible doctors must not open the send confirm
 * at all -- there is nothing useful to confirm, and letting it through just
 * produces a 400 from the edge function after the fact.
 */
export function canConfirmSend(recipientCount: number): boolean {
  return recipientCount > 0;
}

/**
 * The read-only summary line for a sent blast. QA fix: a partial failure
 * (some sends failed) must stay visible in the summary, not round up to a
 * clean "sent to everyone" once failedCount is dropped or ignored.
 */
export function formatSentSummary(recipientCount: number, failedCount: number): string {
  const successCount = Math.max(0, recipientCount);
  const failures = Math.max(0, failedCount);
  if (failures <= 0) {
    return `${successCount} doctor${successCount === 1 ? '' : 's'}`;
  }
  const total = successCount + failures;
  return `${successCount} of ${total} doctor${total === 1 ? '' : 's'}`;
}

/**
 * LRM-3 B4: UI wording override for the 'none' blast state's badge. The
 * status token stays 'locked' so the color/icon still match every other
 * locked state, but the label softens from "Locked" to "Waiting" per the
 * show-do-not-lock principle -- an empty week isn't locked, it's just
 * waiting on a focus or meeting to draft from.
 *
 * LRM-12: also carries the sent count once a week has more than one sent
 * blast ("2 sent") -- a single sent blast keeps the plain "Complete" label
 * from StatusBadge's own default, unchanged from before this ticket.
 */
export function blastBadgeLabel(state: BlastSlotState, sentCount = 0): string | undefined {
  if (state === 'none') return 'Waiting';
  if (state === 'sent' && sentCount > 1) return `${sentCount} sent`;
  return undefined;
}

/**
 * Whether clicking "regenerate" while a draft exists should interrupt with
 * a "Replace the current draft? Your edits will be lost." confirm, versus
 * regenerating straight away. Only interrupts if the draft body currently
 * on screen differs from the last generated/saved value -- i.e. there is
 * something hand-edited that would actually be lost.
 */
export function shouldConfirmRegenerate(currentBody: string, lastGeneratedBody: string): boolean {
  return currentBody.trim() !== lastGeneratedBody.trim();
}

/**
 * LRM-4: the subject a fresh draft proposes, and what a blank subject field
 * displays as a placeholder before she has typed her own. Mirrors
 * supabase/functions/lead-week-blast/index.ts's buildDefaultSubject -- keep
 * the two in sync if this wording changes. weekStartDate is a YYYY-MM-DD
 * Monday, read in the browser's local calendar the same way the rest of
 * this tab's date labels are (see MeetingsAndFocusTab.tsx's `parse`).
 */
export function buildDefaultBlastSubject(weekStartDate: string): string {
  const date = new Date(weekStartDate + 'T12:00:00');
  const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `This week with your Lead RDAs: Week of ${formatted}`;
}

/**
 * LRM-8: whether the Polish button should be enabled. Mirrors the other
 * draft-slot buttons' disabled rule (see Regenerate/Send in
 * MeetingsAndFocusTab.tsx) -- there has to be text to polish, and no other
 * generation (drafting, regenerating, or a previous polish) can already be
 * in flight. The "blast is sent" case is handled separately: the draft
 * editor, and this button with it, is only ever rendered while the blast's
 * status is 'draft' in the first place.
 *
 * LRM-10: `body` is HTML since the composer moved to RichTextEditor, so
 * emptiness is checked with hasBlastBodyContent rather than a bare
 * `.trim()` -- a blank Quill document is `<p><br></p>`, not `''`, and would
 * otherwise read as "has text" forever.
 */
export function canPolish(body: string, busy: boolean): boolean {
  return hasBlastBodyContent(body) && !busy;
}

/**
 * LRM-4: the "(X excluded)" suffix appended to the sent summary, omitted
 * entirely when nothing was excluded (omit-absent-content rule -- a sent
 * blast with no exclusions should read exactly as it did before this
 * ticket).
 */
export function buildExcludedSuffix(excludedCount: number): string {
  return excludedCount > 0 ? ` (${excludedCount} excluded)` : '';
}

/**
 * LRM-11: a week can now hold any number of sent blasts plus at most one
 * open draft (enforced by the DB's partial unique index). This picks WHICH
 * single row is "active": the open draft if there is one (she's mid work on
 * it), otherwise the most recently sent blast (by sent_at, falling back to
 * created_at for a sent row that predates sent_at being stamped). Returns
 * null for a week with no blasts at all. The input list is expected to
 * already be filtered to one week; see selectActiveBlastForWeek for the
 * convenience wrapper that does that filtering too.
 *
 * LRM-12: the stacked-cards slot UI shows the week's WHOLE blast list (see
 * blastsForWeek) rather than a single active row, so this and
 * selectActiveBlastForWeek are no longer called from MeetingsAndFocusTab.
 * Kept, and still covered by tests, in case a single-row "what's active"
 * check is useful elsewhere later.
 */
export function selectActiveWeekBlast(weekBlasts: LeadWeekBlastRow[]): LeadWeekBlastRow | null {
  const draft = weekBlasts.find((b) => b.status === 'draft');
  if (draft) return draft;

  const sent = weekBlasts.filter((b) => b.status === 'sent');
  if (sent.length === 0) return null;

  return sent.reduce((newest, candidate) => {
    const newestTime = newest.sent_at ?? newest.created_at;
    const candidateTime = candidate.sent_at ?? candidate.created_at;
    return candidateTime > newestTime ? candidate : newest;
  });
}

/**
 * LRM-11: filters an unfiltered blast list down to one week, then applies
 * selectActiveWeekBlast's draft-first-else-newest-sent rule. This is what
 * MeetingsAndFocusTab calls in place of the old single-row `.find` now that
 * a week can hold more than one row.
 */
export function selectActiveBlastForWeek(blasts: LeadWeekBlastRow[], weekStartDate: string): LeadWeekBlastRow | null {
  return selectActiveWeekBlast(blasts.filter((b) => b.week_start_date === weekStartDate));
}

// Pure helpers for LRM-3's presentation-layer fixes to the Meetings and
// Focus tab (pipeline chip row, month-view glyphs, past-week badge
// suppression, and the Builder dirty check). Kept separate from
// MeetingsAndFocusTab.tsx so this logic is unit-testable without React.

import type { HydratedFocusWeek } from '@/types/leadFocus';
import type { LeadMeetingRow } from '@/types/leadMeetings';
import type { LeadWeekBlastRow } from '@/types/leadWeekBlasts';
import {
  deriveFocusSlotState, deriveMeetingSlotState, type SlotState,
} from './leadMeetingsAndFocus';
import { deriveBlastSlotState, blastSlotBadgeStatus, blastBadgeLabel, type BlastSlotState } from './leadWeekBlasts';

/** Whether the selected week is before, on, or after the current week. */
export type WeekWhen = 'past' | 'current' | 'future';

/** The chip-row / month-glyph status vocabulary: the subset of StatusBadge's
 * BadgeStatus that this page's three slots actually produce. */
export type PipelineChipStatus = 'not_started' | 'completed' | 'draft' | 'locked';

export interface PipelineChip {
  key: 'focus' | 'meeting' | 'blast';
  label: string;
  status: PipelineChipStatus;
  /** StatusBadge label override, e.g. softening 'locked' to "Waiting". */
  badgeLabel?: string;
}

/**
 * Builds the three-chip pipeline summary row (W2) from the slot states
 * already computed at the top of MeetingsAndFocusTab. Pure so the chip
 * model (which chip, what status, what label override) is testable
 * without rendering anything.
 */
export function buildPipelineChips(
  focusState: SlotState,
  meetingState: SlotState,
  blastState: BlastSlotState,
  sentBlastCount = 0,
): PipelineChip[] {
  // blastSlotBadgeStatus's declared return type is StatusBadge's full
  // BadgeStatus union (shared across the whole design system); its switch
  // only ever actually returns the four values PipelineChipStatus covers.
  const blastStatus = blastSlotBadgeStatus(blastState) as PipelineChipStatus;
  return [
    { key: 'focus', label: 'Focus', status: focusState },
    { key: 'meeting', label: 'Meeting', status: meetingState },
    { key: 'blast', label: 'Blast', status: blastStatus, badgeLabel: blastBadgeLabel(blastState, sentBlastCount) },
  ];
}

/**
 * Per-week state for the Month view's three tiny glyphs (W4), derived the
 * same way the week-spine's own slot states are: from the hydrated focus
 * week, that week's meetings, and that week's blasts (all already
 * client-side once the three hooks have loaded).
 *
 * LRM-12: takes the week's whole blast list rather than one "active" row --
 * the glyph itself only ever shows a single color/status, so more than one
 * sent blast still just reads as the same "completed" dot the month view
 * has always shown; a count label has no home in a plain color dot.
 */
export interface WeekGlyphStates {
  focus: SlotState;
  meeting: SlotState;
  blast: BlastSlotState;
}

export function deriveWeekGlyphStates(
  week: HydratedFocusWeek | null | undefined,
  meetingsForWeek: LeadMeetingRow[],
  blastsForWeek: LeadWeekBlastRow[],
): WeekGlyphStates {
  const focus = deriveFocusSlotState(week);
  const meeting = deriveMeetingSlotState(meetingsForWeek);
  const blastState = deriveBlastSlotState(focus === 'completed', meetingsForWeek.length, blastsForWeek);
  return { focus, meeting, blast: blastState };
}

/**
 * B2: a past week's slot badge reads as reproach when the slot is empty
 * ("Not started" / "Locked" on a legitimately quiet finished week). Suppress
 * the badge in exactly that case; current/future weeks, and any past week
 * that actually has content, keep showing it.
 */
export function shouldHideEmptyBadge(when: WeekWhen, isEmpty: boolean): boolean {
  return when === 'past' && isEmpty;
}

/** The data a dirty-check compares: the Builder's editable fields, reduced
 * to the values that matter for equality (not the React-only `key`). */
export interface BuilderFieldSnapshot {
  items: { text: string; sourceId: string | null }[];
  framing: string;
}

/**
 * B3: whether the open Builder has unsaved edits relative to the snapshot
 * taken when it was opened (the published/saved state at that time). A
 * changed framing note or any changed/added/removed item counts as dirty.
 * (The separate "write your own" input, and its ownDraft field here, were
 * removed 2026-09-18 -- writing your own now happens in the item slots
 * themselves, so it is covered by the items comparison.)
 */
export function isBuilderDirty(current: BuilderFieldSnapshot, snapshot: BuilderFieldSnapshot): boolean {
  if (current.framing.trim() !== snapshot.framing.trim()) return true;
  if (current.items.length !== snapshot.items.length) return true;
  return current.items.some((item, i) => {
    const base = snapshot.items[i];
    return !base || item.text.trim() !== base.text.trim() || item.sourceId !== base.sourceId;
  });
}

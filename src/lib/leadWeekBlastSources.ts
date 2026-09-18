// LRM-12: pure selection-model logic for the draft source picker (the
// checkboxes shown before a new draft, or a Regenerate, calls the edge
// function). Kept separate from React so the selection state, its
// zero-checked guard, and the request-shape it produces are unit-testable
// without rendering the dialog. Mirrors the leadWeekBlastRecipients.ts
// pattern.

/**
 * What the source picker currently has checked. `checkedMeetingIds` only
 * ever contains ids that were offered to the picker (the week's own
 * meetings) -- the dialog never lets an id in that isn't one of those
 * checkboxes.
 */
export interface DraftSourceState {
  focusChecked: boolean;
  checkedMeetingIds: Set<string>;
}

/**
 * The picker's opening state: everything checked (spec "Decisions locked" --
 * all checked by default), every time it opens, for both a brand-new draft
 * and a Regenerate. `hasPublishedFocus` gates whether the focus checkbox
 * exists at all; a week with no published focus has nothing there to check.
 */
export function buildInitialDraftSourceState(hasPublishedFocus: boolean, meetingIds: string[]): DraftSourceState {
  return { focusChecked: hasPublishedFocus, checkedMeetingIds: new Set(meetingIds) };
}

export function toggleFocusSource(state: DraftSourceState): DraftSourceState {
  return { ...state, focusChecked: !state.focusChecked };
}

export function toggleMeetingSource(state: DraftSourceState, meetingId: string): DraftSourceState {
  const next = new Set(state.checkedMeetingIds);
  if (next.has(meetingId)) next.delete(meetingId);
  else next.add(meetingId);
  return { ...state, checkedMeetingIds: next };
}

/** At least one source must stay checked (spec "Decisions locked"); the
 * Draft/Regenerate button disables when this is false. */
export function hasAnySourceChecked(state: DraftSourceState): boolean {
  return state.focusChecked || state.checkedMeetingIds.size > 0;
}

/** The `include_focus` / `meeting_ids` shape the edge function's handleDraft
 * expects, built from the picker's current selection. `allMeetingIds` fixes
 * the output order to the week's own meeting order rather than Set iteration
 * order. */
export function buildDraftSourceParams(
  state: DraftSourceState,
  allMeetingIds: string[],
): { includeFocus: boolean; meetingIds: string[] } {
  return {
    includeFocus: state.focusChecked,
    meetingIds: allMeetingIds.filter((id) => state.checkedMeetingIds.has(id)),
  };
}

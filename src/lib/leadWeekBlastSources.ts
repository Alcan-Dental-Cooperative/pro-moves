// LRM-13: pure selection-model logic for the "Summarize meeting" modal (the
// meeting checkboxes shown before generateDraft is called to replace the
// composer's body). Kept separate from React so the selection state, its
// zero-checked guard, and the ordered id list it produces are unit-testable
// without rendering the dialog.
//
// Replaces LRM-12's SourcePickerDialog model (buildInitialDraftSourceState /
// toggleFocusSource / hasAnySourceChecked / buildDraftSourceParams): the
// composer no longer offers a focus checkbox at all -- the edge function
// includes the week's published focus automatically whenever one exists
// (see docs/specs/lrm-13-composer-first.md, "How it works today" and
// decision 3), so this module only ever tracks meeting selection.

/**
 * What the "Summarize meeting" modal currently has checked. Only ever
 * contains ids that were offered to the modal (the week's own meetings) --
 * the dialog never lets an id in that isn't one of those checkboxes.
 */
export interface MeetingSelectionState {
  checkedMeetingIds: Set<string>;
}

/**
 * The modal's opening state (spec decision 2): when the week has exactly
 * one meeting, it comes pre-checked. With zero meetings or more than one,
 * nothing starts checked -- she picks explicitly, and the confirm button
 * stays disabled until at least one is checked (see
 * hasAnyMeetingChecked).
 */
export function buildInitialMeetingSelection(meetingIds: string[]): MeetingSelectionState {
  return { checkedMeetingIds: new Set(meetingIds.length === 1 ? meetingIds : []) };
}

export function toggleMeetingSelection(state: MeetingSelectionState, meetingId: string): MeetingSelectionState {
  const next = new Set(state.checkedMeetingIds);
  if (next.has(meetingId)) next.delete(meetingId);
  else next.add(meetingId);
  return { checkedMeetingIds: next };
}

/** At least one meeting must stay checked (spec decision 2); the modal's confirm button disables when this is false. */
export function hasAnyMeetingChecked(state: MeetingSelectionState): boolean {
  return state.checkedMeetingIds.size > 0;
}

/**
 * The `meeting_ids` array generateDraft expects, built from the modal's
 * current selection. `allMeetingIds` fixes the output order to the week's
 * own meeting order rather than Set iteration order.
 */
export function buildSummarizeMeetingIds(state: MeetingSelectionState, allMeetingIds: string[]): string[] {
  return allMeetingIds.filter((id) => state.checkedMeetingIds.has(id));
}

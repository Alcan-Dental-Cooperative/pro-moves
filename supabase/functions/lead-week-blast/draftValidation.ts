// LRM-11: pure helpers for handleDraft's source selection, kept separate
// from index.ts (and from any Supabase/network call) so the selection and
// ownership-validation logic is unit-testable directly. See
// docs/specs/lrm-11-multi-blast-week.md, "LRM-11: data model and edge
// function".

/** What handleDraft's payload asked for, after defaulting. */
export interface DraftSourceSelection {
  /** Default true: an omitted `include_focus` still pulls in the week's published focus. */
  includeFocus: boolean;
  /**
   * `null` means "not specified" -- handleDraft defaults this to every
   * meeting in the week. An explicit `[]` is a real, distinct request for
   * zero meetings (a focus-only draft), not the same as omitting the field.
   */
  meetingIds: string[] | null;
}

/**
 * Parses handleDraft's optional `include_focus` (boolean, default true) and
 * `meeting_ids` (uuid array, default = all of the week's meetings) payload
 * fields. Non-string entries in `meeting_ids` are dropped rather than
 * trusted -- the actual ownership/week check happens in
 * `selectRequestedMeetings` once the caller has the week's own meeting rows
 * in hand.
 */
export function parseDraftSourceSelection(payload: unknown): DraftSourceSelection {
  const p = (payload ?? {}) as Record<string, unknown>;
  const includeFocus = p.include_focus === undefined ? true : !!p.include_focus;
  const meetingIds = Array.isArray(p.meeting_ids)
    ? p.meeting_ids.filter((id): id is string => typeof id === 'string')
    : null;
  return { includeFocus, meetingIds };
}

/**
 * Resolves which of the week's own meetings (already scoped to the caller
 * AND this week_start_date by the query that produced `weekMeetings` -- see
 * handleDraft) should feed the draft. `requestedIds === null` means "no
 * selection was passed", so every one of the week's meetings is used
 * (today's default-amalgamate behavior, unchanged). A non-null list is
 * validated id-by-id against `weekMeetings`: any id that isn't one of the
 * caller's own meetings for this week is rejected outright rather than
 * silently dropped, since a stray id could mean "someone else's meeting" or
 * "wrong week" as easily as a typo.
 */
export function selectRequestedMeetings<T extends { id: string }>(
  weekMeetings: T[],
  requestedIds: string[] | null,
): { valid: true; meetings: T[] } | { valid: false } {
  if (requestedIds === null) return { valid: true, meetings: weekMeetings };

  const byId = new Map(weekMeetings.map((m) => [m.id, m]));
  const selected: T[] = [];
  for (const id of requestedIds) {
    const match = byId.get(id);
    if (!match) return { valid: false };
    selected.push(match);
  }
  return { valid: true, meetings: selected };
}

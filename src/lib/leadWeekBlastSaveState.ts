// LRM-13: pure derivation for the composer's save-state indicator, which
// replaces the old "Save draft" button's slot (see
// docs/specs/lrm-13-composer-first.md). Kept as a standalone function, not
// inline in the component, because the spec calls out a specific failure
// mode to avoid -- flickering on every keystroke -- and that's easiest to
// guarantee and pin with a unit test on a pure function than to eyeball in
// a component.
//
// The indicator tracks DIRTY STATE, not the network request: `dirty` is
// "does the live editor content (body + subject) differ from the last
// successfully saved copy", computed by the caller as a simple !==
// comparison. This function does not know about timers, debouncing, or the
// mutation itself -- the caller re-derives the indicator from whatever
// `dirty` and `lastSaveFailed` are at render time, so the indicator can
// never flicker per keystroke: typing changes `dirty` from false to true
// exactly once (not once per character), and it stays true through the
// whole debounce wait and the save request, only flipping back to false
// when the write actually lands.

export type SaveIndicatorState = 'saved' | 'saving' | 'not_saved';

export interface SaveIndicatorInput {
  /** True the moment live content differs from the last successfully saved copy. */
  dirty: boolean;
  /**
   * True when the most recent save attempt for the CURRENT dirty content
   * failed. The caller resets this to false the instant the user edits
   * again (a fresh edit means a fresh, not-yet-attempted save), so a
   * failure never permanently stalls the indicator on "Not saved" once she
   * starts typing again -- it goes back to "Saving…" like any other edit.
   */
  lastSaveFailed: boolean;
}

/**
 * Default on open, and whenever content is not dirty: 'saved'. Dirty with
 * no failed attempt yet (typing, mid-debounce, or the save request itself
 * in flight): 'saving'. Dirty because the last attempt for this content
 * failed: 'not_saved' -- rendered in a non-green color by the caller, per
 * the spec ("Failed save: a non-green 'Not saved' state").
 */
export function deriveSaveIndicatorState({ dirty, lastSaveFailed }: SaveIndicatorInput): SaveIndicatorState {
  if (!dirty) return 'saved';
  return lastSaveFailed ? 'not_saved' : 'saving';
}

import { describe, it, expect } from 'vitest';
import { deriveSaveIndicatorState } from './leadWeekBlastSaveState';

describe('deriveSaveIndicatorState', () => {
  it('is "saved" by default, when content is not dirty (default state on open)', () => {
    expect(deriveSaveIndicatorState({ dirty: false, lastSaveFailed: false })).toBe('saved');
  });

  it('is "saved" when not dirty even if a previous attempt had failed (a successful save clears both)', () => {
    expect(deriveSaveIndicatorState({ dirty: false, lastSaveFailed: true })).toBe('saved');
  });

  it('is "saving" the moment content is dirty with no failed attempt yet -- covers typing and the debounce wait', () => {
    expect(deriveSaveIndicatorState({ dirty: true, lastSaveFailed: false })).toBe('saving');
  });

  it('is "not_saved" when dirty and the last attempt for this content failed', () => {
    expect(deriveSaveIndicatorState({ dirty: true, lastSaveFailed: true })).toBe('not_saved');
  });

  it('does not flicker across repeated identical calls for the same input (pure, deterministic)', () => {
    const input = { dirty: true, lastSaveFailed: false };
    expect(deriveSaveIndicatorState(input)).toBe(deriveSaveIndicatorState(input));
  });

  it('models the full lifecycle: saved -> saving (typing) -> saved (write lands)', () => {
    let state = deriveSaveIndicatorState({ dirty: false, lastSaveFailed: false });
    expect(state).toBe('saved');
    state = deriveSaveIndicatorState({ dirty: true, lastSaveFailed: false }); // she types
    expect(state).toBe('saving');
    state = deriveSaveIndicatorState({ dirty: false, lastSaveFailed: false }); // save succeeds
    expect(state).toBe('saved');
  });

  it('models a failed save: saving -> not_saved, then back to saving on the next edit', () => {
    let state = deriveSaveIndicatorState({ dirty: true, lastSaveFailed: false });
    expect(state).toBe('saving');
    state = deriveSaveIndicatorState({ dirty: true, lastSaveFailed: true }); // the attempt failed
    expect(state).toBe('not_saved');
    state = deriveSaveIndicatorState({ dirty: true, lastSaveFailed: false }); // she edits again, fresh attempt
    expect(state).toBe('saving');
  });
});

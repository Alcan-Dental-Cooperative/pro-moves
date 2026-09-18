import { describe, it, expect } from 'vitest';
import {
  buildInitialDraftSourceState, toggleFocusSource, toggleMeetingSource,
  hasAnySourceChecked, buildDraftSourceParams,
} from './leadWeekBlastSources';

describe('buildInitialDraftSourceState', () => {
  it('checks the focus box and every meeting by default', () => {
    const state = buildInitialDraftSourceState(true, ['m1', 'm2']);
    expect(state.focusChecked).toBe(true);
    expect(state.checkedMeetingIds).toEqual(new Set(['m1', 'm2']));
  });

  it('leaves the focus box unchecked (absent) when there is no published focus', () => {
    const state = buildInitialDraftSourceState(false, ['m1']);
    expect(state.focusChecked).toBe(false);
  });

  it('starts with no meetings checked for a week with none logged', () => {
    const state = buildInitialDraftSourceState(true, []);
    expect(state.checkedMeetingIds.size).toBe(0);
  });
});

describe('toggleFocusSource', () => {
  it('flips focusChecked without touching the meeting selection', () => {
    const state = buildInitialDraftSourceState(true, ['m1']);
    const next = toggleFocusSource(state);
    expect(next.focusChecked).toBe(false);
    expect(next.checkedMeetingIds).toEqual(new Set(['m1']));
  });

  it('is reversible', () => {
    const state = buildInitialDraftSourceState(false, []);
    expect(toggleFocusSource(toggleFocusSource(state)).focusChecked).toBe(false);
  });
});

describe('toggleMeetingSource', () => {
  it('unchecks a meeting that was checked', () => {
    const state = buildInitialDraftSourceState(true, ['m1', 'm2']);
    const next = toggleMeetingSource(state, 'm1');
    expect(next.checkedMeetingIds.has('m1')).toBe(false);
    expect(next.checkedMeetingIds.has('m2')).toBe(true);
  });

  it('rechecks a meeting that was unchecked', () => {
    const state = toggleMeetingSource(buildInitialDraftSourceState(true, ['m1']), 'm1');
    const next = toggleMeetingSource(state, 'm1');
    expect(next.checkedMeetingIds.has('m1')).toBe(true);
  });

  it('does not mutate the set it was given', () => {
    const state = buildInitialDraftSourceState(true, ['m1']);
    const original = state.checkedMeetingIds;
    toggleMeetingSource(state, 'm1');
    expect(original.has('m1')).toBe(true);
  });

  it('does not touch focusChecked', () => {
    const state = buildInitialDraftSourceState(true, ['m1']);
    const next = toggleMeetingSource(state, 'm1');
    expect(next.focusChecked).toBe(true);
  });
});

describe('hasAnySourceChecked', () => {
  it('is true when the focus box alone is checked', () => {
    expect(hasAnySourceChecked({ focusChecked: true, checkedMeetingIds: new Set() })).toBe(true);
  });

  it('is true when at least one meeting alone is checked', () => {
    expect(hasAnySourceChecked({ focusChecked: false, checkedMeetingIds: new Set(['m1']) })).toBe(true);
  });

  it('is false once everything is unchecked (the Draft button disables here)', () => {
    expect(hasAnySourceChecked({ focusChecked: false, checkedMeetingIds: new Set() })).toBe(false);
  });
});

describe('buildDraftSourceParams', () => {
  it('carries focusChecked through as includeFocus', () => {
    const state = buildInitialDraftSourceState(true, []);
    expect(buildDraftSourceParams(state, []).includeFocus).toBe(true);
  });

  it('orders meetingIds by the week\'s own meeting order, not Set insertion order', () => {
    const state = buildInitialDraftSourceState(true, ['m2', 'm1']);
    expect(buildDraftSourceParams(state, ['m1', 'm2']).meetingIds).toEqual(['m1', 'm2']);
  });

  it('excludes an unchecked meeting from the output', () => {
    const state = toggleMeetingSource(buildInitialDraftSourceState(true, ['m1', 'm2']), 'm2');
    expect(buildDraftSourceParams(state, ['m1', 'm2']).meetingIds).toEqual(['m1']);
  });

  it('produces an explicit empty meetingIds array for a focus-only draft', () => {
    const state = { focusChecked: true, checkedMeetingIds: new Set<string>() };
    expect(buildDraftSourceParams(state, ['m1', 'm2']).meetingIds).toEqual([]);
  });
});

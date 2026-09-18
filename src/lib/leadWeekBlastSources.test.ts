import { describe, it, expect } from 'vitest';
import {
  buildInitialMeetingSelection, toggleMeetingSelection,
  hasAnyMeetingChecked, buildSummarizeMeetingIds,
} from './leadWeekBlastSources';

describe('buildInitialMeetingSelection', () => {
  it('pre-checks the single meeting when the week has exactly one', () => {
    const state = buildInitialMeetingSelection(['m1']);
    expect(state.checkedMeetingIds).toEqual(new Set(['m1']));
  });

  it('starts with nothing checked when the week has more than one meeting', () => {
    const state = buildInitialMeetingSelection(['m1', 'm2']);
    expect(state.checkedMeetingIds.size).toBe(0);
  });

  it('starts with nothing checked for a week with no meetings', () => {
    const state = buildInitialMeetingSelection([]);
    expect(state.checkedMeetingIds.size).toBe(0);
  });
});

describe('toggleMeetingSelection', () => {
  it('unchecks a meeting that was checked', () => {
    const state = buildInitialMeetingSelection(['m1']);
    const next = toggleMeetingSelection(state, 'm1');
    expect(next.checkedMeetingIds.has('m1')).toBe(false);
  });

  it('rechecks a meeting that was unchecked', () => {
    const state = toggleMeetingSelection(buildInitialMeetingSelection(['m1']), 'm1');
    const next = toggleMeetingSelection(state, 'm1');
    expect(next.checkedMeetingIds.has('m1')).toBe(true);
  });

  it('does not mutate the set it was given', () => {
    const state = buildInitialMeetingSelection(['m1']);
    const original = state.checkedMeetingIds;
    toggleMeetingSelection(state, 'm1');
    expect(original.has('m1')).toBe(true);
  });

  it('toggling one meeting leaves another untouched', () => {
    const state = { checkedMeetingIds: new Set(['m1']) };
    const next = toggleMeetingSelection(state, 'm2');
    expect(next.checkedMeetingIds).toEqual(new Set(['m1', 'm2']));
  });
});

describe('hasAnyMeetingChecked', () => {
  it('is true when at least one meeting is checked', () => {
    expect(hasAnyMeetingChecked({ checkedMeetingIds: new Set(['m1']) })).toBe(true);
  });

  it('is false when nothing is checked (the confirm button disables here)', () => {
    expect(hasAnyMeetingChecked({ checkedMeetingIds: new Set() })).toBe(false);
  });
});

describe('buildSummarizeMeetingIds', () => {
  it('orders meeting ids by the week\'s own meeting order, not Set insertion order', () => {
    const state = { checkedMeetingIds: new Set(['m2', 'm1']) };
    expect(buildSummarizeMeetingIds(state, ['m1', 'm2'])).toEqual(['m1', 'm2']);
  });

  it('excludes an unchecked meeting from the output', () => {
    const state = toggleMeetingSelection(buildInitialMeetingSelection(['m1', 'm2']), 'm1');
    expect(buildSummarizeMeetingIds(state, ['m1', 'm2'])).toEqual(['m1']);
  });

  it('produces an empty array when nothing is checked', () => {
    expect(buildSummarizeMeetingIds({ checkedMeetingIds: new Set() }, ['m1', 'm2'])).toEqual([]);
  });
});

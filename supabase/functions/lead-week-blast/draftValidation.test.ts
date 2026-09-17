// LRM-11 tests for handleDraft's source-selection helpers. Plain TypeScript,
// no Deno-specific globals, so vitest can import and exercise it directly
// (same pattern as htmlUtils.test.ts).

import { describe, it, expect } from 'vitest';
import { parseDraftSourceSelection, selectRequestedMeetings } from './draftValidation';

describe('parseDraftSourceSelection', () => {
  it('defaults include_focus to true when omitted', () => {
    expect(parseDraftSourceSelection({}).includeFocus).toBe(true);
  });

  it('defaults meeting_ids to null (meaning "all") when omitted', () => {
    expect(parseDraftSourceSelection({}).meetingIds).toBeNull();
  });

  it('honors an explicit include_focus: false', () => {
    expect(parseDraftSourceSelection({ include_focus: false }).includeFocus).toBe(false);
  });

  it('honors an explicit include_focus: true', () => {
    expect(parseDraftSourceSelection({ include_focus: true }).includeFocus).toBe(true);
  });

  it('coerces a truthy non-boolean include_focus', () => {
    expect(parseDraftSourceSelection({ include_focus: 1 }).includeFocus).toBe(true);
  });

  it('passes through a real meeting_ids array', () => {
    expect(parseDraftSourceSelection({ meeting_ids: ['a', 'b'] }).meetingIds).toEqual(['a', 'b']);
  });

  it('keeps an explicit empty meeting_ids array distinct from "not specified"', () => {
    expect(parseDraftSourceSelection({ meeting_ids: [] }).meetingIds).toEqual([]);
  });

  it('drops non-string entries from meeting_ids rather than trusting them', () => {
    expect(parseDraftSourceSelection({ meeting_ids: ['a', 1, null, 'b'] }).meetingIds).toEqual(['a', 'b']);
  });

  it('treats a non-array meeting_ids as "not specified"', () => {
    expect(parseDraftSourceSelection({ meeting_ids: 'a' }).meetingIds).toBeNull();
  });

  it('handles a null/undefined payload without throwing', () => {
    expect(parseDraftSourceSelection(null)).toEqual({ includeFocus: true, meetingIds: null });
    expect(parseDraftSourceSelection(undefined)).toEqual({ includeFocus: true, meetingIds: null });
  });
});

describe('selectRequestedMeetings', () => {
  const week = [
    { id: 'm1', raw_transcript: 'one' },
    { id: 'm2', raw_transcript: 'two' },
    { id: 'm3', raw_transcript: 'three' },
  ];

  it('returns every week meeting when nothing was requested (null)', () => {
    const result = selectRequestedMeetings(week, null);
    expect(result).toEqual({ valid: true, meetings: week });
  });

  it('returns no meetings for an explicit empty selection', () => {
    const result = selectRequestedMeetings(week, []);
    expect(result).toEqual({ valid: true, meetings: [] });
  });

  it('returns only the requested subset, in requested order', () => {
    const result = selectRequestedMeetings(week, ['m3', 'm1']);
    expect(result).toEqual({ valid: true, meetings: [week[2], week[0]] });
  });

  it('rejects a request that includes an id not in the week (wrong week or not owned)', () => {
    const result = selectRequestedMeetings(week, ['m1', 'not-in-this-week']);
    expect(result).toEqual({ valid: false });
  });

  it('rejects a request that is entirely ids outside the week', () => {
    expect(selectRequestedMeetings(week, ['someone-elses-meeting'])).toEqual({ valid: false });
  });

  it('handles duplicate requested ids by including the match once per request', () => {
    const result = selectRequestedMeetings(week, ['m1', 'm1']);
    expect(result).toEqual({ valid: true, meetings: [week[0], week[0]] });
  });
});

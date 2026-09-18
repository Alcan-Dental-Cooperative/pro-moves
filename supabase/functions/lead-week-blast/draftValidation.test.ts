// LRM-11 tests for handleDraft's source-selection helpers. Plain TypeScript,
// no Deno-specific globals, so vitest can import and exercise it directly
// (same pattern as htmlUtils.test.ts).

import { describe, it, expect } from 'vitest';
import { parseDraftSourceSelection, selectRequestedMeetings } from './draftValidation';

function expectValid(payload: unknown) {
  const result = parseDraftSourceSelection(payload);
  if (!result.valid) throw new Error(`expected valid parse, got: ${result.error}`);
  return result.selection;
}

describe('parseDraftSourceSelection', () => {
  it('defaults include_focus to true when omitted', () => {
    expect(expectValid({}).includeFocus).toBe(true);
  });

  it('defaults meeting_ids to null (meaning "all") when omitted', () => {
    expect(expectValid({}).meetingIds).toBeNull();
  });

  it('honors an explicit include_focus: false', () => {
    expect(expectValid({ include_focus: false }).includeFocus).toBe(false);
  });

  it('honors an explicit include_focus: true', () => {
    expect(expectValid({ include_focus: true }).includeFocus).toBe(true);
  });

  it('rejects a non-boolean include_focus instead of coercing it', () => {
    expect(parseDraftSourceSelection({ include_focus: 1 }).valid).toBe(false);
  });

  it('rejects the string "false" for include_focus (truthy string would flip intent)', () => {
    expect(parseDraftSourceSelection({ include_focus: 'false' }).valid).toBe(false);
  });

  it('passes through a real meeting_ids array', () => {
    expect(expectValid({ meeting_ids: ['a', 'b'] }).meetingIds).toEqual(['a', 'b']);
  });

  it('keeps an explicit empty meeting_ids array distinct from "not specified"', () => {
    expect(expectValid({ meeting_ids: [] }).meetingIds).toEqual([]);
  });

  it('dedupes repeated meeting ids so one meeting cannot be weighted twice', () => {
    expect(expectValid({ meeting_ids: ['a', 'a', 'b'] }).meetingIds).toEqual(['a', 'b']);
  });

  it('rejects meeting_ids containing non-string entries instead of dropping them', () => {
    expect(parseDraftSourceSelection({ meeting_ids: ['a', 1, null, 'b'] }).valid).toBe(false);
  });

  it('rejects a non-array meeting_ids instead of silently drafting from the whole week', () => {
    expect(parseDraftSourceSelection({ meeting_ids: 'a' }).valid).toBe(false);
  });

  it('reports a usable error message on invalid input', () => {
    const result = parseDraftSourceSelection({ meeting_ids: 'a' });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/meeting_ids/);
  });

  it('handles a null/undefined payload without throwing', () => {
    expect(expectValid(null)).toEqual({ includeFocus: true, meetingIds: null });
    expect(expectValid(undefined)).toEqual({ includeFocus: true, meetingIds: null });
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

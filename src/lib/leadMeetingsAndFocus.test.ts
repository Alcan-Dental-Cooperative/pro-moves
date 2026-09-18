import { describe, it, expect } from 'vitest';
import {
  deriveMeetingWeekStart, deriveFocusSlotState, deriveMeetingSlotState,
  meetingsInWeek, isTranscriptLongEnough, MIN_TRANSCRIPT_LENGTH, formatMeetingLabel,
} from './leadMeetingsAndFocus';
import type { HydratedFocusWeek } from '@/types/leadFocus';
import type { LeadMeetingRow } from '@/types/leadMeetings';

describe('deriveMeetingWeekStart', () => {
  it('a Monday meeting date normalizes to itself', () => {
    expect(deriveMeetingWeekStart('2026-08-10')).toBe('2026-08-10');
  });

  it('a midweek meeting date resolves to that week\'s Monday', () => {
    expect(deriveMeetingWeekStart('2026-08-12')).toBe('2026-08-10'); // Wednesday
  });

  it('a Sunday meeting date resolves to the preceding Monday, not the next one', () => {
    expect(deriveMeetingWeekStart('2026-08-16')).toBe('2026-08-10');
  });

  it('is DST-safe across the spring-forward week', () => {
    expect(deriveMeetingWeekStart('2026-03-08')).toBe('2026-03-02');
  });
});

function week(overrides: Partial<HydratedFocusWeek> = {}): HydratedFocusWeek {
  return {
    id: 'w1', organization_id: 'org1', created_by: 'staff1',
    week_start_date: '2026-08-10', framing: null,
    status: 'published', published_at: '2026-08-10T12:00:00Z',
    created_at: '2026-08-10T12:00:00Z', updated_at: '2026-08-10T12:00:00Z',
    items: [{ id: 'i1', display_order: 1, text: 'Say hi to every family', source_issue_id: null, outcome: 'pending' }],
    ...overrides,
  };
}

describe('deriveFocusSlotState', () => {
  it('is not_started when there is no week record', () => {
    expect(deriveFocusSlotState(null)).toBe('not_started');
    expect(deriveFocusSlotState(undefined)).toBe('not_started');
  });

  it('is not_started for a draft week (never published)', () => {
    expect(deriveFocusSlotState(week({ status: 'draft' }))).toBe('not_started');
  });

  it('is not_started for a published week with no items', () => {
    expect(deriveFocusSlotState(week({ items: [] }))).toBe('not_started');
  });

  it('is completed for a published week with at least one item', () => {
    expect(deriveFocusSlotState(week())).toBe('completed');
  });
});

function meeting(overrides: Partial<LeadMeetingRow> = {}): LeadMeetingRow {
  return {
    id: 'm1', organization_id: 'org1', created_by: 'staff1',
    meeting_date: '2026-08-11', week_start_date: '2026-08-10',
    raw_transcript: 'raw', internal_summary: 'summary', title: null,
    created_at: '2026-08-11T12:00:00Z', updated_at: '2026-08-11T12:00:00Z',
    ...overrides,
  };
}

describe('deriveMeetingSlotState', () => {
  it('is not_started with no meetings for the week', () => {
    expect(deriveMeetingSlotState([])).toBe('not_started');
  });

  it('is completed once at least one meeting is logged', () => {
    expect(deriveMeetingSlotState([meeting()])).toBe('completed');
  });
});

describe('meetingsInWeek', () => {
  const all = [
    meeting({ id: 'm1', week_start_date: '2026-08-10', meeting_date: '2026-08-10' }),
    meeting({ id: 'm2', week_start_date: '2026-08-10', meeting_date: '2026-08-13' }),
    meeting({ id: 'm3', week_start_date: '2026-08-17', meeting_date: '2026-08-18' }),
  ];

  it('filters to the requested week only', () => {
    expect(meetingsInWeek(all, '2026-08-10').map((m) => m.id)).toEqual(['m2', 'm1']);
  });

  it('returns newest meeting_date first', () => {
    const [first] = meetingsInWeek(all, '2026-08-10');
    expect(first.id).toBe('m2');
  });

  it('returns an empty array for a week with no meetings', () => {
    expect(meetingsInWeek(all, '2026-09-01')).toEqual([]);
  });
});

describe('isTranscriptLongEnough', () => {
  it('rejects an empty or whitespace-only transcript', () => {
    expect(isTranscriptLongEnough('')).toBe(false);
    expect(isTranscriptLongEnough('   ')).toBe(false);
  });

  it(`rejects a transcript shorter than ${MIN_TRANSCRIPT_LENGTH} trimmed characters`, () => {
    expect(isTranscriptLongEnough('short one')).toBe(false);
  });

  it('accepts a transcript at or above the minimum length', () => {
    expect(isTranscriptLongEnough('x'.repeat(MIN_TRANSCRIPT_LENGTH))).toBe(true);
    expect(isTranscriptLongEnough('  ' + 'x'.repeat(MIN_TRANSCRIPT_LENGTH) + '  ')).toBe(true);
  });
});

// LRM-13: '2026-08-10' is a Monday (pinned by deriveMeetingWeekStart's own
// tests above), so '2026-08-14' is that week's Friday -- used here for a
// stable, known day-of-week without hardcoding a date far from other tests
// in this file.
describe('formatMeetingLabel', () => {
  it('renders day abbreviation + short date with no title', () => {
    expect(formatMeetingLabel('2026-08-14', null)).toBe('Fri 8/14');
  });

  it('appends the title after a middle dot when present', () => {
    expect(formatMeetingLabel('2026-08-14', 'Meeting with Jenny')).toBe('Fri 8/14 · Meeting with Jenny');
  });

  it('treats undefined the same as null (no title)', () => {
    expect(formatMeetingLabel('2026-08-14', undefined)).toBe('Fri 8/14');
  });

  it('treats a whitespace-only title as absent (no placeholder, no trailing dot)', () => {
    expect(formatMeetingLabel('2026-08-14', '   ')).toBe('Fri 8/14');
  });

  it('trims surrounding whitespace on a real title', () => {
    expect(formatMeetingLabel('2026-08-14', '  Meeting with Jenny  ')).toBe('Fri 8/14 · Meeting with Jenny');
  });

  it('does not zero-pad the day-of-month (matches the "9/14" style in the spec, not "09/14")', () => {
    expect(formatMeetingLabel('2026-08-05', null)).toBe('Wed 8/5');
  });

  it('disambiguates two same-day meetings by their titles', () => {
    const a = formatMeetingLabel('2026-08-14', 'Morning huddle');
    const b = formatMeetingLabel('2026-08-14', 'Afternoon follow-up');
    expect(a).not.toBe(b);
    expect(a).toBe('Fri 8/14 · Morning huddle');
    expect(b).toBe('Fri 8/14 · Afternoon follow-up');
  });
});

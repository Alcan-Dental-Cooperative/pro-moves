import { describe, expect, it } from 'vitest';
import { filterAnswerFeedback, truncateAnswer } from './answerFeedbackLogic';
import type { AskAnswerFeedbackListRow } from '@/integrations/supabase/corpusTypes';

function row(overrides: Partial<AskAnswerFeedbackListRow>): AskAnswerFeedbackListRow {
  return {
    feedback_id: 'f1',
    rating: 1,
    note: null,
    created_at: '2026-09-28T00:00:00Z',
    answer: 'An answer.',
    cited_document_ids: [],
    question: 'A question?',
    ...overrides,
  };
}

describe('filterAnswerFeedback', () => {
  const rows = [
    row({ feedback_id: 'up-1', rating: 1 }),
    row({ feedback_id: 'down-1', rating: -1 }),
    row({ feedback_id: 'down-2', rating: -1 }),
  ];

  it('returns everything for "all"', () => {
    expect(filterAnswerFeedback(rows, 'all')).toHaveLength(3);
  });

  it('returns only thumbs-down rows for "down"', () => {
    const result = filterAnswerFeedback(rows, 'down');
    expect(result.map((r) => r.feedback_id)).toEqual(['down-1', 'down-2']);
  });

  it('returns only thumbs-up rows for "up"', () => {
    const result = filterAnswerFeedback(rows, 'up');
    expect(result.map((r) => r.feedback_id)).toEqual(['up-1']);
  });

  it('does not mutate the input array', () => {
    const original = [...rows];
    filterAnswerFeedback(rows, 'down');
    expect(rows).toEqual(original);
  });
});

describe('truncateAnswer', () => {
  it('returns the full text untruncated when it fits', () => {
    expect(truncateAnswer('Short answer.', 220)).toEqual({
      preview: 'Short answer.',
      isTruncated: false,
    });
  });

  it('breaks at the last whole word within the window', () => {
    const answer = 'word '.repeat(20).trim(); // 20 * 5 - 1 = 99 chars, all real word breaks
    const { preview, isTruncated } = truncateAnswer(answer, 50);
    expect(isTruncated).toBe(true);
    expect(preview.endsWith('word')).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(50);
  });

  it('falls back to a hard cut when there is no reasonable word break', () => {
    const answer = 'x'.repeat(300);
    const { preview, isTruncated } = truncateAnswer(answer, 220);
    expect(isTruncated).toBe(true);
    expect(preview).toHaveLength(220);
  });

  it('trims leading/trailing whitespace before measuring', () => {
    expect(truncateAnswer('   padded   ', 220)).toEqual({
      preview: 'padded',
      isTruncated: false,
    });
  });
});

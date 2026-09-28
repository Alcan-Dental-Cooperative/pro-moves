import { describe, expect, it } from 'vitest';
import { nextFeedbackState, type FeedbackState } from './useAskFeedback';

describe('nextFeedbackState', () => {
  it('sets a rating when nothing is set yet', () => {
    expect(nextFeedbackState(null, 1)).toEqual({ rating: 1, note: null });
    expect(nextFeedbackState(null, -1)).toEqual({ rating: -1, note: null });
  });

  it('switching down to up drops the note (a helpful rating never carries one)', () => {
    const down: FeedbackState = { rating: -1, note: 'Missed the nitrous question' };
    expect(nextFeedbackState(down, 1)).toEqual({ rating: 1, note: null });
  });

  it('switching up to down carries over a note, if one is set', () => {
    // In practice thumbs up never has a saved note (the rule above), so
    // this is the trivial case, but it's exercised explicitly since it's a
    // distinct branch of the toggle rule.
    const up: FeedbackState = { rating: 1, note: null };
    expect(nextFeedbackState(up, -1)).toEqual({ rating: -1, note: null });
  });

  it('clears the rating (and, by the caller deleting the row, the note) when the same button is tapped again', () => {
    const up: FeedbackState = { rating: 1, note: null };
    expect(nextFeedbackState(up, 1)).toBeNull();

    const down: FeedbackState = { rating: -1, note: 'Too vague' };
    expect(nextFeedbackState(down, -1)).toBeNull();
  });
});

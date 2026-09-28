// Pure helpers for the Admin "Answer feedback" list, split out so they're
// testable without rendering (see src/pages/ask/askPageLogic.ts for the
// precedent this follows).

import type { AskAnswerFeedbackListRow } from '@/integrations/supabase/corpusTypes';

export type AnswerFeedbackFilter = 'all' | 'down' | 'up';

/** Filters the already-fetched rows client-side (all rows come from one
 * list_ask_answer_feedback() call; the filter just narrows what's shown). */
export function filterAnswerFeedback(
  rows: AskAnswerFeedbackListRow[],
  filter: AnswerFeedbackFilter
): AskAnswerFeedbackListRow[] {
  if (filter === 'all') return rows;
  const rating = filter === 'up' ? 1 : -1;
  return rows.filter((row) => row.rating === rating);
}

export interface TruncatedAnswer {
  /** The shortened text (no trailing ellipsis included). */
  preview: string;
  /** True when `preview` is shorter than the full answer. */
  isTruncated: boolean;
}

const DEFAULT_ANSWER_PREVIEW_LENGTH = 220;
// Only back up to a word boundary if doing so doesn't throw away too much
// of the preview (a preview that's mostly one giant unbroken "word" — a
// URL, say — is better left cut mid-token than shrunk to almost nothing).
const MIN_ACCEPTABLE_BREAK_RATIO = 0.6;

/**
 * Shortens an answer to a preview length, breaking at the last whole word
 * where reasonable instead of cutting mid-word.
 */
export function truncateAnswer(
  answer: string,
  maxLength: number = DEFAULT_ANSWER_PREVIEW_LENGTH
): TruncatedAnswer {
  const trimmed = answer.trim();
  if (trimmed.length <= maxLength) {
    return { preview: trimmed, isTruncated: false };
  }
  const cut = trimmed.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  const preview =
    lastSpace > maxLength * MIN_ACCEPTABLE_BREAK_RATIO ? cut.slice(0, lastSpace) : cut;
  return { preview: preview.trimEnd(), isTruncated: true };
}

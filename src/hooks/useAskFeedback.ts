// Data hooks + pure toggle logic for Ask Alcan answer feedback (thumbs
// up/down + an optional note on down). See docs/specs/ask-answer-feedback.md.
//
// ask_message_feedback is owner-only under RLS (mirrors ask_messages), so
// the chat-side queries here return only the caller's own ratings. The
// admin list goes through the super-admin-only list_ask_answer_feedback()
// function instead of querying the table directly.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  AskAnswerFeedbackListRow,
  AskFeedbackRating,
  AskMessageFeedbackRow,
} from '@/integrations/supabase/corpusTypes';

// ask_message_feedback is not in the generated Database type (same reason as
// ask_conversations/ask_messages — see corpusTypes.ts), so queries cast
// through `any` at the client boundary, matching useAskAlcanChat.ts.
const sb = supabase as any;

const FEEDBACK_QUERY_KEY = ['ask', 'feedback'] as const;
// Exported so useAskAlcanChat.ts's deleteConversation can invalidate the
// admin list too (QA fix: deleting a conversation left its rated exchange
// on the admin list until the 5-minute cache expired or the page reloaded).
export const ADMIN_FEEDBACK_QUERY_KEY = ['ask', 'admin-feedback'] as const;

/** One feedback row per message id, batched like useCitedDocuments. */
export function useAskMessageFeedbackMap(messageIds: string[]) {
  const key = [...messageIds].sort();
  return useQuery({
    queryKey: [...FEEDBACK_QUERY_KEY, key],
    enabled: messageIds.length > 0,
    queryFn: async (): Promise<Map<string, AskMessageFeedbackRow>> => {
      const { data, error } = await sb
        .from('ask_message_feedback')
        .select('*')
        .in('message_id', key);
      if (error) throw error;
      const map = new Map<string, AskMessageFeedbackRow>();
      for (const row of (data ?? []) as AskMessageFeedbackRow[]) {
        map.set(row.message_id, row);
      }
      return map;
    },
  });
}

/** The bit of a feedback row the toggle logic below cares about. */
export interface FeedbackState {
  rating: AskFeedbackRating;
  note: string | null;
}

/**
 * Pure toggle rule for tapping a rating button on an answer:
 * - tapping the already-selected rating clears it entirely (the row goes
 *   away, note and all — clearing a rating removes the exchange from the
 *   admin list, per the spec's consent rule)
 * - tapping the OTHER rating switches to it. Switching to thumbs UP always
 *   drops any note (John's decision, 2026-09-28): a helpful rating never
 *   carries a "what was off" note, and the note box only ever shows on
 *   down, so there'd be no way to see or clear it once it was there.
 *   Switching to thumbs DOWN keeps a note if one is already saved (thumbs
 *   up never has one to keep, by the rule above).
 * - tapping with nothing set yet, sets that rating with no note
 *
 * No I/O here on purpose, so set/switch/clear can be tested without a
 * database or a render.
 */
export function nextFeedbackState(
  current: FeedbackState | null,
  tapped: AskFeedbackRating
): FeedbackState | null {
  if (current?.rating === tapped) return null;
  if (tapped === 1) return { rating: 1, note: null };
  return { rating: tapped, note: current?.note ?? null };
}

export function useAskFeedbackMutations() {
  const queryClient = useQueryClient();
  // Both the chat-side per-message map and the admin list read from this
  // table, so a rating change has to invalidate both (QA fix: the admin
  // list wasn't invalidated at all, so it kept showing a cleared rating or
  // a stale note until its 5-minute cache expired or the page reloaded).
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: FEEDBACK_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ADMIN_FEEDBACK_QUERY_KEY }),
    ]);

  /** Sets or switches the rating for a message (one row per message_id). */
  const setRating = useMutation({
    mutationFn: async (args: {
      messageId: string;
      staffId: string;
      rating: AskFeedbackRating;
      note?: string | null;
    }): Promise<void> => {
      const { error } = await sb.from('ask_message_feedback').upsert(
        {
          message_id: args.messageId,
          staff_id: args.staffId,
          rating: args.rating,
          note: args.note ?? null,
        },
        { onConflict: 'message_id' }
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Clears a rating entirely (deletes the row; the note goes with it). */
  const clearRating = useMutation({
    mutationFn: async (messageId: string): Promise<void> => {
      const { error } = await sb.from('ask_message_feedback').delete().eq('message_id', messageId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Saves the optional note on an already-rated message. */
  const saveNote = useMutation({
    mutationFn: async (args: { messageId: string; note: string | null }): Promise<void> => {
      const { error } = await sb
        .from('ask_message_feedback')
        .update({ note: args.note })
        .eq('message_id', args.messageId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { setRating, clearRating, saveNote };
}

/**
 * Admin-only: the super-admin read path (Answer feedback section of the
 * Admin Ask Alcan tab). Goes through list_ask_answer_feedback(), which
 * raises for a non-super-admin caller and starts from ask_message_feedback
 * so an unrated message can never come out of it. `enabled` should be tied
 * to the same useAskAlcanAccess() check the surface is gated by, so the RPC
 * is never called for a caller who can't use it.
 */
export function useAskAnswerFeedbackList(enabled: boolean = true) {
  return useQuery({
    queryKey: ADMIN_FEEDBACK_QUERY_KEY,
    enabled,
    queryFn: async (): Promise<AskAnswerFeedbackListRow[]> => {
      const { data, error } = await sb.rpc('list_ask_answer_feedback');
      if (error) throw error;
      return (data ?? []) as AskAnswerFeedbackListRow[];
    },
  });
}

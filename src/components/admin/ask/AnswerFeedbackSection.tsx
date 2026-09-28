// Admin "Answer feedback" list: rated Ask Alcan answers, newest first, so
// the team can find weak answers and fix the corpus behind them without
// reading anyone's private chats. See docs/specs/ask-answer-feedback.md.
//
// Gated by the same useAskAlcanAccess() check as the rest of Ask Alcan
// (this section also only mounts inside AdminSurveysTab, which AdminPage
// already renders only for that same check — this is a second, defensive
// layer, not the only one). Data comes from the super-admin-only
// list_ask_answer_feedback() function; no asker identity is ever in the
// result, so none is shown here.

import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { MessageSquareText, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAskAlcanAccess } from '@/lib/askAlcanAccess';
import { useAskAnswerFeedbackList } from '@/hooks/useAskFeedback';
import { useCitedDocuments } from '@/hooks/useAskAlcanChat';
import type { AskAnswerFeedbackListRow } from '@/integrations/supabase/corpusTypes';
import { filterAnswerFeedback, truncateAnswer, type AnswerFeedbackFilter } from './answerFeedbackLogic';

function CitedDocTitles({ documentIds }: { documentIds: string[] }) {
  const { data: docs } = useCitedDocuments(documentIds);
  if (documentIds.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {documentIds.map((id) => (
        <Badge key={id} variant="outline" className="font-normal text-muted-foreground">
          {docs?.get(id)?.title ?? 'source no longer available'}
        </Badge>
      ))}
    </div>
  );
}

function FeedbackRowCard({ row }: { row: AskAnswerFeedbackListRow }) {
  const [expanded, setExpanded] = useState(false);
  const { preview, isTruncated } = useMemo(() => truncateAnswer(row.answer), [row.answer]);
  const isUp = row.rating === 1;

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {isUp ? (
              <ThumbsUp className="h-4 w-4 text-primary" aria-hidden="true" />
            ) : (
              <ThumbsDown className="h-4 w-4 text-destructive" aria-hidden="true" />
            )}
            <span className="text-sm font-medium">{isUp ? 'Helpful' : 'Missed'}</span>
          </div>
          <span className="text-2xs text-muted-foreground">
            {format(parseISO(row.created_at), 'MMM d, yyyy h:mm a')}
          </span>
        </div>

        {row.note && <p className="text-sm italic">&ldquo;{row.note}&rdquo;</p>}

        {row.question && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Question: </span>
            {row.question}
          </p>
        )}

        <p className="text-sm">
          {expanded || !isTruncated ? row.answer : `${preview}…`}
          {isTruncated && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="ml-1 h-auto p-0 align-baseline text-2xs"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show less' : 'Show more'}
            </Button>
          )}
        </p>

        <CitedDocTitles documentIds={row.cited_document_ids} />
      </CardContent>
    </Card>
  );
}

export function AnswerFeedbackSection() {
  const { canAccess } = useAskAlcanAccess();
  const {
    data: rows,
    isLoading,
    isError,
    refetch,
  } = useAskAnswerFeedbackList(canAccess);
  const [filter, setFilter] = useState<AnswerFeedbackFilter>('all');

  const filtered = useMemo(() => filterAnswerFeedback(rows ?? [], filter), [rows, filter]);

  if (!canAccess) return null;
  // Omit the section entirely when there's truly no feedback, rather than
  // showing an empty-state message — but a load FAILURE still gets a visible
  // error (below), so a broken fetch never looks the same as "nothing rated
  // yet" (QA fix: this used to hide on any query error, including the
  // frontend shipping before the migration's SQL was applied).
  if (!isLoading && !isError && (rows?.length ?? 0) === 0) return null;

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquareText className="h-6 w-6" />
          Answer feedback
        </h2>
        {!isError && (
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => v && setFilter(v as AnswerFeedbackFilter)}
            size="sm"
            className="rounded-lg bg-muted/50 p-1"
          >
            <ToggleGroupItem value="all" className="h-10 rounded-md px-3 text-sm md:h-7 md:px-2 md:text-xs">
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="down" className="h-10 rounded-md px-3 text-sm md:h-7 md:px-2 md:text-xs">
              Down
            </ToggleGroupItem>
            <ToggleGroupItem value="up" className="h-10 rounded-md px-3 text-sm md:h-7 md:px-2 md:text-xs">
              Up
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {isError ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
          <p>Answer feedback didn&apos;t load.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
            <FeedbackRowCard key={row.feedback_id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

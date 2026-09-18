import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLeadFocus } from '@/hooks/useLeadFocus';
import { useCoachingWorkspace } from '@/hooks/useCoachingWorkspace';
import { useLeadMeetings } from '@/hooks/useLeadMeetings';
import { useLeadWeekBlasts } from '@/hooks/useLeadWeekBlasts';
import { useWorkspaceLocations } from '@/hooks/useWorkspaceLocations';
import { SOURCE_META, type SourceType, type CoachingIssue } from '@/types/coachingWorkspace';
import { OUTCOME_META, type HydratedFocusWeek } from '@/types/leadFocus';
import type { LeadMeetingRow } from '@/types/leadMeetings';
import type { LeadWeekBlastRow, LeadWeekBlastRecipient } from '@/types/leadWeekBlasts';
import { deriveFocusSlotState, deriveMeetingSlotState, meetingsInWeek } from '@/lib/leadMeetingsAndFocus';
import {
  deriveBlastSlotState, blastSlotBadgeStatus, blastBadgeLabel,
  canConfirmSend, formatSentSummary, buildDefaultBlastSubject, buildExcludedSuffix, canPolish,
  canDraftBlast, countSentBlasts, blastsForWeek, buildSendConfirmBody,
} from '@/lib/leadWeekBlasts';
import {
  groupRecipientsByLocation, isGroupFullyIncluded,
  toggleDoctorExclusion, toggleGroupExclusion,
  selectAllRecipients, selectNoRecipients,
  deriveExclusionIds, buildSendingSummary,
} from '@/lib/leadWeekBlastRecipients';
import {
  buildInitialMeetingSelection, toggleMeetingSelection,
  hasAnyMeetingChecked, buildSummarizeMeetingIds,
  type MeetingSelectionState,
} from '@/lib/leadWeekBlastSources';
import { deriveSaveIndicatorState, type SaveIndicatorState } from '@/lib/leadWeekBlastSaveState';
import {
  buildPipelineChips, deriveWeekGlyphStates, shouldHideEmptyBadge, isBuilderDirty,
  type WeekWhen, type PipelineChip, type PipelineChipStatus, type WeekGlyphStates,
} from '@/lib/meetingsAndFocusView';
import { formatDateForDisplay } from '@/lib/dateInputMask';
import { formatMeetingLabel } from '@/lib/leadMeetingsAndFocus';
import { RecordMeetingDialog } from '@/components/training/RecordMeetingDialog';
import { StatusBadge, type BadgeStatus } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { Skeleton } from '@/components/ui/skeleton';
import DOMPurify from 'dompurify';
import { upgradeBlastBodyToHtml, hasBlastBodyContent, reconcileNormalizedLoad, convertQuillListFlavors, needsSaveBeforeSend } from '@/lib/leadWeekBlastHtml';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import {
  ChevronLeft, ChevronRight, LayoutList, CalendarDays, Sparkles, Loader2, Plus, X, Shield,
  Users, Mail, Send, Trash2,
} from 'lucide-react';
import { CT_TZ } from '@/lib/centralTime';
import { addDaysToDateString, mondaysInMonth as mondaysInMonthTz } from '@/lib/dateUtils';

// ── date helpers (local; Monday-keyed like the planner) ──────────────────────
// `parse` is display-only (toLocaleDateString), so it's fine to read the
// browser's own local calendar fields. `addDays`/`firstOfMonth`/
// `mondaysInMonth` feed week/month keys back into state and queries, so they
// go through the timezone-explicit helpers instead of a round trip through
// toISOString(), which shifted results a day early for anyone in a
// negative-UTC timezone (Central time).
const parse = (s: string) => new Date(s + 'T12:00:00');
const fmtShort = (s: string) => parse(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtWeek = (s: string) => 'Week of ' + fmtShort(s);
const fmtMonth = (s: string) => parse(s).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const addDays = (s: string, n: number) => addDaysToDateString(s, n, CT_TZ);
const firstOfMonth = (s: string) => `${s.slice(0, 7)}-01`;
const mondaysInMonth = (anchor: string): string[] => mondaysInMonthTz(anchor, CT_TZ);

interface BuilderItem { key: string; text: string; sourceId: string | null; sourceTitle: string | null; polishing?: boolean; aiPolished?: boolean }

export function MeetingsAndFocusTab() {
  const { weeks, currentMonday, publishWeek, isLoading } = useLeadFocus();
  const ws = useCoachingWorkspace();
  const meetingsHook = useLeadMeetings();
  const blastsHook = useLeadWeekBlasts();
  const { data: locations = [] } = useWorkspaceLocations(ws.orgId);
  const weeksByDate = useMemo(() => new Map(weeks.map((w) => [w.week_start_date, w])), [weeks]);

  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedMonday, setSelectedMonday] = useState(currentMonday);
  const [monthAnchor, setMonthAnchor] = useState(firstOfMonth(currentMonday));

  // builder (focus slot)
  const [builderOpen, setBuilderOpen] = useState(false);
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [framing, setFraming] = useState('');
  const [own, setOwn] = useState('');
  // Snapshot of what the Builder loaded with, so navigation can tell whether
  // there are unsaved edits worth confirming before discarding (B3).
  const [builderSnapshot, setBuilderSnapshot] = useState<{ items: { text: string; sourceId: string | null }[]; framing: string } | null>(null);
  // A navigation action deferred behind the unsaved-edits confirm (B3).
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const keyRef = useRef(1);
  const nextKey = () => 'k' + (keyRef.current++);

  // meeting dialog
  const [meetingDialog, setMeetingDialog] = useState<{ mode: 'create' | 'view'; meeting: LeadMeetingRow | null } | null>(null);

  const selected = weeksByDate.get(selectedMonday) ?? null;
  const when: WeekWhen =
    selectedMonday < currentMonday ? 'past' : selectedMonday === currentMonday ? 'current' : 'future';

  const usedIds = new Set(items.map((i) => i.sourceId).filter(Boolean) as string[]);
  const availIssues = ws.issues.filter((i) => !usedIds.has(i.id));

  const openBuilder = (monday: string) => {
    const w = weeksByDate.get(monday);
    const initialItems = (w?.items ?? []).map((it) => ({
      key: nextKey(), text: it.text, sourceId: it.source_issue_id, sourceTitle: it.sourceIssueTitle ?? null, aiPolished: true,
    }));
    setItems(initialItems);
    setFraming(w?.framing ?? '');
    setBuilderSnapshot({ items: initialItems.map((it) => ({ text: it.text, sourceId: it.sourceId })), framing: w?.framing ?? '' });
    setBuilderOpen(true);
  };
  const closeBuilder = () => { setBuilderOpen(false); setItems([]); setFraming(''); setOwn(''); setBuilderSnapshot(null); };

  const isBuilderEditDirty = builderOpen && !!builderSnapshot && isBuilderDirty(
    { items: items.map((it) => ({ text: it.text, sourceId: it.sourceId })), framing, ownDraft: own },
    builderSnapshot,
  );

  // B3: the week arrows and the Month view's "jump to this week" both close
  // an open Builder as a side effect. If it has unsaved edits, defer the
  // action behind a plain confirm instead of discarding them silently.
  const guardedNavigate = (action: () => void) => {
    if (isBuilderEditDirty) {
      setPendingNav(() => action);
    } else {
      action();
    }
  };

  const addIssue = (issue: CoachingIssue) => {
    if (items.length >= 2) return;
    setItems((p) => [...p, { key: nextKey(), text: issue.title, sourceId: issue.id, sourceTitle: issue.title }]);
  };
  const addOwn = () => {
    if (items.length >= 2) { toast({ title: 'Two is the cap' }); return; }
    if (!own.trim()) return;
    setItems((p) => [...p, { key: nextKey(), text: own.trim(), sourceId: null, sourceTitle: null }]);
    setOwn('');
  };
  const editItem = (key: string, text: string) => setItems((p) => p.map((i) => (i.key === key ? { ...i, text, aiPolished: false } : i)));
  const removeItem = (key: string) => setItems((p) => p.filter((i) => i.key !== key));

  const polishItem = async (key: string) => {
    const it = items.find((i) => i.key === key); if (!it || !it.text.trim()) return;
    setItems((p) => p.map((i) => (i.key === key ? { ...i, polishing: true } : i)));
    try {
      const { data, error } = await supabase.functions.invoke('polish-note', {
        body: { text: it.text, context: 'Rewrite as a clear, encouraging one-sentence weekly focus that a lead dental assistant will carry into their location. Keep it concrete and in plain words.' },
      });
      if (error) throw error;
      const polished = (data as any)?.polished?.trim();
      setItems((p) => p.map((i) => (i.key === key ? { ...i, text: polished || i.text, polishing: false, aiPolished: !!polished } : i)));
    } catch (e: any) {
      setItems((p) => p.map((i) => (i.key === key ? { ...i, polishing: false } : i)));
      toast({ title: "Couldn't polish that", description: e?.message ?? 'Try again.', variant: 'destructive' });
    }
  };

  const schedule = () => {
    if (!items.length) { toast({ title: 'Add at least one focus first' }); return; }
    publishWeek.mutate(
      { weekStart: selectedMonday, framing, items: items.map((i) => ({ text: i.text.trim(), source_issue_id: i.sourceId })) },
      { onSuccess: () => {
          const live = when === 'current';
          const moved = items.filter((i) => i.sourceId).length;
          closeBuilder();
          toast({ title: `Scheduled for ${fmtShort(selectedMonday)}` + (live ? ' · live on lead homes' : ' · planned ahead') + (moved ? ` · ${moved} issue${moved > 1 ? 's' : ''} → Communicated` : '') });
        } },
    );
  };

  const weekMeetings = meetingsInWeek(meetingsHook.meetings, selectedMonday);
  const focusState = deriveFocusSlotState(selected);
  const meetingState = deriveMeetingSlotState(weekMeetings);

  // LRM-11/12: a week can now hold any number of sent blasts plus at most
  // one open draft. The stacked-cards slot UI (BlastSlot below) renders the
  // week's whole list; the chip/badge states are derived from that same
  // list so "sent" reads as the most advanced state no matter how many
  // blasts have gone out.
  const weekBlasts = blastsForWeek(blastsHook.blasts, selectedMonday);
  const blastState = deriveBlastSlotState(focusState === 'completed', weekMeetings.length, weekBlasts);
  const sentBlastCount = countSentBlasts(weekBlasts);

  const pipelineChips = buildPipelineChips(focusState, meetingState, blastState, sentBlastCount);
  const scrollToSlot = (key: PipelineChip['key']) => {
    document.getElementById(`slot-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        {/* W1: the week (or month) is the page's dominant heading, not the static tab title. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => viewMode === 'week'
                ? guardedNavigate(() => { setSelectedMonday((s) => addDays(s, -7)); closeBuilder(); })
                : setMonthAnchor((a) => firstOfMonth(addDays(a, -15)))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              {viewMode === 'week' ? fmtWeek(selectedMonday) : fmtMonth(monthAnchor)}
            </h1>
            <Button variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => viewMode === 'week'
                ? guardedNavigate(() => { setSelectedMonday((s) => addDays(s, 7)); closeBuilder(); })
                : setMonthAnchor((a) => firstOfMonth(addDays(a, 40)))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {viewMode === 'week' && selectedMonday !== currentMonday && (
              <Button variant="ghost" size="sm" onClick={() => guardedNavigate(() => { setSelectedMonday(currentMonday); closeBuilder(); })}>This week</Button>
            )}
          </div>
          <div className="inline-flex gap-1 rounded-lg border bg-muted/50 p-1">
            {([['week', 'Week', LayoutList], ['month', 'Month', CalendarDays]] as const).map(([m, label, Icon]) => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${viewMode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Shield className="h-4 w-4" /> Set the week's focus, run the Lead RDA meeting, and send doctors a weekly recap. Past weeks are your record.
        </p>
        {viewMode === 'week' && <PipelineChipRow chips={pipelineChips} onSelect={scrollToSlot} />}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : viewMode === 'month' ? (
        <div className="space-y-2 rounded-xl border p-3">
          {mondaysInMonth(monthAnchor).map((m) => {
            const w = weeksByDate.get(m); const set = !!w && w.items.length > 0;
            const isCurrent = m === currentMonday; const pastEmpty = m < currentMonday && !set;
            const monthRowMeetings = meetingsInWeek(meetingsHook.meetings, m);
            const monthRowBlasts = blastsForWeek(blastsHook.blasts, m);
            const glyphStates = deriveWeekGlyphStates(w, monthRowMeetings, monthRowBlasts);
            return (
              <button key={m}
                onClick={() => guardedNavigate(() => { setSelectedMonday(m); setViewMode('week'); closeBuilder(); })}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted ${set ? 'bg-background' : 'bg-muted/40'} ${pastEmpty ? 'opacity-50' : ''}`}>
                <span className="text-sm font-semibold">{fmtWeek(m)}{isCurrent && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-semibold text-primary">this week</span>}</span>
                <span className="flex items-center gap-3">
                  <WeekGlyphs states={glyphStates} />
                  <span className="text-xs font-semibold text-muted-foreground">{set ? (m < currentMonday ? '✓ covered' : '✓ scheduled') : '◦ not set'}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <SlotSection num={1} title="Focus" state={focusState} id="slot-focus"
            hideBadge={shouldHideEmptyBadge(when, focusState === 'not_started')}>
            {builderOpen ? (
              <Builder weekLabel={fmtWeek(selectedMonday)} when={when} items={items} framing={framing} own={own}
                availIssues={availIssues} publishing={publishWeek.isPending}
                onOwn={setOwn} onAddOwn={addOwn} onAddIssue={addIssue} onEdit={editItem} onRemove={removeItem}
                onPolish={polishItem} onFraming={setFraming} onSchedule={schedule} onCancel={closeBuilder} />
            ) : (
              <SelectedWeek week={selected} when={when} monday={selectedMonday} onBuild={() => openBuilder(selectedMonday)} />
            )}
          </SlotSection>

          <SlotSection num={2} title="Meeting" state={meetingState} id="slot-meeting"
            hideBadge={shouldHideEmptyBadge(when, meetingState === 'not_started')}>
            <MeetingSlot
              meetings={weekMeetings}
              onRecord={() => setMeetingDialog({ mode: 'create', meeting: null })}
              onOpen={(m) => setMeetingDialog({ mode: 'view', meeting: m })}
            />
          </SlotSection>

          <SlotSection num={3} title="Doctor blast" state={blastSlotBadgeStatus(blastState)} id="slot-blast"
            badgeLabel={blastBadgeLabel(blastState, sentBlastCount)} hideBadge={shouldHideEmptyBadge(when, blastState === 'none')}>
            <BlastSlot
              hasPublishedFocus={focusState === 'completed'}
              weekMeetings={weekMeetings}
              weekBlasts={weekBlasts}
              weekStartDate={selectedMonday}
              blastsHook={blastsHook}
            />
          </SlotSection>
        </div>
      )}

      <AlertDialog open={!!pendingNav} onOpenChange={(o) => { if (!o) setPendingNav(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>This week's focus has unsaved edits. Leaving now will lose them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const action = pendingNav; setPendingNav(null); action?.(); }}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {meetingDialog && (
        <RecordMeetingDialog
          open={!!meetingDialog}
          onOpenChange={(o) => { if (!o) setMeetingDialog(null); }}
          mode={meetingDialog.mode}
          meeting={meetingDialog.meeting}
          weekStart={selectedMonday}
          locations={locations}
          creating={meetingsHook.createMeeting.isPending}
          updating={meetingsHook.updateMeeting.isPending}
          onCreate={(input) => meetingsHook.createMeeting.mutate(input, {
            onSuccess: () => toast({ title: 'Meeting saved' }),
          })}
          onUpdateSummary={(input) => meetingsHook.updateMeeting.mutate(input, {
            onSuccess: () => toast({ title: 'Summary saved' }),
          })}
          onAddIssue={(input) => ws.createIssue.mutate(input)}
        />
      )}
    </div>
  );
}

// ── slot chrome ───────────────────────────────────────────────────────────

function SlotSection({ num, title, state, id, badgeLabel, hideBadge, children }: {
  num: number; title: string; state: BadgeStatus; id?: string; badgeLabel?: string; hideBadge?: boolean; children: React.ReactNode;
}) {
  return (
    <div id={id} className="rounded-xl border p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{num}</span>
        <h2 className="text-sm font-bold">{title}</h2>
        {!hideBadge && <StatusBadge status={state} label={badgeLabel} className="ml-auto" />}
      </div>
      {children}
    </div>
  );
}

// W2: the quiet three-chip pipeline summary under the week headline. Each
// chip names its step and state (design tokens only, via StatusBadge) and
// scrolls to that slot's card on click -- information, not nagging.
function PipelineChipRow({ chips, onSelect }: { chips: PipelineChip[]; onSelect: (key: PipelineChip['key']) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button key={chip.key} onClick={() => onSelect(chip.key)}
          className="inline-flex items-center gap-1.5 rounded-full border bg-muted/30 px-2 py-1 text-2xs font-semibold text-muted-foreground transition-colors hover:bg-muted">
          {chip.label}
          <StatusBadge status={chip.status} label={chip.badgeLabel} className="h-5 px-1.5 py-0 text-2xs" />
        </button>
      ))}
    </div>
  );
}

// W4: the three tiny per-week state glyphs on a Month view row.
const GLYPH_COLOR: Record<PipelineChipStatus, string> = {
  completed: 'hsl(var(--status-complete))',
  draft: 'hsl(var(--status-late))',
  not_started: 'hsl(var(--muted-foreground) / 0.35)',
  locked: 'hsl(var(--muted-foreground) / 0.35)',
};

function WeekGlyphs({ states }: { states: WeekGlyphStates }) {
  // See buildPipelineChips's comment: the switch only ever returns the four
  // values PipelineChipStatus covers, narrower than the declared BadgeStatus.
  const blastStatus = blastSlotBadgeStatus(states.blast) as PipelineChipStatus;
  const dots: { label: string; status: PipelineChipStatus }[] = [
    { label: 'Focus', status: states.focus },
    { label: 'Meeting', status: states.meeting },
    { label: 'Blast', status: blastStatus },
  ];
  return (
    <span className="inline-flex items-center gap-1" title={dots.map((d) => `${d.label}: ${d.status.replace('_', ' ')}`).join(', ')}>
      {dots.map((d) => (
        <span key={d.label} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: GLYPH_COLOR[d.status] }} />
      ))}
    </span>
  );
}

function MeetingSlot({ meetings, onRecord, onOpen }: { meetings: LeadMeetingRow[]; onRecord: () => void; onOpen: (m: LeadMeetingRow) => void }) {
  if (meetings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
        <div><Button onClick={onRecord}><Plus className="mr-1.5 h-4 w-4" />Record meeting</Button></div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {meetings.map((m) => (
        <button key={m.id} onClick={() => onOpen(m)}
          className="flex w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-muted/40">
          <Users className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{formatMeetingLabel(m.meeting_date, m.title)}</div>
            {m.internal_summary && <div className="mt-0.5 truncate text-xs text-muted-foreground">{m.internal_summary}</div>}
          </div>
        </button>
      ))}
      <Button variant="outline" size="sm" onClick={onRecord}><Plus className="mr-1.5 h-4 w-4" />Record another</Button>
    </div>
  );
}

const fmtSentAt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// LRM-10: the composer's toolbar is deliberately narrowed to exactly the
// tags the server-side allowlist keeps (p, ul, ol, li, strong, em, br) --
// no headers, no underline, nothing that would produce a tag the server
// strips anyway.
const BLAST_QUILL_MODULES = {
  toolbar: [['bold', 'italic'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']],
};

// LRM-13: how long the composer waits after the last edit before autosaving,
// within the spec's "roughly 1.5-2s" window.
const AUTOSAVE_DEBOUNCE_MS = 1750;

// Client-side render-time sanitization for stored blast HTML, matching the
// same allowlist the edge function enforces server-side, and the same
// DOMPurify.sanitize + dangerouslySetInnerHTML approach the app already uses
// for other stored rich text (CombinedPrepView, MeetingOutcomeCapture,
// DoctorReviewPrep, EvaluationViewer, InsightsDisplay all sanitize a
// stored-HTML field this way before rendering it read-only).
const BLAST_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'ul', 'ol', 'li', 'strong', 'em', 'br'],
  ALLOWED_ATTR: [],
};

/**
 * LRM-12: the read-only summary card for one sent blast, extracted from
 * BlastSlot's old single-row 'sent' branch so the stack can render any
 * number of them. Rendering/copy unchanged from before this ticket.
 */
function SentBlastCard({ blast }: { blast: LeadWeekBlastRow }) {
  const summary = formatSentSummary(blast.recipient_count ?? 0, blast.failed_count ?? 0);
  const excludedSuffix = buildExcludedSuffix(blast.excluded_staff_ids?.length ?? 0);
  return (
    <div className="space-y-2.5">
      {/*
        LRM-10: a sent blast can predate this ticket (plain text, bare
        newlines) or postdate it (HTML). upgradeBlastBodyToHtml handles
        both -- it's a no-op for a body that's already HTML, and converts
        plain text into equivalent paragraphs -- so this one render path
        covers old and new rows alike. Sanitized with the same allowlist
        the server enforces before rendering, the same DOMPurify.sanitize +
        dangerouslySetInnerHTML approach the app already uses for other
        stored rich text (CombinedPrepView, MeetingOutcomeCapture,
        DoctorReviewPrep, EvaluationViewer, InsightsDisplay).

        Codex review (PR #116, P2): convertQuillListFlavors runs BEFORE
        DOMPurify -- DOMPurify's ALLOWED_ATTR: [] below strips data-list
        along with every other attribute, so a Quill-flavored bullet list
        (`<ol><li data-list="bullet">`) has to become a real `<ul>` first
        or it renders as a numbered list here too.
      */}
      <div
        className="prose prose-sm max-w-none rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground dark:prose-invert"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(convertQuillListFlavors(upgradeBlastBodyToHtml(blast.body)), BLAST_SANITIZE_CONFIG),
        }}
      />
      <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        Sent {blast.sent_at && fmtSentAt(blast.sent_at)} · {summary}{excludedSuffix}
      </div>
    </div>
  );
}

function BlastSlot({
  hasPublishedFocus, weekMeetings, weekBlasts, weekStartDate, blastsHook,
}: {
  hasPublishedFocus: boolean;
  weekMeetings: LeadMeetingRow[];
  weekBlasts: LeadWeekBlastRow[];
  weekStartDate: string;
  blastsHook: ReturnType<typeof useLeadWeekBlasts>;
}) {
  // LRM-12: a week's blasts split into any number of sent rows (rendered as
  // a read-only stack, oldest first so the newest sent blast reads last)
  // plus at most one open draft -- the DB's partial unique index guarantees
  // there's never more than one. canStartDraft gates both the empty-week
  // "Draft blast" button and the post-send "New blast" button, same
  // canDraftBlast rule as before this ticket.
  const sentBlasts = weekBlasts
    .filter((b) => b.status === 'sent')
    .slice()
    .sort((a, b) => (a.sent_at ?? a.created_at).localeCompare(b.sent_at ?? b.created_at));
  const draftBlast = weekBlasts.find((b) => b.status === 'draft') ?? null;
  const canStartDraft = canDraftBlast(hasPublishedFocus, weekMeetings.length);

  const [editedBody, setEditedBody] = useState(upgradeBlastBodyToHtml(draftBlast?.body ?? ''));
  const [editedSubject, setEditedSubject] = useState(draftBlast?.subject || buildDefaultBlastSubject(weekStartDate));
  const [drafting, setDrafting] = useState(false);
  const draftingRef = useRef(false);
  const [polishing, setPolishing] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [recipients, setRecipients] = useState<LeadWeekBlastRecipient[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [recipientsLoading, setRecipientsLoading] = useState(false);

  // LRM-13: creates a brand-new draft with an empty body -- "Draft blast" no
  // longer generates anything on its own (spec decision 1). The composer
  // opens blank; generation is now something she reaches for ("Summarize
  // meeting" below), not a step she starts from. Guarded the same way
  // runSummarize/the old runDraft are: the `isPending` flag lags a render
  // behind, so a fast double-click could otherwise fire two inserts and
  // trip the one-draft-per-week unique index.
  const creatingDraftRef = useRef(false);
  const onCreateEmptyDraftClick = () => {
    if (creatingDraftRef.current) return;
    creatingDraftRef.current = true;
    blastsHook.createBlast.mutate(
      { weekStartDate, body: '', subject: buildDefaultBlastSubject(weekStartDate) },
      { onSettled: () => { creatingDraftRef.current = false; } },
    );
  };

  // LRM-13: the meetings-only "Summarize meeting" modal, replacing LRM-12's
  // focus+meetings SourcePickerDialog (decision 2 -- no focus checkbox; the
  // edge function includes the week's published focus automatically).
  // Always reset to the modal's own opening rule when it opens (see
  // buildInitialMeetingSelection) -- it never remembers a previous open's
  // selection.
  const [summarizeOpen, setSummarizeOpen] = useState(false);
  const [meetingSelection, setMeetingSelection] = useState<MeetingSelectionState>(
    () => buildInitialMeetingSelection(weekMeetings.map((m) => m.id)),
  );
  // LRM-13: the "this will replace your text" warning (decision 2), shown
  // only when the editor already has real content at the moment the modal
  // is confirmed.
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);

  const onSummarizeClick = () => {
    setMeetingSelection(buildInitialMeetingSelection(weekMeetings.map((m) => m.id)));
    setSummarizeOpen(true);
  };

  // Codex review (PR #115): live mirrors of the editor text and the loaded
  // draft row, so an in-flight polish can detect on resolve that the user
  // typed or navigated weeks mid-request and drop its stale result.
  const editedBodyRef = useRef(editedBody);
  editedBodyRef.current = editedBody;
  const draftBlastRef = useRef(draftBlast);
  draftBlastRef.current = draftBlast;

  // LRM-10: RichTextEditor can rewrite structural markup when it loads a
  // value into Quill (observed: `<ul>` becomes `<ol data-list="bullet">`)
  // with no 'text-change' event at all, so the raw string we hand it as
  // `value` is not always byte-identical to what ends up as the "current"
  // content. Comparing a freshly-loaded body against itself must not read
  // as an edit, so whenever we set editedBody to a value we intend as the
  // new baseline (a loaded draft, or a fresh Summarize result), this flag
  // arms the editor's onReady callback to correct editedBody to Quill's own
  // normalized output once it settles -- not the raw string we asked it to
  // load.
  //
  // pendingWrittenValueRef records exactly what was written so
  // reconcileNormalizedLoad can tell "nothing touched editedBody since the
  // write" (safe to replace with the normalized value) apart from "a
  // keystroke landed first" (must not clobber it) -- onReady only ever
  // fires for a silent, non-user write, but this guard is cheap insurance
  // against any path where a keystroke could land in the gap between the
  // write and onReady firing.
  //
  // Deliberately NOT armed for Polish (see onPolishClick): a polish result
  // still goes through the normal onChange/autosave path like any edit, it
  // just doesn't need this particular reconciliation.
  //
  // Codex review (PR #116, P2): a CHILD component's own mount effect runs
  // BEFORE this component's effects (React commits child effects
  // bottom-up), and RichTextEditor calls onReady synchronously while
  // seeding its initial content. So on first mount with an existing draft,
  // onReady's first call arrived here BEFORE the week-switch effect below
  // had a chance to arm this flag -- it was still `false`, the arm-worthy
  // onReady call was silently ignored, and the flag stayed armed for
  // whatever onReady fired NEXT, wrongly reconciling an unrelated later
  // write against the wrong written-value baseline.
  //
  // Fixed two ways together (traced empirically, not just reasoned through
  // -- React batches this component's own effect with the child's into one
  // update, so either fix alone still lets the second clobber the first):
  // 1. This ref is armed with its INITIAL value during render (useRef's
  //    initial argument), before the child ever mounts, so the very first
  //    onReady call has something correct to consume.
  // 2. The week-switch effect below skips its arm-then-set body on its own
  //    first run (isFirstRunRef) -- that effect always fires once at mount
  //    regardless of its dependency array, and since it unconditionally
  //    overwrites editedBody with the RAW (pre-Quill-normalization) body,
  //    letting it run at mount would silently undo the correction onReady
  //    just made. On a REAL week switch (not mount), isFirstRunRef is
  //    already false, so the effect's existing arm-then-set ordering runs
  //    exactly as before -- that path was never broken.
  const pendingGeneratedSyncRef = useRef(true);
  const pendingWrittenValueRef = useRef(editedBody);
  const onEditorReady = (html: string) => {
    if (pendingGeneratedSyncRef.current) {
      pendingGeneratedSyncRef.current = false;
      setEditedBody((current) => reconcileNormalizedLoad(current, pendingWrittenValueRef.current, html));
    }
  };

  // Codex review (PR #116, P2): this effect always fires once at mount too
  // (React runs every effect after the initial render regardless of its
  // dependency array), and its unconditional setEditedBody(upgraded) would
  // overwrite editedBody's already-correct, Quill-normalized value (set
  // moments earlier by the render-time-armed onEditorReady above) with the
  // raw pre-normalization body -- re-breaking the very thing the arming
  // above just fixed. Skipping this effect's body on its own first run
  // avoids that: render-time arming already seeded everything correctly for
  // the initial-mount case, so there is nothing for this run to do. On a
  // REAL week switch, isFirstRunRef is already false, so this effect's
  // existing arm-then-set ordering runs exactly as before.
  const isFirstRunRef = useRef(true);

  // LRM-13: `savedSnapshot` is the body/subject last known to be persisted
  // -- the save-state indicator's "dirty" reading is a plain !== comparison
  // against it, and every successful save (autosave, blur-flush, or the
  // Send/Test-send pre-send save) advances it. Initialized to match
  // editedBody/editedSubject's own initializer, so a freshly loaded draft
  // starts clean ("Saved", per spec).
  const [savedSnapshot, setSavedSnapshot] = useState(() => ({
    body: upgradeBlastBodyToHtml(draftBlast?.body ?? ''),
    subject: draftBlast?.subject || buildDefaultBlastSubject(weekStartDate),
  }));
  // True only when the most recent save attempt for the CURRENT dirty
  // content failed -- reset to false on every edit (a fresh edit is a
  // fresh, not-yet-attempted save). See leadWeekBlastSaveState.ts.
  const [saveFailed, setSaveFailed] = useState(false);
  const autosaveTimerRef = useRef<number | null>(null);

  // Re-sync local edit state when a different week's draft loads. Keyed on
  // id + week so it doesn't stomp on in-progress typing when the query
  // silently refetches the same row. Existing rows are plain text (bare
  // newlines) predating LRM-10 -- upgradeBlastBodyToHtml is a no-op for a
  // body that's already HTML, and converts one that isn't into equivalent
  // HTML paragraphs so nothing is lost visually in the editor.
  useEffect(() => {
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      return;
    }
    const upgraded = upgradeBlastBodyToHtml(draftBlast?.body ?? '');
    const subject = draftBlast?.subject || buildDefaultBlastSubject(weekStartDate);
    setEditedBody(upgraded);
    setEditedSubject(subject);
    setSavedSnapshot({ body: upgraded, subject });
    setSaveFailed(false);
    // Synchronous fallback baseline, corrected to Quill's normalized shape
    // by onEditorReady the moment the editor finishes loading it (see
    // pendingGeneratedSyncRef above).
    pendingWrittenValueRef.current = upgraded;
    pendingGeneratedSyncRef.current = true;
  }, [draftBlast?.id, weekStartDate]);

  // LRM-13: the ONE persistence path for every edit -- typing, a Polish
  // result, and a confirmed Summarize replacement all flow through the
  // debounced autosave effect below, which calls this. Send/Test-send call
  // it directly as their pre-send save (see needsSaveBeforeSend). Rethrows
  // on failure so those two callers can still gate on it the same way they
  // always have; the debounced/blur callers swallow the rejection (their
  // job ends at setting saveFailed, which the indicator picks up).
  const persistNow = async (body: string, subject: string) => {
    if (!draftBlast) return;
    try {
      await blastsHook.updateBlastBody.mutateAsync({ id: draftBlast.id, body, subject });
      setSavedSnapshot({ body, subject });
      setSaveFailed(false);
    } catch (err) {
      setSaveFailed(true);
      throw err;
    }
  };

  const isDirty = !!draftBlast && (editedBody !== savedSnapshot.body || editedSubject !== savedSnapshot.subject);
  const saveIndicator = deriveSaveIndicatorState({ dirty: isDirty, lastSaveFailed: saveFailed });

  // LRM-13: debounced autosave -- save on idle (~1.5-2s after the last
  // edit) and on blur (flushSave below), replacing the old manual "Save
  // draft" button. Any edit resets saveFailed here, since a fresh edit
  // means a fresh, not-yet-attempted save (see leadWeekBlastSaveState.ts's
  // comment on why that matters for the indicator not getting stuck on
  // "Not saved" after she starts typing again).
  useEffect(() => {
    setSaveFailed(false);
    if (!draftBlast) return;
    if (editedBody === savedSnapshot.body && editedSubject === savedSnapshot.subject) return;
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      persistNow(editedBody, editedSubject).catch(() => {});
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedBody, editedSubject, draftBlast?.id]);

  // Flushes a pending debounced save immediately -- wired to the subject
  // input's and the editor's onBlur, per spec ("save on idle and on
  // blur").
  const flushSave = () => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (draftBlast && (editedBody !== savedSnapshot.body || editedSubject !== savedSnapshot.subject)) {
      persistNow(editedBody, editedSubject).catch(() => {});
    }
  };

  // LRM-13: generates a meeting summary and REPLACES the editor body --
  // never appends (spec decision 2). Subject is left untouched. The
  // replacement then autosaves like any other edit, through the same
  // debounced effect above.
  const runSummarize = async (meetingIds: string[]) => {
    // Synchronous re-entry guard, same reasoning as the old runDraft's: the
    // `drafting` state that disables the modal's confirm button lags a
    // render behind a fast double-click.
    if (draftingRef.current) return;
    draftingRef.current = true;
    setDrafting(true);
    try {
      const { body } = await blastsHook.generateDraft.mutateAsync({
        weekStartDate, includeFocus: true, meetingIds,
      });
      pendingWrittenValueRef.current = body;
      pendingGeneratedSyncRef.current = true;
      setEditedBody(body);
    } catch {
      // Failure toast already shown by the hook's onError.
    } finally {
      draftingRef.current = false;
      setDrafting(false);
    }
  };

  // LRM-13: the modal only gathers a meeting selection; whether a second,
  // separate warning is needed depends on the editor's CURRENT content at
  // the moment it's confirmed (spec decision 2), not on anything the modal
  // itself tracks.
  const onConfirmSummarizeModal = () => {
    setSummarizeOpen(false);
    if (hasBlastBodyContent(editedBody)) {
      setReplaceConfirmOpen(true);
    } else {
      runSummarize(buildSummarizeMeetingIds(meetingSelection, weekMeetings.map((m) => m.id)));
    }
  };

  const onReplaceConfirm = () => {
    setReplaceConfirmOpen(false);
    runSummarize(buildSummarizeMeetingIds(meetingSelection, weekMeetings.map((m) => m.id)));
  };

  // LRM-8: sends ONLY the current editor text -- never the week's focus
  // items or meeting notes -- and replaces the editor with the result. The
  // replacement autosaves like any other edit, same as Summarize.
  const onPolishClick = async () => {
    if (!draftBlast) return;
    // Codex review (PR #115): capture what was sent and which row it was
    // for, so a slow response can be recognized as stale and dropped
    // instead of stomping newer typing or another week's editor.
    const requestedBody = editedBody;
    const requestedBlastId = draftBlast.id;
    setPolishing(true);
    try {
      const polished = await blastsHook.polishDraft.mutateAsync(requestedBody);
      const staleRow = draftBlastRef.current?.id !== requestedBlastId;
      const staleText = editedBodyRef.current !== requestedBody;
      if (staleRow || staleText) {
        toast({
          title: 'Polish discarded',
          description: staleRow
            ? 'You moved to a different week while polishing, so the result was not applied.'
            : 'The text changed while polishing, so the result was not applied. Polish again when ready.',
        });
        return;
      }
      setEditedBody(polished);
    } catch {
      // Failure toast already shown by the hook's onError.
    } finally {
      setPolishing(false);
    }
  };

  // blast-send-trap incident: the editor is local state, previously
  // persisted only by an explicit "Save draft" click, while both send paths
  // read `body` (and `subject`) straight from the DB row. A real user edited
  // her draft and clicked Send; the stale saved AI draft reached 16 doctors
  // instead of what she was looking at. Both send paths now persist
  // editedBody AND editedSubject first, whenever either differs from what's
  // saved (needsSaveBeforeSend), and only proceed on that save's success --
  // see the function's own doc comment for why "differs" is intentionally
  // the conservative, no-normalization strict comparison for body, and why
  // subject gets one narrow, provably-safe exception.
  //
  // QA follow-up: the first version of this saved `subject: draftBlast.subject`
  // (the STALE saved subject), matching the Polish/Regenerate convention of
  // never touching subject. That reproduced the exact same incident class
  // for a subject-only edit -- the review dialog renders
  // `subject={editedSubject}` (the live input) while the send reads the DB
  // row, so the dialog previewed the new subject and the email went out
  // with the old one. The send path's contract is different from
  // Polish/Regenerate on purpose: generation paths must never clobber a
  // subject she's mid-typing while a draft/polish call is in flight, but
  // Send and Test-send are what-you-see-is-what-sends for every visible
  // field, so they now persist `subject: editedSubject` here, verbatim.
  //
  // The in-flight lock this shares with autosave (blastsHook.updateBlastBody
  // .isPending disables both send buttons, see the JSX below) means a
  // concurrent autosave can't race this one.
  const onTestSendClick = async () => {
    if (!draftBlast) return;
    if (needsSaveBeforeSend(editedBody, editedSubject, draftBlast.body, draftBlast.subject, buildDefaultBlastSubject(weekStartDate))) {
      try {
        await persistNow(editedBody, editedSubject);
      } catch {
        // Failure toast already shown by the hook's onError (including the
        // sent-status seatbelt inside updateBlastBody) -- do not fire the
        // test send on a failed pre-send save.
        return;
      }
    }
    blastsHook.testSendBlast.mutate(draftBlast.id, {
      onSuccess: (data) => toast({ title: 'Test sent', description: `Sent to ${data.email}.` }),
    });
  };

  const onSendClick = async () => {
    if (!draftBlast) return;
    setRecipientsLoading(true);
    try {
      if (needsSaveBeforeSend(editedBody, editedSubject, draftBlast.body, draftBlast.subject, buildDefaultBlastSubject(weekStartDate))) {
        // Persist before recipients are even fetched, let alone the review
        // dialog opens -- the dialog previews no body and previews subject
        // from live editor state, not the DB row, so this is the only gate
        // standing between a stale draft (or stale subject) and a real
        // send.
        await persistNow(editedBody, editedSubject);
      }
      const list = await blastsHook.fetchRecipients.mutateAsync();
      // Fresh every open: nothing carries over from a previous review.
      setRecipients(list);
      setExcludedIds(new Set());
      // QA fix carried from LRM-2: zero eligible doctors means there's
      // nothing to review -- show a plain message instead of opening the
      // review step for a send the edge function would reject anyway.
      if (canConfirmSend(list.length)) {
        setReviewOpen(true);
      } else {
        toast({ title: 'No doctors to send to', description: 'There are no doctors to send this to yet.' });
      }
    } catch {
      // Failure toast already shown by the hook's onError -- whether the
      // pre-send save or the recipients lookup failed, stop here in both
      // cases and never open the review dialog.
    } finally {
      setRecipientsLoading(false);
    }
  };

  const includedCount = recipients.length - excludedIds.size;

  const confirmSend = () => {
    if (!draftBlast) return;
    blastsHook.sendBlast.mutate(
      { blastId: draftBlast.id, excludedStaffIds: deriveExclusionIds(excludedIds) },
      {
        onSuccess: (data) => {
          setReviewOpen(false);
          // QA fix: a partial failure must be visible, not swallowed into a
          // clean "sent" toast.
          if (data.failed > 0) {
            toast({
              title: 'Sent with some failures',
              description: `${data.sent} sent, ${data.failed} failed. Check the recipient list and try again if needed.`,
              variant: 'destructive',
            });
          } else {
            toast({ title: 'Sent to doctors' });
          }
        },
      },
    );
  };

  // LRM-12: discards the open draft outright (blastsHook.deleteDraft is
  // draft-only, same seatbelt pattern as updateBlastBody -- see the hook).
  // Confirmed via discardConfirmOpen below before this ever runs.
  //
  // QA fix: synchronous re-entry guard, same pattern as
  // onCreateEmptyDraftClick/runSummarize -- deleteDraft.isPending lags a
  // render behind, so a fast double-click on the confirm button could
  // otherwise fire two deletes.
  const discardingRef = useRef(false);
  const onDiscardConfirm = () => {
    if (!draftBlast) return;
    if (discardingRef.current) return;
    discardingRef.current = true;
    // QA fix: cancel any pending debounced autosave BEFORE the delete
    // fires. Without this, typing and then discarding within the ~1.75s
    // debounce window still lets the stale timer fire after the row is
    // gone -- updateBlastBody's draft-only scope matches zero rows, and its
    // "no longer editable" toast pops right after an otherwise-clean
    // discard.
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    blastsHook.deleteDraft.mutate(draftBlast.id, {
      onSuccess: () => toast({ title: 'Draft discarded' }),
      onSettled: () => { discardingRef.current = false; },
    });
    setDiscardConfirmOpen(false);
  };

  return (
    <div className="space-y-2.5">
      {/* LRM-12: sent blasts stack oldest-first (newest last), read-only. */}
      {sentBlasts.map((b) => (
        <SentBlastCard key={b.id} blast={b} />
      ))}

      {draftBlast ? (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div className="flex-1">
              <Label htmlFor="blast-subject" className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Subject</Label>
              <Input id="blast-subject" value={editedSubject} onChange={(e) => setEditedSubject(e.target.value)} onBlur={flushSave} />
            </div>
            {/* LRM-13: the save-state indicator lives in the old "Save
                draft" button's slot, tracking dirty state, not the network
                request (see leadWeekBlastSaveState.ts). */}
            <SaveIndicatorLabel state={saveIndicator} />
          </div>
          <RichTextEditor
            value={editedBody}
            onChange={setEditedBody}
            onReady={onEditorReady}
            onBlur={flushSave}
            modules={BLAST_QUILL_MODULES}
            placeholder="Write the blast body here…"
            className="bg-background rounded-md [&_.ql-editor]:min-h-[220px]"
          />
          <div className="flex flex-wrap items-center gap-2">
            {/* LRM-13: Discard relocated here -- visible without scrolling
                whenever a draft is open, and clearly quieter than Send
                (ghost variant, muted text, no fill) rather than the old
                barely-visible text link below the action row. */}
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setDiscardConfirmOpen(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />Discard draft
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={drafting || polishing || weekMeetings.length === 0}
              onClick={onSummarizeClick}
            >
              {drafting ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Summarizing…</>
              ) : (
                <><Sparkles className="mr-1.5 h-4 w-4" />Summarize meeting</>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!canPolish(editedBody, drafting || polishing)}
              onClick={onPolishClick}
            >
              {polishing ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Polishing…</>
              ) : (
                <><Sparkles className="mr-1.5 h-4 w-4" />Polish</>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasBlastBodyContent(editedBody) || drafting || polishing || blastsHook.updateBlastBody.isPending || blastsHook.testSendBlast.isPending}
              onClick={onTestSendClick}
            >
              {blastsHook.testSendBlast.isPending ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Sending test…</>
              ) : (
                <><Send className="mr-1.5 h-4 w-4" />Send a test to me</>
              )}
            </Button>
            <Button size="sm" className="ml-auto" disabled={!hasBlastBodyContent(editedBody) || drafting || polishing || blastsHook.updateBlastBody.isPending || recipientsLoading} onClick={onSendClick}>
              {recipientsLoading ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Checking…</>
              ) : (
                <><Mail className="mr-1.5 h-4 w-4" />Send to doctors</>
              )}
            </Button>
          </div>

          <AlertDialog open={replaceConfirmOpen} onOpenChange={setReplaceConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Replace your text?</AlertDialogTitle>
                <AlertDialogDescription>The meeting summary will replace what's currently in the editor. Your text will be lost.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onReplaceConfirm}>Replace</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep editing</AlertDialogCancel>
                <AlertDialogAction disabled={blastsHook.deleteDraft.isPending} onClick={onDiscardConfirm}>Discard</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <RecipientReviewDialog
            open={reviewOpen}
            onOpenChange={setReviewOpen}
            subject={editedSubject}
            recipients={recipients}
            excludedIds={excludedIds}
            onExcludedIdsChange={setExcludedIds}
            includedCount={includedCount}
            sending={blastsHook.sendBlast.isPending}
            onConfirm={confirmSend}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          <Mail className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          {/* W3: explain what a draft draws from instead of a bare disabled
              button -- only needed the first time, before anything has been
              sent yet. */}
          {sentBlasts.length === 0 && (
            <p className="text-xs text-muted-foreground">Write it yourself, or summarize this week's meeting once the draft is open.</p>
          )}
          <div className="mt-3">
            <Button disabled={!canStartDraft || blastsHook.createBlast.isPending} onClick={onCreateEmptyDraftClick}>
              {blastsHook.createBlast.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</>
              ) : (
                <><Plus className="mr-1.5 h-4 w-4" />{sentBlasts.length > 0 ? 'New blast' : 'Draft blast'}</>
              )}
            </Button>
          </div>
        </div>
      )}

      <SummarizeMeetingDialog
        open={summarizeOpen}
        onOpenChange={setSummarizeOpen}
        meetings={weekMeetings}
        state={meetingSelection}
        onToggleMeeting={(id) => setMeetingSelection((s) => toggleMeetingSelection(s, id))}
        confirming={drafting}
        onConfirm={onConfirmSummarizeModal}
      />
    </div>
  );
}

/**
 * LRM-13: the save-state indicator that replaced the old "Save draft"
 * button's slot. Purely a render of `deriveSaveIndicatorState`'s output --
 * all the "does this flicker" logic lives in that pure function, tested on
 * its own (leadWeekBlastSaveState.test.ts), not here.
 */
function SaveIndicatorLabel({ state }: { state: SaveIndicatorState }) {
  if (state === 'saving') {
    return <span className="text-2xs font-semibold text-muted-foreground">Saving…</span>;
  }
  if (state === 'not_saved') {
    return <span className="text-2xs font-semibold text-destructive">Not saved</span>;
  }
  // 'saved' -- the one state that gets the green status token, never a
  // hardcoded color (CLAUDE.md design system conventions).
  return <span className="text-2xs font-semibold" style={{ color: 'hsl(var(--status-complete))' }}>Saved</span>;
}

/**
 * LRM-13: the meetings-only modal behind "Summarize meeting", replacing
 * LRM-12's SourcePickerDialog. No focus checkbox -- the edge function
 * includes the week's published focus automatically (spec decision 3).
 * Meeting labels use the same day-abbreviation + date + title format as
 * MeetingSlot (formatMeetingLabel). The confirm button disables until at
 * least one meeting is checked.
 */
function SummarizeMeetingDialog({
  open, onOpenChange, meetings, state, onToggleMeeting, confirming, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetings: LeadMeetingRow[];
  state: MeetingSelectionState;
  onToggleMeeting: (meetingId: string) => void;
  confirming: boolean;
  onConfirm: () => void;
}) {
  const canConfirm = hasAnyMeetingChecked(state);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Summarize which meetings?</DialogTitle>
          <DialogDescription>Check at least one meeting to summarize into the composer.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {meetings.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-lg border p-2.5">
              <Checkbox
                id={`summarize-meeting-${m.id}`}
                checked={state.checkedMeetingIds.has(m.id)}
                onCheckedChange={() => onToggleMeeting(m.id)}
              />
              <Label htmlFor={`summarize-meeting-${m.id}`} className="text-sm">{formatMeetingLabel(m.meeting_date, m.title)}</Label>
            </div>
          ))}
        </div>

        {!canConfirm && <p className="text-xs text-muted-foreground">Check at least one meeting.</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canConfirm || confirming} onClick={onConfirm}>
            {confirming ? (
              <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Summarizing…</>
            ) : 'Summarize'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * LRM-4: the "Send to doctors" review step. Groups the resolved cohort by
 * location (Roaming for doctors with no home location), lets her narrow the
 * send with per-doctor, per-location, and top-level toggles, and shows a
 * live "Sending to N of M doctors" line. Everyone starts checked and
 * nothing carries over between opens -- the parent resets excludedIds each
 * time it fetches a fresh recipient list.
 */
function RecipientReviewDialog({
  open, onOpenChange, subject, recipients, excludedIds, onExcludedIdsChange, includedCount, sending, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  recipients: LeadWeekBlastRecipient[];
  excludedIds: Set<string>;
  onExcludedIdsChange: (next: Set<string>) => void;
  includedCount: number;
  sending: boolean;
  onConfirm: () => void;
}) {
  const groups = groupRecipientsByLocation(recipients);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send to doctors</DialogTitle>
          {/* LRM-12: names the live included count instead of the old
              "It cannot be sent twice" (no longer true -- another blast can
              follow this one). */}
          <DialogDescription>{buildSendConfirmBody(includedCount)}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-2.5">
          <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Subject</span>
          <p className="text-sm font-semibold">{subject}</p>
        </div>

        {/* LRM-12: explicit Select all / Select none, replacing the old
            single "Everyone" checkbox -- from a partial selection (some
            doctors excluded, some not) a single toggle can't tell "go to
            all" and "go to none" apart without a second click, which is
            exactly the two-doctor-send case this ticket adds. */}
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-semibold" onClick={() => onExcludedIdsChange(selectAllRecipients())}>
              Select all
            </Button>
            <span className="text-muted-foreground">·</span>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-semibold" onClick={() => onExcludedIdsChange(selectNoRecipients(recipients))}>
              Select none
            </Button>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">{buildSendingSummary(recipients.length, excludedIds.size)}</span>
        </div>

        {/*
          LRM-8: fixed header/subject/Everyone toggle above, fixed footer
          below -- only this region scrolls. flex-1 (not a fixed max-h) lets
          it take exactly whatever space is left inside DialogContent's own
          max-h-[85vh] budget, so it stays reachable regardless of how many
          location groups or doctors there are. min-h-0 overrides the flex
          item's default min-height:auto, which otherwise refuses to shrink
          below its content size and lets the list spill out of the dialog
          uncontained instead of scrolling internally -- the actual bug
          reported live with 15+ recipients.
        */}
        <ScrollArea className="-mx-1 min-h-0 flex-1 px-1">
          <div className="space-y-3">
            {groups.map((group) => {
              const groupChecked = isGroupFullyIncluded(excludedIds, group);
              return (
                <div key={group.key} className="rounded-lg border p-2.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <Checkbox
                      id={`blast-group-${group.key}`}
                      checked={groupChecked}
                      onCheckedChange={() => onExcludedIdsChange(toggleGroupExclusion(excludedIds, group))}
                    />
                    <Label htmlFor={`blast-group-${group.key}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </Label>
                  </div>
                  <div className="space-y-1.5 pl-6">
                    {group.doctors.map((doctor) => (
                      <div key={doctor.staff_id} className="flex items-center gap-2">
                        <Checkbox
                          id={`blast-doctor-${doctor.staff_id}`}
                          checked={!excludedIds.has(doctor.staff_id)}
                          onCheckedChange={() => onExcludedIdsChange(toggleDoctorExclusion(excludedIds, doctor.staff_id))}
                        />
                        <Label htmlFor={`blast-doctor-${doctor.staff_id}`} className="text-sm">{doctor.name}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {includedCount === 0 && (
          <p className="text-xs text-muted-foreground">Everyone is excluded. Check at least one doctor to send.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={sending || includedCount === 0} onClick={onConfirm}>
            {sending ? (
              <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Sending…</>
            ) : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── existing focus slot pieces (unchanged behavior) ─────────────────────────

function SelectedWeek({ week, when, monday, onBuild }: { week: HydratedFocusWeek | null; when: WeekWhen; monday: string; onBuild: () => void }) {
  const live = when === 'current';
  if (week && week.items.length > 0) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{when === 'past' ? 'What you covered' : 'Scheduled'}</span>
          {live && <span className="inline-flex items-center gap-1.5 text-2xs font-bold text-[color:var(--domain-clinical,#0E7C86)]">● live on lead homes</span>}
        </div>
        {week.items.map((it, i) => <FocusRow key={it.id} idx={i} text={it.text} outcome={when === 'past' ? it.outcome : undefined} />)}
        {week.framing && <p className="mt-2.5 text-sm italic text-muted-foreground">“{week.framing}”</p>}
        {when !== 'past' && <Button variant="outline" size="sm" className="mt-3" onClick={onBuild}>Edit</Button>}
      </div>
    );
  }
  // B2: a past empty week is legitimately finished, not a chore left undone --
  // no CTA that would publish a focus into a finished week, and no "...yet"
  // wording (omit-absent-content rule; there is no "yet" about the past).
  if (when === 'past') {
    return <div className="rounded-lg border border-dashed py-12" />;
  }
  return (
    <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
      Nothing set for {fmtShort(monday)} yet.
      <div className="mt-3"><Button onClick={onBuild}><Plus className="mr-1.5 h-4 w-4" />{when === 'current' ? "Set this week's focus" : 'Plan this week'}</Button></div>
    </div>
  );
}

function FocusRow({ idx, text, outcome }: { idx: number; text: string; outcome?: string }) {
  return (
    <div className="flex items-start gap-3 border-t py-2.5 first:border-0">
      <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{idx + 1}</span>
      <div className="flex-1">
        <div className="text-sm font-semibold">{text}</div>
        {outcome && <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-2xs font-bold text-muted-foreground">{OUTCOME_META[outcome as keyof typeof OUTCOME_META]?.label ?? outcome}</span>}
      </div>
    </div>
  );
}

function Builder(props: {
  weekLabel: string; when: WeekWhen; items: BuilderItem[]; framing: string; own: string; availIssues: CoachingIssue[]; publishing: boolean;
  onOwn: (v: string) => void; onAddOwn: () => void; onAddIssue: (i: CoachingIssue) => void; onEdit: (k: string, v: string) => void; onRemove: (k: string) => void;
  onPolish: (k: string) => void; onFraming: (v: string) => void; onSchedule: () => void; onCancel: () => void;
}) {
  const { items, availIssues, when } = props;
  const live = when === 'current';
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold">Set focus · {props.weekLabel}</h3>
        <Button variant="ghost" size="sm" onClick={props.onCancel}>Cancel</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-[1.35fr_1fr]">
        {/* left: slots */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">This week (1–2)</span>
            {items.length >= 2 && <span className="text-2xs font-bold text-muted-foreground">Two is the cap</span>}
          </div>
          {[0, 1].map((n) => {
            const it = items[n];
            if (!it) return <div key={n} className="mb-3 rounded-xl border border-dashed p-3.5 text-xs text-muted-foreground">Add an issue from the right, or write your own.</div>;
            return (
              <div key={it.key} className="mb-3 rounded-xl border p-3">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{n + 1}</span>
                  <div className="flex-1">
                    <Textarea value={it.text} onChange={(e) => props.onEdit(it.key, e.target.value)} rows={2} className="font-semibold" />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border bg-background px-2 py-0.5 text-2xs font-semibold text-muted-foreground">{it.sourceTitle ? `from: ${it.sourceTitle.slice(0, 24)}${it.sourceTitle.length > 24 ? '…' : ''}` : 'written by you'}</span>
                        {it.aiPolished && <span className="inline-flex items-center gap-1 text-2xs font-bold text-[color:var(--domain-clinical,#0E7C86)]"><Sparkles className="h-4 w-4" />AI-polished</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" disabled={it.polishing} onClick={() => props.onPolish(it.key)}>
                          {it.polishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="mr-1 h-4 w-4" />Polish</>}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => props.onRemove(it.key)}><X className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="my-4 h-px bg-border" />
          <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Framing note <span className="font-normal normal-case tracking-normal">(optional)</span></div>
          <Textarea value={props.framing} onChange={(e) => props.onFraming(e.target.value)} rows={2} placeholder="e.g. Two small things this week, both about starting strong with the family." />
          <Button className="mt-3.5" disabled={props.publishing || !items.length} onClick={props.onSchedule}>
            {props.publishing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scheduling…</> : 'Schedule this week →'}
          </Button>
          <p className="mt-2.5 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {live ? 'Pushes to the lead homes and moves' : 'Saves to this week and moves'} the sourcing issues to <span className="font-semibold text-[color:var(--domain-clinical,#0E7C86)]">Communicated</span>.
          </p>
        </div>
        {/* right: issues menu */}
        <div className="self-start rounded-xl border p-3.5">
          <h3 className="text-sm font-bold">Pull from your issues</h3>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">Click <b>+ Focus</b> to promote one. Declaring moves it to Communicated.</p>
          <div className="mb-3.5 flex gap-2">
            <Input value={props.own} onChange={(e) => props.onOwn(e.target.value)} placeholder="Or write your own…" onKeyDown={(e) => { if (e.key === 'Enter') props.onAddOwn(); }} />
            <Button variant="outline" size="sm" onClick={props.onAddOwn}>Add</Button>
          </div>
          {availIssues.length === 0 ? (
            <div className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">No open issues to pull.</div>
          ) : availIssues.map((iss) => (
            <div key={iss.id} className="mb-2.5 rounded-lg border p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 text-xs font-semibold">{iss.title}</div>
                <Button size="sm" disabled={items.length >= 2} onClick={() => props.onAddIssue(iss)}><Plus className="mr-1 h-4 w-4" />Focus</Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {iss.is_global && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-semibold text-primary">Global</span>}
                {iss.sources.map((s: SourceType) => <span key={s} className="rounded-full border bg-background px-1.5 py-0.5 text-2xs text-muted-foreground">{SOURCE_META[s].label}</span>)}
                {iss.sources.length >= 2 && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs font-bold text-primary">×{iss.sources.length}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

-- LRM-13: optional Title field on lead_meetings, so the meeting labels shown
-- in MeetingSlot and the summarize modal can disambiguate same-day meetings
-- (e.g. two Friday meetings in one week). Additive, nullable, no backfill,
-- no RLS change: lead_meetings' existing author-only policy is column-
-- agnostic and already covers this column. Safe to apply before the
-- frontend publishes; old code simply ignores the new column.
-- Not a framework-versioned table (see CLAUDE.md), so no app.change_reason.

alter table public.lead_meetings
  add column if not exists title text;

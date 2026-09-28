-- Ask Alcan answer feedback (spec: docs/specs/ask-answer-feedback.md).
--
-- Thumbs up/down + an optional short note on an Ask Alcan answer, plus the
-- first read path for anyone besides the asker into Ask Alcan chat text: a
-- super-admin-only function that returns rated exchanges so the team can
-- find weak answers and fix the corpus, without reading private chats.
--
-- THE CONSENT RULE THIS MIGRATION MUST KEEP (John, 2026-09-28): rating an
-- answer is the asker's explicit OK to share THAT ONE exchange (their
-- question and the answer) with the Ask Alcan team, and nothing else from
-- the chat. Consequences enforced below:
--   - No new or changed policy on ask_conversations or ask_messages. Their
--     asker-only rules (supabase/migrations/20260821120000_ask1_corpus_backbone.sql)
--     stay exactly as they are.
--   - ask_message_feedback itself is owner-only under RLS. There is no
--     super-admin policy on it — super admins never read this table
--     directly, only through list_ask_answer_feedback() below, which starts
--     from ask_message_feedback so an unrated message can never come out.
--   - message_id is unique + FK ... on delete cascade, and staff_id is FK
--     ... on delete cascade: clearing a rating (the app deletes the row) or
--     deleting the conversation (which cascades ask_messages, which cascades
--     this table) both remove the exchange from the admin list.
--   - The admin function returns no asker identity. Name is left out on
--     purpose; adding it later is a separate product decision.
--
-- No app.change_reason needed: ask_message_feedback is not a framework
-- table (framework_history capture only covers pro_moves / pro_move_resources).
--
-- Idempotent throughout: this is pasted into the Supabase SQL Editor, not
-- run via `supabase db push` (see CLAUDE.md, "Applying migrations").

-- ─── Table ───────────────────────────────────────────────────────────────────

create table if not exists public.ask_message_feedback (
  id          uuid primary key default gen_random_uuid(),
  -- One rating per answer, changeable. Deleting the answer (which cascades
  -- from deleting its conversation) removes the rating.
  message_id  uuid not null unique references public.ask_messages(id) on delete cascade,
  -- The rater, always the asker (enforced by the RLS policy below, not just
  -- convention).
  staff_id    uuid not null references public.staff(id) on delete cascade,
  rating      smallint not null check (rating in (-1, 1)), -- -1 down, 1 up
  -- Optional. Any rating may carry one, though the UI only offers the box
  -- on thumbs down.
  note        text check (note is null or char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- For the admin list: newest first.
create index if not exists idx_ask_message_feedback_created_at
  on public.ask_message_feedback(created_at desc);

drop trigger if exists trg_ask_message_feedback_updated_at on public.ask_message_feedback;
create trigger trg_ask_message_feedback_updated_at
  before update on public.ask_message_feedback
  for each row execute function public.corpus_set_updated_at();

-- ─── RLS: owner-only, mirrors ask_messages_owner_all ──────────────────────────
--
-- The caller must both (a) be the staff_id on the row and (b) be the owner
-- (via ask_conversations.staff_id) of the conversation holding the assistant
-- message being rated. (b) also blocks rating a 'user'-role message (you
-- can't rate your own question) since the exists() requires role = 'assistant'.
--
-- Deliberately no other policy: super admins get NO direct read/write path
-- to this table. Their only access is list_ask_answer_feedback() below.

alter table public.ask_message_feedback enable row level security;

drop policy if exists ask_message_feedback_owner_all on public.ask_message_feedback;
create policy ask_message_feedback_owner_all on public.ask_message_feedback
  for all
  using (
    staff_id = public.get_current_staff_id()
    and exists (
      select 1
      from public.ask_messages m
      join public.ask_conversations c on c.id = m.conversation_id
      where m.id = ask_message_feedback.message_id
        and m.role = 'assistant'
        and c.staff_id = public.get_current_staff_id()
    )
  )
  with check (
    staff_id = public.get_current_staff_id()
    and exists (
      select 1
      from public.ask_messages m
      join public.ask_conversations c on c.id = m.conversation_id
      where m.id = ask_message_feedback.message_id
        and m.role = 'assistant'
        and c.staff_id = public.get_current_staff_id()
    )
  );

-- Local Supabase doesn't auto-grant table privileges to API roles the way
-- hosted does; grant explicitly, as the ASK-1 migration does. RLS still
-- governs what authenticated can see (anon gets nothing, no grant given).
grant select, insert, update, delete on public.ask_message_feedback to authenticated, service_role;

-- ─── Admin read function ─────────────────────────────────────────────────────
--
-- Super-admin-only (raises on anyone else). Starts FROM ask_message_feedback
-- so an unrated message can never be reached through it. No asker identity
-- in the result, on purpose. p_rating filters to one rating when given
-- (-1 down, 1 up); null (default) returns both.

create or replace function public.list_ask_answer_feedback(p_rating smallint default null)
returns table (
  feedback_id        uuid,
  rating             smallint,
  note               text,
  created_at         timestamptz,
  answer             text,
  cited_document_ids uuid[],
  question           text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    f.id as feedback_id,
    f.rating,
    f.note,
    f.created_at,
    am.content as answer,
    am.cited_document_ids,
    (
      -- The question: the latest 'user' message in the same conversation
      -- that came before the answer.
      select uq.content
      from public.ask_messages uq
      where uq.conversation_id = am.conversation_id
        and uq.role = 'user'
        and uq.created_at < am.created_at
      order by uq.created_at desc
      limit 1
    ) as question
  from public.ask_message_feedback f
  join public.ask_messages am on am.id = f.message_id
  where p_rating is null or f.rating = p_rating
  order by f.created_at desc;
end;
$$;

revoke all on function public.list_ask_answer_feedback(smallint) from public, anon;
grant execute on function public.list_ask_answer_feedback(smallint) to authenticated;

-- ─── Sanity check ────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'ask_message_feedback'
  ) then
    raise exception 'ask_answer_feedback sanity check failed: table public.ask_message_feedback is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ask_message_feedback'
      and policyname = 'ask_message_feedback_owner_all'
  ) then
    raise exception 'ask_answer_feedback sanity check failed: policy ask_message_feedback_owner_all is missing';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ask_message_feedback'
  ) and (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'ask_message_feedback'
  ) <> 1 then
    raise exception 'ask_answer_feedback sanity check failed: expected exactly one policy on ask_message_feedback (owner-only, no super-admin policy)';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'list_ask_answer_feedback'
  ) then
    raise exception 'ask_answer_feedback sanity check failed: function public.list_ask_answer_feedback is missing';
  end if;
end;
$$;

-- ─── Verification checklist (run by hand after applying; not executed by this file) ──
--
-- No local DB exists for this repo (see CLAUDE.md), so this is a checklist
-- for QA / John to run against the live project after pasting the migration
-- into the SQL Editor, before signing off on step 1. Use two real accounts:
-- staff A owns a conversation with at least one assistant message; staff B
-- is any other staff member; superadmin is a super-admin account.
--
-- 1. Asker can rate only their own assistant messages.
--    As staff A (via the app, or `set local role authenticated; set local
--    request.jwt.claims...` in the SQL editor scoped to A's session):
--      insert into ask_message_feedback (message_id, staff_id, rating)
--      values ('<A''s assistant message id>', '<A''s staff id>', 1);
--    Expect: 1 row inserted.
--
--    Still as A, try to rate A's own USER-role message in the same
--    conversation:
--      insert into ask_message_feedback (message_id, staff_id, rating)
--      values ('<A''s user message id>', '<A''s staff id>', 1);
--    Expect: rejected (RLS with-check fails: the exists() requires
--    m.role = 'assistant').
--
-- 2. Other users cannot read or write the row.
--    As staff B:
--      select * from ask_message_feedback where message_id = '<A''s
--      assistant message id>';
--    Expect: 0 rows (RLS using-clause fails: staff_id / conversation
--    ownership both belong to A, not B).
--
--    Still as B, try to insert a feedback row against A's message:
--      insert into ask_message_feedback (message_id, staff_id, rating)
--      values ('<A''s assistant message id>', '<B''s staff id>', 1);
--    Expect: rejected (the exists() requires the conversation's staff_id to
--    equal the caller, which is B, but the conversation belongs to A).
--
--    Still as B, try to update or delete A's row directly by id:
--      update ask_message_feedback set rating = -1 where id = '<A''s
--      feedback id>';
--    Expect: 0 rows affected.
--
-- 3. A non-super-admin calling the function gets an error.
--    As staff A or B (neither is a super admin):
--      select * from list_ask_answer_feedback();
--    Expect: error "Not authorized".
--
--    As a super admin:
--      select * from list_ask_answer_feedback();
--    Expect: rows back, newest first, no staff_id / asker identity column
--    in the result at all.
--      select * from list_ask_answer_feedback(-1);
--    Expect: only rating = -1 rows.
--      select * from list_ask_answer_feedback(1);
--    Expect: only rating = 1 rows.
--
--    As a super admin, confirm the direct-table door stays shut:
--      select * from ask_message_feedback;
--    Expect: 0 rows (no super-admin policy exists on the table itself;
--    is_superadmin() is checked only inside the function, never in a
--    table policy).

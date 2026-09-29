# Spec: Ask Alcan answer feedback

Ticket: `docs/archive/engine/tickets/ask-answer-feedback.md`  
Lane: cross-cutting

## What and why

People using Ask Alcan can give any answer a thumbs up or a thumbs down, and
after a thumbs down they can add a short optional note about what was off. A
small line by the buttons tells them that rating shares that one question and
answer with the Ask Alcan team. A super admin then sees a list of rated
answers, newest first, so the team can find weak answers and fix the documents
behind them. This is the "watch the logs weekly, tune the corpus" loop from
the pilot plan (`docs/features/ask-alcan-assistant.md`, section H), done with
the asker's say-so instead of by reading private chats.

## The consent rule this spec must keep

Ask Alcan chats are private to the asker. The ASK-1 migration says no one else
gets a read path to `ask_conversations` or `ask_messages` without an explicit
product decision. John's decision (2026-09-28): **rating an answer is the
asker's explicit OK to share that one exchange** (their question and the
answer), and nothing else from the chat. Consequences the build must honour:

- No new policy on `ask_conversations` or `ask_messages`. Their asker-only
  rules stay exactly as they are.
- The only admin read path is a super-admin-only function that returns rated
  exchanges. An unrated message is never reachable by it.
- Clearing a rating, or deleting the conversation, removes the exchange from
  the admin list (the feedback row goes, by cascade or by delete).
- The admin list does not show who asked. (Name is left out on purpose;
  adding it later is a separate decision.)
- The privacy line at the top of Ask Alcan changes to: "Your conversations
  are private to you. If you rate an answer, that one question and answer is
  shared with the Ask Alcan team." (John, 2026-09-28, after QA found the old
  "not even admins" line.)
- Switching a rating from down to up clears the note (John, 2026-09-28), so a
  helpful rating never carries a "what was off" note.

## Acceptance script

Right now only super admins can open Ask Alcan, so every step is done as a
super admin. Use two super-admin accounts (A and B) for the privacy steps.

1. As super admin A, open Ask Alcan and ask a question. When the answer
   appears, expect a thumbs up and a thumbs down under it, and a short line
   saying rating shares this question and answer with the Ask Alcan team.
   Your own questions have no buttons.
2. Tap thumbs up. Expect it to stay highlighted, and to still be highlighted
   after reloading the page.
3. Tap thumbs down on the same answer. Expect the rating to switch to down,
   and a small optional box asking what was off. Type a short note and save.
   Expect a quiet confirmation, and the note kept after a reload.
4. Tap thumbs up. Expect the rating to switch to up and the note to be gone.
   Tap thumbs down, add a note again, then tap thumbs down again (the one
   already chosen). Expect the rating to clear,
   and the note with it.
5. Rate a different answer thumbs down and skip the note. Expect that to work
   with no note.
6. As super admin A, open Admin, then the Ask Alcan tab. Expect an "Answer
   feedback" section listing each rated answer, newest first: the date, up or
   down, the note if any, the question, the answer (shortened, with a way to
   see all of it), and the titles of the documents it cited. No name.
7. In that list, filter to thumbs down only. Expect only the down ratings.
8. Expect the answer you cleared in step 4 to be absent.
9. As super admin B, open Ask Alcan and look at the conversation list. Expect
   to see only B's own chats, never A's, exactly as before this change.
10. As super admin A, delete the conversation from step 5. Go back to the
    admin list without reloading. Expect that rated answer to be gone.
    Also check the question shown next to the first answer in a brand new
    chat is that answer's own question.
11. As any user who is not a super admin (participant, coach, office manager,
    org admin, doctor), check that Ask Alcan and the Answer feedback section
    are still hidden, as before.

## Personas to test as

Every persona in the config (participant, coach, office manager, org admin,
doctor) for step 11, plus two super-admin accounts for steps 1 to 10. Ask
Alcan is super-admin only today, so the personas mainly prove nothing leaked.

## Parts of the app it touches

- `supabase/migrations/` (one new migration file)
- `src/hooks/useAskAlcanChat.ts` (or a new sibling `src/hooks/useAskFeedback.ts`)
- `src/pages/ask/AskPage.tsx` (the `ChatMessage` component and its caller)
- `src/components/admin/surveys/AdminSurveysTab.tsx` (host the new section) and
  a new `src/components/admin/ask/AnswerFeedbackSection.tsx`

## Out of scope

- Opening Ask Alcan to anyone beyond super admins.
- Showing who asked, any export, emails or alerts about new feedback.
- Any change to the ask-alcan edge functions or to how answers are made.
- Any new read path to whole conversations.
- Rating the user's own questions, or rating an answer more than once
  (one rating per answer, changeable).

## DB impact

One additive migration. New table and function only; no existing table,
column, or policy changes. Apply order: **apply the SQL before the frontend
deploy** (the new buttons write to the table, so it must exist first). Being
additive, it is harmless to live code that does not use it yet.

Start the file with a header comment naming this spec and restating the
consent rule. Idempotent throughout (`if not exists`, `create or replace`,
`drop policy if exists`), because it is pasted into the SQL Editor
(`CLAUDE.md:79-88`). No `app.change_reason` needed (no framework tables).

**Table `public.ask_message_feedback`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk, `gen_random_uuid()` | |
| `message_id` | uuid not null, unique, FK `ask_messages(id)` on delete cascade | one rating per answer; deleting the chat removes it |
| `staff_id` | uuid not null, FK `staff(id)` on delete cascade | the rater, always the asker |
| `rating` | smallint not null, check `in (-1, 1)` | -1 down, 1 up |
| `note` | text null, check `char_length(note) <= 500` | optional, any rating may carry one but the UI offers it on down |
| `created_at`, `updated_at` | timestamptz not null default now() | reuse `public.corpus_set_updated_at()` trigger |

Index on `(created_at desc)` for the admin list.

**RLS on the table**: enable it. One owner policy `for all`, using and with
check: `staff_id = public.get_current_staff_id()` **and** the message is an
`assistant` message in a conversation whose `staff_id` is the caller's
(mirrors `ask_messages_owner_all` in
`supabase/migrations/20260821120000_ask1_corpus_backbone.sql:142-160`). No
other policy: super admins do not read the table directly.

**Admin read function** `public.list_ask_answer_feedback(p_rating smallint default null)`:
`security definer`, `set search_path = public`, first line raises if
`not public.is_superadmin()`. Returns one row per feedback row (filtered by
`p_rating` when given): feedback id, rating, note, created_at, the answer's
content and `cited_document_ids`, and the question (the latest `user` message
in the same conversation created before the answer). Newest first. It must
start from `ask_message_feedback`, so only rated exchanges can ever come out.
`revoke all ... from public, anon`; `grant execute ... to authenticated`.

Finish with a sanity `DO $$ ... $$` block that checks the table, the policy,
and the function exist.

**Types**: do not regenerate `src/integrations/supabase/types.ts`. Hand-type
the row and RPC result locally, as `useAskAlcanChat.ts` and `useAuth.tsx` do.

## Docs the builder must read

- `docs/archive/engine/principles.md` (people will see this)
- The database row: `CLAUDE.md:79-88` (migrations ship through the SQL Editor,
  idempotent, never `supabase db push`), `CLAUDE.md:104-118` (key
  relationships and the RLS ordering rule), `CLAUDE.md:137-160` (writing
  migrations)
- Code reading a new table: `docs/features/mobile-build-instructions.md:32-34`
  (never regenerate `types.ts`; hand-type what is missing)
- No routing row covers Ask Alcan yet. Proposed row, for these docs:
  `docs/features/ask-alcan-assistant.md` (sections F and H: logging and
  consent, rollout), `docs/specs/ask-1b-chat-ui-adoption.md` (how the chat
  screen is built), `supabase/migrations/20260821120000_ask1_corpus_backbone.sql`
  (the consent-scoped tables and their policies).
- `docs/design-system.md` for the buttons, note box and list (icon sizes and
  colour tokens from `CLAUDE.md`, no hard-coded Tailwind colours).
- `docs/archive/engine/living-spec.md` was still the empty template, so it adds nothing here.

## Ticket breakdown

One ticket, built in this order on one branch:

1. **The migration** (table, policy, function, sanity check). Nothing else
   depends on the screens. Write a test or a SQL check list proving: an asker
   can rate only their own assistant messages; another user cannot read or
   write the row; a non-super-admin calling the function gets an error.
2. **The rating buttons and note** in the chat, depends on 1. Buttons only on
   assistant messages; tap to set, tap the chosen one again to clear; note box
   after thumbs down, optional, saved with the rating; the consent line.
   Unit tests for the set, switch and clear logic.
3. **The admin list**, depends on 1. An "Answer feedback" section in the Admin
   Ask Alcan tab, gated by the same `useAskAlcanAccess` check, with an
   all / down / up filter and cited document titles (reuse
   `useCitedDocuments`). Leave the section out entirely when there is no
   feedback, rather than showing an empty-state message.

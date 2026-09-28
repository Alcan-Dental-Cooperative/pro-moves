# Ask Alcan answer feedback

stage: qa
lane: cross-cutting

## What changes for a user, and why

People using Ask Alcan can give an answer a thumbs up or down, and add a
short note when an answer missed. Rating shares that one question and answer
with the Ask Alcan team, and says so right by the buttons. A super admin sees
the rated answers in one list, so weak answers point straight at the
documents that need fixing, without anyone reading private chats.

## Lane

cross-cutting: a new table plus the first way for anyone besides the asker to
read Ask Alcan chat text, so who-sees-what gets the strictest review.

## Acceptance script

See `docs/specs/ask-answer-feedback.md` (11 steps: rate, switch, clear, note,
the admin list and filter, and the privacy checks with a second super admin
and every other persona).

Personas to test as: participant, coach, office manager, org admin, doctor
(nothing leaks), plus two super-admin accounts.

## Status

- QA verdict: fail: the admin list shows the wrong question next to each rated answer, and the chat header still says admins can never read chats (commit 3374cade)
- Stage: qa

---

## Technical detail

- **Spec**: `docs/specs/ask-answer-feedback.md`
- **Branch**: `feature/ask-answer-feedback`
- **PR**: none yet
- **DB change**: new table `ask_message_feedback` (owner-only RLS) and a
  super-admin-only function `list_ask_answer_feedback`. Additive. Apply the
  SQL before the frontend deploy.
- **Notes**: must not touch the asker-only policies on `ask_conversations` /
  `ask_messages`. Hand-type the new types; never regenerate `types.ts`.
- **Local run**: none
- **Shipped**: not yet
- **Undone**: no
- **Design grade**: 2.8/5 from code (design 3, originality 3, craft 2, works 3): no error states

## QA report

### QA: ask-answer-feedback (gate 2)

**Verdict: FAIL at commit 3374cade.** The admin list shows the wrong question next to a rated answer (the question from the previous exchange in that chat, or nothing at all), which both breaks the list and shares a question the asker never rated. On top of that, the Ask Alcan header still promises "No one else can read them, not even admins", which this change makes untrue, and a deleted chat stays on the admin list for up to five minutes in the same session.

Reviewed from code and tests only. `npm run check` passed (tail below).

```
tsc: clean
lint: 0 errors, 896 warnings (existing baseline; two new `any` warnings in useAskFeedback.ts, same pattern as useAskAlcanChat.ts)
Hardcoded Tailwind color check passed: 372 (down from 374 baseline).
Test Files  89 passed (89)
     Tests  1249 passed (1249)
vite build: built in 16.78s (usual >500 kB chunk warning)
EXIT 0
```

### Blocking findings (one per fix)

**B1. The admin list pairs each answer with the wrong question.** (Severity: high. It shows wrong data, and it leaks an unrated question, which breaks the consent rule. An outside reviewer would raise it.)
Both edge functions save the question and the answer in one insert (`supabase/functions/ask-alcan/index.ts:581`, `ask-alcan-v2/index.ts:548`), so the two rows get the exact same `created_at` (Postgres `now()` is fixed for the whole transaction). The migration looks up the question with `uq.created_at < am.created_at` (strictly earlier), so it never finds the matching question. It returns the question from the *previous* exchange in that conversation, or nothing (null) for the first exchange. The first case shows a super admin a question the asker never rated. Fix: pair using `<=` (the matching question is then the latest one at or before the answer), or pair explicitly, and add a post-apply check: "rate the first answer in a new chat; the admin list must show that exact question." Will it come back? Yes. Any query that pairs question and answer by strict timestamp will hit this again. The guard is that post-apply check, plus a comment in `persistExchange` noting that both rows share one timestamp.

**B2. The page header still says admins can never read chats.** (Severity: medium to high on trust. An outside reviewer would likely raise it in a privacy review.)
`src/pages/ask/AskPage.tsx:585`, which this change did not touch, always shows: "Your conversations are private to you. No one else can read them — not even admins." Once someone rates an answer, super admins *can* read that exchange. The consent line by the buttons tells the truth, but the header now contradicts it. Fix: change the header copy (for example, "...unless you rate an answer, which shares that one question and answer with the Ask Alcan team"). The spec missed this, so John should approve the wording. Note that the existing line also contains an em dash.

**B3. Acceptance step 10 fails within the same session: the admin list is cached.** (Severity: medium. It hurts the "delete removes it" promise. An outside reviewer might raise it.)
The app caches data for 5 minutes (`src/App.tsx:292`). The admin list uses the cache key `['ask','admin-feedback']`. Nothing refreshes that key: not the rating mutations (they refresh only `['ask','feedback']`, `useAskFeedback.ts:76`) and not conversation delete (`useAskAlcanChat.ts:160-161`). So step 6, then deleting the chat, then going back to Admin (step 10) still shows the deleted exchange until the cache expires or the page reloads. The same thing happens after clearing a rating. Step 8 passes only because the script clears the rating before the list is first opened. Fix: refresh `['ask','admin-feedback']` from all three mutations and from delete conversation, or give that query a stale time of 0.

**B4. Nothing tells the user when a rating fails** (principle: "Every state is designed: loading, empty, error, and success"). (Severity: medium. It is also why the design grade fails.)
- `setRating` and `clearRating` have no error handler. A failed tap just leaves the button as it was, with no toast.
- The note's Save button calls `mutateAsync` with no try/catch (`AskPage.tsx`, the Save `onClick`). A failure throws an unhandled promise rejection, "Saved." never shows, and no error appears.
- `AnswerFeedbackSection` ignores `isError`. If the admin function fails (for example, the frontend ships before the SQL, or the function raises), the section disappears as though there were no feedback.
Fix: add a toast on error (AskPage already uses `useToast`), and have the admin section show a short error line instead of hiding.

### Acceptance script

| # | Result |
|---|---|
| 1 | Code supports it, operator to confirm. Buttons render only when `role !== 'user'`; the consent line "Rating shares this question and answer with the Ask Alcan team." sits under them; the pending bubble is a user-role message, so it gets no buttons. |
| 2 | Code supports it, operator to confirm. Highlight comes from the server row (`aria-pressed`, tokenised primary tint), so it survives a reload. |
| 3 | Code supports it, operator to confirm. Switching upserts on `message_id`; the note box appears on down; Save writes the note and shows "Saved."; the note reloads from the row. |
| 4 | Code supports it, operator to confirm. Tapping the same rating deletes the row, and the note goes with it (unit tested in `nextFeedbackState`). |
| 5 | Code supports it, operator to confirm. The note is optional; a down rating with no note is a valid row. |
| 6 | **FAIL (B1).** Date, up/down, note, answer with show more/less, and cited titles (via `useCitedDocuments`) are all there, with no name. But the question shown is the previous exchange's question, or it is missing. |
| 7 | Code supports it, operator to confirm. All/Down/Up filter runs client-side (unit tested). |
| 8 | Code supports it for the script order as written, operator to confirm. If the list was already open this session, it goes stale (B3). |
| 9 | Pass by code. No policy on `ask_conversations` or `ask_messages` changed; the diff touches only the new table and function. Operator to confirm with a second super admin. |
| 10 | **FAIL in-session (B3).** The server side is correct (FK cascade from conversation to messages to feedback), but the cached admin list keeps showing the row for up to 5 minutes without a reload. |
| 11 | Pass by code, operator to confirm. `/ask` and the Admin "Ask Alcan" tab are gated by `useAskAlcanAccess` (super admin), the section gates itself a second time, and the function raises "Not authorized" for anyone else. Anon has execute revoked. |

### Browser walk

Could not run. The project config has `preview.kind: "none"` and `localRun: false`, because the app is hard-wired to the live production database and there is no staging database. Clicking through every screen and control, on phone and desktop, and judging the look on real screens is on John's list below.

### Design grade (graded from code, not screenshots; no brand pack, judged against principles and docs/design-system.md)

Overall 2.8 of 5 (design 3, originality 3, craft 2, works 3). **Fails on craft.**
- **Design quality 3:** Ghost icon buttons, a primary/destructive tint, `text-2xs` muted helper copy and shadcn cards match the existing Ask and admin screens, but nothing goes beyond that.
- **Originality 3:** Standard thumbs pattern and a cards list with library defaults, which is appropriate here but not distinctive.
- **Craft 2:** The error state is missing everywhere (B4), which the principles require. On a phone, the filter chips are 28px tall (`h-7`), below a comfortable tap size. A 24px heading icon sits next to `text-sm` heading text. Tokens and icon sizes are otherwise correct (16px inline, 20px buttons).
- **Functionality 3:** The main actions are obvious and the copy is plain with no em dashes, but the header's privacy promise now contradicts the consent line (B2), and a failed tap does nothing visible.

### Break attempts

- **Spoofing `staff_id` on insert or update:** blocked. WITH CHECK requires `staff_id = get_current_staff_id()`.
- **Rating someone else's answer by guessing its id:** blocked. WITH CHECK requires the conversation's owner to be the caller. An upsert that hits another person's existing row fails the UPDATE USING check, so it errors and does not overwrite. Message ids are random uuids, so the leftover "a row exists" signal is negligible.
- **Rating your own question:** blocked. The policy requires `role = 'assistant'`.
- **Reading, updating or deleting another person's row:** the USING clause hides it, so zero rows are affected.
- **Non-super-admin calling the function:** raises before touching any data. `is_superadmin()` (latest definition, `20250828183239_...sql`) is SECURITY DEFINER with a pinned search_path and checks `staff.user_id = auth.uid()`. The new function sets `search_path` and starts from `ask_message_feedback`, so unrated messages cannot come out of it, except for the question lookup bug in B1. It returns no asker identity.
- **Grants:** execute is revoked from public and anon and granted to authenticated. The table is granted to authenticated and service_role only.
- **Re-running the migration:** safe. It uses `if not exists`, drop-then-create for the trigger and policy, `create or replace` for the function, grants and revokes that can repeat, and a read-only sanity block. Every dependency already exists live (`ask_messages`, `staff`, `corpus_set_updated_at`, `is_superadmin`, `get_current_staff_id`).
- **Rapid repeated taps:** both buttons are disabled while a mutation is pending, and `onSuccess` returns the refetch promise, so they stay disabled until fresh data arrives. The upsert avoids unique-violation errors. Two tabs racing each other: the last write wins, and nothing duplicates.
- **Pending and optimistic bubble:** gets the id `'pending'`, is user role, has no buttons, and is never queried.
- **Note limits:** the textarea has `maxLength=500` and the DB has a matching check. A whitespace-only note saves as null.
- **Frontend deployed before the SQL:** rating fails silently and the admin section hides silently (B4). The spec's apply order (SQL first) matters.
- **Deletion cascades:** conversation to messages to feedback, and staff to feedback, are both `on delete cascade`. Confirmed in the DDL.

### Regressions

- **AskPage chat flow:** `ChatMessage` gains optional props, and the pending bubble gets an id. Sending, the pending bubble logic (`computeShowPending`) and delete conversation are unchanged. The only addition is one extra batched query per open conversation. No regression found in the code.
- **AdminSurveysTab:** the only change is the new section appended after the surveys list, outside the loading, empty and list branches. Surveys render as before.
- **ask_conversations / ask_messages policies and the edge functions:** untouched (confirmed from the diff file list).
- **Pre-existing, not caused by this change:** the chat orders messages by `created_at` only, and a question and its answer share a timestamp, so their order on screen is not guaranteed. It is the same root cause as B1 and worth a follow-up ticket.

### Non-blocking notes

- **Judgment call on switching ratings (spec-compatible, but flag for John):** switching from down to up keeps the note. The spec allows a note on any rating, but the asker can no longer see or edit that note while the rating is up (the box shows only on down). Meanwhile the admin list shows a "Helpful" card with a "what was off" note. Consider clearing the note on switch to up, or showing it there.
- **Explicit Save button for the note and client-side filtering:** both fine against the spec (step 3 says "type a short note and save"). The function still supports `p_rating`.
- **The `useEffect` that syncs the note draft** says it will not clobber an unsaved edit, but it does whenever the saved note changes. Harmless in practice.
- **The admin list shows raw answer text,** so markdown from answers appears as literal characters. Cosmetic.
- **The builder's post-apply checklist in the migration has problems John would trip over:**
  - (a) It says a super admin running `select * from ask_message_feedback` should see 0 rows. Wrong: they see their own ratings, and today every rater is a super admin.
  - (b) It uses "staff A and B, neither a super admin" as askers, but both edge functions reject non-super-admins (`ask-alcan-v2/index.ts:268`), so those accounts cannot own conversations.
  - (c) Its inserts would write real rows to production with no cleanup step. It should be wrapped in `begin; ... rollback;`, and `set local` only works inside a transaction.
  - (d) It lacks the question-pairing check from B1.

### NOT VERIFIED

- The body of `get_current_staff_id()`. It is not defined in any repo migration (it exists live per `types.ts:4984`). I assumed it behaves as the live ASK-1 policies already rely on.
- Whether older live `ask_messages` rows were written with distinct timestamps (an earlier edge-function version). This does not change B1 for new data.
- Whether the Supabase SQL Editor wraps a paste in one transaction (this matters for the checklist's `set local`).

Not verifiable by the agent, only John can check
- Pasting the migration into the Supabase SQL Editor (before the frontend deploy), confirming the sanity block passes, and running the builder's post-apply checklist, once it is corrected per the notes above (inside begin/rollback so no test rows stay in production).
- Clicking through steps 1 to 11 on a phone and on a desktop: button highlight, note box, "Saved.", reloads, the admin list, the filter, show more.
- The two-super-admin privacy check (step 9): B never sees A's chats, and A's rated exchange appears only in the admin list.
- Step 11 as each persona (participant, coach, office manager, org admin, doctor): Ask Alcan and Answer feedback stay hidden.
- The look and feel on real screens, and the final wording of the header privacy line (B2).

# Ask Alcan answer feedback

stage: ready
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

- QA verdict: pass (commit a9bc8a20)
- Stage: ready

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
- **Design grade**: 3.0/5 from code (design 3, originality 3, craft 3, works 3)

## QA report

### QA round 2: ask-answer-feedback (gate 2)

**Verdict: PASS at commit a9bc8a20.** All four round-1 blockers are fixed. Each rated answer now shows its own question. The header tells the truth. The admin list refreshes after every change. Failures show an error. One thing to fix before you run the SQL checks: part 3 of the post-apply checklist in the migration will error as written, and it skips the "non-super-admin gets refused" proof. That is a problem with the checklist text, not the product (details under N1).

I reviewed this from code and tests only. There is no preview and no local run, because the app only talks to the live database. I ran `npm run check` myself at a9bc8a20:

```
✖ 896 problems (0 errors, 896 warnings)   (same baseline as round 1)
Hardcoded Tailwind color check passed: 372 (down from 374 baseline).
 Test Files  89 passed (89)
      Tests  1249 passed (1249)
✓ built in 13.26s
EXIT 0
```

### Acceptance script

| # | Result |
|---|---|
| 1 | Code supports it, operator to confirm. Thumbs up and down appear only on answers (`!isUser`). The consent line "Rating shares this question and answer with the Ask Alcan team." sits under them. The pending question bubble has role `user`, so it gets no buttons. |
| 2 | Code supports it, operator to confirm. The highlight comes from the saved row (`aria-pressed`, `bg-primary/10 text-primary`), so it survives a reload. |
| 3 | Code supports it, operator to confirm. Switching upserts on `message_id` and keeps any note. The note box shows on down. Save writes the note and shows "Saved.", and the note reloads from the row. |
| 4 | Code supports it, operator to confirm (new wording). Down to up now sends `note: null` (`nextFeedbackState`, unit tested), so the note is gone. Tapping the chosen down again deletes the row, which takes the note with it (unit tested). |
| 5 | Code supports it, operator to confirm. A down with no note is a valid row. |
| 6 | Code supports it, operator to confirm. The list shows the date, Helpful or Missed, the note, the question (now correct, see B1), the answer with Show more and Show less, and the cited titles. No name. |
| 7 | Code supports it, operator to confirm. The All, Down and Up filter runs on the client and is unit tested. |
| 8 | Code supports it, operator to confirm. Clearing a rating deletes the row and now also refreshes the admin list. |
| 9 | Passes by code, operator to confirm with a second super admin. No policy on `ask_conversations` or `ask_messages` changed. The diff adds only the new table, its single owner policy and the function. |
| 10 | Code supports it, operator to confirm. Deleting a conversation cascades conversation to messages to feedback, and `deleteConversation` now refreshes `['ask','admin-feedback']`, so going back to Admin fetches fresh data without a reload. The "first answer in a brand new chat shows its own question" check is covered by the `<=` fix (see B1). |
| 11 | Passes by code, operator to confirm per persona. `useAskAlcanAccess` is super admin only. The section checks it again and does not even run the query without it. The function raises "Not authorized" for anyone else, and anon has no execute. |

### Round-1 findings

- **B1 (wrong question paired with each answer): FIXED.** I confirmed from git history that every version of both edge functions, from ASK-1 (`11ae9591`) through today, saves the question and the answer in one bulk insert (`ask-alcan/index.ts:581`, `ask-alcan-v2/index.ts:548`). That means the pair always shares one `created_at`, and so do the older rows already live. The lookup is now `uq.created_at <= am.created_at order by uq.created_at desc, uq.id desc limit 1`.
  - Can it return another exchange's question? Earlier exchanges each come from a separate request, and so a separate transaction with an earlier timestamp. So the paired question, being the latest at or before the answer, always wins.
  - A tie would need two exchanges in the same conversation to start their transactions in the same microsecond. That is not realistic, and the code comment says so honestly.
  - Can it return an unrated question? No. It only ever returns the one question in the same conversation paired with a rated answer.
  - The one theoretical gap is an asker writing to `ask_messages` directly (see break attempts). That touches only their own content.
- **B2 (header said not even admins could read chats): FIXED.** `AskPage.tsx` now says, word for word as the spec asks: "Your conversations are private to you. If you rate an answer, that one question and answer is shared with the Ask Alcan team." The old em dash is gone.
- **B3 (admin list never refreshed): FIXED.** `setRating`, `clearRating` and `saveNote` all refresh both `['ask','feedback']` and `['ask','admin-feedback']`, and `deleteConversation` refreshes `['ask','admin-feedback']`. That covers set, switch, clear, note and delete. A refreshed query refetches when the admin tab next mounts, even inside the 5-minute cache window.
- **B4 (no error states): FIXED.**
  - Rating taps and note saves are wrapped in try/catch and show a destructive toast ("That rating didn't save" and "That note didn't save").
  - The admin section now shows "Answer feedback didn't load." with a Try again button, instead of hiding. The filter is hidden while that error shows.
- **Round-1 non-blocking notes:**
  - The note carrying over from down to up is now resolved by John's decision, and the code follows it.
  - The checklist problems (a) super admin sees 0 rows, (b) askers who are not super admins, and (c) no rollback are all fixed. The checklist is now wrapped in begin and rollback, uses two super admins, and says super admins see their own rows. Its new problems are in N1 below.
  - (d) The pairing check is now step 4.

### Browser walk

Could not run. The config has `preview.kind: "none"` and `localRun: false`, because the app is wired to the live production database and there is no staging database. Every screen and control, on phone and desktop, is on John's list below.

### Design grade (graded from code, not screenshots; no brand pack, judged against `.engine/principles.md` and `docs/design-system.md`)

Overall 3.0 of 5 (design 3, originality 3, craft 3, works 3). **No criterion at 1 or 2, so the grade passes.**
- **Design quality 3:** The ghost icon buttons, primary and destructive tints, muted `text-2xs` helper copy and plain cards match the existing Ask and Admin screens, so it sits with the app (principles: stay consistent with the Pro Moves design system), but nothing goes further than that.
- **Originality 3:** It is the standard thumbs pattern and a list of cards with library defaults, which fits the job but is not distinctive.
- **Craft 3:** Loading, empty, error and success states now all exist ("Every state is designed"), and the tokens and icon sizes follow CLAUDE.md. The filter chips are now 40px tall on phones. But the thumbs buttons are 36px (`h-9 w-9`), a little under a comfortable phone tap size, and error toasts show the raw database message.
- **Functionality 3:** The actions are obvious, the copy is plain with no em dashes on screen, and the header and consent line now agree. The raw database error text in a toast is the one thing a user would not understand.

### Break attempts

- **Pairing across exchanges:** covered under B1. There is no path to a different exchange's question with real data.
- **Unrated message through the function:** the function starts from `ask_message_feedback` and joins only the rated answer plus one paired question. Nothing else is reachable. The consent rule holds.
- **RLS and SECURITY DEFINER guarantees:** unchanged from round 1 apart from the `<=`.
  - There is one owner-only policy, and the sanity block asserts exactly one policy exists.
  - `staff_id` and conversation ownership are both checked in USING and in WITH CHECK, and only `role = 'assistant'` messages can be rated.
  - The function keeps `security definer` and `set search_path to 'public'`, and raises on `not is_superadmin()` before any read.
  - Execute is revoked from public and anon and granted to authenticated. The function returns no asker identity.
- **Migration re-run and SQL Editor paste:** still idempotent.
  - It uses `create table if not exists`, `create index if not exists`, and drop-then-create for the trigger and the policy.
  - The function uses `create or replace`, and its signature is unchanged, so the replace is legal.
  - The grants and revokes can repeat safely. The sanity block only reads.
- **Checklist safety on production:** safe. Every test write sits inside `begin; ... rollback;`. If a statement errors partway through, Postgres aborts the whole transaction, so nothing can be committed even if the script stops before `rollback`. Its correctness problems are in N1.
- **The asker writing `ask_messages` directly (existing ASK-1 policy is `for all`):** an asker can insert or edit rows in their own conversations through the API. They could fake an "answer", rate it, or edit an answer's text after rating it, so the admin list shows words the model never wrote. This only affects the asker's own content, and all askers are super admins today. It is not a consent leak. Low severity, pre-existing policy, and worth remembering before Ask Alcan opens to wider staff.
- **Note save racing a thumbs-up tap:** `busy` does not include `saveNote.isPending`, so someone can tap thumbs up while a note save is still in flight. If the note update lands after the upsert, the row ends up "up" with a note, which breaks John's "a helpful rating never carries a note" rule. The UI then hides the note, and the admin card shows Helpful with a note. It needs a fast double action and is low severity. Fix: include `saveNote.isPending` in `busy`.
- **Rapid double taps:** the buttons are disabled while set or clear is pending, and the upsert avoids duplicates.
- **Frontend deployed before the SQL:** rating taps now toast an error and the admin section shows its error line, so nothing fails silently. The apply order (SQL first) still matters.
- **Feedback map fails to load in chat:** the buttons render as unrated with no error line. Low severity, since a tap then either no-ops or reports its own error.
- **Em dashes:** every em dash in the added source is inside code comments. The on-screen strings have none.

### Regressions

- **AskPage:** sending, the pending bubble (`computeShowPending`) and delete are unchanged, apart from the added refresh. The header line changed as the spec asks. I found no regression.
- **AdminSurveysTab:** the only change is the section appended after the surveys list. Surveys render as before.
- **`ask_conversations` and `ask_messages` policies and the edge functions:** untouched.
- **Pre-existing, not caused by this change:** the chat orders messages by `created_at` only (`useAskAlcanChat.ts:66`). A question and its answer share that timestamp, so their order on screen is not guaranteed. Worth a follow-up ticket (for example, add `role` as a tie-break).

### Non-blocking findings (one per fix)

**N1. Checklist part 3 fails as written and does not prove the non-super-admin rule.**
Severity: low for users, but it will confuse whoever runs it. An outside reviewer would note it because the spec's ticket breakdown asks for a check list proving "a non-super-admin calling the function gets an error".
- (a) Part 3 says "as a super admin, no transaction needed" and calls `list_ask_answer_feedback()`. In the SQL Editor the caller is `postgres` with no login, so `is_superadmin()` sees no user and the call raises "Not authorized". Each of those reads needs `begin; set local role authenticated; set local request.jwt.claims = '{"sub":"<super admin auth id>"}'; ... rollback;`.
- (b) It says no ordinary staff account exists to test the refusal. That is wrong: you do not need to own a conversation to call the function. Set the claims to any participant's auth id inside begin and rollback, and expect "Not authorized". That is the proof the spec asked for.
- (c) In part 2, B's rejected insert aborts the transaction, so the `update ... expect 0 rows` line after it errors with "current transaction is aborted". Put the rejected insert last, or give it its own begin and rollback. Part 1 already puts its rejected insert last.

Will it come back? Only if the checklist is copied into future migrations. The guard is a standing pattern: every "as user X" check goes in its own begin, set local, rollback block.

**N2. Toasts show raw database errors.** The rating and note toasts use `err.message`, which could read "new row violates row-level security policy...". This matches the existing AskPage toasts for sending and deleting, so it is consistent, but it breaks "plain words on screen". Fix: a plain description with the raw message logged instead. It is a page-wide pattern, so it will come back without a lint or a shared helper.

**N3. The note save can race a thumbs-up tap** (see break attempts). Fix: add `saveNote.isPending` to `busy`.

**N4. Stale comments.**
- The `AnswerFeedback` docstring still says a note "survives a switch to thumbs up", which is now false.
- The `useEffect` comment claims it will not clobber an unsaved edit, but it does whenever the saved note changes.

Both are code-only. Nobody sees them on screen.

**N5. The thumbs buttons are 36px on phones.** They are a touch small for a thumb. Consider `h-10 w-10` on phones, as the filter chips now do.

### NOT VERIFIED

- The body of `get_current_staff_id()` and exactly how `is_superadmin()` resolves the caller under `set local request.jwt.claims` in the SQL Editor. I inferred both from how ASK-1 already relies on them. I ran no SQL, by instruction.
- How the Supabase SQL Editor handles a pasted script with an explicit `begin` when a statement errors, beyond Postgres's own rule that an aborted transaction cannot commit.
- Live data: I did not query production, so I cannot say whether any existing `ask_messages` rows were written outside the edge functions.

Not verifiable by the agent, only John can check
- Pasting `supabase/migrations/20260928140000_ask_answer_feedback.sql` into the Supabase SQL Editor before the frontend deploy, and confirming the sanity block passes (no error).
- Running the post-apply checklist in the migration, with the N1 corrections (every "as user X" block inside begin, set local, rollback, and a participant's auth id used for the "Not authorized" check), then confirming no test rows remain.
- The two-super-admin privacy check (step 9): B never sees A's chats, and A's rated exchange appears only in the admin list, with no name.
- Checklist part 4 in the app: a later answer in a multi-question chat, and the first answer in a brand new chat, each show their own question on the admin list.
- Clicking through steps 1 to 11 on a phone and on a desktop: button highlight, note box, Save and "Saved.", clear, reloads, delete then Admin with no reload, the filter, Show more, and the error toast if you can provoke one.
- Step 11 as each persona (participant, coach, office manager, org admin, doctor): Ask Alcan and Answer feedback stay hidden.
- The look and feel on real screens (tap size of the thumbs, spacing of the consent line, the admin cards).

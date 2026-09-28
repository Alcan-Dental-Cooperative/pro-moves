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

- QA verdict: pending
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

# The Alcan App — initiative home

**Status:** v0.1 synthesis, 2026-09-24. Direction set by Tim (CEO) in
conversation with John; synthesized here against all prior planning.
**Owner:** John. **Executive checkpoints:** Tim (direction, brand,
behavior), Dr. Alex (clinical content, permissions affecting doctors).

This folder is the umbrella for the unified-app initiative. It sits above
the existing feature plans rather than replacing them; wherever a
capability already has a plan, this doc points at it instead of restating
it.

## The direction in one paragraph

Tim wants the "Alcan App": one app that is the front door to work life at
Alcan. Staff open it to talk to each other, look things up, do their Pro
Moves work, submit content, and jump to the other tools they use. The
important inversion: **Pro Moves becomes a feature of the Alcan App**,
not the container everything else squeezes into. This is less of a pivot
than it sounds. The platform has been quietly becoming this for months
(surveys, the coaching workspace, Ask Alcan all live here already); the
bones stay, the front door and identity change.

## Locked principles

1. **Multi-tenant underneath, Alcan-branded on top.** The platform stays
   org-aware (Avenue UK already runs on it). The Alcan App is Alcan's
   shell over the shared platform, the way surveys are already an
   Alcan-gated feature. We do not fork an Alcan-only codebase.
2. **One responsive app: phone-first PWA, full desktop peer.** No app
   store app (reaffirmed against the new feature list; nothing requires
   native). Desktop is a first-class experience, not a leftover.
3. **Proven over scratch.** Every new capability starts with "who has
   built this well, and can we adopt, embed, or copy their model?"
   Research memos in `research/` back each such decision.
4. **Consolidation is a workstream, not a byproduct.** The current
   desktop app grew a navbar item per feature. The shell work includes a
   deliberate information-architecture pass over everything that exists
   today, with a design-direction checkpoint before build.
5. **Conservative migration.** New surfaces build alongside live ones;
   nothing breaks for staff mid-transition (house rule, see
   project CLAUDE.md).
6. **The Basecamp exit is one coordinated retirement.** Basecamp does two
   jobs: documents and communication. Documents move to the Google Drive
   Shared Drive (decided 2026-09-24, see the Ask doc); communication
   moves to the new communication layer. Plan them together, retire
   Basecamp once. ("Forum" is deliberately avoided as the term: the use
   case is leadership announcements staff actually read plus team and
   location conversation, which the proven employee platforms serve with
   a feed, not an internet-style forum.)

## Capability map

| Capability | State today | Plan lives at |
|---|---|---|
| App shell + IA consolidation | New (design exists piecemeal) | This folder; `docs/features/mobile-redesign-*.md`, DSN-5 tokens |
| Pro Moves (the coaching loop) | Live | Existing platform docs |
| Ask Alcan | Built through ASK-2, gated | `docs/features/ask-alcan-assistant.md` v0.3, `docs/specs/ask-*.md` |
| Staff feed (Basecamp comms replacement; feed-first, decided — no forum, no chat, no DMs) | New | This folder + `research/` |
| Primary document library | Decided: Drive Shared Drive | Ask doc v0.3 decision block |
| Social media content submission → Drive | New | This folder + `research/` |
| Push notifications | Planned (PWA push initiative) | `docs/features/pwa-push-notifications.md` |
| Deputy (schedule, time clock) | Planned as Ask v3 tool; time clock new | Ask doc §E + `research/` |
| Links hub (Done Desk, ADP, Uptime, Deputy) | New, trivial | Build plan phase 1 |
| Hosting: Lovable → Cloudflare + domain | Planned (consolidation plan) | Hosting writeup artifact; folded into build plan |

## Governance

- **Per-ticket process:** the existing kit (spec → build → QA → ship)
  with its two human gates: John approves specs, John reviews and merges
  PRs.
- **Initiative checkpoints with Tim and Alex**, at minimum:
  1. This synthesis + the phased build plan (before real build starts).
  2. Design direction: shell IA, look, and the app's name/domain.
  3. Permissions and app behavior: who sees what, forum moderation
     rules, what Ask will and won't answer, consent posture.
  4. End of each build phase: a working demo, not a document.

## Open decisions

- The app's public name and domain (mypromoves.com stops being right).
- ~~Communication layer model~~ **Decided 2026-09-24 (John): feed-first.**
  Not a forum and not chat; both are explicitly out. The layer is a
  staff feed: leadership announcements with comments and reactions,
  targeted by location and role, with read-tracking for must-reads.
  Person-to-person chat and DMs stay out of the app entirely (texting
  and Google Chat already exist for that, and keeping DMs out avoids
  the moderation and HR-liability surface). Remaining open: adopt vs
  build for the feed components (research memo to follow).
- Sign-in direction: whether staff identity moves toward Google accounts
  (Workspace groups are already the access model in the hosting plan).
- Timing of the Lovable → Cloudflare move relative to the shell rebuild.

## What's in this folder

- `build-plan.html` — the phased build plan, visual, in plain language.
  The version of record for sequencing; review happens against this.
- `research/` — memos backing proven-over-scratch decisions.

# Session state — 2026-09-24 (evening)

## The job
Fold John's answers into the Alcan App plan (v2) and tee up the design
mockup work that comes next.

## Done
- `docs/alcan-app/README.md` bumped to v0.2: Google accounts answered
  (most staff do NOT get them; app-native sign-in; app is the staff
  reading surface for Drive docs), Tim & Alex largely approved plan v1,
  new "use what we already pay for" Google/Gemini ground rule, feed
  concept art linked.
- `docs/alcan-app/build-plan.html` v2 republished to the SAME artifact:
  https://claude.ai/code/artifact/39faf068-5c14-4e4a-9190-485f39c000df
  (if John shared it, the share pin may still show v1 until moved).
- Committed and pushed on branch `docs/alcan-app-plan` (updates PR #133).
- c0 nodes added: "staff google account coverage", "alcan app plan v2
  status". Memory file alcan-app-initiative.md refreshed.

## Next
- Start design mockups for the app shell / checkpoint 2, per John's ask
  ("let's start to mock up some stuff"). Approach agreed with John this
  session: static concept screens per major surface first (cheap,
  disposable, for Tim), a small clickable shell demo ONLY if navigation
  feel needs judging, then real build behind a feature flag. No
  full-app clickable prototype.
- Use "Peak" as the placeholder app name (John, this session). Name and
  domain wait; keep the name in one swappable place in any mock.
- Concrete first step: propose which screens to mock first (suggest:
  Home, the nav/tab shell, Hub, News/feed following the briefing
  concept) and produce static concept art in the style of the existing
  feed exploration.

## Files that matter
`docs/alcan-app/README.md` — initiative home, v0.2, decisions live here
`docs/alcan-app/build-plan.html` — plan of record, v2, published
`docs/alcan-app/research/proven-platforms.md` — adopt-vs-build evidence
`docs/features/ask-alcan-assistant.md` — v0.3 Drive decision block
`promoves-brand/` — locked brand kit; mockups must consume DSN-5 tokens

## Open questions
- App name/domain parked; "Peak" is the working placeholder (decided).
- Feed adopt-vs-build still open; briefing concept art is design input.
- Does the Google Shared Drive exist yet? Phase 0 verifies/creates.
- PRs #129, #132, #133 await John's merge.

## Do not re-derive
- Most staff get NO Google accounts (John, 2026-09-24). App-native
  sign-in; in-app doc reader from nightly-sync copies; Chat sidecar is
  leadership-only; social uploads via backend service account. c0 node
  "staff google account coverage".
- Plan v1 reviewed and largely approved by Tim & Alex; checkpoint 1
  substantially passed. Only name/domain remains, and it is parked.
- Feed is DECIDED feed-first (no forum, no chat, no DMs). Concept art
  (briefing News tab, must-see "Got it", monthly Vitals letter, founder
  composer): https://claude.ai/artifact/CAitf6tbftxrSiVSTdyzSH — input,
  not gospel.
- Ground rule: evaluate Google Workspace/Gemini built-ins anywhere they
  streamline, not just social submissions.
- Prototype approach (agreed with John): static mocks → tiny clickable
  shell demo if needed → real build behind a flag. Never a throwaway
  full prototype.
- Mockups are design artifacts, not repo UI code; but any in-app build
  later consumes DSN-5 tokens and the locked brand kit.
- c0 namespace for this repo is `skill-flow-pro`; do not "fix" it.

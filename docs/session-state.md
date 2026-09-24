# Session state — 2026-09-24

## The job
Stand up the Alcan App initiative: synthesize Tim's unified-app direction
against all prior planning, produce the folder, the research, and the
phased build plan v1 for John's review.

## Done
- `docs/alcan-app/README.md` — initiative synthesis: six locked
  principles, capability map, governance (Tim/Alex checkpoints), open
  decisions. Feed-first comms decided: no forum, no chat, no DMs in-app.
- `docs/alcan-app/research/proven-platforms.md` — two web-research
  passes with sources (employee-app IA, comms model, Drive uploads,
  Deputy API, PWA reaffirmation).
- `docs/alcan-app/build-plan.html` — visual phased plan v1, published as
  artifact: https://claude.ai/code/artifact/39faf068-5c14-4e4a-9190-485f39c000df
- All on branch `docs/alcan-app-plan`, PR #133 (open).
- Earlier same session: Ask doc bumped to v0.3 with the Google Drive
  Shared Drive decision (PR #132, open); branch sweep deleted 26 merged
  local branches; fixed `.c0/config.toml` namespace (was pointing at
  empty `pro-moves`, facts live under `skill-flow-pro`).

## Next
- John reviews the build plan artifact and answers open questions (he
  said he would right after this checkpoint). Fold his answers into
  `docs/alcan-app/README.md` and republish build-plan.html v2 to the
  SAME artifact URL (same file path from a new session: pass the URL as
  `url` to the Artifact tool).
- Then: schedule the Tim & Alex checkpoint 1 review; after sign-off,
  spec Phase 0 items via /spec.

## Files that matter
`docs/alcan-app/README.md` — initiative home; decisions live here
`docs/alcan-app/build-plan.html` — plan of record for sequencing
`docs/alcan-app/research/proven-platforms.md` — evidence behind
proven-over-scratch calls
`docs/features/ask-alcan-assistant.md` — v0.3, Drive decision block
`.c0/config.toml` — namespace must stay `skill-flow-pro` (see comment)

## Open questions
- App name and domain (Tim, checkpoint 1).
- Does every staff member (incl. part-timers) get a Google Workspace
  identity? Plan leans on it.
- Feed build approach: recommended small build on our stack; alternative
  (GetStream free tier) documented in research memo.
- Hosting-move timing: recommended complete before Phase 3.
- Three open PRs await John's merge: #129, #132, #133.
- Six stale unmerged local branches need keep-or-kill (list in c0 node
  "stale unmerged local branches"); nothing blocks on them.

## Do not re-derive
- Comms layer is DECIDED feed-first: no forum, no chat, no DMs in the
  app; Google Chat Spaces via links hub is the chat sidecar. Evidence in
  research memo; do not reopen.
- Primary documents home is DECIDED: Google Drive Shared Drive replacing
  Basecamp (Ask doc v0.3). Basecamp exit = docs to Drive + comms to feed,
  retired once.
- Multi-tenant posture is DECIDED: platform stays org-aware, Alcan App
  is the branded shell, never a fork.
- PWA + full desktop peer is DECIDED; nothing on the feature list needs
  an app store.
- Deputy API: clock in/out IS possible via API (verified, sources in
  memo); Deputy starts as a link anyway.
- c0 graph namespace for this repo is `skill-flow-pro` (98 concepts);
  config.toml already points there. Do not "fix" it to `pro-moves`.

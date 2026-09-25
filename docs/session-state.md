# Session state — 2026-09-25

## The job
First round of Alcan App shell mockups: John's five-tab IA turned into
static concept screens for Tim's checkpoint 2.

## Done
- Published Turn 2 shell mockups (five phone screens, one per tab):
  https://claude.ai/code/artifact/253a19a3-dd87-4898-9e6f-107efcf5f14b
  Source: scratchpad only, not yet committed to the repo.
- IA confirmed against docs: five tabs is the hard ceiling
  (docs/features/mobile-redesign-skeleton.md); John's map supersedes that
  doc's old Home/Explore/Performance/Comms/Ask end state.
- Brand call agreed with John: shell wears the Alcan family look, the Pro
  Moves kit widens into the app ("Peak" placeholder) kit, Pro Moves keeps
  its P-mark as one tab's brand. PEAK is defined in exactly one CSS rule
  in the mock file for easy swap.
- Turn 1 concept-art assets extracted (Biondi Sans OTF, P-mark SVG, page
  markup) from artifact 5a700903 into the session scratchpad.
- c0 nodes: "alcan app five tab ia", "peak app brand direction".

## Next
- Mock v2 with John's two notes: (1) Ask Alcan screen becomes a standard
  chat UI like ChatGPT with chat history/options in the usual drawer spot;
  (2) replace the "Library" browse list with recently-opened docs and
  maybe pins. Republish to the SAME artifact URL above. John does visual
  QA (never Chrome-screenshot QA, he prefers doing it himself).
- Then: start the permissions/identity redesign workstream (see Open
  questions) and a Turn 3 mock round for desktop admin surfaces once the
  permission model is sketched.

## Files that matter
`docs/alcan-app/README.md` — initiative home, v0.2, decisions live here
`docs/alcan-app/build-plan.html` — plan of record, v2, published
`docs/features/mobile-redesign-skeleton.md` — 5-tab ceiling + old IA map
`docs/simplification-roadmap.md` — split-brain permissions audit input
`promoves-brand/brand-brief.md` — Alcan/Pro Moves brand architecture

## Open questions
- Tab names are working labels ("My Role", "The Hub"); Tim's checkpoint 2
  blesses the map, brand call, and ideally the real app name.
- Permissions redesign: John wants the rebuild to fix user profiling and
  the dual permission systems (his biggest recurring pain). Needs its own
  design doc before per-tab PRDs; feeds checkpoint 3. Not started.
- Should mock sources be committed to docs/alcan-app/? Offered, not decided.
- PRs #129, #132, #133 still await John's merge.

## Do not re-derive
- The five-tab IA (John, 2026-09-24, mocked not approved): Home (briefing
  feed opens the app, ritual pinned as a strip), Ask Alcan (chat + docs),
  Pro Moves (whole loop, center slot, P-mark icon), My Role (Explore
  renamed + Alcan Way), The Hub (Deputy/Done Desk/ADP/Uptime + photo
  submission + surveys). Profile/settings stay in the header avatar menu.
  c0: "alcan app five tab ia".
- Mocks are directional only; every tab gets PRDs through the normal spec
  gate. John's Library/recents note is PRD input, not a mock blocker.
- Turn 1 feed exploration (screens 1a-1h) lives at desktop artifact
  claude.ai/artifact/CAitf6tbftxrSiVSTdyzSH = code artifact 5a700903, a
  BUNDLED page (base64 assets); to read it, extract the
  __bundler/template script, do not WebFetch the shortlink (403).
- Most staff get NO Google accounts; app-native sign-in; docs read in-app
  from nightly-sync copies (c0: "staff google account coverage").
- Sequence agreed: mock v2 + Tim checkpoint (days), permissions design in
  parallel, then per-tab PRDs in build order (feed first, Pro Moves tab is
  a relocation, Hub trivial, Ask extends ASK workstream).
- c0 namespace here is skill-flow-pro; do not "fix" it.

# Session state — 2026-09-18 (Avenue training day line)

**Read me first:** this baton belongs to branch `docs/avenue-training-day`,
worked in the `~/Documents/projects/pro-moves-avenue` worktree folder. The main
`pro-moves` folder is owned by the LRM-13 line and has its OWN session-state on
its own branch. Never switch branches in the main folder; the two lines
collided once on 2026-09-18 and this split is the fix. One c0 gotcha here: the
worktree has no `.c0/config.toml`, so pass `-t skill-flow-pro` on every capture.

## The job
Prep the Avenue all-staff training day (Tue 6 Oct 2026). Agenda, question
one-pager, and flow-map text draft are built. John has had the Bobby
conversation and holds a transcript; this session folds it in.

## Done
- Facilitator agenda: `docs/alcan-avenue-training-day-agenda.md` (run sheets,
  timings, casting sheet with ⟨TBD⟩ slots keyed to the Bobby questions, prep
  checklist, contingencies for half-day / nervous team / therapist absent).
- Question one-pager with sources: `docs/outbound/bobby-meeting-questions.md`.
- Flow-map poster content, TEXT DRAFT AWAITING JOHN'S CHECK:
  `docs/alcan-avenue-patient-flow-map.md`. After his check it becomes an
  artifact (side-by-side visual for the day, printable).
- Discovered 2026-09-18: the repo already lives in the Alcan org
  (Alcan-Dental-Cooperative/pro-moves) and Lovable publishing survived the
  move (LRM-12 published post-move). The repo is still PUBLIC though.

## Next
1. **FIRST, its own short session: move Avenue out of the public repo.**
   John's call, 2026-09-18: Avenue training and implementation docs are client
   rollout material, not app code, and the pro-moves repo must stay public
   (flipping it private forces a Lovable plan upgrade). The move:
   - Create `~/Documents/projects/alcan-avenue` as its own git repo with a
     PRIVATE GitHub remote under Alcan-Dental-Cooperative (private repos are
     free there; this repo never touches Lovable). Flat lowercase-hyphen name
     per John's naming conventions.
   - Move into it, from this branch: the four `docs/alcan-avenue-*.md` files,
     `docs/outbound/bobby-meeting-questions.md`,
     `docs/outbound/patient-journey-review-email.md`,
     `docs/outbound/Alcan-Avenue-Patient-Journey-Draft.docx`,
     `docs/reference/alcan-manager-kpi-scorecard-q2-2026-template.csv`,
     and this session-state.md (it becomes the new repo's baton). Fix any
     dangling references in `docs/README.md`.
   - Give the new repo a short README/CLAUDE.md: what Pro Moves is as a
     concept, pointer to the app repo, and what this repo holds. Run
     `c0 init --namespace alcan-avenue` in its root, then `c0 move` the
     Avenue concepts (`Avenue training day 2026-10-06`,
     `Alcan Avenue UK expansion`) from skill-flow-pro into it.
   - Then clean pro-moves: PR to main deleting the journey docs and .docx
     from `docs/` (John merges), delete the `docs/avenue-training-day`
     branch locally AND on origin (never merged, so this removes the agenda,
     flow map and one-pager from public view), and
     `git worktree remove ~/Documents/projects/pro-moves-avenue`.
   - Honesty note, John has seen this: main's git HISTORY still contains the
     journey doc and its figures. A true scrub means rewriting history, which
     we are deliberately NOT doing while Lovable is attached. Accepted risk
     until the hosting consolidation removes Lovable from the loop.
   - Checkpoint into the new repo and clear. Transcript work starts fresh in
     `alcan-avenue`.
2. Then, in the new folder: John pastes the Bobby transcript. Read it, then:
   - fill every ⟨TBD⟩ casting slot and pick the contingency variants in the
     agenda (the nine questions in the one-pager are the extraction checklist);
   - probe the transcript for the contracts-and-roles specifics. The only
     recorded fact is Bobby's ~13 Aug email one-liner (contracts came back).
     John half-remembers Bobby reviewing the manager KPIs himself, adjusting
     them, then showing Abbie; UNVERIFIED, confirm or kill it from the
     transcript and capture the answer.
3. Get John's verdict on the four flow-map checks (bottom of
   `docs/alcan-avenue-patient-flow-map.md`: roles vs names, keep the two
   numbers, prop vs permanent, altitude/Q14 wording). Then build the flow-map
   artifact.

## Files that matter
- `docs/alcan-avenue-training-day-agenda.md` — the deliverable being polished next
- `docs/outbound/bobby-meeting-questions.md` — the nine questions the transcript should answer, plus source key
- `docs/alcan-avenue-patient-flow-map.md` — poster text awaiting check, then artifact
- `docs/alcan-avenue-patient-journey.md` — agreed v0.3 vision; §13 = question provenance
- `docs/reference/alcan-manager-kpi-scorecard-q2-2026-template.csv` — US scorecard the Avenue one adapts

## Open questions
- The four flow-map checks (above), John's call.
- None new. The repo-visibility worry is resolved by Next step 1: pro-moves
  stays public (private forces a Lovable upgrade), the sensitive Avenue docs
  leave it instead.

## Do not re-derive
- Journey v0.3 is agreed, not draft. Source tags and CU anchors live in the
  one-pager and journey §13; the agenda already condenses the journey doc, do
  not re-read it wholesale.
- Training arc principle: the day trains the seams, not role depth; B4 hygiene
  call-in gets the most reps; Bobby stays in character, coaches only in
  debriefs.
- Rollout shape: quick wins before the day, the day flips shared behaviours,
  structural switches in the fortnight after (VoiceStack routing, Millie in
  role, hygiene-first default, PM scorecard).
- Flow-map draft uses role titles not names, includes the 61% and £3,000
  callouts, condenses Track A to 8 moments, and follows Bobby's lean on open
  Q14 (call-in only when something is found).

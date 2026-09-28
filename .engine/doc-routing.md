# Doc routing for Pro Moves

When writing a spec, copy the relevant rows from the table at the bottom into
the spec's "Docs the builder must read" section, so the builder reads exactly
what it needs and nothing else.

## What is routable

`docs/` is organised by kind, not by topic:

| Folder | Kind | Route an agent to it? |
|---|---|---|
| `docs/*.md` (top level) | Canonical. How the system works today. | Yes |
| `docs/living-spec.md` | One plain page on what the app does today. | Yes, almost always |
| `docs/specs/` | Work in flight. | Yes, the one spec for the task |
| `docs/dev/` | How we work: process, lint policy, tooling. | Yes, when relevant |
| `docs/features/` | Feature plans and build notes still in play. | Yes, the relevant one |
| `docs/archive/` | Historical records. Accurate about the past, wrong about now. | **No.** Cite as history only, never as authority |
| `docs/business/` | Client emails, source content, exports. | **No** |

Every file under `docs/archive/` should carry a header saying so. If a task
genuinely needs one, read it as evidence about what happened, and verify any
claim about present behaviour against the code or the data before acting on it.

## Routing table

Fill this in as the project grows. One row per kind of work.

| When the work touches... | Read these |
|---|---|
| | |

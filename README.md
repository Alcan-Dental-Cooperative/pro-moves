# Skill Flow Pro

Skill Flow Pro (the app's UI brand is **ProMoves**) is a coaching and
skills-development platform for dental practices. It turns "getting better at
your job" into a structured, measurable weekly habit: each week, staff rate
their confidence on a set of assigned **Pro Moves** (specific, coachable
behaviors), then rate their actual performance at the end of the week. Coaches
review that gap, run evaluations, and a recommender engine (the "sequencer")
suggests what to assign next. It was originally built as an internal tool for
a single pediatric dental organization (Alcan) and is now being expanded into
a multi-tenant SaaS product. See `docs/system-overview.md` for the full tour.

## Stack

- **Frontend**: Vite + React + TypeScript, Tailwind + shadcn/ui
- **Backend**: Supabase (Postgres, Auth, Row-Level Security, Edge Functions)
- **Package manager**: npm

## Prerequisites

- Node.js. CI runs Node 24; use that or newer.
- npm (ships with Node).
- No local database or Supabase CLI setup is required to run the app. See
  "Local dev talks to production" below before you assume otherwise.

## Running locally

```sh
npm i
npm run dev
```

This starts the Vite dev server (default port 8080, or `$PORT` if set).

### Local dev talks to the LIVE production Supabase project

There is no local Supabase stack for this project. When you run `npm run dev`,
the app connects straight to the real production database
(`yeypngaufuualdfzcjpk.supabase.co`) — the same one the live app uses. There
is no seeded local copy and no staging environment. Be careful with anything
that writes data; you are working against real practice data, not a sandbox.

The Supabase URL and anon (publishable) key are hardcoded in
`src/integrations/supabase/client.ts`, so they don't come from environment
variables at all. See CLAUDE.md for the Supabase CLI commands used to inspect
the live schema.

## Environment variables

Copy `.env.example` to `.env` and fill in real values (see "About `.env`" below) before running
the app. Each variable is documented with a comment in `.env.example`.

None of the variables currently gate the Supabase connection itself (that's
hardcoded, see above). The `VITE_*` flags gate optional UI behavior; see the
comments in `.env.example` and the "About `.env`" section for
what's actually wired up versus what's currently dead.

### About `.env` (no longer committed)

`.env` was committed until 2026-09-18, then untracked and gitignored. Keep
your own local copy (from `.env.example`); it holds only publishable values
and non-secret feature flags.

What we learned from untracking it: Lovable's Publish build supplies the
Supabase connection values itself, but NOT custom flags. So any `VITE_*`
flag that production depends on must default to the production behavior in
code, not rely on `.env`. `VITE_ENABLE_SIMTOOLS` works this way: it is ON
unless a build explicitly sets it to `false` (see `src/lib/simTools.ts`).
Before untracking, it was opt-in, and the admin Sim Console silently
disappeared from production.

If a real secret ever needs to live in an environment variable for this
project, it must not go in this file — it needs a different, gitignored
mechanism first.

## How database changes actually ship

The known-good path is one of these two:

- paste the migration's SQL into the Supabase dashboard **SQL Editor**,
  written idempotently (`IF NOT EXISTS` / `CREATE OR REPLACE`, column adds
  before the functions that reference them), or
- land it on `main` for Lovable to pick up.

`npx supabase db push` is **not trusted and unproven** on this project as of
this writing. Do not run it against the live project without reading CLAUDE.md
("Applying migrations") first — that section holds the current reasoning and
status and is the source of truth, not this README.

## Edge functions

Edge functions live in `supabase/functions/`. Per-function JWT verification is
configured in `supabase/config.toml`. See CLAUDE.md ("Edge functions") for the
current function list and which ones are public.

## Tests, typecheck, lint, build

```sh
npm run check
```

Runs typecheck, lint, tests, and a production build in sequence — the same
checks CI runs on every pull request. Run it before committing.

## Where to go next

- **`CLAUDE.md`** (repo root) — the load-bearing operational facts for working
  in this repo: the migration/`db push` situation, current data-model
  terminology (Organization / Group / Location), design-system conventions
  (icon sizes, color tokens, `text-2xs`). Read this before making changes.
- **`docs/README.md`** — the docs index: what's current, what's historical,
  and where to find the spec for any given ticket.
- **`docs/system-overview.md`** — the product tour: who uses it, the weekly
  loop, how content is structured.
- **`docs/dev/assessment-2026-08-18.md`** — the current engineering
  assessment: known issues, the backlog, and why things look the way they do.

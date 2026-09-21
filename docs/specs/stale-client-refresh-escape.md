# Fix: "New Version Available" refresh button cannot escape a stale PWA client

**Lane:** bug
**Branch:** `fix/stale-client-refresh-escape`
**DB impact:** none

## What and why

When a user's browser has the PWA service worker registered (anyone with
`staff.pwa_enabled = true`, on ANY device including desktop, installed or
not), a deploy can strand them permanently on an old build. The service
worker serves the cached old app shell; when the old build then requests a
route chunk that no longer exists on the server, `RouteErrorBoundary` shows
"New Version Available. Please refresh." But its Refresh button only calls
`window.location.reload()`, and the old service worker answers that reload
with the same cached old `index.html` (workbox `navigateFallback`), so
refreshing changes nothing, forever. The app's update mode is
`registerType: 'prompt'`, so the already-downloaded new version activates
only via the small "Update available" toast, which a user stuck on the error
screen has no reliable path to.

Confirmed in production on 2026-09-21: Ariyana McDonald (staff
`pwa_enabled = true`, desktop browser) was pinned to a pre-Sept-14 build.
Side effect: her stale build's plain-textarea blast composer displayed the
new edge function's correct HTML draft as literal tags (reported as "raw
Markdown"). The server output is verified correct in the DB, so that symptom
needs no separate fix; it disappears once the client can update itself.

## The fix (suite)

1. **`RouteErrorBoundary.handleRefresh` must escape the stale service
   worker, not just reload.** Before reloading: call `applyPendingUpdate()`
   from `src/lib/pwa.ts` if an update is waiting; otherwise unregister all
   service worker registrations for the origin (and optionally clear the
   workbox precache caches), then `window.location.reload()`. A plain reload
   is never sufficient here.
2. **Auto-recover on chunk-update errors.** When the boundary classifies an
   error as `chunk-update` (`classifyRouteError`), it may trigger the same
   escape path automatically once (guarded against loops via the existing
   sessionStorage timestamp) so most users never even see the screen.
3. **Loop guard feedback.** When the 10-second reload loop guard swallows a
   click, show visible feedback (e.g. disable the button with "Just
   refreshed, retrying shortly...") instead of only `console.error`. A
   silent dead button is what made this feel broken.
4. **Reconsider update mode (decision point for John, not required for this
   ticket):** either keep `prompt` mode with the above escape hatch, or move
   to `autoUpdate` so deploys roll out without user action. Document the
   choice in `docs/features/pwa-push-notifications.md`.

## Acceptance script (do X, expect Y)

Written for John. Requires a PWA-flagged test user (set
`localStorage.pwa_v1 = 'on'` or use a `pwa_enabled` staff row) in a
production build.

1. Open the app in a browser as the flagged user, let it load fully, then
   deploy a new build (or simulate: with DevTools, keep the old tab, delete
   a route chunk from the serving layer / block its URL).
2. Navigate to a lazy route so the chunk load fails. Expect the "New Version
   Available" screen.
3. Click "Refresh Page" ONCE. Expect the app to come back on the NEW build
   (no error screen, new UI visible), even though a service worker was
   controlling the page.
4. Click Refresh twice rapidly on the error screen (if reproducible).
   Expect visible feedback, not a silently dead button.
5. Regression: while offline, hit a lazy route. Expect the "You appear to be
   offline" variant, and "Try Again" must NOT unregister the service worker
   (offline users depend on the cache).

## Personas to test as

- participant (PWA-flagged, desktop browser, not installed)
- participant (installed/standalone app)
- lead (the blast composer must load and render the current draft's HTML
  correctly after the client updates)

## Out of scope

- Any change to the `lead-week-blast` edge function or blast composer. The
  stored draft bodies are verified-correct HTML; the "raw Markdown" report
  was a stale-client rendering artifact.
- Changing who is `pwa_enabled`.
- Push notifications and install-nudge behavior.

## Docs the builder must read

- `docs/features/pwa-push-notifications.md` (D2 activation model)
- `src/lib/pwa.ts`, `src/components/pwa/PwaManager.tsx`,
  `src/components/RouteErrorBoundary.tsx` (+ its test file)
- `vite.config.ts` VitePWA/workbox block
- `docs/testing.md`, `docs/dev/lint-policy.md`

## Incident notes (evidence, 2026-09-21)

- "Regenerate" button removed in LRM-13 (merged Sept 18); Ariyana clicked it
  on Sept 21, proving a pre-Sept-14 client.
- All edge functions redeployed Sept 18; deployed `lead-week-blast` is
  current (v13).
- Her Sept 21 draft row body in `lead_week_blasts` is clean constrained
  HTML (`<p>Hey there!</p><p><strong>...`), i.e. server correct, client
  stale.
- Frontend redeploys Sept 18 and Sept 21 14:30 UTC (Lovable commit
  `2f5d814`) invalidated old chunk filenames, which is what surfaced the
  error screen. John's local repo folder move was unrelated.

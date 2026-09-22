// PWA activation gating + service worker registration.
// The manifest and service worker ship to everyone, but nothing activates
// unless this user is flagged: staff.pwa_enabled in the DB (rollout lever)
// or the pwa_v1 localStorage flag (dev loop, same pattern as eval_review_v2).
// See docs/features/pwa-push-notifications.md (D2).

const LOCAL_FLAG_KEY = 'pwa_v1';
const DEVICE_OPTOUT_KEY = 'pwa_device_optout';
const BANNER_DISMISSED_KEY = 'pwa_banner_dismissed';
const INSTALLED_NUDGE_SNOOZE_KEY = 'pwa_installed_nudge_snooze_until';

/** How long "Continue in browser" quiets the already-installed nudge. */
export const INSTALLED_NUDGE_SNOOZE_DAYS = 7;

let registered = false;
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;
// Set when the SW reports a new build waiting (onNeedRefresh); cleared once
// applyPendingUpdate() hands it off. Lets callers (RouteErrorBoundary) tell
// "an update is already downloaded, just activate it" apart from "nothing is
// waiting, the stale worker itself has to go" -- calling updateServiceWorker()
// with nothing waiting is a no-op that never reloads the page.
let updateAvailable = false;

// Captured at module load so we don't miss the (early-firing) Android install
// prompt event before the banner mounts.
let deferredInstallPrompt: any = null;
const promptListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    promptListeners.forEach((fn) => fn());
  });
}

export function isLocallyFlagged(): boolean {
  try {
    return localStorage.getItem(LOCAL_FLAG_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Shared-device affordance: this browser never activates PWA behavior. */
export function isDeviceOptedOut(): boolean {
  try {
    return localStorage.getItem(DEVICE_OPTOUT_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setDeviceOptOut(): void {
  try {
    localStorage.setItem(DEVICE_OPTOUT_KEY, 'on');
  } catch {
    /* storage unavailable — nothing to do */
  }
}

/**
 * The rollout gate: profile flag or local dev flag, minus device opt-out.
 * This is deliberately NOT platform-aware -- it's also read by
 * useMobileShell (mobile-build-instructions.md ground rule 1), which
 * combines it with viewport width on purpose. PwaManager, where actual
 * service worker registration and install-surface rendering happen,
 * additionally requires isMobilePlatform() || isStandalone() on top of
 * this before treating the PWA as active (stale-client-refresh-escape).
 */
export function isPwaActive(profileEnabled: boolean): boolean {
  return !isDeviceOptedOut() && (profileEnabled || isLocallyFlagged());
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}

export function isIos(): boolean {
  // Modern iPads report as "Macintosh" with touch support, so UA sniffing
  // alone misses them.
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * Platform gate for PWA activation (stale-client-refresh-escape, item 4):
 * a phone or tablet, not a browser window that merely happens to be narrow.
 * Deliberately NOT viewport-based -- a resized desktop window must not
 * register a sticky service worker. See PwaManager for where this combines
 * with isStandalone() to decide whether to register/unregister.
 */
export function isMobilePlatform(): boolean {
  return isIos() || /android/i.test(navigator.userAgent);
}

/**
 * Whether PWA activation (service worker registration, install surfaces)
 * is allowed here: a mobile platform, or standalone display mode regardless
 * of platform -- someone deliberately installed it, so it keeps working
 * even from, say, an iPad reporting as desktop Safari. Extracted as its own
 * pure combinator so PwaManager's gating decision is unit-testable without
 * mounting the component.
 */
export function isPlatformPwaEligible(): boolean {
  return isMobilePlatform() || isStandalone();
}

/**
 * On iOS, ONLY Safari can install a PWA — Chrome/Firefox/Edge on iOS run
 * WebKit but Apple restricts Add to Home Screen installability to Safari.
 * Detection: every third-party iOS browser adds its own UA marker
 * (CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge, OPT = Opera, plus
 * GSA/DuckDuckGo for in-app webviews). Safari is iOS minus all of those.
 */
export function isIosSafari(): boolean {
  if (!isIos()) return false;
  return !/crios|fxios|edgios|opt\/|gsa|duckduckgo/i.test(navigator.userAgent);
}

export function getDeferredInstallPrompt(): any {
  return deferredInstallPrompt;
}

export function onInstallPromptAvailable(fn: () => void): () => void {
  promptListeners.add(fn);
  return () => promptListeners.delete(fn);
}

export async function triggerInstallPrompt(): Promise<void> {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
}

/**
 * Whether the first-run bottom banner has been dismissed. Permanent once set
 * (MOB-2) — there is no re-nag timer, because the persistent "Install the
 * app" row in the avatar menu (MoreMenuRows) now guarantees the install
 * help is never lost, so dismissing the banner doesn't need to chase the
 * user again later.
 */
export function isBannerDismissed(): boolean {
  try {
    return localStorage.getItem(BANNER_DISMISSED_KEY) === 'on';
  } catch {
    return false;
  }
}

export function dismissBanner(): void {
  try {
    localStorage.setItem(BANNER_DISMISSED_KEY, 'on');
  } catch {
    /* storage unavailable — nothing to do */
  }
}

/**
 * Snooze state for the "you've already installed the app" nudge shown to
 * confirmed-installed users browsing on their phone anyway. Unlike the
 * install banner's permanent dismissal, this one recurs: the goal is a
 * gentle periodic reminder, and there is no persistent menu fallback for
 * "go back to your installed app".
 */
export function isInstalledNudgeSnoozed(now: number = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(INSTALLED_NUDGE_SNOOZE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && now < until;
  } catch {
    return false;
  }
}

export function snoozeInstalledNudge(now: number = Date.now()): void {
  try {
    localStorage.setItem(
      INSTALLED_NUDGE_SNOOZE_KEY,
      String(now + INSTALLED_NUDGE_SNOOZE_DAYS * 24 * 60 * 60 * 1000),
    );
  } catch {
    /* storage unavailable — nothing to do */
  }
}

/**
 * Pure selection of whether to show the already-installed nudge instead of
 * the install banner. Device opt-out is not an input because PwaManager
 * already gates all PWA surfaces on isPwaActive(), which includes it.
 */
export function shouldShowInstalledNudge(opts: {
  installConfirmed: boolean;
  standalone: boolean;
  isMobile: boolean;
  snoozed: boolean;
}): boolean {
  return opts.installConfirmed && !opts.standalone && opts.isMobile && !opts.snoozed;
}

export type InstallPathway = 'ios-safari' | 'ios-other-browser' | 'android-prompt' | 'manual';

/**
 * Pure selection of which install-instructions branch to show (MOB-2).
 * Extracted out of what was inline JSX in InstallBanner so it can be unit
 * tested without mounting a component, and so the banner and the avatar-menu
 * entry point (InstallInstructions) can never select different branches.
 *
 * Order matters: iOS is checked before the captured `beforeinstallprompt`
 * flag because iOS Safari never fires that event, and iOS non-Safari
 * browsers cannot install a PWA at all regardless of the flag.
 */
export function getInstallPathway(opts: {
  isIosSafari: boolean;
  isIos: boolean;
  canPrompt: boolean;
}): InstallPathway {
  if (opts.isIosSafari) return 'ios-safari';
  if (opts.isIos) return 'ios-other-browser';
  if (opts.canPrompt) return 'android-prompt';
  return 'manual';
}

/**
 * Register the service worker (prod builds only). Idempotent.
 * onNeedRefresh fires when a new build is waiting; call applyPendingUpdate()
 * to swap and reload — this is the reload path in standalone mode, where
 * there is no browser refresh button.
 */
export async function registerPwaServiceWorker(onNeedRefresh: () => void): Promise<void> {
  if (registered) return;
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) {
    console.info('[pwa] dev mode: service worker registration skipped');
    return;
  }
  registered = true;
  const { registerSW } = await import('virtual:pwa-register');
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh: () => {
      updateAvailable = true;
      onNeedRefresh();
    },
  });
}

/** Whether a new build has already downloaded and is waiting to activate. */
export function hasPendingUpdate(): boolean {
  return updateAvailable;
}

/**
 * Hand off to the waiting service worker. Returns the promise from
 * updateServiceWorker(true) so a caller can race it against a timeout --
 * that promise resolves once the skip-waiting message is sent, not once the
 * page has actually reloaded, so a caller that needs the reload to really
 * happen (RouteErrorBoundary) still needs its own fallback for the case
 * where the hand-off silently never completes (see escapeStaleServiceWorker).
 */
export function applyPendingUpdate(): Promise<void> {
  updateAvailable = false;
  if (!updateServiceWorker) return Promise.resolve();
  return updateServiceWorker(true);
}

/**
 * Unregister every service worker registration for this origin. Used both
 * to escape a stale worker that's serving old cached routes
 * (RouteErrorBoundary) and to self-heal a desktop that registered one
 * before platform gating existed (PwaManager). Safe to call when nothing is
 * registered.
 */
export async function unregisterAllServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

/**
 * Delete workbox's own caches (the app-shell precache) so a reload after
 * unregisterAllServiceWorkers() can't still serve old cached assets while
 * the browser cache is warm. Best-effort: any cache API failure is
 * swallowed by the caller, since the unregister + reload is what actually
 * matters.
 */
export async function clearWorkboxCaches(): Promise<void> {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => key.startsWith('workbox-')).map((key) => caches.delete(key))
  );
}

/** How long probeConnectivity() waits before treating the network as unreachable. */
export const CONNECTIVITY_PROBE_TIMEOUT_MS = 3000;

/**
 * Confirms real network reachability -- navigator.onLine reports true on a
 * captive portal or dead wifi, and RouteErrorBoundary's escape path trusts
 * "online" before unregistering the service worker and clearing its
 * precache. Getting that wrong for a genuinely offline user destroys their
 * only cached copy of the app and reloads into nothing, so this does an
 * actual round trip rather than trusting the browser's flag.
 *
 * Uses fetch, not a navigation, so navigateFallback (vite.config.ts) never
 * applies; the unique cache-busting query param means it can't match any
 * precached asset's exact URL either, and runtimeCaching is empty in this
 * project's workbox config, so nothing here can be answered locally --
 * a resolved `ok` response only ever comes from the real network.
 */
export async function probeConnectivity(timeoutMs = CONNECTIVITY_PROBE_TIMEOUT_MS): Promise<boolean> {
  try {
    const probeUrl = `${window.location.origin}/?swProbe=${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(probeUrl, { cache: 'no-store', signal: controller.signal });
      return response.ok;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return false;
  }
}

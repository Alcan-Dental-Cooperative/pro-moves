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

/** The single gate: profile flag or local dev flag, minus device opt-out. */
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
    onNeedRefresh,
  });
}

export function applyPendingUpdate(): void {
  updateServiceWorker?.(true);
}

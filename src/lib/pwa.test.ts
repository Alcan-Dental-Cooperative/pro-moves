import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getInstallPathway,
  isBannerDismissed,
  dismissBanner,
  isInstalledNudgeSnoozed,
  snoozeInstalledNudge,
  shouldShowInstalledNudge,
  isMobilePlatform,
  isPlatformPwaEligible,
  INSTALLED_NUDGE_SNOOZE_DAYS,
} from './pwa';

// Helpers for stubbing navigator/window bits that isMobilePlatform() and
// isPlatformPwaEligible() read directly, rather than taking as arguments
// (matching the existing isIos()/isStandalone() style in this file).
function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

function setPlatform(platform: string, maxTouchPoints = 0) {
  Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

function setStandalone(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === '(display-mode: standalone)' ? matches : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

describe('getInstallPathway', () => {
  it('routes iOS Safari to the share-sheet steps', () => {
    expect(getInstallPathway({ isIosSafari: true, isIos: true, canPrompt: false })).toBe('ios-safari');
  });

  it('routes iOS Safari to the share-sheet steps even if a beforeinstallprompt was somehow captured', () => {
    // iOS Safari never fires beforeinstallprompt, but the branch order
    // should still prefer the iOS-Safari path if canPrompt were ever true.
    expect(getInstallPathway({ isIosSafari: true, isIos: true, canPrompt: true })).toBe('ios-safari');
  });

  it('routes iOS non-Safari (Chrome/Firefox/Edge on iOS) to the "open in Safari" copy', () => {
    expect(getInstallPathway({ isIosSafari: false, isIos: true, canPrompt: false })).toBe('ios-other-browser');
  });

  it('routes iOS non-Safari to "open in Safari" even with a captured prompt, since iOS cannot install outside Safari', () => {
    expect(getInstallPathway({ isIosSafari: false, isIos: true, canPrompt: true })).toBe('ios-other-browser');
  });

  it('routes non-iOS with a captured beforeinstallprompt to the one-tap Android button', () => {
    expect(getInstallPathway({ isIosSafari: false, isIos: false, canPrompt: true })).toBe('android-prompt');
  });

  it('falls back to manual "Add to Home screen" instructions when nothing else applies', () => {
    expect(getInstallPathway({ isIosSafari: false, isIos: false, canPrompt: false })).toBe('manual');
  });
});

describe('banner dismissal (MOB-2: permanent, no 7-day re-nag)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is not dismissed before dismissBanner() is called', () => {
    expect(isBannerDismissed()).toBe(false);
  });

  it('stays dismissed after dismissBanner(), with no time-based expiry', () => {
    dismissBanner();
    expect(isBannerDismissed()).toBe(true);
  });

  it('is unaffected by an old timestamp-shaped value from the pre-MOB-2 7-day scheme', () => {
    // Old key stored a raw millisecond timestamp; new code only recognizes
    // the literal 'on' sentinel, so any leftover legacy value reads as "not
    // dismissed" rather than crashing or misinterpreting the number.
    localStorage.setItem('pwa_banner_dismissed', String(Date.now()));
    expect(isBannerDismissed()).toBe(false);
  });
});

describe('shouldShowInstalledNudge', () => {
  const base = { installConfirmed: true, standalone: false, isMobile: true, snoozed: false };

  it('shows for a confirmed installer browsing on mobile, unsnoozed', () => {
    expect(shouldShowInstalledNudge(base)).toBe(true);
  });

  it('never shows inside the installed app itself', () => {
    expect(shouldShowInstalledNudge({ ...base, standalone: true })).toBe(false);
  });

  it('never shows without a confirmed install (those users get the install banner)', () => {
    expect(shouldShowInstalledNudge({ ...base, installConfirmed: false })).toBe(false);
  });

  it('never shows on desktop, where browser use is legitimate', () => {
    expect(shouldShowInstalledNudge({ ...base, isMobile: false })).toBe(false);
  });

  it('respects an active snooze', () => {
    expect(shouldShowInstalledNudge({ ...base, snoozed: true })).toBe(false);
  });
});

describe('installed-nudge snooze (recurring, unlike the banner)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is not snoozed before snoozeInstalledNudge() is called', () => {
    expect(isInstalledNudgeSnoozed()).toBe(false);
  });

  it('is snoozed immediately after, and stays snoozed just before expiry', () => {
    const now = Date.now();
    snoozeInstalledNudge(now);
    expect(isInstalledNudgeSnoozed(now)).toBe(true);
    const justBeforeExpiry = now + INSTALLED_NUDGE_SNOOZE_DAYS * 24 * 60 * 60 * 1000 - 1;
    expect(isInstalledNudgeSnoozed(justBeforeExpiry)).toBe(true);
  });

  it('expires after the snooze window so the nudge recurs', () => {
    const now = Date.now();
    snoozeInstalledNudge(now);
    const afterExpiry = now + INSTALLED_NUDGE_SNOOZE_DAYS * 24 * 60 * 60 * 1000;
    expect(isInstalledNudgeSnoozed(afterExpiry)).toBe(false);
  });

  it('treats a corrupted stored value as not snoozed', () => {
    localStorage.setItem('pwa_installed_nudge_snooze_until', 'garbage');
    expect(isInstalledNudgeSnoozed()).toBe(false);
  });
});

// stale-client-refresh-escape, item 4: PWA activation must be gated on the
// physical platform, not the viewport (useIsMobile is <768px and would
// treat a narrowed desktop window as mobile -- exactly the bug). These
// pin isMobilePlatform() against real UA strings for each device class.
describe('isMobilePlatform', () => {
  const originalUserAgent = window.navigator.userAgent;
  const originalPlatform = window.navigator.platform;
  const originalMaxTouchPoints = window.navigator.maxTouchPoints;

  afterEach(() => {
    setUserAgent(originalUserAgent);
    setPlatform(originalPlatform, originalMaxTouchPoints);
  });

  it('is true on an iPhone UA', () => {
    setUserAgent(IPHONE_UA);
    setPlatform('iPhone');
    expect(isMobilePlatform()).toBe(true);
  });

  it('is true on a modern iPad reporting as MacIntel with touch support', () => {
    // isIos() has this same special case (iPadOS Safari UA-sniffs as Mac).
    setUserAgent(DESKTOP_UA);
    setPlatform('MacIntel', 5);
    expect(isMobilePlatform()).toBe(true);
  });

  it('is true on an Android UA', () => {
    setUserAgent(ANDROID_UA);
    setPlatform('Linux armv8l');
    expect(isMobilePlatform()).toBe(true);
  });

  it('is false on a desktop UA', () => {
    setUserAgent(DESKTOP_UA);
    setPlatform('MacIntel', 0);
    expect(isMobilePlatform()).toBe(false);
  });

  it('is false on a desktop UA even at zero touch points on MacIntel', () => {
    setUserAgent(DESKTOP_UA);
    setPlatform('MacIntel', 0);
    expect(isMobilePlatform()).toBe(false);
  });
});

describe('isPlatformPwaEligible', () => {
  const originalUserAgent = window.navigator.userAgent;
  const originalPlatform = window.navigator.platform;
  const originalMaxTouchPoints = window.navigator.maxTouchPoints;
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    setUserAgent(originalUserAgent);
    setPlatform(originalPlatform, originalMaxTouchPoints);
    window.matchMedia = originalMatchMedia;
  });

  it('is eligible on a mobile platform, not standalone', () => {
    setUserAgent(ANDROID_UA);
    setStandalone(false);
    expect(isPlatformPwaEligible()).toBe(true);
  });

  it('is not eligible on a desktop platform, not standalone', () => {
    setUserAgent(DESKTOP_UA);
    setPlatform('MacIntel', 0);
    setStandalone(false);
    expect(isPlatformPwaEligible()).toBe(false);
  });

  it('the standalone exception: a desktop platform running standalone stays eligible', () => {
    setUserAgent(DESKTOP_UA);
    setPlatform('MacIntel', 0);
    setStandalone(true);
    expect(isPlatformPwaEligible()).toBe(true);
  });

  it('a mobile platform running standalone is eligible (both reasons agree)', () => {
    setUserAgent(IPHONE_UA);
    setStandalone(true);
    expect(isPlatformPwaEligible()).toBe(true);
  });
});

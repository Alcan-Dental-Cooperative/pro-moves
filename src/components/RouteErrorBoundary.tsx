import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import {
  hasPendingUpdate,
  applyPendingUpdate,
  unregisterAllServiceWorkers,
  clearWorkboxCaches,
  probeConnectivity,
} from '@/lib/pwa';

interface Props {
  children: ReactNode;
}

/** How long the reload loop guard blocks a repeat refresh, in milliseconds. */
const LOOP_GUARD_WINDOW_MS = 10000;
const RELOAD_TIMESTAMP_KEY = 'app_reload_timestamp';
/** How long the pending-update hand-off gets before falling back to the
 * harder unregister escape (adversarial QA finding: a waiting worker that
 * never takes control -- e.g. other tabs still holding the old one -- must
 * not wedge the user with no reload and no feedback). */
const PENDING_UPDATE_TIMEOUT_MS = 3000;

// This boundary is the outermost one in the tree, so a thrown storage
// access inside componentDidCatch (locked-down browsers, block-all-cookies
// settings) must never itself become the crash -- that would replace a
// recoverable fallback screen with a blank one. Falls back to an in-memory
// timestamp so the MANUAL-click loop guard still works within a single page
// instance without sessionStorage. It does NOT survive an actual page
// reload (module state resets with the rest of the JS context), which is
// why it is not trusted to guard the AUTOMATIC path at all -- see
// isSessionStorageDurable() and componentDidCatch below. A manual click is
// self-rate-limited by a human and still gated by the connectivity probe,
// so it stays allowed even without durable storage; an unbounded loop can
// only happen on the automatic path, across real reloads a broken deploy
// keeps failing.
let inMemoryReloadTimestamp: string | null = null;

function readReloadTimestamp(): string | null {
  try {
    return sessionStorage.getItem(RELOAD_TIMESTAMP_KEY);
  } catch {
    return inMemoryReloadTimestamp;
  }
}

function writeReloadTimestamp(value: string): void {
  inMemoryReloadTimestamp = value;
  try {
    sessionStorage.setItem(RELOAD_TIMESTAMP_KEY, value);
  } catch {
    /* sessionStorage unavailable -- the in-memory fallback above still guards */
  }
}

const STORAGE_PROBE_KEY = '__route_error_boundary_storage_probe__';

/**
 * Whether sessionStorage will actually carry the loop-guard timestamp
 * across a real reload -- not just whether it exists. Some browsers throw
 * only on write (quota limits, certain privacy-mode policies) while reads
 * quietly succeed, so a bare try/catch around one operation isn't enough; a
 * real write-then-read-then-remove round trip is the only way to know.
 *
 * Used to gate the AUTOMATIC recover path only (componentDidCatch): without
 * durable storage, the in-memory fallback above resets on every reload, so
 * an auto-retry against a genuinely broken deploy (bad build, CDN
 * propagation lag) would loop forever across real navigations, with no
 * human in the loop to notice or stop it.
 */
function isSessionStorageDurable(): boolean {
  try {
    const probeValue = String(Date.now());
    sessionStorage.setItem(STORAGE_PROBE_KEY, probeValue);
    const ok = sessionStorage.getItem(STORAGE_PROBE_KEY) === probeValue;
    sessionStorage.removeItem(STORAGE_PROBE_KEY);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Test-only: this fallback is deliberately module-level (survives across
 * component instances, same as a real reload would find it in sessionStorage),
 * so tests that simulate sessionStorage being unavailable need a way to reset
 * it between cases instead of bleeding state across them.
 */
export function __resetInMemoryReloadTimestampForTests(): void {
  inMemoryReloadTimestamp = null;
}

/**
 * What kind of error the boundary is showing, decided once at catch time:
 * - 'chunk-offline': a lazy route's chunk failed to load and the browser was
 *   offline at that moment. Most likely cause of the failure is the missing
 *   network, not a stale build, so "New Version Available" would be
 *   misleading here.
 * - 'chunk-update': a lazy route's chunk failed to load while online -- the
 *   original case this boundary was built for (a stale client after a new
 *   deploy references a chunk that no longer exists).
 * - 'generic': anything else.
 */
type RouteErrorKind = 'chunk-offline' | 'chunk-update' | 'generic';

interface State {
  hasError: boolean;
  errorKind: RouteErrorKind;
  /** True right after the loop guard swallows a click -- drives the visible
   * button feedback (item 3) instead of a silently dead button. */
  loopGuardTripped: boolean;
}

/**
 * Pure classification, extracted so it's testable without mounting a
 * component or throwing a real error. `isOnline` is threaded in as a plain
 * boolean rather than read from `navigator.onLine` here, so this stays a
 * pure function; the boundary itself reads `navigator.onLine` at the actual
 * moment of the error (see getDerivedStateFromError below) and passes it in.
 */
export function classifyRouteError(error: Pick<Error, 'message' | 'name'>, isOnline: boolean): RouteErrorKind {
  const isChunkError =
    error.message?.includes('dynamically imported module') ||
    error.message?.includes('Importing a module script failed') ||
    error.message?.includes('Failed to fetch dynamically imported module') ||
    error.message?.includes('Loading chunk') ||
    error.name === 'ChunkLoadError';

  if (!isChunkError) return 'generic';
  return isOnline ? 'chunk-update' : 'chunk-offline';
}

export class RouteErrorBoundary extends Component<Props, State> {
  private loopGuardTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorKind: 'generic', loopGuardTripped: false };
  }

  static getDerivedStateFromError(error: Error): Pick<State, 'hasError' | 'errorKind'> {
    // Read online status at the moment the error is caught, not later --
    // by the time a person reads the fallback UI they may have reconnected,
    // but the classification should reflect what actually caused this load
    // to fail, not the state after the fact.
    return { hasError: true, errorKind: classifyRouteError(error, navigator.onLine) };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RouteErrorBoundary caught error:', error, errorInfo);
    // Auto-recover once on a stale-build error (item 2): most users should
    // never see this screen. attemptRefresh() itself owns the loop guard
    // within a single page instance, but the automatic path additionally
    // requires isSessionStorageDurable() -- without storage that actually
    // survives a reload, an auto-retry against a deploy that's still broken
    // (bad build, CDN propagation lag) would loop forever across real
    // navigations, since the in-memory fallback timestamp resets with the
    // rest of module state on every reload. Without durable storage, this
    // just renders the error screen and leaves the escape to the manual
    // button, which is self-rate-limited by a human and still gated by the
    // connectivity probe.
    if (this.state.errorKind === 'chunk-update' && isSessionStorageDurable()) {
      this.attemptRefresh(true);
    }
  }

  componentWillUnmount() {
    if (this.loopGuardTimeout) clearTimeout(this.loopGuardTimeout);
    if (this.pendingUpdateTimeout) clearTimeout(this.pendingUpdateTimeout);
  }

  /**
   * Shared by the manual Refresh/Try Again click and the chunk-update
   * auto-recover (item 2). Owns the loop guard: a call within
   * LOOP_GUARD_WINDOW_MS of the last one is swallowed rather than retried,
   * so a broken escape path can't reload forever. `auto` distinguishes the
   * two callers only for what happens when the guard trips -- the button
   * gets visible feedback (item 3); the silent auto-recover just gives up
   * and leaves the error screen showing.
   */
  private attemptRefresh = (auto = false) => {
    const lastReload = readReloadTimestamp();
    const now = Date.now();
    const elapsed = lastReload ? now - parseInt(lastReload, 10) : Infinity;

    if (elapsed < LOOP_GUARD_WINDOW_MS) {
      console.error('Reload loop detected. Please try again in a few seconds.');
      if (!auto) {
        this.setState({ loopGuardTripped: true });
        if (this.loopGuardTimeout) clearTimeout(this.loopGuardTimeout);
        this.loopGuardTimeout = setTimeout(() => {
          this.setState({ loopGuardTripped: false });
        }, LOOP_GUARD_WINDOW_MS - elapsed);
      }
      return;
    }

    writeReloadTimestamp(now.toString());
    this.escapeStaleServiceWorker();
  };

  handleRefresh = () => {
    this.attemptRefresh(false);
  };

  /**
   * The actual escape (item 1): a bare reload is never enough here, because
   * the old service worker answers it with the same cached old index.html
   * (workbox navigateFallback). If a new build already downloaded and is
   * waiting, activate it -- that hands off and reloads on its own, with a
   * timeout fallback in case the hand-off never actually completes. Otherwise
   * unregister the worker (and its precache) so the next reload has to hit
   * the network for real -- but only once a real connectivity probe confirms
   * the network is actually there.
   *
   * Regression guard: the offline variant ("You appear to be offline") must
   * never unregister -- those users are relying on the very cache this
   * would clear -- so it takes a plain reload instead.
   */
  private escapeStaleServiceWorker = () => {
    if (this.state.errorKind === 'chunk-offline') {
      this.reload();
      return;
    }

    if (hasPendingUpdate()) {
      this.applyPendingUpdateWithFallback();
      return;
    }

    this.unregisterAfterConfirmingOnline();
  };

  /**
   * Adversarial QA finding: applyPendingUpdate()'s promise resolves once the
   * skip-waiting message is sent, not once the page has actually reloaded --
   * a real workbox gotcha (e.g. a waiting worker that never takes control
   * with multiple tabs open) can leave the hand-off silently incomplete,
   * wedging the user with no reload and no feedback, which is the exact bug
   * this ticket exists to fix. Races the hand-off against a timeout and
   * falls back to the harder unregister escape if it doesn't win.
   */
  private applyPendingUpdateWithFallback = () => {
    const timeout = new Promise<never>((_, reject) => {
      this.pendingUpdateTimeout = setTimeout(() => {
        reject(new Error('applyPendingUpdate timed out'));
      }, PENDING_UPDATE_TIMEOUT_MS);
    });

    const clearPendingUpdateTimeout = () => {
      if (this.pendingUpdateTimeout) {
        clearTimeout(this.pendingUpdateTimeout);
        this.pendingUpdateTimeout = null;
      }
    };

    Promise.race([applyPendingUpdate(), timeout])
      .then(() => clearPendingUpdateTimeout())
      .catch(() => {
        clearPendingUpdateTimeout();
        this.unregisterAfterConfirmingOnline();
      });
  };

  /**
   * Adversarial QA finding: navigator.onLine reports true on a captive
   * portal or dead wifi, and this boundary's classification trusts it. Before
   * this fix that misclassification was harmless (both paths just reloaded);
   * now it would unregister a genuinely offline user's service worker and
   * clear its precache -- destroying their only copy of the app -- then
   * reload into nothing. A real network probe gates the unregister step for
   * both the auto and manual paths, since both reach it through here.
   */
  private unregisterAfterConfirmingOnline = () => {
    probeConnectivity().then((online) => {
      if (!online) {
        this.reload();
        return;
      }

      unregisterAllServiceWorkers()
        .then(() => clearWorkboxCaches())
        .catch((err) => console.error('[pwa] failed to clear stale service worker', err))
        .finally(() => this.reload());
    });
  };

  // Extracted so tests can substitute it on a ref'd instance -- jsdom's
  // window.location.reload is a non-configurable, non-writable property and
  // cannot be spied on or reassigned directly.
  private reload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { errorKind, loopGuardTripped } = this.state;
      const isOffline = errorKind === 'chunk-offline';

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center space-y-6 max-w-md">
            <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              {isOffline ? (
                <WifiOff className="w-8 h-8 text-muted-foreground" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-muted-foreground" />
              )}
            </div>

            {errorKind === 'chunk-offline' ? (
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold text-foreground">
                  You appear to be offline
                </h1>
                <p className="text-muted-foreground">
                  We couldn't load this page without a connection. Check your Wi-Fi or
                  data, then try again.
                </p>
              </div>
            ) : errorKind === 'chunk-update' ? (
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold text-foreground">
                  New Version Available
                </h1>
                <p className="text-muted-foreground">
                  The app has been updated. Please refresh to get the latest version.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold text-foreground">
                  Something went wrong
                </h1>
                <p className="text-muted-foreground">
                  We encountered an unexpected error. Please try refreshing the page.
                </p>
              </div>
            )}

            <Button onClick={this.handleRefresh} size="lg" className="gap-2" disabled={loopGuardTripped}>
              <RefreshCw className="w-4 h-4" />
              {loopGuardTripped ? 'Just refreshed, retrying shortly...' : isOffline ? 'Try Again' : 'Refresh Page'}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

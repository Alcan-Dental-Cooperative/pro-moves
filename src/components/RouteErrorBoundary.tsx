import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import {
  hasPendingUpdate,
  applyPendingUpdate,
  unregisterAllServiceWorkers,
  clearWorkboxCaches,
} from '@/lib/pwa';

interface Props {
  children: ReactNode;
}

/** How long the reload loop guard blocks a repeat refresh, in milliseconds. */
const LOOP_GUARD_WINDOW_MS = 10000;
const RELOAD_TIMESTAMP_KEY = 'app_reload_timestamp';

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
    // never see this screen. attemptRefresh() itself owns the loop guard,
    // so a genuine loop (the escape attempt fails and throws right back
    // into this boundary within the guard window) falls through to showing
    // the screen instead of retrying forever.
    if (this.state.errorKind === 'chunk-update') {
      this.attemptRefresh(true);
    }
  }

  componentWillUnmount() {
    if (this.loopGuardTimeout) clearTimeout(this.loopGuardTimeout);
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
    const lastReload = sessionStorage.getItem(RELOAD_TIMESTAMP_KEY);
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

    sessionStorage.setItem(RELOAD_TIMESTAMP_KEY, now.toString());
    this.escapeStaleServiceWorker();
  };

  handleRefresh = () => {
    this.attemptRefresh(false);
  };

  /**
   * The actual escape (item 1): a bare reload is never enough here, because
   * the old service worker answers it with the same cached old index.html
   * (workbox navigateFallback). If a new build already downloaded and is
   * waiting, activate it -- that hands off and reloads on its own. Otherwise
   * unregister the worker (and its precache) so the next reload has to hit
   * the network for real.
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
      applyPendingUpdate();
      return;
    }

    unregisterAllServiceWorkers()
      .then(() => clearWorkboxCaches())
      .catch((err) => console.error('[pwa] failed to clear stale service worker', err))
      .finally(() => this.reload());
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

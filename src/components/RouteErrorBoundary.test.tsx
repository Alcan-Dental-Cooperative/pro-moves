import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createRef } from 'react';
import { render, cleanup, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { RouteErrorBoundary, classifyRouteError } from './RouteErrorBoundary';
import { hasPendingUpdate, applyPendingUpdate, unregisterAllServiceWorkers, clearWorkboxCaches } from '@/lib/pwa';

// PRF-3a: the "New Version Available" copy this boundary shows for a failed
// lazy-chunk load is misleading when the real cause is the user being
// offline, not a stale build after a deploy. classifyRouteError is the pure
// decision extracted out of getDerivedStateFromError so this is testable
// without mounting a component or throwing a real error; the render tests
// below then pin the three resulting UI branches (offline / stale-build /
// generic) end to end.
//
// stale-client-refresh-escape: the boundary's refresh path now escapes a
// stale service worker instead of just reloading (item 1), auto-recovers
// once on a chunk-update error (item 2), and gives the button visible
// feedback when the loop guard swallows a click (item 3). src/lib/pwa.ts is
// mocked so these tests control exactly what "an update is already waiting"
// vs "nothing is waiting, unregister" looks like, without touching the real
// service worker/cache APIs jsdom doesn't implement anyway.
vi.mock('@/lib/pwa', () => ({
  hasPendingUpdate: vi.fn(() => false),
  applyPendingUpdate: vi.fn(),
  unregisterAllServiceWorkers: vi.fn(() => Promise.resolve()),
  clearWorkboxCaches: vi.fn(() => Promise.resolve()),
}));

afterEach(cleanup);

describe('classifyRouteError', () => {
  const chunkErrorMessages = [
    'Failed to fetch dynamically imported module: https://app/assets/AdminPage-abc123.js',
    'Importing a module script failed',
    'Loading chunk 4 failed',
  ];

  it.each(chunkErrorMessages)('classifies "%s" as chunk-update while online', (message) => {
    expect(classifyRouteError({ message, name: 'Error' }, true)).toBe('chunk-update');
  });

  it.each(chunkErrorMessages)('classifies "%s" as chunk-offline while offline', (message) => {
    expect(classifyRouteError({ message, name: 'Error' }, false)).toBe('chunk-offline');
  });

  it('classifies by error name (ChunkLoadError) in addition to message text', () => {
    expect(classifyRouteError({ message: '', name: 'ChunkLoadError' }, true)).toBe('chunk-update');
    expect(classifyRouteError({ message: '', name: 'ChunkLoadError' }, false)).toBe('chunk-offline');
  });

  it('classifies a non-chunk error as generic regardless of online status', () => {
    expect(classifyRouteError({ message: 'TypeError: x is not a function', name: 'TypeError' }, true)).toBe(
      'generic'
    );
    expect(classifyRouteError({ message: 'TypeError: x is not a function', name: 'TypeError' }, false)).toBe(
      'generic'
    );
  });
});

describe('RouteErrorBoundary', () => {
  // sessionStorage backs the reload loop guard, and it isn't reset between
  // test files automatically -- clear it so every test starts as if this is
  // the user's first refresh attempt. Mocks are cleared too, since
  // auto-recover (item 2) now runs pwa.ts calls during render itself, not
  // only on a button click.
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(hasPendingUpdate).mockReset().mockReturnValue(false);
    vi.mocked(applyPendingUpdate).mockClear();
    vi.mocked(unregisterAllServiceWorkers).mockClear().mockResolvedValue(undefined);
    vi.mocked(clearWorkboxCaches).mockClear().mockResolvedValue(undefined);
  });

  // Every test in this block throws a real error through the boundary,
  // which React logs via console.error (componentDidCatch) -- expected
  // noise, not a real failure signal, so it's silenced per test. Returns a
  // ref to the boundary instance too, with its `reload` swapped for a spy:
  // jsdom's window.location.reload is a non-configurable, non-writable
  // property, so it cannot be spied on or reassigned directly, and the
  // component reaches it only through this instance method for exactly
  // that reason.
  function renderWithThrow(message: string, name = 'Error') {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Thrower = () => {
      const error = new Error(message);
      error.name = name;
      throw error;
    };
    const ref = createRef<RouteErrorBoundary>();
    const result = render(
      <RouteErrorBoundary ref={ref}>
        <Thrower />
      </RouteErrorBoundary>
    );
    const reload = vi.fn();
    if (ref.current) {
      (ref.current as unknown as { reload: () => void }).reload = reload;
    }
    return { ...result, consoleError, reload };
  }

  function setOnline(value: boolean) {
    Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
  }

  it('shows the offline copy when a chunk load fails while offline', () => {
    setOnline(false);
    renderWithThrow('Failed to fetch dynamically imported module');

    expect(screen.queryByText('You appear to be offline')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeNull();
    // The stale-build copy must not also be showing.
    expect(screen.queryByText('New Version Available')).toBeNull();
  });

  it('shows the stale-build copy when a chunk load fails while online', () => {
    setOnline(true);
    renderWithThrow('Failed to fetch dynamically imported module');

    expect(screen.queryByText('New Version Available')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /refresh page/i })).not.toBeNull();
    expect(screen.queryByText('You appear to be offline')).toBeNull();
  });

  it('shows the generic error copy for a non-chunk error, even while offline', () => {
    setOnline(false);
    renderWithThrow('Cannot read properties of undefined', 'TypeError');

    expect(screen.queryByText('Something went wrong')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /refresh page/i })).not.toBeNull();
  });

  // Item 1: the escape path. Uses a generic (non-chunk) error deliberately
  // -- its "Refresh Page" button goes through the exact same
  // escapeStaleServiceWorker() branch as chunk-update, but generic errors
  // never trigger item 2's auto-recover, so a manual click here is the
  // click, not a second attempt racing the loop guard against an automatic
  // first one.
  describe('handleRefresh escape path (item 1)', () => {
    it('applies the pending update instead of unregistering, when one is already waiting', () => {
      setOnline(true);
      vi.mocked(hasPendingUpdate).mockReturnValue(true);
      const { reload } = renderWithThrow('Cannot read properties of undefined', 'TypeError');

      fireEvent.click(screen.getByRole('button', { name: /refresh page/i }));

      expect(applyPendingUpdate).toHaveBeenCalledTimes(1);
      expect(unregisterAllServiceWorkers).not.toHaveBeenCalled();
      // applyPendingUpdate's own SW hand-off reloads the page; the boundary
      // must not also reload directly in this branch.
      expect(reload).not.toHaveBeenCalled();
    });

    it('unregisters the service worker and clears its caches, then reloads, when nothing is waiting', async () => {
      setOnline(true);
      vi.mocked(hasPendingUpdate).mockReturnValue(false);
      const { reload } = renderWithThrow('Cannot read properties of undefined', 'TypeError');

      fireEvent.click(screen.getByRole('button', { name: /refresh page/i }));

      expect(unregisterAllServiceWorkers).toHaveBeenCalledTimes(1);
      expect(applyPendingUpdate).not.toHaveBeenCalled();
      await waitFor(() => expect(clearWorkboxCaches).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    });

    it('regression: the offline "Try Again" reloads directly and never unregisters the service worker', async () => {
      setOnline(false);
      vi.mocked(hasPendingUpdate).mockReturnValue(false);
      const { reload } = renderWithThrow('Failed to fetch dynamically imported module');

      fireEvent.click(screen.getByRole('button', { name: /try again/i }));

      expect(reload).toHaveBeenCalledTimes(1);
      expect(unregisterAllServiceWorkers).not.toHaveBeenCalled();
      expect(applyPendingUpdate).not.toHaveBeenCalled();
    });
  });

  // Item 2: auto-recover once on chunk-update, so most users never see this
  // screen at all. Guarded by the same sessionStorage timestamp as the
  // manual button, so it can only ever fire once per loop-guard window.
  describe('auto-recover on chunk-update (item 2)', () => {
    it('escapes automatically on mount, with no click needed', () => {
      setOnline(true);
      vi.mocked(hasPendingUpdate).mockReturnValue(false);
      renderWithThrow('Failed to fetch dynamically imported module');

      // componentDidCatch calls the escape path synchronously; only its
      // promise continuation (clearWorkboxCaches/reload) is deferred.
      expect(unregisterAllServiceWorkers).toHaveBeenCalledTimes(1);
    });

    it('does not auto-recover a second time inside the loop-guard window', () => {
      setOnline(true);
      vi.mocked(hasPendingUpdate).mockReturnValue(false);
      // Simulate the guard timestamp from a reload attempt 1s ago -- well
      // inside the 10s window.
      sessionStorage.setItem('app_reload_timestamp', String(Date.now() - 1000));

      renderWithThrow('Failed to fetch dynamically imported module');

      expect(unregisterAllServiceWorkers).not.toHaveBeenCalled();
      expect(applyPendingUpdate).not.toHaveBeenCalled();
      // The screen still renders normally (not the tripped-button copy --
      // that's the manual path's feedback, item 3, not the silent auto path).
      expect(screen.queryByText('New Version Available')).not.toBeNull();
      expect(screen.queryByRole('button', { name: /refresh page/i })).not.toBeNull();
    });
  });

  // Item 3: a click swallowed by the loop guard must give visible feedback,
  // not just a console.error. Uses a generic error for the same reason as
  // the item-1 block -- no auto-recover competing for the guard window.
  describe('loop-guard button feedback (item 3)', () => {
    it('disables the button with explanatory text when a second click lands inside the guard window', () => {
      setOnline(true);
      renderWithThrow('Cannot read properties of undefined', 'TypeError');

      const button = screen.getByRole('button', { name: /refresh page/i });
      fireEvent.click(button); // first click: real attempt, sets the guard timestamp
      expect(unregisterAllServiceWorkers).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button')); // second click: swallowed
      expect(unregisterAllServiceWorkers).toHaveBeenCalledTimes(1); // still just the one

      const trippedButton = screen.getByRole('button', {
        name: /just refreshed, retrying shortly/i,
      }) as HTMLButtonElement;
      expect(trippedButton.disabled).toBe(true);
    });

    it('re-enables the button once the loop-guard window passes', async () => {
      vi.useFakeTimers();
      try {
        setOnline(true);
        renderWithThrow('Cannot read properties of undefined', 'TypeError');

        fireEvent.click(screen.getByRole('button', { name: /refresh page/i }));
        fireEvent.click(screen.getByRole('button')); // swallowed, trips the guard
        expect(
          (screen.getByRole('button', { name: /just refreshed, retrying shortly/i }) as HTMLButtonElement).disabled
        ).toBe(true);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(10000);
        });

        expect((screen.getByRole('button', { name: /refresh page/i }) as HTMLButtonElement).disabled).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('renders children normally when there is no error', () => {
    render(
      <RouteErrorBoundary>
        <div>All good</div>
      </RouteErrorBoundary>
    );
    expect(screen.queryByText('All good')).not.toBeNull();
  });
});

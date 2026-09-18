import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { isPwaActive, isStandalone, registerPwaServiceWorker, applyPendingUpdate } from '@/lib/pwa';
import { InstallBanner } from './InstallBanner';
import { InstalledAppNudge } from './InstalledAppNudge';

/**
 * Orchestrates per-user PWA activation (docs/features/pwa-push-notifications.md D2):
 * when the signed-in user is flagged (staff.pwa_enabled or the pwa_v1
 * localStorage flag), registers the service worker and shows either the
 * full-screen install takeover (install not yet confirmed) or the
 * already-installed browser nudge. The update toast is the reload path in
 * standalone mode, where there is no browser refresh button.
 *
 * Install confirmation: standalone display mode is the only trustworthy
 * install signal (user agents are identical to the browser's on modern iOS
 * and on Android), so when the app finds itself running standalone it stamps
 * staff.pwa_installed_at via the record_pwa_install() RPC. The RPC is
 * self-scoped (auth.uid()) and writes only once, so re-calling is harmless.
 */
export function PwaManager() {
  const { user, pwaEnabled, pwaInstalledAt } = useAuth();
  const active = !!user && isPwaActive(pwaEnabled);

  useEffect(() => {
    if (!active) return;
    if (isStandalone() && !pwaInstalledAt) {
      supabase.rpc('record_pwa_install' as any).then(({ error }) => {
        if (error) console.warn('[pwa] record_pwa_install failed', error);
      });
    }
  }, [active, pwaInstalledAt]);

  useEffect(() => {
    if (!active) return;
    registerPwaServiceWorker(() => {
      toast({
        title: 'Update available',
        description: 'A new version of Pro Moves is ready.',
        duration: 1000 * 60 * 60,
        action: (
          <ToastAction altText="Refresh now" onClick={() => applyPendingUpdate()}>
            Refresh
          </ToastAction>
        ),
      });
    });
  }, [active]);

  if (!active) return null;
  return pwaInstalledAt ? <InstalledAppNudge /> : <InstallBanner />;
}

import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  isStandalone,
  isInstalledNudgeSnoozed,
  snoozeInstalledNudge,
  shouldShowInstalledNudge,
} from '@/lib/pwa';

/**
 * Gentle redirect for people who have confirmed the installed app
 * (staff.pwa_installed_at set) but are visiting in a phone browser anyway.
 * Rendered by PwaManager in place of the install takeover once the install
 * is confirmed.
 *
 * There is deliberately no "open the app" button: neither iOS nor Android
 * exposes any way for a web page to launch an installed PWA, so the
 * strongest call to action possible is pointing at the home screen icon.
 *
 * Unlike the install banner (permanent dismissal, MOB-2), "Continue in
 * browser" snoozes this for INSTALLED_NUDGE_SNOOZE_DAYS per device: a
 * recurring gentle reminder is the point, and browser visits from a
 * confirmed installer are usually habit, not intent.
 */
export function InstalledAppNudge() {
  const isMobile = useIsMobile();
  const [snoozed, setSnoozed] = useState(isInstalledNudgeSnoozed());

  const show = shouldShowInstalledNudge({
    installConfirmed: true, // PwaManager only renders this when confirmed
    standalone: isStandalone(),
    isMobile,
    snoozed,
  });
  if (!show) return null;

  const handleContinue = () => {
    snoozeInstalledNudge();
    setSnoozed(true);
  };

  return (
    <DialogPrimitive.Root open modal>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/50" />
        <DialogPrimitive.Content
          className="fixed inset-x-4 top-1/2 z-[100] -translate-y-1/2 rounded-2xl border bg-background p-6 shadow-xl focus:outline-none"
          onEscapeKeyDown={handleContinue}
          onPointerDownOutside={handleContinue}
          onInteractOutside={handleContinue}
        >
          <div className="flex flex-col items-center text-center">
            <img src="/pwa-192.png" alt="" className="h-16 w-16 rounded-2xl shadow-lg" />
            <DialogPrimitive.Title asChild>
              <h2 className="mt-4 text-xl font-bold leading-tight">
                You've already got the app!
              </h2>
            </DialogPrimitive.Title>
            <DialogPrimitive.Description asChild>
              <p className="mt-2 text-sm text-muted-foreground">
                Pro Moves looks and works better from the app on your home
                screen. Close this tab and tap the Pro Moves icon instead.
              </p>
            </DialogPrimitive.Description>
            <button
              type="button"
              onClick={handleContinue}
              className="mt-6 text-sm text-muted-foreground underline underline-offset-4"
            >
              Continue in browser for now
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

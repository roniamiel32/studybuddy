/**
 * File:        src/components/calendar/calendar-sync-card.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Connect Google Calendar card, used in onboarding step 4 and on
 *              the Profile tab.
 *
 *              ONE COMPONENT, TWO PLACES, because the states it has to explain are
 *              fiddly — not configured, not connected, connected, connected but
 *              broken — and two copies would drift apart on the third one.
 *
 *              IT IS HONEST ABOUT WHAT CONNECTING DOES. Read sync replaces the
 *              hand-drawn week, and write sync puts study sessions in somebody's
 *              real calendar. Both are said out loud before the button, not
 *              discovered afterwards.
 * Version:     0.46.0
 *
 * Modifications:
 *     0.46.0 - 2026-08-18 - Initial implementation (two-way calendar sync)
 */

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  CalendarCheck,
  CalendarPlus,
  Loader2,
  RefreshCw,
  Unlink,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  disconnectCalendar,
  startCalendarConnect,
  syncCalendarNow,
} from '@/features/calendar/actions';
import type { CalendarStatus } from '@/features/calendar/queries';

export interface CalendarSyncCardProps {
  status: CalendarStatus;
  /** Which screen this is on, so the callback returns here. */
  origin: 'settings' | 'onboarding';
}

/**
 * Turns the `?calendar=` value the callback appends into a sentence.
 *
 * @param value - The status the route handler set.
 * @returns A message and tone, or null when there is nothing to say.
 */
function readCallbackStatus(
  value: string | null,
): { tone: 'success' | 'error'; message: string } | null {
  if (!value) {
    return null;
  }

  if (value.startsWith('synced-')) {
    const count = Number(value.slice('synced-'.length));

    return {
      tone: 'success',
      message:
        count > 0
          ? `Calendar connected. We found ${count} free slot${count === 1 ? '' : 's'} in your week.`
          : 'Calendar connected, but we found no free time between 08:00 and 22:00. Check your calendar and resync.',
    };
  }

  const messages: Record<string, { tone: 'success' | 'error'; message: string }> = {
    denied: { tone: 'error', message: 'Calendar access was not granted, so nothing changed.' },
    invalid: {
      tone: 'error',
      message: 'That calendar link had expired. Press Connect to try again.',
    },
    'exchange-failed': {
      tone: 'error',
      message: 'Google would not complete the connection. Try again in a moment.',
    },
    'sync-failed': {
      tone: 'error',
      message: 'Calendar connected, but the first sync failed. Try Resync.',
    },
    'signed-out': { tone: 'error', message: 'You were signed out. Sign in and try again.' },
  };

  return messages[value] ?? null;
}

/**
 * Renders the calendar sync card.
 *
 * @param status - The connection state, read on the server.
 * @param origin - Which screen this is on.
 * @returns The card element.
 */
export function CalendarSyncCard({ status, origin }: CalendarSyncCardProps) {
  const [pending, startAction] = useTransition();
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | null>(null);
  const notify = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackStatus = searchParams.get('calendar');

  /*
   * The callback cannot raise a toast itself — it is a redirect — so it leaves the
   * outcome in the query string and this picks it up once, then strips it so a
   * refresh does not replay the message.
   */
  useEffect(() => {
    const parsed = readCallbackStatus(callbackStatus);

    if (!parsed) {
      return;
    }

    notify(parsed);
    router.replace(origin === 'onboarding' ? '/onboarding/availability' : '/settings');
  }, [callbackStatus, notify, router, origin]);

  const run = (
    which: 'connect' | 'sync' | 'disconnect',
    work: () => Promise<void>,
  ) => {
    setBusy(which);
    startAction(async () => {
      await work();
      setBusy(null);
    });
  };

  const onConnect = () =>
    run('connect', async () => {
      const result = await startCalendarConnect({ origin });

      if (!result.ok) {
        notify({ tone: 'error', message: result.error.message });
        return;
      }

      /* Full page navigation, not a router push: this leaves the app for Google. */
      window.location.href = result.data.url;
    });

  const onSync = () =>
    run('sync', async () => {
      const result = await syncCalendarNow();

      notify(
        result.ok
          ? {
              tone: 'success',
              message:
                result.data.slotCount > 0
                  ? `Synced. ${result.data.slotCount} free slot${result.data.slotCount === 1 ? '' : 's'} this week.`
                  : 'Synced, but we found no free time between 08:00 and 22:00.',
            }
          : { tone: 'error', message: result.error.message },
      );

      router.refresh();
    });

  const onDisconnect = () =>
    run('disconnect', async () => {
      const result = await disconnectCalendar();

      notify(
        result.ok
          ? {
              tone: 'success',
              message: 'Calendar disconnected. Your synced availability has been cleared.',
            }
          : { tone: 'error', message: result.error.message },
      );

      router.refresh();
    });

  if (!status.available) {
    /*
     * Rendered rather than hidden. A missing card looks like a missing feature;
     * this says the deployment has not been given credentials, which is a
     * different and fixable thing.
     */
    return (
      <section className="border-outline-variant/60 flex items-start gap-3 rounded-md border border-dashed p-4">
        <CalendarPlus className="text-outline mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <h3 className="text-label-md">Google Calendar sync</h3>
          <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
            Not set up on this deployment yet. Once it is, you will be able to fill your
            week in automatically.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="border-outline-variant/60 flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-start gap-3">
        {status.connected ? (
          <CalendarCheck className="text-brand mt-0.5 size-5 shrink-0" aria-hidden="true" />
        ) : (
          <CalendarPlus className="text-outline mt-0.5 size-5 shrink-0" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1">
          <h3 className="text-label-md">Google Calendar sync</h3>

          {status.connected ? (
            <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
              Connected{status.accountEmail ? ` as ${status.accountEmail}` : ''}. Your free
              time between 08:00 and 22:00 is filled in from your calendar, and study
              sessions you join are added back to it.
            </p>
          ) : (
            <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
              Connect it and we will work out when you are free between 08:00 and 22:00
              instead of you drawing it in. Sessions you join get added to your calendar.
              This replaces any week you have filled in by hand.
            </p>
          )}

          {status.connected && status.syncedSlotCount > 0 ? (
            <p className="text-outline mt-1 text-label-sm">
              {status.syncedSlotCount} free slot
              {status.syncedSlotCount === 1 ? '' : 's'} from your calendar
              {status.lastSyncedAt
                ? ` · last synced ${new Date(status.lastSyncedAt).toLocaleString()}`
                : ''}
            </p>
          ) : null}
        </div>
      </div>

      {status.lastError ? (
        <p
          role="status"
          className="text-destructive bg-destructive/10 flex items-start gap-2 rounded-md p-3 text-label-md"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {status.lastError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {status.connected ? (
          <>
            <Button type="button" variant="outline" disabled={pending} onClick={onSync}>
              {busy === 'sync' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw aria-hidden="true" />
              )}
              {busy === 'sync' ? 'Syncing…' : 'Resync now'}
            </Button>

            <Button type="button" variant="ghost" disabled={pending} onClick={onDisconnect}>
              {busy === 'disconnect' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Unlink aria-hidden="true" />
              )}
              Disconnect
            </Button>
          </>
        ) : (
          <Button type="button" disabled={pending} onClick={onConnect}>
            {busy === 'connect' ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <CalendarPlus aria-hidden="true" />
            )}
            {busy === 'connect' ? 'Opening Google…' : 'Connect Google Calendar'}
          </Button>
        )}
      </div>
    </section>
  );
}

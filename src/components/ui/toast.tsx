/**
 * File:        src/components/ui/toast.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Transient notifications. One provider at the root, one `notify`
 *              call from anywhere below it.
 *
 *              Hand-rolled rather than pulled from a library because the whole
 *              surface is "show a sentence, then stop showing it" — a dependency
 *              for that is a dependency to keep current for the life of the
 *              project.
 *
 *              THE LIVE REGION IS PERMANENT AND THE TOASTS ARE INSERTED INTO IT.
 *              A live region mounted at the same moment as its content is not
 *              announced by most screen readers, which is the standard way a
 *              hand-rolled toast ends up invisible to exactly the people who
 *              cannot see it appear. Errors go in an assertive region and
 *              everything else in a polite one, so a validation failure
 *              interrupts and a confirmation waits its turn.
 * Version:     0.43.0
 *
 * Modifications:
 *     0.43.0 - 2026-08-17 - Initial implementation (gatekeeper feedback)
 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

import { cn } from '@/lib/utils';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
}

interface Toast extends Required<ToastOptions> {
  id: number;
}

/** How long a toast stays before removing itself. */
const DISMISS_AFTER_MS = 6_000;

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

/**
 * Returns the notify function.
 *
 * @returns A function that shows a toast.
 * @throws Error when called outside the provider, which is a wiring mistake
 *         rather than a runtime condition worth handling.
 */
export function useToast(): (options: ToastOptions) => void {
  const notify = useContext(ToastContext);

  if (!notify) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }

  return notify;
}

const TONE_STYLES: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: {
    icon: CheckCircle2,
    className: 'border-brand/40 bg-white text-on-surface',
  },
  error: {
    icon: AlertCircle,
    className: 'border-destructive/40 bg-white text-on-surface',
  },
  info: {
    icon: Info,
    className: 'border-outline-variant/60 bg-white text-on-surface',
  },
};

const ICON_TONE: Record<ToastTone, string> = {
  success: 'text-brand',
  error: 'text-destructive',
  info: 'text-outline',
};

/**
 * Provides toasts to everything below it.
 *
 * @param children - The application.
 * @returns The provider and its viewport.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));

    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    ({ message, tone = 'info' }: ToastOptions) => {
      const id = nextId.current++;

      setToasts((current) => [...current, { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS),
      );
    },
    [dismiss],
  );

  /* Every pending timer is cleared on unmount, so a navigation mid-toast does
     not leave a callback pointing at a component that is gone. */
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
      pending.clear();
    };
  }, []);

  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/*
        * Both regions are always mounted and always empty until something is
        * added to them. `pointer-events-none` on the viewport with `auto` on
        * each toast keeps the strip from swallowing clicks on the page beneath.
        */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
        <ToastRegion
          politeness="assertive"
          toasts={toasts.filter((toast) => toast.tone === 'error')}
          onDismiss={dismiss}
        />
        <ToastRegion
          politeness="polite"
          toasts={toasts.filter((toast) => toast.tone !== 'error')}
          onDismiss={dismiss}
        />
      </div>
    </ToastContext.Provider>
  );
}

/**
 * One live region and the toasts currently inside it.
 *
 * @param politeness - Whether these interrupt.
 * @param toasts     - The toasts to render.
 * @param onDismiss  - Removes one.
 * @returns The region element.
 */
function ToastRegion({
  politeness,
  toasts,
  onDismiss,
}: {
  politeness: 'polite' | 'assertive';
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live={politeness}
      aria-atomic="false"
      className="flex w-full flex-col gap-2 sm:w-auto"
    >
      {toasts.map((toast) => {
        const { icon: Icon, className } = TONE_STYLES[toast.tone];

        return (
          <div
            key={toast.id}
            className={cn(
              'shadow-clay-soft pointer-events-auto flex w-full items-start gap-3 rounded-md border p-3.5 text-label-md sm:w-96',
              className,
            )}
          >
            <Icon
              className={cn('mt-0.5 size-4 shrink-0', ICON_TONE[toast.tone])}
              aria-hidden="true"
            />
            <p className="min-w-0 flex-1 text-pretty">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss"
              className="text-outline hover:bg-surface-container focus-visible:ring-brand/35 -m-1 rounded-full p-1 transition-colors focus-visible:ring-4 focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

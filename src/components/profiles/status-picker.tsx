/**
 * File:        src/components/profiles/status-picker.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Choosing what the bubble above your own avatar says.
 *
 *              THE BUBBLE IS THE BUTTON, and when there is no status yet the
 *              button is a small "Add a status" in its place. Sending people to
 *              Settings for one line of text would be three screens for a thing
 *              they change on a whim — and the bubble is already exactly where
 *              they are looking when they decide to change it.
 *
 *              "אחר" SWAPS THE LIST FOR A FIELD rather than opening a second
 *              dialog. It is the same decision at a different grain, so it
 *              belongs in the same place; a nested modal would also put two
 *              Escape targets on screen, and the wrong one wins.
 *
 *              REMOVE IS AN EMPTY WRITE, not its own action. `updateStatusMessage`
 *              treats an empty string as a clear, so the button here says what it
 *              does rather than being wired to a second endpoint that means the
 *              same thing.
 * Version:     0.39.5
 *
 * Modifications:
 *     0.39.5 - 2026-08-17 - Pushed empty state bubble further top-right
 *     0.39.4 - 2026-08-17 - Moved empty state bubble to the top-right
 *     0.39.3 - 2026-08-17 - Changed empty state to a thought bubble trail
 *     0.39.2 - 2026-08-17 - Updated empty state bubble to match white styling
 *     0.39.1 - 2026-08-17 - Updated empty state bubble to match iOS styling
 *     0.39.0 - 2026-08-17 - Initial implementation (Phase 11A)
 */

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Loader2, Trash2, X } from 'lucide-react';

import { StatusBubble } from '@/components/profiles/status-bubble';
import { Button } from '@/components/ui/button';
import { updateStatusMessage } from '@/features/profile/actions';
import {
  STATUS_MAX_LENGTH,
  STATUS_PLACEHOLDER,
  STATUS_PRESETS,
} from '@/features/profile/status-options';
import { cn } from '@/lib/utils';

export interface StatusPickerProps {
  /** What it says now, or null when they have none. */
  status: string | null;
}

/**
 * Renders the owner's bubble as a control, and the dialog behind it.
 *
 * @returns The trigger and its dialog.
 */
export function StatusPicker({ status }: StatusPickerProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  /* Opened fresh each time: the field starts on whatever they have now, so
     editing an existing custom line does not mean retyping it. */
  const [openWas, setOpenWas] = useState(open);

  if (openWas !== open) {
    setOpenWas(open);
    setError(null);

    if (open) {
      const isPreset = status !== null && (STATUS_PRESETS as readonly string[]).includes(status);

      setCustom(isPreset || status === null ? '' : status);
      setWriting(!isPreset && status !== null);
    }
  }

  const save = (next: string) => {
    setError(null);

    startTransition(async () => {
      const result = await updateStatusMessage({ status: next });

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setOpen(false);
      router.refresh();
    });
  };

  const trimmed = custom.trim();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={status ? `Your status: ${status}. Change it.` : 'Add a status'}
        className={cn(
          'group/status focus-visible:ring-brand/35 absolute inset-0 z-20 rounded-full',
          'focus-visible:ring-4 focus-visible:outline-none',
        )}
      >
        {status ? (
          <StatusBubble status={status} interactive />
        ) : (
          /* Only on your own profile, and only until there is one to show. */
          <span className="absolute bottom-[85%] left-[85%] drop-shadow-md opacity-0 transition-opacity group-hover/status:opacity-100 focus-visible:opacity-100">
            <span className="relative z-10 block truncate whitespace-nowrap bg-white text-gray-800 px-5 py-2.5 rounded-[20px] text-sm font-medium transition-colors group-hover/status:bg-gray-50">
              Add a status
            </span>
            <span
              aria-hidden="true"
              className="absolute -bottom-1.5 left-3 z-0 size-2.5 rounded-full bg-white transition-colors group-hover/status:bg-gray-50"
            />
            <span
              aria-hidden="true"
              className="absolute -bottom-4 left-0 z-0 size-1.5 rounded-full bg-white transition-colors group-hover/status:bg-gray-50"
            />
          </span>
        )}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="status-title"
        className="bg-surface shadow-clay-lifted m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl p-0 backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <div className="border-outline-variant/30 flex items-start justify-between gap-4 border-b p-5">
          <div>
            <h2 id="status-title" className="font-heading text-headline-md">
              Your status
            </h2>
            <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
              Shown above your photo. It stays until you change it.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-outline hover:bg-surface-container-high focus-visible:ring-brand/35 shrink-0 rounded-full p-2 transition-colors focus-visible:ring-4 focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-5">
          {error ? (
            <p role="alert" className="text-destructive flex items-start gap-2 text-label-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          {writing ? (
            <div className="flex flex-col gap-3">
              <label htmlFor="status-custom" className="text-label-md">
                אחר
              </label>
              <input
                id="status-custom"
                /* Auto, not rtl: the presets are Hebrew but somebody may well
                   write theirs in English, and the field should follow whatever
                   they actually type. */
                dir="auto"
                autoFocus
                value={custom}
                maxLength={STATUS_MAX_LENGTH}
                onChange={(event) => setCustom(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && trimmed.length > 0) {
                    event.preventDefault();
                    save(trimmed);
                  }
                }}
                placeholder={STATUS_PLACEHOLDER}
                className="border-outline-variant/60 bg-field focus:border-brand focus:ring-brand/20 rounded-md border px-3 py-2 text-body-md outline-none focus:bg-white focus:ring-2"
              />

              <p className="text-outline text-label-sm font-normal">
                {custom.length} / {STATUS_MAX_LENGTH}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  disabled={pending || trimmed.length === 0}
                  onClick={() => save(trimmed)}
                >
                  {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  Save
                </Button>

                <Button type="button" variant="ghost" onClick={() => setWriting(false)}>
                  Back to the list
                </Button>
              </div>
            </div>
          ) : (
            <>
              {STATUS_PRESETS.map((preset) => {
                const chosen = status === preset;

                return (
                  <button
                    key={preset}
                    type="button"
                    dir="auto"
                    disabled={pending}
                    aria-pressed={chosen}
                    onClick={() => save(preset)}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-md border px-4 py-2.5',
                      'text-body-md transition-colors',
                      'focus-visible:ring-brand/35 focus-visible:ring-4 focus-visible:outline-none',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                      chosen
                        ? 'border-brand bg-brand-fixed/60'
                        : 'border-outline-variant/60 hover:bg-surface-container bg-white',
                    )}
                  >
                    <span>{preset}</span>
                    {chosen ? (
                      <Check className="text-brand size-4 shrink-0" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}

              <button
                type="button"
                dir="auto"
                disabled={pending}
                onClick={() => setWriting(true)}
                /* No text-left: dir="auto" puts Hebrew on the right, and this
                   button sat left while every preset above it sat right. */
                className="border-outline-variant/60 hover:bg-surface-container focus-visible:ring-brand/35 flex items-center justify-between gap-3 rounded-md border bg-white px-4 py-2.5 text-body-md transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
              >
                אחר
              </button>
            </>
          )}

          {/*
            * OUTSIDE THE BRANCH, deliberately. A custom status opens the picker
            * straight into its text field so it can be edited without retyping —
            * which meant Remove, when it lived in the list, was unreachable for
            * exactly the people most likely to want it. Clearing is a top-level
            * choice, so it sits below both states rather than inside one.
            */}
          {status ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => save('')}
              className="text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/35 mt-2 flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-label-md transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              Remove my status
            </button>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
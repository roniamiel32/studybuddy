/**
 * File:        src/components/profiles/block-menu.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The three-dot menu on somebody else's profile, and the only place
 *              in the product that can block them.
 *
 *              WHY THIS EXISTS AT ALL. Until matching v5 a negative rating was a
 *              hard, symmetric exclusion, so "I do not want to see this person"
 *              had an answer even though nothing was labelled that way. Softening
 *              that penalty to 0.75x left the exclusion with no control attached
 *              to it: `blocked_users` was read by the scorer and written by
 *              nothing. A demotion is not an answer to somebody you want gone.
 *
 *              BLOCKING IS CONFIRMED, RATING IS NOT. The rating dialog takes an
 *              answer in one press because it is reversible and private. This
 *              removes a person from your matches in both directions, so it asks
 *              first — and says what it will do, because "block" means different
 *              things in different products and a student should not have to
 *              find out by pressing it.
 *
 *              IT NEVER SAYS WHETHER THEY BLOCKED YOU. `isBlocked` is the
 *              viewer's own row and nothing else; there is no state here for
 *              "they blocked you", because a screen that could show it would
 *              turn a quiet exit into a confrontation.
 * Version:     0.34.0
 *
 * Modifications:
 *     0.34.0 - 2026-08-15 - Initial implementation (Phase 10C)
 */

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, MoreHorizontal, ShieldOff, ShieldX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { blockStudent, unblockStudent } from '@/features/profiles/actions';

export interface BlockMenuProps {
  profileId: string;
  /** First name, so the copy reads like a sentence about a person. */
  name: string;
  /** Whether the viewer has already blocked them. */
  isBlocked: boolean;
}

/**
 * Renders the overflow menu and its confirmation dialog.
 *
 * @returns The menu trigger, the menu, and the dialog.
 */
export function BlockMenu({ profileId, name, isBlocked }: BlockMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  /* Close on an outside press or Escape — the two things every menu owes. */
  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (confirming && !dialog.open) {
      dialog.showModal();
    } else if (!confirming && dialog.open) {
      dialog.close();
    }
  }, [confirming]);

  const run = (action: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    setError(null);

    startTransition(async () => {
      const result = await action();

      if (!result.ok && result.error) {
        setError(result.error.message);
        return;
      }

      setConfirming(false);
      setOpen(false);
      /* The action revalidates; this pulls the new state into the open page. */
      router.refresh();
    });
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${name}`}
        onClick={() => setOpen((current) => !current)}
        className="border-outline-variant/60 text-on-surface-variant hover:border-brand hover:text-brand focus-visible:ring-brand/35 flex size-10 items-center justify-center rounded-full border bg-white transition-colors focus-visible:ring-4 focus-visible:outline-none"
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          className="border-outline-variant/40 shadow-clay-lifted absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border bg-white p-1"
        >
          {isBlocked ? (
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => run(() => unblockStudent({ profileId }))}
              className="text-on-surface hover:bg-surface-container flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-label-md transition-colors disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldOff className="size-4" aria-hidden="true" />
              )}
              Unblock {name}
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setConfirming(true);
              }}
              className="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-label-md transition-colors"
            >
              <ShieldX className="size-4" aria-hidden="true" />
              Block {name}
            </button>
          )}
        </div>
      ) : null}

      <dialog
        ref={dialogRef}
        onClose={() => setConfirming(false)}
        aria-labelledby="block-title"
        className="bg-surface shadow-clay-lifted m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl p-0 backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-4 p-5">
          <h2 id="block-title" className="font-heading text-headline-md">
            Block {name}?
          </h2>

          {/* Says what it does, in both directions, before it is done. */}
          <p className="text-on-surface-variant text-body-md text-pretty">
            You will stop seeing each other in matches and suggestions. They are not told,
            and you can undo this from their profile at any time.
          </p>

          {error ? (
            <p role="alert" className="text-destructive flex items-start gap-2 text-label-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => blockStudent({ profileId }))}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Block {name}
            </Button>

            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

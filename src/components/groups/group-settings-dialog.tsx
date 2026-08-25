/**
 * File:        src/components/groups/group-settings-dialog.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Group settings" — the name, the blurb and the participant limit.
 *
 *              The same native <dialog> shell as the course override
 *              questionnaire, so an admin meets one modal in this app rather
 *              than three.
 *
 *              THE LIMIT IS THE INTERESTING FIELD. Lowering it below the people
 *              already in the group is refused by a trigger, and the message
 *              names the count — so the number they need is in the error rather
 *              than something they have to go and count themselves.
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7A)
 */

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Settings, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateGroup } from '@/features/groups/actions';
import { MAX_PARTICIPANTS, MIN_PARTICIPANTS } from '@/features/groups/group-view';

export interface GroupSettingsDialogProps {
  groupId: string;
  name: string;
  description: string | null;
  maxParticipants: number;
  /** The floor the limit cannot go below, shown before they try it. */
  memberCount: number;
}

/**
 * Renders the settings control and its dialog.
 *
 * @param props - The group's current details.
 * @returns The button and dialog elements.
 */
export function GroupSettingsDialog({
  groupId,
  name,
  description,
  maxParticipants,
  memberCount,
}: GroupSettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [state, formAction, saving] = useActionState(updateGroup, null);

  const error = state && !state.ok ? state.error : null;

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

  /* Close once the save succeeds — the page revalidates behind it. */
  const [handled, setHandled] = useState<unknown>(null);

  if (state?.ok === true && state !== handled) {
    setHandled(state);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-on-surface-variant hover:text-brand focus-visible:ring-brand/35 flex items-center gap-1.5 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none"
      >
        <Settings className="size-4" aria-hidden="true" />
        Settings
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="group-settings-title"
        className="bg-surface shadow-clay-lifted m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl p-0 backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <div className="border-outline-variant/30 flex items-start justify-between gap-4 border-b p-5">
          <div>
            <h2 id="group-settings-title" className="font-heading text-headline-md">
              Group settings
            </h2>
            <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
              Everyone in the course sees the name and the size.
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

        <form action={formAction} className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto p-5">
          <input type="hidden" name="groupId" value={groupId} />

          {error ? (
            <p role="alert" className="text-destructive flex items-start gap-2 text-label-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error.message}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              name="name"
              defaultValue={name}
              maxLength={80}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="group-description">What is it for? (optional)</Label>
            <Input
              id="group-description"
              name="description"
              defaultValue={description ?? ''}
              maxLength={400}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="group-max">How many people, including you?</Label>
            <Input
              id="group-max"
              name="maxParticipants"
              type="number"
              defaultValue={maxParticipants ?? ''}
              /* The floor is the people already here. Stated as a bound the input
                 enforces AND as a sentence, because a number input silently
                 refusing to go lower explains nothing. */
              min={Math.max(MIN_PARTICIPANTS, memberCount)}
              max={MAX_PARTICIPANTS}
              required
            />
            <p className="text-outline text-label-sm font-normal">
              {memberCount} {memberCount === 1 ? 'person is' : 'people are'} already in the
              group, so it cannot be smaller than that.
            </p>
          </div>

          <div className="border-outline-variant/30 flex flex-wrap items-center gap-3 border-t pt-4">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Save changes
            </Button>

            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

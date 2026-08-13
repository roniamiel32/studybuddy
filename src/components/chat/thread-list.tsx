/**
 * File:        src/components/chat/thread-list.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Messages tab — personal conversations and group chats in one
 *              list, with the controls over it.
 *
 *              CLIENT-SIDE SORTING AND FILTERING, and that is a decision about
 *              scale rather than laziness. A student has tens of threads, not
 *              thousands; they all arrive in the server render already, so
 *              re-ordering them is a millisecond of array work against a round
 *              trip and a spinner for every press of a radio button.
 *
 *              "LOAD MORE" REVEALS RATHER THAN FETCHES, for the same reason. The
 *              rows are already here; the button is about how much of the page
 *              you want at once, so it should not have a loading state.
 *
 *              THE COUNT RESETS WHEN THE VIEW CHANGES. Switching to "Groups only"
 *              while showing twenty-one rows would otherwise leave the list
 *              scrolled far past the end of a much shorter answer.
 * Version:     0.26.0
 *
 * Modifications:
 *     0.26.0 - 2026-08-13 - Initial implementation (Phase 9D)
 */

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, MessagesSquare, Users } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { Chip } from '@/components/ui/chip';
import { formatConversationTime } from '@/features/chat/chat-view';
import {
  arrangeThreads,
  type MessageThreadView,
  type ThreadFilter,
  type ThreadSort,
} from '@/features/chat/thread-view';
import { cn } from '@/lib/utils';

export interface ThreadListProps {
  threads: MessageThreadView[];
}

/** How many rows show at first, and how many more each press reveals. */
const PAGE_SIZE = 7;

const SORTS: { value: ThreadSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

const FILTERS: { value: ThreadFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'groups', label: 'Groups only' },
  { value: 'people', label: 'Personal only' },
];

/**
 * Renders the merged thread list and its controls.
 *
 * @param threads - Every thread the student can see.
 * @returns The list element.
 */
export function ThreadList({ threads }: ThreadListProps) {
  const [sort, setSort] = useState<ThreadSort>('newest');
  const [filter, setFilter] = useState<ThreadFilter>('all');
  const [shown, setShown] = useState(PAGE_SIZE);

  const arranged = useMemo(
    () => arrangeThreads(threads, sort, filter),
    [threads, sort, filter],
  );

  const visible = arranged.slice(0, shown);
  const remaining = arranged.length - visible.length;

  /**
   * Applies a control and returns to the first page.
   *
   * @param apply - The state change the control asked for.
   * @returns Nothing.
   */
  const change = (apply: () => void) => {
    apply();
    setShown(PAGE_SIZE);
  };

  if (threads.length === 0) {
    return <EmptyThreads />;
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <ControlGroup
          label="Sort"
          options={SORTS}
          value={sort}
          onChange={(next) => change(() => setSort(next))}
        />
        <ControlGroup
          label="Show"
          options={FILTERS}
          value={filter}
          onChange={(next) => change(() => setFilter(next))}
        />
      </div>

      {arranged.length === 0 ? (
        <p className="text-on-surface-variant bg-surface-container rounded-md p-4 text-body-md text-pretty">
          {filter === 'groups'
            ? 'You are not in any group chats yet. Groups live on a course page.'
            : 'No personal conversations yet.'}
        </p>
      ) : (
        <>
          <ul aria-label="Conversations" className="flex flex-col gap-3">
            {visible.map((thread) => (
              <ThreadRow key={`${thread.kind}-${thread.id}`} thread={thread} />
            ))}
          </ul>

          {remaining > 0 ? (
            <button
              type="button"
              onClick={() => setShown((count) => count + PAGE_SIZE)}
              className="clay-btn-secondary focus-visible:ring-brand/35 mt-4 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-label-md focus-visible:ring-4 focus-visible:outline-none"
            >
              Load more
              <span className="text-outline font-normal">
                ({remaining} more)
              </span>
            </button>
          ) : null}
        </>
      )}
    </>
  );
}

/**
 * A labelled row of radio buttons styled as chips.
 *
 * RADIOS, NOT BUTTONS: these are one-of-several choices, which is what a radio
 * group is. Built from buttons they would announce as unrelated controls and
 * lose arrow-key selection.
 *
 * @param props - The label, the options, and the current value.
 * @returns The fieldset element.
 */
function ControlGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">{label}</legend>
      <span aria-hidden="true" className="text-outline text-label-sm font-normal">
        {label}
      </span>

      {options.map((option) => (
        <label key={option.value} className="cursor-pointer">
          <input
            type="radio"
            name={`threads-${label}`}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="peer sr-only"
          />
          <span
            className={cn(
              'peer-focus-visible:ring-brand/35 block rounded-full border px-3 py-1 text-label-sm transition-colors peer-focus-visible:ring-4',
              value === option.value
                ? 'border-brand bg-brand-fixed text-brand'
                : 'border-outline-variant/60 text-on-surface-variant hover:border-brand/60',
            )}
          >
            {option.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * One row, personal or group.
 *
 * @param thread - The thread.
 * @returns The list item element.
 */
function ThreadRow({ thread }: { thread: MessageThreadView }) {
  const unread = thread.kind === 'person' && thread.unreadCount > 0;

  return (
    <li>
      <Link
        href={thread.href}
        className={cn(
          'clay-card focus-visible:ring-brand/35 flex items-center gap-4 p-4 transition-colors focus-visible:ring-4 focus-visible:outline-none',
          /* An unread thread is tinted, not just badged: the whole row is the
             target, so the whole row should read as "new". */
          unread && 'bg-brand-fixed/30',
        )}
      >
        {thread.kind === 'group' ? (
          <span className="bg-brand-fixed text-brand flex size-12 shrink-0 items-center justify-center rounded-full border-[3px] border-white">
            <Users className="size-5" aria-hidden="true" />
          </span>
        ) : (
          <MatchAvatar
            fullName={thread.title}
            avatarUrl={thread.avatarUrl}
            size={48}
            className="border-[3px]"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className={cn('truncate text-label-md text-[15px]', unread && 'font-bold')}>
              {thread.title}
            </h2>
            <span className="text-outline shrink-0 text-label-sm font-normal">
              {formatConversationTime(thread.lastMessageAt)}
            </span>
          </div>

          <p
            className={cn(
              'truncate text-label-sm font-normal',
              unread ? 'text-on-surface' : 'text-on-surface-variant',
            )}
          >
            {thread.lastMessageBody
              ? /* "You: " so a student can see who spoke last without opening
                   the thread. */
                `${thread.lastMessageFromMe ? 'You: ' : ''}${thread.lastMessageBody}`
              : 'No messages yet'}
          </p>

          <div className="mt-1.5 flex items-center gap-2">
            {thread.kind === 'group' ? (
              <Chip tone="mint">
                <Users className="size-3" aria-hidden="true" />
                {thread.subtitle}
              </Chip>
            ) : thread.subtitle ? (
              <Chip tone="brand">{thread.subtitle}</Chip>
            ) : null}

            {unread ? <Chip tone="sunset">{thread.unreadCount} new</Chip> : null}
          </div>
        </div>

        <ChevronRight className="text-outline size-5 shrink-0" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * Explains an empty Messages tab, and where conversations come from.
 *
 * @returns The empty state element.
 */
function EmptyThreads() {
  return (
    <div className="clay-card flex flex-col items-center p-8 text-center sm:p-12">
      <span className="bg-brand-fixed text-brand mb-4 flex size-14 items-center justify-center rounded-full">
        <MessagesSquare className="size-7" aria-hidden="true" />
      </span>

      <h2 className="font-heading text-headline-md">No conversations yet</h2>
      <p className="text-on-surface-variant mt-2 max-w-md text-body-md text-pretty">
        Conversations you start with your matches appear here, and so do the study
        groups you join.
      </p>
    </div>
  );
}

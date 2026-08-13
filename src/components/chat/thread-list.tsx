/**
 * File:        src/components/chat/thread-list.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Messages tab — personal conversations and group chats in one
 *              list, with the controls over it.
 * Version:     0.26.4
 */

'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ChevronRight, Filter, MessagesSquare, Users, X } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { Chip } from '@/components/ui/chip';
import { hideThread } from '@/features/chat/actions';
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
 */
export function ThreadList({ threads }: ThreadListProps) {
  const [sort, setSort] = useState<ThreadSort>('newest');
  const [filter, setFilter] = useState<ThreadFilter>('all');
  const [shown, setShown] = useState(PAGE_SIZE);

  // States for the Dropdown menu
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /*
   * Cleared rows leave the list at once rather than waiting for the revalidation.
   * Keyed by kind and id together, because a conversation and a group could in
   * principle share a uuid and this list holds both.
   */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  const arranged = useMemo(
    () =>
      arrangeThreads(threads, sort, filter).filter(
        (thread) => !hidden.has(`${thread.kind}-${thread.id}`),
      ),
    [threads, sort, filter, hidden],
  );

  const visible = arranged.slice(0, shown);
  const remaining = arranged.length - visible.length;

  const change = (apply: () => void) => {
    apply();
    setShown(PAGE_SIZE);
    setIsMenuOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  if (threads.length === 0) {
    return <EmptyThreads />;
  }

  return (
    <>
      {/* Pulled up with negative margin to sit on the same line as the header */}
      <div className="relative z-10 mb-4 -mt-6 flex justify-end sm:-mt-16 sm:mb-8" ref={menuRef}>
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-expanded={isMenuOpen}
            className={cn(
              'clay-btn-secondary focus-visible:ring-brand/35 flex items-center gap-2 rounded-lg px-4 py-2.5 text-label-md transition-colors focus-visible:ring-4 focus-visible:outline-none',
              isMenuOpen ? 'bg-surface-container border-brand/60' : 'bg-white'
            )}
          >
            <Filter className="size-4" aria-hidden="true" />
            Filter
            <ChevronDown className="text-outline size-4 opacity-70" aria-hidden="true" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-full z-10 mt-2 w-56 rounded-xl border border-outline-variant/40 bg-white p-2 shadow-lg">
              <div className="mb-1 px-2 py-1 text-label-sm text-outline">Sort by</div>
              {SORTS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => change(() => setSort(option.value))}
                  className="focus-visible:bg-brand-fixed/30 hover:bg-brand-fixed/30 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-label-md focus-visible:outline-none"
                >
                  {option.label}
                  {sort === option.value && <Check className="text-brand size-4" />}
                </button>
              ))}

              <div className="bg-outline-variant/30 my-1.5 h-px w-full" />

              <div className="mb-1 px-2 py-1 text-label-sm text-outline">Show</div>
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => change(() => setFilter(option.value))}
                  className="focus-visible:bg-brand-fixed/30 hover:bg-brand-fixed/30 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-label-md focus-visible:outline-none"
                >
                  {option.label}
                  {filter === option.value && <Check className="text-brand size-4" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {arranged.length === 0 ? (
        <p className="bg-surface-container text-on-surface-variant rounded-md p-4 text-body-md text-pretty">
          {filter === 'groups'
            ? 'You are not in any group chats yet. Groups live on a course page.'
            : 'No personal conversations yet.'}
        </p>
      ) : (
        <>
          <ul aria-label="Conversations" className="flex flex-col gap-3">
            {visible.map((thread) => (
              <ThreadRow
                key={`${thread.kind}-${thread.id}`}
                thread={thread}
                onHidden={() =>
                  setHidden((current) =>
                    new Set(current).add(`${thread.kind}-${thread.id}`),
                  )
                }
              />
            ))}
          </ul>

          {/* Load More & Show Less Buttons */}
          {(remaining > 0 || shown > PAGE_SIZE) ? (
            <div className="mt-4 flex gap-3">
              {remaining > 0 ? (
                <button
                  type="button"
                  onClick={() => setShown((count) => count + PAGE_SIZE)}
                  className="clay-btn-secondary focus-visible:ring-brand/35 flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-label-md focus-visible:ring-4 focus-visible:outline-none"
                >
                  Load more
                </button>
              ) : null}

              {shown > PAGE_SIZE ? (
                <button
                  type="button"
                  onClick={() => setShown(PAGE_SIZE)}
                  className="clay-btn-secondary focus-visible:ring-brand/35 flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-label-md focus-visible:ring-4 focus-visible:outline-none"
                >
                  Show less
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

/**
 * One row, personal or group.
 */
function ThreadRow({
  thread,
  onHidden,
}: {
  thread: MessageThreadView;
  onHidden: () => void;
}) {
  /*
   * Two presses, and the second one is the destructive one. Clearing a thread is
   * quiet — the other person keeps it, and a new message brings it back — but it
   * still makes something disappear from a list you are scanning, and a bare X
   * beside a row is far too easy to catch on the way past.
   */
  const [confirming, setConfirming] = useState(false);
  const [pendingHide, startHiding] = useTransition();

  /* No cast needed since Phase 9E: a group thread carries a real unread count
     against last_seen_at, so both members of the union have `unreadCount: number`. */
  const unreadCount = thread.unreadCount;
  const unread = unreadCount > 0;

  return (
    <li className="relative">
      {/*
        The controls sit BESIDE the row, not inside it: the row is an anchor, and
        a button inside an anchor is invalid markup that navigates when pressed.
        `pr-14` (or `pr-24` while confirming) keeps the chevron clear of them.
      */}
      <Link
        href={thread.href}
        className={cn(
          'clay-card focus-visible:ring-brand/35 flex items-center gap-4 p-4 transition-colors focus-visible:ring-4 focus-visible:outline-none',
          unread && 'bg-brand-fixed/30',
          confirming ? 'pr-24' : 'pr-14',
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
              ? `${thread.lastMessageFromMe ? 'You: ' : ''}${thread.lastMessageBody}`
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

            {unread ? <Chip tone="sunset">{unreadCount} new</Chip> : null}
          </div>
        </div>

        <ChevronRight className="text-outline size-5 shrink-0" aria-hidden="true" />
      </Link>

      <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1">
        {confirming ? (
          <>
            <button
              type="button"
              disabled={pendingHide}
              aria-label={`Confirm clearing ${thread.title}`}
              onClick={() => {
                onHidden();
                startHiding(async () => {
                  await hideThread({ kind: thread.kind, id: thread.id });
                });
              }}
              className="bg-brand focus-visible:ring-brand/35 flex size-8 items-center justify-center rounded-full text-white transition-colors hover:brightness-110 focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
            >
              <Check className="size-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              disabled={pendingHide}
              aria-label="Keep this conversation"
              onClick={() => setConfirming(false)}
              className="text-outline hover:text-on-surface hover:bg-surface-container focus-visible:ring-brand/35 flex size-8 items-center justify-center rounded-full transition-colors focus-visible:ring-4 focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-label={`Clear ${thread.title} from your messages`}
            onClick={() => setConfirming(true)}
            className="text-outline hover:text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/35 flex size-8 items-center justify-center rounded-full transition-colors focus-visible:ring-4 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}
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
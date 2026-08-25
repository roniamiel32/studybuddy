/**
 * File:        src/components/layout/header-search.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The global search — a button until you want it, a field once you
 *              do.
 *
 *              IT GROWS LEFTWARD BECAUSE OF WHAT IS TO ITS RIGHT. Match is the
 *              call to action and sits at the end of the header; a field that
 *              expanded rightward would shove it under the user menu every time
 *              somebody searched. Growing into the empty middle moves nothing.
 *
 *              THE WIDTH IS ANIMATED, NOT THE MOUNTING. The input is always in
 *              the DOM and the collapsed state is a zero width with the padding
 *              removed, so the browser has two lengths to interpolate between —
 *              mounting it on click would give it nothing to animate from and it
 *              would appear in one frame.
 *
 *              DEBOUNCED, AND OUT-OF-ORDER REPLIES ARE DROPPED. Every keystroke
 *              would otherwise be a round trip, and the answer to "dan" can
 *              arrive after the answer to "danie" and overwrite it with staler
 *              results. The sequence number is what makes the last request win
 *              rather than the last reply.
 * Version:     0.26.2
 *
 * Modifications:
 *     0.26.2 - Fixed CSS width interpolation for perfectly smooth collapsing
 *     0.26.1 - State reset fixed for immediate clear on close
 *     0.26.0 - 2026-08-13 - Initial implementation (Phase 9D)
 */

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Loader2, Search, Users, X } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { searchEverything } from '@/features/search/actions';
import { KIND_LABELS, type SearchResult } from '@/features/search/search-view';
import { cn } from '@/lib/utils';

const DEBOUNCE_MS = 180;

export function HeaderSearch() {
  const router = useRouter();
  const listboxId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);

  const [answer, setAnswer] = useState<{ query: string; results: SearchResult[] } | null>(null);

  const trimmed = query.trim();
  const results = answer?.query === trimmed ? answer.results : [];
  const loading = trimmed.length >= 2 && answer?.query !== trimmed;

  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
        setAnswer(null);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);

    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (trimmed.length < 2) {
      return;
    }

    const sequence = ++sequenceRef.current;

    const timer = setTimeout(async () => {
      const result = await searchEverything(trimmed);

      if (sequence !== sequenceRef.current) {
        return;
      }

      setAnswer({ query: trimmed, results: result.ok ? result.data : [] });
      setHighlighted(0);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed]);

  const choose = (result: SearchResult) => {
    setOpen(false);
    setQuery('');
    setAnswer(null);
    router.push(result.href);
  };

  const showPanel = open && trimmed.length >= 2;

  return (
    <div ref={rootRef} className="relative flex shrink-0 items-center justify-end">
      <div
        className={cn(
          'flex items-center overflow-hidden rounded-full transition-all duration-300 ease-out',
          open
            ? 'border-outline-variant/60 focus-within:border-brand focus-within:ring-brand/25 border bg-white focus-within:ring-4'
            : 'border border-transparent'
        )}
      >
        <button
          type="button"
          onClick={() => {
            if (open) {
              setOpen(false);
              setQuery('');
              setAnswer(null);
            } else {
              setOpen(true);
            }
          }}
          aria-label={open ? 'Close search' : 'Search'}
          aria-expanded={open}
          className={cn(
            'focus-visible:ring-brand/35 flex shrink-0 items-center gap-2 rounded-full text-label-md whitespace-nowrap transition-colors focus-visible:ring-4 focus-visible:outline-none',
            open
              ? 'text-outline hover:text-on-surface px-3 py-2'
              : 'text-on-surface-variant hover:bg-surface-container-high px-3.5 py-2',
          )}
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          {open ? null : <span className="hidden sm:inline">Search</span>}
        </button>

        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label="Search courses, people and groups"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              setQuery('');
              setAnswer(null);
              return;
            }

            if (!showPanel || results.length === 0) {
              return;
            }

            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setHighlighted((index) => (index + 1) % results.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlighted((index) => (index - 1 + results.length) % results.length);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              const chosen = results[highlighted];

              if (chosen) {
                choose(chosen);
              }
            }
          }}
          placeholder="Courses, people, groups..."
          className={cn(
            'text-on-surface placeholder:text-outline min-w-0 bg-transparent text-label-md outline-none transition-all duration-300 ease-out',
            open ? 'w-[12rem] sm:w-[15rem] py-2 pr-2' : 'w-0 p-0',
          )}
          tabIndex={open ? 0 : -1}
        />

        {open && query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setAnswer(null);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="text-outline hover:text-on-surface focus-visible:ring-brand/35 mr-2 shrink-0 rounded-full transition-colors focus-visible:ring-4 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {showPanel ? (
        <div className="border-outline-variant/40 absolute top-full right-0 z-50 mt-2 w-[min(22rem,85vw)] overflow-hidden rounded-xl border bg-white shadow-lg">
          {loading && results.length === 0 ? (
            <p className="text-outline flex items-center gap-2 p-4 text-label-sm font-normal">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Searching...
            </p>
          ) : results.length === 0 ? (
            <p className="text-on-surface-variant p-4 text-label-sm font-normal text-pretty">
              Nothing matched &ldquo;{trimmed}&rdquo;.
            </p>
          ) : (
            <ul id={listboxId} role="listbox" aria-label="Search results" className="max-h-80 overflow-y-auto py-1">
              {results.map((result, index) => {
                const first =
                  index === 0 || results[index - 1]?.kind !== result.kind;

                return (
                  <li key={`${result.kind}-${result.id}`} role="presentation">
                    {first ? (
                      <p
                        aria-hidden="true"
                        className="text-outline px-3 pt-2 pb-1 text-label-sm font-normal tracking-wider uppercase"
                      >
                        {KIND_LABELS[result.kind]}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      role="option"
                      aria-selected={index === highlighted}
                      onMouseEnter={() => setHighlighted(index)}
                      onClick={() => choose(result)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                        index === highlighted ? 'bg-brand-fixed/50' : 'hover:bg-surface-container',
                      )}
                    >
                      <ResultIcon result={result} />

                      <span className="min-w-0 flex-1">
                        <span className="text-label-md block truncate">{result.title}</span>
                        {result.subtitle ? (
                          <span className="text-outline block truncate text-label-sm font-normal">
                            {result.subtitle}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ResultIcon({ result }: { result: SearchResult }) {
  if (result.kind === 'student') {
    return (
      <MatchAvatar fullName={result.title} avatarUrl={result.avatarUrl} size={32} />
    );
  }

  return (
    <span className="bg-brand-fixed text-brand flex size-8 shrink-0 items-center justify-center rounded-full">
      {result.kind === 'course' ? (
        <BookOpen className="size-4" aria-hidden="true" />
      ) : (
        <Users className="size-4" aria-hidden="true" />
      )}
    </span>
  );
}
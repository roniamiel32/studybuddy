/**
 * File:        src/components/profiles/profile-header.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The banner, avatar, name and badges shared by both profile views.
 *
 *              IT OWNS THE NAVIGATION BETWEEN THEM, and the two directions are
 *              deliberately different controls:
 *
 *                "Learn more" goes to the study information — an explicit button,
 *                because leaving the wall is a decision.
 *
 *                "Meeting History" sits beside it AND ONLY ON YOUR OWN PROFILE.
 *                It is a private record, so a classmate is never shown a link to
 *                it — the route itself 404s for them, and a link they could see
 *                but not follow would be worse than no link.
 *
 *                THE AVATAR AND NAME GO BACK, and only when there is somewhere to
 *                go back to. A picture that navigates is a convention students
 *                already know from every social product; making it the way home
 *                means the header is the same shape in both views.
 *
 *              usePathname rather than a prop: this is the one thing the header
 *              needs to know that its parent would otherwise have to remember to
 *              tell it, and a page that forgot would render a "Learn more" button
 *              on the page it already points at.
 * Version:     0.47.0
 *
 * Modifications:
 *     0.47.0 - 2026-08-19 - The private Meeting History link, and the back
 *                           navigation generalised to any sub-view
 *     0.20.0 - 2026-08-11 - Extracted from the profile page (Phase 8B)
 */

'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, CalendarClock, GraduationCap, Handshake, MapPin } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { StatusBubble } from '@/components/profiles/status-bubble';
import { StatusPicker } from '@/components/profiles/status-picker';
import { Chip } from '@/components/ui/chip';

export interface ProfileHeaderProps {
  profileId: string;
  fullName: string;
  avatarUrl: string | null;
  subtitle: string;
  universityName: string;
  city: string | null;
  weeklyFreeHours: number;
  connectionsSummary: string | null;
  /** Message / rate / edit, rendered by the server page that knows about them. */
  actions: ReactNode;
  /** The line above the avatar, or null when they have none. */
  statusMessage?: string | null;
  /** True on your own profile, where the bubble becomes a control. */
  isSelf?: boolean;
}

/**
 * Renders the profile header.
 *
 * @param props - Who they are, and the actions available on them.
 * @returns The header section.
 */
export function ProfileHeader({
  profileId,
  fullName,
  avatarUrl,
  subtitle,
  universityName,
  city,
  weeklyFreeHours,
  connectionsSummary,
  actions,
  statusMessage = null,
  isSelf = false,
}: ProfileHeaderProps) {
  const pathname = usePathname();
  const wallHref = `/students/${profileId}`;
  /* Any view that is not the wall itself. Tested this way rather than against a
     list of names so a fourth view gets the back navigation for free — which is
     what /meeting-history did. */
  const onSubView = Boolean(pathname) && pathname !== wallHref;
  const onMeetingHistory = pathname?.endsWith('/meeting-history') ?? false;

  return (
    <section aria-labelledby="profile-heading" className="clay-card mb-6 overflow-hidden p-0">
      <div
        aria-hidden="true"
        className="h-24 bg-[linear-gradient(135deg,var(--color-grape-bright)_0%,var(--color-brand-bright)_55%,var(--color-brand)_100%)]"
      />

      <div className="p-6">
        {/* The avatar overlaps the banner, as a social profile does. */}
        <div className="-mt-16 mb-4 flex flex-wrap items-end justify-between gap-4">
          {/*
            * The avatar's own positioning context, so the bubble can hang above
            * it without being placed against the card. `relative` is on this
            * wrapper rather than the flex row: centred on the row, the tail
            * would point at the gap between the avatar and the actions.
            */}
          <div className="relative shrink-0">
            {onSubView ? (
              <Link
                href={wallHref}
                aria-label={`Back to ${fullName}'s wall`}
                className="focus-visible:ring-brand/35 block rounded-full focus-visible:ring-4 focus-visible:outline-none"
              >
                <MatchAvatar
                  fullName={fullName}
                  avatarUrl={avatarUrl}
                  size={96}
                  className="border-4"
                />
              </Link>
            ) : (
              <MatchAvatar
                fullName={fullName}
                avatarUrl={avatarUrl}
                size={96}
                className="border-4"
              />
            )}

            {isSelf ? (
              <StatusPicker status={statusMessage} />
            ) : statusMessage ? (
              <StatusBubble status={statusMessage} />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>

        {onSubView ? (
          <Link
            href={wallHref}
            className="text-on-surface-variant hover:text-brand focus-visible:ring-brand/35 mb-2 inline-flex items-center gap-1.5 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to the wall
          </Link>
        ) : null}

        {/*
          * The name is a link home too, for the same reason the avatar is — and
          * plain text on the wall itself, because a link to the page you are on
          * is a dead control.
          */}
        <h1 id="profile-heading" className="font-heading text-[28px] leading-9 text-balance">
          {onSubView ? (
            <Link
              href={wallHref}
              className="hover:text-brand focus-visible:ring-brand/35 rounded-md transition-colors focus-visible:ring-4 focus-visible:outline-none"
            >
              {fullName}
            </Link>
          ) : (
            fullName
          )}
        </h1>

        <p className="text-on-surface-variant mt-1 text-body-md">{subtitle}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip tone="brand">
            <GraduationCap className="size-3" aria-hidden="true" />
            {universityName}
          </Chip>
          {city ? (
            <Chip tone="neutral">
              <MapPin className="size-3" aria-hidden="true" />
              {city}
            </Chip>
          ) : null}
          {weeklyFreeHours > 0 ? (
            <Chip tone="mint">
              <CalendarClock className="size-3" aria-hidden="true" />
              {weeklyFreeHours}h free a week
            </Chip>
          ) : null}
          {connectionsSummary ? (
            <Chip tone="sunset">
              <Handshake className="size-3" aria-hidden="true" />
              {connectionsSummary}
            </Chip>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {!onSubView ? (
            <Link
              href={`${wallHref}/study-info`}
              className="inline-block px-3 py-1 rounded-md text-sm text-neutral-600 transition-colors duration-200 hover:bg-neutral-100 hover:text-indigo-900"
            >
              Learn more
            </Link>
          ) : null}

          {isSelf && !onMeetingHistory ? (
            <Link
              href={`${wallHref}/meeting-history`}
              className="inline-block px-3 py-1 rounded-md text-sm text-neutral-600 transition-colors duration-200 hover:bg-neutral-100 hover:text-indigo-900"
            >
              Meeting History
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

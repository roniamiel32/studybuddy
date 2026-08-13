/**
 * File:        src/components/notifications/pending-requests-section.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Waiting for you" — the join requests, now on Notifications.
 *
 *              THE CARD IS THE SAME CARD. This renders ApplicantRow, the exact
 *              component the Groups tab used, so the row, the "Pending" chip and
 *              the "Review" dialog are not reimplementations that will drift —
 *              they are the original, moved. The only thing this file adds is the
 *              heading and the count around them.
 *
 *              ABOVE THE FEED, NOT IN IT. A join request is not a notification:
 *              a notification tells you something happened and a request is
 *              waiting on you to decide. Sorting them into the same
 *              reverse-chronological list would bury a decision under things
 *              that only wanted reading.
 * Version:     0.26.0
 *
 * Modifications:
 *     0.26.0 - 2026-08-13 - Moved here from the Groups tab (Phase 9D)
 */

import { ApplicantRow } from '@/components/groups/applicant-review-dialog';
import { Chip } from '@/components/ui/chip';
import { placesLeft } from '@/features/groups/group-view';
import type { StudyGroupView, GroupRequestView } from '@/features/groups/group-view';

export interface PendingRequestsSectionProps {
  requests: GroupRequestView[];
  /** The caller's groups, to work out how many places are left in each. */
  groups: StudyGroupView[];
}

/**
 * Renders the pending join requests, or nothing when there are none.
 *
 * @param requests - Requests waiting on the caller as an admin.
 * @param groups   - The caller's groups, for the remaining-places count.
 * @returns The section element, or null.
 */
export function PendingRequestsSection({ requests, groups }: PendingRequestsSectionProps) {
  if (requests.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="waiting-heading" className="clay-card mb-6 p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 id="waiting-heading" className="font-heading text-headline-md">
          Waiting for you
        </h2>
        <Chip tone="sunset">
          {requests.length} {requests.length === 1 ? 'request' : 'requests'}
        </Chip>
      </div>
      <p className="text-on-surface-variant mt-1 mb-4 text-body-md text-pretty">
        Classmates who have asked to join a group you run.
      </p>

      <ul aria-label="Pending requests" className="flex flex-col gap-2">
        {requests.map((request) => {
          const group = groups.find((candidate) => candidate.id === request.groupId);

          return (
            <ApplicantRow
              key={request.id}
              request={request}
              placesLeft={group ? placesLeft(group) : 0}
            />
          );
        })}
      </ul>
    </section>
  );
}

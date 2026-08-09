/**
 * File:        src/app/(app)/dashboard/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Where a student lands after onboarding. Deliberately a
 *              placeholder: matching is Phase 2, so this confirms setup worked
 *              and shows what was saved rather than pretending to have results.
 *              An empty state that explains itself beats a fake one.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import type { Metadata } from 'next';
import { BookOpen, Clock, Sparkles } from 'lucide-react';

import { Chip } from '@/components/ui/chip';
import {
  getMyAvailability,
  getMyEnrolledOfferingIds,
  getOnboardingProfile,
} from '@/features/onboarding/queries';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * Renders the dashboard.
 *
 * @returns The page element.
 */
export default async function DashboardPage() {
  const supabase = await createClient();

  const [profile, enrolledIds, slots] = await Promise.all([
    getOnboardingProfile(),
    getMyEnrolledOfferingIds(),
    getMyAvailability(),
  ]);

  const { data: courses } = await supabase
    .from('course_offerings')
    .select('id, courses!inner(code, name)')
    .in('id', enrolledIds.length > 0 ? enrolledIds : ['00000000-0000-0000-0000-000000000000']);

  const weeklyHours = slots.reduce((total, slot) => {
    const [startHour] = slot.starts_at.split(':').map(Number);
    const [endHour] = slot.ends_at.split(':').map(Number);
    return total + (endHour - startHour);
  }, 0);

  const firstName = profile.fullName?.split(' ')[0] ?? 'there';

  return (
    <>
      <h1 className="font-heading text-headline-lg text-balance">
        You are all set, {firstName}.
      </h1>
      <p className="text-on-surface-variant mt-2 text-body-lg text-pretty">
        Your profile is ready. Matching goes live next — here is what we will use
        to find your partners.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <section className="border-outline-variant/30 shadow-clay rounded-xl border bg-white p-6">
          <h2 className="font-heading flex items-center gap-2 text-body-lg font-semibold">
            <BookOpen className="text-brand size-5" aria-hidden="true" />
            Your courses
          </h2>

          {courses && courses.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {courses.map((offering) => (
                <li key={offering.id}>
                  <Chip tone="brand">{offering.courses.code}</Chip>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-on-surface-variant mt-3 text-body-md">
              No courses yet.
            </p>
          )}

          <p className="text-outline mt-4 text-label-sm font-normal">
            Each of these will get its own page of study partners.
          </p>
        </section>

        <section className="border-outline-variant/30 shadow-clay rounded-xl border bg-white p-6">
          <h2 className="font-heading flex items-center gap-2 text-body-lg font-semibold">
            <Clock className="text-sunset-deep size-5" aria-hidden="true" />
            Your free time
          </h2>

          <p className="font-heading mt-4 text-headline-lg">{weeklyHours}h</p>
          <p className="text-on-surface-variant text-body-md">marked as free each week</p>

          <p className="text-outline mt-4 text-label-sm font-normal">
            {weeklyHours === 0
              ? 'Add some free time and we can match you on overlapping hours.'
              : 'We match you with people whose free hours overlap yours.'}
          </p>
        </section>
      </div>

      <section className="border-brand/30 bg-brand-fixed/40 mt-4 flex items-start gap-3 rounded-xl border border-dashed p-6">
        <Sparkles className="text-brand mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="font-heading text-body-lg font-semibold">Matching is next</h2>
          <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
            Once it is switched on, open any course to see classmates ranked by
            shared hours and study style — then send a request with an opener
            already written for you.
          </p>
        </div>
      </section>
    </>
  );
}

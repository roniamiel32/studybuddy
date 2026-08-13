/**
 * File:        src/features/search/actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The one search box, across the three things a student navigates
 *              to: their courses, their classmates, and their groups.
 *
 *              RLS IS THE SCOPE, not a university filter written here. Every one
 *              of these three selects runs as the student, so the rows that come
 *              back are the rows they were already allowed to see — a search box
 *              that could find a name the profile page would then refuse is a
 *              search box that leaks.
 *
 *              COURSES ARE LIMITED TO THE ONES THEY ARE TAKING, deliberately and
 *              not by RLS. `course_offerings` is readable across the institution
 *              so the "add a course" panel can work, but /courses/[offeringId]
 *              404s for a course you are not enrolled in — so offering the rest
 *              here would be offering a door into a wall.
 *
 *              THREE QUERIES IN PARALLEL RATHER THAN ONE RPC. They return
 *              different shapes, they are each a single indexed ILIKE, and the
 *              round trip is one either way. A union view would have to flatten
 *              three row types into one and be maintained every time any of them
 *              gained a column.
 * Version:     0.26.0
 *
 * Modifications:
 *     0.26.0 - 2026-08-13 - Initial implementation (Phase 9D)
 */

'use server';

import { z } from 'zod';

import { ok, toActionError, type ActionResult } from '@/lib/errors';
import { createClient, requireUser } from '@/lib/supabase/server';

import type { SearchResult } from './search-view';

/**
 * The query, as typed.
 *
 * Two characters minimum: one letter matches most of a university and makes the
 * typeahead flash a list nobody asked for on the way to the second keystroke.
 */
const querySchema = z
  .string()
  .trim()
  .min(2)
  .max(80);

/** How many of each kind to offer. Three apiece keeps the panel one screen. */
const PER_KIND = 4;

/**
 * Escapes the wildcards PostgREST's ILIKE filter would otherwise honour.
 *
 * Without this, typing `%` matches everything and `_` matches any character —
 * so a student idly typing punctuation gets a list of the whole institution.
 *
 * @param value - The raw query.
 * @returns The query, safe to interpolate into an ILIKE pattern.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Searches courses, students and groups at once.
 *
 * @param rawQuery - What the student has typed.
 * @returns The matches, or an empty list when the query is too short.
 */
export async function searchEverything(rawQuery: string): Promise<ActionResult<SearchResult[]>> {
  try {
    const parsed = querySchema.safeParse(rawQuery);

    /* Too short is not an error — it is the normal state of a box being typed
       into, and reporting it would put a red message under every first letter. */
    if (!parsed.success) {
      return ok([]);
    }

    const user = await requireUser();
    const supabase = await createClient();
    const pattern = `%${escapeLikePattern(parsed.data)}%`;

    const [enrolments, students, groups] = await Promise.all([
      supabase
        .from('enrollments')
        .select('course_offering_id, course_offerings ( courses ( name, code ) )')
        .eq('profile_id', user.id),
      supabase
        .from('profiles')
        .select('id, full_name, avatar_url, degrees ( name )')
        .neq('id', user.id)
        .ilike('full_name', pattern)
        .limit(PER_KIND),
      supabase
        .from('study_group_members')
        .select('group_id, study_groups ( id, name )')
        .eq('profile_id', user.id),
    ]);

    interface EnrolmentRow {
      course_offering_id: string;
      course_offerings: { courses: { name: string; code: string } | null } | null;
    }

    interface StudentRow {
      id: string;
      full_name: string | null;
      avatar_url: string | null;
      degrees: { name: string } | null;
    }

    interface MembershipRow {
      group_id: string;
      study_groups: { id: string; name: string } | null;
    }

    const needle = parsed.data.toLowerCase();

    /*
     * Courses and groups are filtered in memory rather than by the database.
     * Both are reached through a join table the student owns — their enrolments,
     * their memberships — and the name being searched lives on the far side of
     * it, where PostgREST cannot put an ILIKE without an inner-join hint that
     * would silently drop rows whose embed came back null. Both lists are the
     * size of one person's timetable, so the filtering is free.
     */
    const courseResults: SearchResult[] = ((enrolments.data ?? []) as unknown as EnrolmentRow[])
      .flatMap((row) => {
        const course = row.course_offerings?.courses;

        if (!course) {
          return [];
        }

        const matches =
          course.name.toLowerCase().includes(needle) ||
          course.code.toLowerCase().includes(needle);

        return matches
          ? [
              {
                kind: 'course' as const,
                id: row.course_offering_id,
                title: course.name,
                subtitle: course.code,
                href: `/courses/${row.course_offering_id}`,
                avatarUrl: null,
              },
            ]
          : [];
      })
      .slice(0, PER_KIND);

    const studentResults: SearchResult[] = ((students.data ?? []) as unknown as StudentRow[]).map(
      (row) => ({
        kind: 'student' as const,
        id: row.id,
        title: row.full_name ?? 'A classmate',
        subtitle: row.degrees?.name ?? null,
        href: `/students/${row.id}`,
        avatarUrl: row.avatar_url,
      }),
    );

    const groupResults: SearchResult[] = ((groups.data ?? []) as unknown as MembershipRow[])
      .flatMap((row) =>
        row.study_groups && row.study_groups.name.toLowerCase().includes(needle)
          ? [
              {
                kind: 'group' as const,
                id: row.study_groups.id,
                title: row.study_groups.name,
                subtitle: 'Study group',
                href: `/groups/${row.study_groups.id}`,
                avatarUrl: null,
              },
            ]
          : [],
      )
      .slice(0, PER_KIND);

    /* Courses first: they are the thing a student navigates to most, and the
       one whose name they are most likely to be typing in full. */
    return ok([...courseResults, ...studentResults, ...groupResults]);
  } catch (error) {
    return toActionError(error, 'search.searchEverything');
  }
}

/**
 * File:        src/features/search/search-view.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: What a search result is, whichever of the three things it is.
 * Version:     0.26.0
 *
 * Modifications:
 *     0.26.0 - 2026-08-13 - Initial implementation (Phase 9D)
 */

export type SearchResultKind = 'course' | 'student' | 'group';

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle: string | null;
  /** Where selecting it goes. */
  href: string;
  /** Only ever set for a student. */
  avatarUrl: string | null;
}

/** The heading a group of results sits under. */
export const KIND_LABELS: Record<SearchResultKind, string> = {
  course: 'Courses',
  student: 'People',
  group: 'Groups',
};

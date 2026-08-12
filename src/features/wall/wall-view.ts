/**
 * File:        src/features/wall/wall-view.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: View model for a wall post.
 * Version:     0.20.0
 *
 * Modifications:
 *     0.20.0 - 2026-08-11 - Initial implementation (Phase 8B)
 */

export interface WallPostView {
  id: string;
  body: string;
  createdAt: string;
  /** Null once the author deletes their account; the post survives them. */
  authorId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  /** Whether the viewer may remove it — its author, or the wall's owner. */
  canRemove: boolean;
}

/** Why the viewer cannot post here, in words, or null when they can. */
export function postBlockedReason(options: {
  isSelf: boolean;
  isConnection: boolean;
  firstName: string;
}): string | null {
  if (options.isSelf || options.isConnection) {
    return null;
  }

  /*
   * Names the rule rather than the refusal. "You cannot post" tells a student
   * nothing they can act on; this tells them the one thing that would change it,
   * and it happens to be the thing the product wants them to do anyway.
   */
  return `You can post here once you and ${options.firstName} have studied together.`;
}

/**
 * File:        src/features/wall/wall-view.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: View models for a wall post, its likes, comments and shares.
 * Version:     0.21.0
 *
 * Modifications:
 *     0.21.0 - 2026-08-12 - Likes, comments, sharing (Phase 8C)
 *     0.20.0 - 2026-08-11 - Initial implementation (Phase 8B)
 */

export interface WallCommentView {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  /** The author, or the owner of the wall the post sits on. */
  canRemove: boolean;
}

/** The post being passed on, when this one is a share. */
export interface SharedOriginView {
  postId: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  /** Whose wall it was written on — the second half of the visibility rule. */
  ownerId: string;
  ownerName: string;
}

export interface WallPostView {
  id: string;
  /** Null only on a bare share, which carries no words of its own. */
  body: string | null;
  createdAt: string;
  isEdited: boolean;
  authorId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  /** Whether the viewer may remove it — its author, or the wall's owner. */
  canRemove: boolean;
  /** Only the author may rewrite their own words. */
  canEdit: boolean;
  likeCount: number;
  likedByMe: boolean;
  comments: WallCommentView[];
  shared: SharedOriginView | null;
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

/**
 * The line above a shared post — "Noa shared Maya's post".
 *
 * @param sharerName - Who passed it on.
 * @param ownerName  - Whose wall it came from.
 * @returns The attribution.
 */
export function shareAttribution(sharerName: string, ownerName: string): string {
  const first = (name: string) => name.split(' ')[0];

  return `${first(sharerName)} shared ${first(ownerName)}'s post`;
}

import { BoardVisibility } from '@prisma/client';

/** A role string is a "director" role iff it ends in `_DIRECTOR`. */
export function isDirectorRole(role: string): boolean {
  return typeof role === 'string' && role.endsWith('_DIRECTOR');
}

/** True when the given set of role strings contains at least one director role. */
export function isDirector(roles: readonly string[]): boolean {
  return roles.some(isDirectorRole);
}

/** True when the given set of role strings contains SYS_ADMIN. */
export function isSysAdmin(roles: readonly string[]): boolean {
  return roles.includes('SYS_ADMIN');
}

/** The minimal board shape the confidentiality rule needs. */
export interface ConfidentialBoardLike {
  visibility: BoardVisibility;
}

/** The minimal board-member shape the confidentiality rule needs. */
export interface BoardMemberLike {
  userId: string;
}

/** The minimal user shape the confidentiality rule needs. */
export interface ConfidentialUserLike {
  id: string;
  roles: readonly string[];
}

/**
 * THE core security predicate. Decides whether `user` may see the CONTENT of `board`
 * (the board row itself plus all its lists/cards/checklist/comments).
 *
 * Rules:
 * - A TEAM board is never confidential — content visibility is governed elsewhere
 *   (route roles); this predicate returns true for it.
 * - A DIRECTOR_CONFIDENTIAL board is visible ONLY to directors (a user holding any
 *   role ending in `_DIRECTOR`). Being SYS_ADMIN alone never grants content access.
 * - If the confidential board has explicit BoardMember rows, ONLY those named members
 *   (who are also directors) may see it — no other director. If it has no members,
 *   every director may see it.
 */
export function canSeeConfidential(
  userRoles: readonly string[],
  board: ConfidentialBoardLike,
  members: readonly BoardMemberLike[] = [],
  userId?: string,
): boolean {
  if (board.visibility !== BoardVisibility.DIRECTOR_CONFIDENTIAL) {
    return true;
  }
  // Must be a director; SYS_ADMIN-without-director is explicitly NOT enough.
  if (!isDirector(userRoles)) {
    return false;
  }
  // Member-restricted board: only named members (who are directors) may see it.
  if (members.length > 0) {
    if (!userId) {
      return false;
    }
    return members.some((m) => m.userId === userId);
  }
  // No explicit members → all directors may see it.
  return true;
}

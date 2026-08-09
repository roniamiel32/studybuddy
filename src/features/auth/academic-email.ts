/**
 * File:        src/features/auth/academic-email.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Recognising academic email addresses, and deriving readable
 *              names from them. Pure functions with no database access, so the
 *              rules can be tested exhaustively without a running stack.
 * Version:     0.6.1
 *
 * Modifications:
 *     0.6.1 - 2026-08-05 - Initial implementation
 */

/**
 * Suffixes that identify a university address.
 *
 * `.ac.il` covers Israeli institutions and `.edu` the American convention.
 * Both are restricted registries rather than open ones, which is what makes
 * them usable as a proxy for "is a student" without a separate verification
 * step.
 */
export const ACADEMIC_SUFFIXES = ['.ac.il', '.edu'] as const;

/**
 * Normalises an email address for storage and comparison.
 *
 * Trimming and lower-casing matters more than it looks: without it,
 * "Roni@Post.RUNI.ac.il " and "roni@post.runi.ac.il" resolve to different
 * domains, and a student could end up with two accounts, or none.
 *
 * @param email - Raw input, possibly padded or mixed case.
 * @returns The normalised address.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Extracts the domain from an address.
 *
 * @param email - Any address.
 * @returns The lowercase domain, or an empty string when there is no '@'.
 */
export function emailDomain(email: string): string {
  const parts = normaliseEmail(email).split('@');
  return parts.length === 2 ? parts[1] : '';
}

/**
 * Reports whether an address belongs to an academic institution.
 *
 * @param email - Any address.
 * @returns True when the domain ends in a recognised academic suffix.
 */
export function isAcademicEmail(email: string): boolean {
  const domain = emailDomain(email);

  if (!domain || domain.startsWith('.') || domain.endsWith('.')) {
    return false;
  }

  return ACADEMIC_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

/**
 * Derives a readable institution name from a domain.
 *
 * Takes the label immediately before the academic suffix, which is the
 * institution in both conventions: "post.runi.ac.il" and "runi.ac.il" both give
 * "Runi", and "harvard.edu" gives "Harvard".
 *
 * A generated name is a placeholder, not a fact — the institution's real name
 * should replace it once someone from there actually enrols.
 *
 * @param domain - A lowercase academic domain.
 * @returns A title-cased institution name, or the domain itself if nothing
 *          sensible can be derived.
 */
export function institutionNameFromDomain(domain: string): string {
  const suffix = ACADEMIC_SUFFIXES.find((candidate) => domain.endsWith(candidate));

  if (!suffix) {
    return domain;
  }

  const labels = domain.slice(0, -suffix.length).split('.').filter(Boolean);
  const institution = labels.at(-1);

  if (!institution) {
    return domain;
  }

  return institution.charAt(0).toUpperCase() + institution.slice(1);
}

/**
 * Builds a URL-safe slug from a domain.
 *
 * @param domain - A lowercase academic domain.
 * @returns A slug matching the `universities.slug` constraint.
 */
export function slugFromDomain(domain: string): string {
  return domain
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Guesses a student's name from the local part of their address.
 *
 * "roni.amiel@post.runi.ac.il" becomes "Roni Amiel". This is a starting point
 * the student can correct, never a value written without them seeing it —
 * plenty of addresses are "ra4839" and would produce nonsense.
 *
 * @param email - The student's address.
 * @returns A best-effort display name, or an empty string when the local part
 *          yields nothing name-like.
 */
export function nameFromEmail(email: string): string {
  const [localPart] = normaliseEmail(email).split('@');

  if (!localPart) {
    return '';
  }

  const words = localPart
    /* Strip trailing digits: "roni.amiel2024" is a person, not a year. */
    .replace(/\d+$/g, '')
    .split(/[._\-+]+/)
    .filter((word) => word.length > 1 && /^[a-z]+$/.test(word));

  /*
   * A single short fragment is almost always a handle rather than a name:
   * "ra4839" reduces to "ra", and offering "Ra" as someone's name is worse
   * than offering nothing. Two or more words look like a real name even when
   * short, so only the single-word case needs the extra length.
   */
  const looksLikeAName = words.length > 1 || (words[0]?.length ?? 0) >= 3;

  if (!looksLikeAName) {
    return '';
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

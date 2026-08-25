/**
 * File:        src/features/auth/academic-email.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Recognising academic email addresses, and deriving readable
 *              names from them. Pure functions with no database access.
 * Version:     0.6.3
 *
 * Modifications:
 *     0.6.3 - 2026-08-10 - Expanded institution mapping to include all Israeli universities and major colleges
 *     0.6.2 - 2026-08-10 - Added explicit institution name mapping for known domains
 *     0.6.1 - 2026-08-05 - Initial implementation
 */

export const ACADEMIC_SUFFIXES = ['.ac.il', '.edu'] as const;

/**
 * Explicit mapping for known academic domains to ensure official full names.
 */
export const KNOWN_INSTITUTIONS: Record<string, string> = {
  // Universities
  'post.runi.ac.il': 'Reichman University',
  'runi.ac.il': 'Reichman University',
  'idc.ac.il': 'Reichman University',
  
  'tau.ac.il': 'Tel Aviv University',
  'mail.tau.ac.il': 'Tel Aviv University',
  
  'technion.ac.il': 'Technion - Israel Institute of Technology',
  'campus.technion.ac.il': 'Technion - Israel Institute of Technology',
  
  'bgu.ac.il': 'Ben-Gurion University of the Negev',
  'post.bgu.ac.il': 'Ben-Gurion University of the Negev',
  
  'huji.ac.il': 'Hebrew University of Jerusalem',
  'mail.huji.ac.il': 'Hebrew University of Jerusalem',
  
  'biu.ac.il': 'Bar-Ilan University',
  'stu.biu.ac.il': 'Bar-Ilan University',
  
  'haifa.ac.il': 'University of Haifa',
  'campus.haifa.ac.il': 'University of Haifa',
  
  'ariel.ac.il': 'Ariel University',
  'ms.ariel.ac.il': 'Ariel University',
  
  'openu.ac.il': 'Open University of Israel',
  'mail.openu.ac.il': 'Open University of Israel',
  
  'weizmann.ac.il': 'Weizmann Institute of Science',

  // Major Colleges
  'colman.ac.il': 'College of Management Academic Studies',
  'stu.colman.ac.il': 'College of Management Academic Studies',
  
  'mta.ac.il': 'Academic College of Tel Aviv-Yaffo',
  's.mta.ac.il': 'Academic College of Tel Aviv-Yaffo',
  
  'hit.ac.il': 'Holon Institute of Technology',
  
  'shenkar.ac.il': 'Shenkar College of Engineering, Design and Art',
  
  'afeka.ac.il': 'Afeka College of Engineering',
  
  'sce.ac.il': 'SCE - Shamoon College of Engineering',
  
  'ruppin.ac.il': 'Ruppin Academic Center',
  
  'sapir.ac.il': 'Sapir Academic College',
  
  'telhai.ac.il': 'Tel-Hai College',
  
  'hac.ac.il': 'Hadassah Academic College',
  
  'kinneret.ac.il': 'Kinneret College on the Sea of Galilee',
  
  'wgalil.ac.il': 'Western Galilee College',
  
  'braude.ac.il': 'Braude College of Engineering',
  
  'bezalel.ac.il': 'Bezalel Academy of Arts and Design',
  'post.bezalel.ac.il': 'Bezalel Academy of Arts and Design'
};

/**
 * Normalises an email address for storage and comparison.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Extracts the domain from an address.
 */
export function emailDomain(email: string): string {
  const parts = normaliseEmail(email).split('@');
  return parts.length === 2 ? parts[1] : '';
}

/**
 * Reports whether an address belongs to an academic institution.
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
 * Checks the explicit mapping first, and falls back to dynamic derivation.
 */
export function institutionNameFromDomain(domain: string): string {
  const normalisedDomain = domain.toLowerCase();

  if (KNOWN_INSTITUTIONS[normalisedDomain]) {
    return KNOWN_INSTITUTIONS[normalisedDomain];
  }

  const suffix = ACADEMIC_SUFFIXES.find((candidate) => normalisedDomain.endsWith(candidate));

  if (!suffix) {
    return normalisedDomain;
  }

  const labels = normalisedDomain.slice(0, -suffix.length).split('.').filter(Boolean);
  const institution = labels.at(-1);

  if (!institution) {
    return normalisedDomain;
  }

  return institution.charAt(0).toUpperCase() + institution.slice(1);
}

/**
 * Builds a URL-safe slug from a domain.
 */
export function slugFromDomain(domain: string): string {
  return domain
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Guesses a student's name from the local part of their address.
 */
export function nameFromEmail(email: string): string {
  const [localPart] = normaliseEmail(email).split('@');

  if (!localPart) {
    return '';
  }

  const words = localPart
    .replace(/\d+$/g, '')
    .split(/[._\-+]+/)
    .filter((word) => word.length > 1 && /^[a-z]+$/.test(word));

  const looksLikeAName = words.length > 1 || (words[0]?.length ?? 0) >= 3;

  if (!looksLikeAName) {
    return '';
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
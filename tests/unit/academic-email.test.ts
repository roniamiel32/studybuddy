/**
 * File:        tests/unit/academic-email.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Unit tests for academic address handling. This logic decides who
 *              may register and which institution they join, so the rejections
 *              matter as much as the acceptances.
 * Version:     0.6.1
 *
 * Modifications:
 *     0.6.1 - 2026-08-05 - Initial tests
 */

import { describe, expect, it } from 'vitest';

import {
  emailDomain,
  institutionNameFromDomain,
  isAcademicEmail,
  nameFromEmail,
  normaliseEmail,
  slugFromDomain,
} from '@/features/auth/academic-email';
import { signUpSchema } from '@/features/auth/schema';

describe('normaliseEmail', () => {
  it('trims and lowercases, so one person cannot end up with two accounts', () => {
    expect(normaliseEmail('  Roni.Amiel@Post.RUNI.ac.il ')).toBe(
      'roni.amiel@post.runi.ac.il',
    );
  });
});

describe('isAcademicEmail', () => {
  it.each([
    'student@post.runi.ac.il',
    'student@runi.ac.il',
    'student@mail.tau.ac.il',
    'student@harvard.edu',
    'student@some.deep.subdomain.mit.edu',
    '  Student@University.EDU  ',
  ])('accepts %s', (email) => {
    expect(isAcademicEmail(email)).toBe(true);
  });

  it.each([
    'student@gmail.com',
    'student@university.education',
    'student@edu',
    'student@ac.il.example.com',
    'not-an-address',
    '',
  ])('rejects %s', (email) => {
    expect(isAcademicEmail(email)).toBe(false);
  });

  it('rejects a lookalike domain that merely contains the suffix', () => {
    // ".edu.co" is a commercial registry, not an academic one.
    expect(isAcademicEmail('student@university.edu.co')).toBe(false);
  });
});

describe('emailDomain', () => {
  it('extracts the domain used to resolve the institution', () => {
    expect(emailDomain('Roni@Post.RUNI.ac.il')).toBe('post.runi.ac.il');
  });

  it('returns empty for a malformed address rather than throwing', () => {
    expect(emailDomain('not-an-address')).toBe('');
  });
});

describe('institutionNameFromDomain', () => {
  /*
   * Known domains get their real name; everything else is derived from the
   * domain. The map exists because derivation produces "Runi" and "Tau" — right
   * enough to route a signup, wrong enough to look careless on a profile header
   * next to a student's name.
   */
  it.each([
    ['post.runi.ac.il', 'Reichman University'],
    ['runi.ac.il', 'Reichman University'],
    ['idc.ac.il', 'Reichman University'],
    ['mail.tau.ac.il', 'Tel Aviv University'],
  ])('uses the real name for the known domain %s', (domain, expected) => {
    expect(institutionNameFromDomain(domain)).toBe(expected);
  });

  it.each([
    ['harvard.edu', 'Harvard'],
    ['cs.stanford.edu', 'Stanford'],
    ['newcollege.edu', 'Newcollege'],
  ])('derives %s into %s when the domain is unknown', (domain, expected) => {
    /*
     * The fallback still has to work: any .ac.il or .edu address can sign up
     * (D12), so most institutions will never be in the map.
     */
    expect(institutionNameFromDomain(domain)).toBe(expected);
  });

  it('is case-insensitive about the domain', () => {
    expect(institutionNameFromDomain('POST.RUNI.AC.IL')).toBe('Reichman University');
  });

  it('returns the domain unchanged when it is not academic at all', () => {
    /* Signup rejects these long before this point; returning something rather
       than throwing keeps the function total. */
    expect(institutionNameFromDomain('example.com')).toBe('example.com');
  });
});

describe('slugFromDomain', () => {
  it('produces a slug the universities constraint accepts', () => {
    const slug = slugFromDomain('post.runi.ac.il');

    expect(slug).toBe('post-runi-ac-il');
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe('nameFromEmail', () => {
  it('turns a dotted local part into a name', () => {
    expect(nameFromEmail('roni.amiel@post.runi.ac.il')).toBe('Roni Amiel');
  });

  it('handles underscores and hyphens', () => {
    expect(nameFromEmail('eden_bitran@post.runi.ac.il')).toBe('Eden Bitran');
    expect(nameFromEmail('eden-bitran@post.runi.ac.il')).toBe('Eden Bitran');
  });

  it('drops a trailing year, which is an enrolment number and not a name', () => {
    expect(nameFromEmail('roni.amiel2024@post.runi.ac.il')).toBe('Roni Amiel');
  });

  it('returns empty for an opaque local part rather than inventing a name', () => {
    // Guessing "Ra4839" would be worse than leaving the field blank.
    expect(nameFromEmail('ra4839@post.runi.ac.il')).toBe('');
  });

  it('returns empty rather than guessing from a single initial', () => {
    expect(nameFromEmail('r@post.runi.ac.il')).toBe('');
  });
});

describe('signUpSchema', () => {
  it('accepts any academic address, not only seeded domains', () => {
    const parsed = signUpSchema.parse({
      email: '  Student@Harvard.EDU ',
      password: 'longenough1',
    });

    expect(parsed.email).toBe('student@harvard.edu');
  });

  it('rejects a non-academic address with an actionable message', () => {
    const result = signUpSchema.safeParse({
      email: 'student@gmail.com',
      password: 'longenough1',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/\.ac\.il or \.edu/);
  });

  it('rejects a password shorter than the project minimum', () => {
    expect(() =>
      signUpSchema.parse({ email: 'a@post.runi.ac.il', password: 'short' }),
    ).toThrow();
  });
});

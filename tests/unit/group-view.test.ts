/**
 * File:        tests/unit/group-view.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Unit tests for the study-group logic that is not in SQL: capacity,
 *              whether the viewer may ask to join and why not, the canned rejection
 *              messages, and the welcome line.
 *
 *              The rejection messages get the most attention. They are the words a
 *              real student receives after being turned down by a classmate, and an
 *              empty or truncated one is worse than no feature: the request would
 *              simply vanish with nothing said.
 * Version:     0.15.0
 *
 * Modifications:
 *     0.15.0 - 2026-08-10 - Initial tests (Phase 5)
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
  REJECTION_REASONS,
  canRequestToJoin,
  isFull,
  joinBlockedReason,
  placesLeft,
  rejectionMessageFor,
  welcomeMessageFor,
  type StudyGroupView,
} from '@/features/groups/group-view';

/** A group with two of three places taken, seen by a non-member. */
function group(overrides: Partial<StudyGroupView> = {}): StudyGroupView {
  return {
    id: 'g1',
    courseOfferingId: 'o1',
    name: 'Midterm revision',
    description: null,
    maxParticipants: 3,
    status: 'open',
    adminId: 'admin',
    adminName: 'Maya',
    createdAt: '2026-08-10T09:00:00.000Z',
    members: [
      { profileId: 'admin', fullName: 'Maya', avatarUrl: null, isAdmin: true, isFounder: true },
      { profileId: 'member', fullName: 'Tamar', avatarUrl: null, isAdmin: false, isFounder: false },
    ],
    isAdmin: false,
    isFounder: false,
    isMember: false,
    myRequestStatus: null,
    matchScore: null,
    pendingRequests: [],
    ...overrides,
  };
}

describe('placesLeft and isFull', () => {
  it('counts the remaining places', () => {
    expect(placesLeft(group())).toBe(1);
    expect(isFull(group())).toBe(false);
  });

  it('reports a full group', () => {
    const full = group({
      members: [
        { profileId: 'a', fullName: 'A', avatarUrl: null, isAdmin: true, isFounder: true },
        { profileId: 'b', fullName: 'B', avatarUrl: null, isAdmin: false, isFounder: false },
        { profileId: 'c', fullName: 'C', avatarUrl: null, isAdmin: false, isFounder: false },
      ],
    });

    expect(placesLeft(full)).toBe(0);
    expect(isFull(full)).toBe(true);
  });

  it('never reports negative places', () => {
    /*
     * Should not happen — the capacity trigger refuses the insert — but a group
     * that somehow held more than its limit must not render "-1 free".
     */
    const over = group({
      maxParticipants: 2,
      members: [
        { profileId: 'a', fullName: 'A', avatarUrl: null, isAdmin: true, isFounder: true },
        { profileId: 'b', fullName: 'B', avatarUrl: null, isAdmin: false, isFounder: false },
        { profileId: 'c', fullName: 'C', avatarUrl: null, isAdmin: false, isFounder: false },
      ],
    });

    expect(placesLeft(over)).toBe(0);
  });
});

describe('canRequestToJoin', () => {
  it('lets a classmate ask when there is room', () => {
    expect(canRequestToJoin(group())).toBe(true);
  });

  it('refuses a member', () => {
    expect(canRequestToJoin(group({ isMember: true }))).toBe(false);
  });

  it('refuses the admin', () => {
    expect(canRequestToJoin(group({ isAdmin: true, isMember: true }))).toBe(false);
  });

  it('refuses a closed group', () => {
    expect(canRequestToJoin(group({ status: 'closed' }))).toBe(false);
  });

  it('refuses a full group', () => {
    const full = group({
      members: [
        { profileId: 'a', fullName: 'A', avatarUrl: null, isAdmin: true, isFounder: true },
        { profileId: 'b', fullName: 'B', avatarUrl: null, isAdmin: false, isFounder: false },
        { profileId: 'c', fullName: 'C', avatarUrl: null, isAdmin: false, isFounder: false },
      ],
    });

    expect(canRequestToJoin(full)).toBe(false);
  });

  it('refuses a second ask while one is pending', () => {
    expect(canRequestToJoin(group({ myRequestStatus: 'pending' }))).toBe(false);
  });

  it('allows asking again after a rejection', () => {
    /*
     * Deliberate, and the database agrees: the one-live-request index excludes
     * rejected rows. Circumstances change — a place opens up, the times move — and
     * a permanent ban after one "not right now" would be harsher than anyone meant.
     */
    expect(canRequestToJoin(group({ myRequestStatus: 'rejected' }))).toBe(true);
  });
});

describe('joinBlockedReason', () => {
  it('says nothing when they can ask', () => {
    expect(joinBlockedReason(group())).toBeNull();
  });

  it('distinguishes the reasons, because they are different situations', () => {
    /* A single greyed-out button would explain none of these. */
    expect(joinBlockedReason(group({ isFounder: true }))).toMatch(/created/i);
    expect(joinBlockedReason(group({ isMember: true }))).toMatch(/in this group/i);
    expect(joinBlockedReason(group({ myRequestStatus: 'pending' }))).toMatch(/waiting/i);
    expect(joinBlockedReason(group({ status: 'closed' }))).toMatch(/not accepting/i);
  });

  it('does not tell a promoted admin they created the group', () => {
    /*
     * Since Phase 7A "admin" is a rank the founder can grant, so it no longer
     * implies authorship. Telling someone they created a group they were invited
     * to is a small lie in exactly the place students look to work out what
     * happened.
     */
    expect(joinBlockedReason(group({ isAdmin: true, isMember: true }))).toMatch(
      /in this group/i,
    );
  });

  it('puts membership before a pending request', () => {
    /* Someone approved has both; "you are in this group" is the useful half. */
    const both = group({ isMember: true, myRequestStatus: 'approved' });

    expect(joinBlockedReason(both)).toMatch(/in this group/i);
  });

  it('reports a full group to a classmate who has not asked', () => {
    const full = group({
      members: [
        { profileId: 'a', fullName: 'A', avatarUrl: null, isAdmin: true, isFounder: true },
        { profileId: 'b', fullName: 'B', avatarUrl: null, isAdmin: false, isFounder: false },
        { profileId: 'c', fullName: 'C', avatarUrl: null, isAdmin: false, isFounder: false },
      ],
    });

    expect(joinBlockedReason(full)).toBe('Full');
  });
});

describe('REJECTION_REASONS', () => {
  it('offers an "other" option, because a fixed list cannot cover everything', () => {
    const other = REJECTION_REASONS.find((option) => option.value === 'other');

    expect(other).toBeDefined();
    /* Its message is empty on purpose: the admin supplies it. */
    expect(other!.message).toBe('');
  });

  it('gives every canned reason a message worth sending', () => {
    for (const option of REJECTION_REASONS) {
      if (option.value === 'other') {
        continue;
      }

      /*
       * Long enough to be a sentence, and polite enough to send to someone you
       * will sit next to all semester — which is the whole reason these are canned
       * rather than typed in a hurry.
       */
      expect(option.message.length, option.value).toBeGreaterThan(40);
      expect(option.message, option.value).toMatch(/thanks/i);
      expect(option.label.length, option.value).toBeGreaterThan(3);
    }
  });

  it('has no duplicate values', () => {
    const values = REJECTION_REASONS.map((option) => option.value);

    expect(new Set(values).size).toBe(values.length);
  });
});

describe('rejectionMessageFor', () => {
  it('returns the canned text for a known reason', () => {
    expect(rejectionMessageFor('group_full', '')).toMatch(/full/i);
  });

  it('returns the custom text for "other", trimmed', () => {
    expect(rejectionMessageFor('other', '  We already have three.  ')).toBe(
      'We already have three.',
    );
  });

  it('ignores custom text when a canned reason was chosen', () => {
    /* The dropdown and the textarea can both hold values; only one applies. */
    const message = rejectionMessageFor('group_full', 'ignored');

    expect(message).not.toBe('ignored');
    expect(message).toMatch(/full/i);
  });

  it('returns empty for "other" with nothing written, so the action can refuse', () => {
    /*
     * The guard that stops a silent rejection. A student whose request vanished
     * with no message is exactly what the canned list exists to prevent, so the
     * action checks for this and refuses rather than sending nothing.
     */
    expect(rejectionMessageFor('other', '   ')).toBe('');
  });

  it('returns empty for a reason it does not know', () => {
    expect(rejectionMessageFor('made_up', '')).toBe('');
  });
});

describe('welcomeMessageFor', () => {
  it('names the new member', () => {
    expect(welcomeMessageFor('Tamar Adler')).toBe('Welcome Tamar Adler to the group!');
  });

  it('falls back rather than greeting nobody', () => {
    /* A profile with no name is possible mid-onboarding, and "Welcome  to the
       group!" would be worse than a generic line. */
    expect(welcomeMessageFor('   ')).toBe('Welcome a new member to the group!');
  });
});

describe('participant bounds', () => {
  it('mirrors the database CHECK constraint', () => {
    /* If the migration's bounds change, this is the test that says the UI and the
       schema have drifted apart. */
    expect(MIN_PARTICIPANTS).toBe(2);
    expect(MAX_PARTICIPANTS).toBe(20);
  });
});

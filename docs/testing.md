# StudyBuddy — Testing Specification & Implementation

```
File:        docs/testing.md
Authors:     Roni Amiel & Eden Bitran
Course:      Internet Technologies, Reichman University
Description: What is tested, at which level, and why each rule is tested where it
             is. Counts are measured from an actual run, not estimated.
Version:     1.0
Date:        August 2026
```

---

## 1. Summary

| Layer | Files | Tests | Runner | What it proves |
|---|---:|---:|---|---|
| Unit | 19 | **373** | Vitest + jsdom | Pure logic: view models, formatting, validation, presentation |
| Integration | 15 | **283** | Vitest against a real local PostgreSQL | Schema constraints, RLS policies, RPC behaviour |
| End-to-end | 14 | **67 × 2 browsers = 134** | Playwright against a production build | Real user journeys through a real browser |
| **Total** | **48** | **790 executions** | | |

```bash
npm run test        # unit + integration — 656 tests
npm run test:e2e    # end-to-end — 134 executions across two viewports
npm run verify      # lint + typecheck + test + build
```

**Current status: 656/656 unit and integration passing; 133/134 end-to-end passing.**
The single failure is documented in §8 — it is a real product bug, deliberately left
visible rather than silenced.

## 2. Testing strategy

The guiding rule is **test each thing at the cheapest level that can actually prove
it**, and the architecture is shaped to make that possible.

- **A rule that can be a pure function is one.** Every domain has a `*-view.ts`
  module holding view models and formatting with no database access. That is why 373
  tests run in about eight seconds with no database, no browser and no clock.
- **A rule enforced by the database is tested against the database.** An RLS policy
  cannot be proven by a unit test with a mock, because the mock is not the policy.
  Integration tests connect as two different real students and assert what each can
  and cannot read.
- **A journey is tested in a browser.** Anything spanning navigation, forms,
  redirects and live updates is end-to-end.

Two supporting decisions matter:

**End-to-end runs against a production build, not the dev server.** The dev server
compiles each route on first request, so a cold cache looks exactly like a broken
redirect. Serving a real build removes an entire class of false failure.

**Time is injected, never read from the clock inside a test.** Formatters and
schedule logic take a `now` or a `baseDate` parameter. A suite whose result depends
on what day it runs is a suite that fails on somebody else's machine only.

## 3. Unit tests — 373 across 19 files

| File | Covers |
|---|---|
| `academic-email.test.ts` | Domain extraction, academic-suffix recognition, name derivation |
| `academic-year.test.ts` | When to prompt a student to advance their year |
| `calendar-free-time.test.ts` | Converting Google busy blocks into weekly availability |
| `chat-view.test.ts` | Conversation view models, unread totals |
| `course-gatekeeper.test.ts` | Matching a typed course name against the catalogue |
| `course-view.test.ts` | Per-course preference override resolution |
| `env.test.ts` | Environment schema — rejects malformed configuration at boot |
| `errors.test.ts` | `ActionResult` shapes and error-code mapping |
| `group-view.test.ts` | Capacity, places left, fit presentation |
| `icebreaker.test.ts` | Icebreaker selection and fallbacks |
| `match-presentation.test.ts` | Turning a score into an explanation |
| `meeting-components.test.tsx` | Meeting cards and dialogs rendered with Testing Library |
| `meeting-view.test.ts` | Slot grid, run merging, banner windows, formatting |
| `meeting-history-view.test.ts` | History split, statistics, partner phrasing |
| `notification-copy.test.ts` | Every notification type's sentence |
| `onboarding-schema.test.ts` | Zod schemas for all four onboarding steps |
| `placeholder-catalog.test.ts` | The fallback catalogue used with no AI key |
| `profile-view.test.ts` | Profile subtitles, connection summaries |
| `schedule-dialog.test.tsx` | The scheduling picker's grid, list and shared selection |

### Examples of what a unit test pins down

**Accessibility is asserted, not assumed.** `schedule-dialog.test.tsx` counts the
buttons in the grid: cells with no shared time must not be buttons *at all* — not
disabled buttons. "Grey and read-only" is easy to fake with a disabled control, and a
disabled control is still a stop for a keyboard user, so a week with forty
unavailable cells becomes forty stops on the way to the one free Thursday.

**Copy is tested as data, not by eye.** `notification-copy.test.ts` renders all 15
notification types × 2 actor states × 3 title shapes and asserts every result is
non-empty, single-spaced, terminated with punctuation, and opens in upper case — the
four ways a sentence assembled from optional parts goes wrong.

**Ordering is tested for stability, not just correctness.** Feeds sorted by timestamp
break ties on id, and a test asserts two different input orders produce the same
output. Without it, two rows written in the same millisecond can hydrate in a
different sequence than they rendered — a React mismatch that reproduces only on
someone else's machine.

## 4. Integration tests — 283 across 15 files

These run against a real PostgreSQL started by `supabase start`, using two or more
genuinely distinct authenticated clients. They are the only honest way to test a
policy.

| File | Covers |
|---|---|
| `schema.test.ts` | Constraints, defaults, cascade behaviour |
| `rls.test.ts` | Tenancy isolation — the core privacy guarantee |
| `chat-rls.test.ts` | Conversation and message visibility |
| `groups-rls.test.ts` | Group membership and discovery rules |
| `ratings-rls.test.ts` | The public-positive / private-negative split |
| `matching.test.ts` | `rpc_find_candidates` — scoring, exclusions, ordering |
| `meetings.test.ts` | Booking, clashes, the RSVP freeze, cancellation |
| `book-several-sessions.test.ts` | Multi-session atomicity |
| `dismissed-meetings.test.ts` | Per-user dismissal without affecting others |
| `group-admins.test.ts` | Admin-only operations |
| `join-request-history.test.ts` | Request history retained across rejoins |
| `leaving-a-group.test.ts` | Departure, cleanup, empty-group handling |
| `course-overrides.test.ts` | Per-course preferences reaching the matching SQL |
| `wall-and-notifications.test.ts` | Wall writes and the notifications they generate |
| `calendar-sync.test.ts` | Calendar tables, grants, link lifecycle |

### The tenancy suite

`rls.test.ts` creates a student at Reichman and a student at Tel Aviv University and
then attempts, from Reichman, every read and write that would breach the boundary:

- cannot read a Tel Aviv student's availability, enrolments, learning preferences or
  phone number
- cannot read a Tel Aviv course offering **even by its exact id** — guessing the
  primary key is not a way in
- cannot enrol itself in a Tel Aviv course
- cannot move itself into another institution
- cannot put itself on another university's degree
- cannot create a profile row belonging to someone else
- cannot edit a classmate's profile
- an unenumerable listing does not leak Tel Aviv rows either

### Business rules proven at the database level

- **A blocked student cannot detect that they were blocked.** Blocking produces
  absence, not an error — an error message is itself information.
- **A student cannot forge a match score**, and reads only their own.
- **A student cannot write to the AI usage log**, which would erase their own rate
  limit.
- **The person who cancelled cannot rate the one who came.** Attendance is the
  entitlement to rate, and it is checked in SQL.
- **The RSVP freeze holds.** Attendance cannot be rewritten after a session starts.
- **Meeting duration bounds hold** — a full day is accepted, longer is refused.

## 5. End-to-end tests — 67 across 14 files, run on two viewports

Playwright, against `npm start` (a production build), on **Desktop Chrome** and
**iPhone 14 (mobile Safari)**. Students overwhelmingly use phones, so the mobile pass
is not optional.

| File | Journey |
|---|---|
| `landing.spec.ts` | Public marketing page |
| `onboarding.spec.ts` | Sign-up through all four steps to the dashboard |
| `account.spec.ts` | Session persistence, password reset, change, deletion |
| `matches.spec.ts` | The ranked list and its explanations |
| `chat.spec.ts` | Conversations, live delivery, icebreakers |
| `courses.spec.ts` | Course grid, joining, dropping, per-course overrides |
| `groups.spec.ts` | Creation, discovery, join requests |
| `group-admin.spec.ts` | Admin operations |
| `group-fit.spec.ts`, `group-card-fit.spec.ts` | Fit scores and who may see them |
| `meetings.spec.ts` | The scheduling picker and booking |
| `availability.spec.ts` | Editing the week, and the calendar stand-down |
| `profiles.spec.ts` | Profile views, ratings, privacy |
| `status.spec.ts` | Status bubbles |

### The assertion that matters most

Several specs make a point of asserting **against the database, not the screen**. The
meetings spec says it outright: a dialog that opens, lists plausible times and closes
politely would satisfy every visible expectation while booking nothing. So the test
reads `meeting_attendees` back through an admin client and asserts two rows, both
`going`.

## 6. Invalid input and edge cases

Validation is tested at every level it exists at.

| Case | Where tested | Expected behaviour |
|---|---|---|
| Non-academic email at sign-up (`someone@gmail.com`) | e2e `onboarding` | Rejected with a message naming the requirement |
| Unknown academic domain | e2e `onboarding` | Institution provisioned on first sight, sign-up succeeds |
| Wrong or expired confirmation code | e2e `account` | One message for both — distinguishing them tells a guesser which attempt was close |
| Wrong current password on change | e2e `account` | Refused, and the change does not reach the auth server |
| Account used before confirmation | e2e `onboarding` | Blocked until the code is entered |
| Malformed environment variables | unit `env` | Application fails at boot with a named error, not at first use |
| Session shorter than 3 characters, longer than 120 | unit `meeting schema` | Rejected as a sentence, not a 500 |
| More than 20 sessions booked at once | unit `meeting schema` | Refused with a sentence, mirroring the RPC's own cap |
| Session longer than the bound | integration `meetings` | Database rejects it |
| Booking a slot someone just took | integration `meetings` | Advisory lock; a clash books nothing, not some |
| Empty availability week | e2e `availability` | A legitimate answer, saved as such |
| A conversation, group, course or profile you are not part of | e2e ×4 | **404, not 403** — a forbidden page confirms the resource exists |
| A private meeting history that is not yours | e2e | 404, and no link is rendered |
| No shared free time at all | unit `schedule-dialog` | Explains why, rather than drawing an empty grid |
| Deleted account referenced by old rows | unit `notification-copy` | Subjectless sentence, still grammatical |
| Unknown notification type from a newer migration | unit `notification-copy` | Row skipped; page still renders |

That last one is worth stating as a principle: the notification enum lives in the
database and grows in a migration, so between that landing and a deploy the feed will
be handed rows the build has never heard of. Skipping one row inconveniences a
student; throwing takes the page away from them.

## 7. Permissions testing

Authorisation is tested where it is enforced — in the database — and again where the
student experiences it.

**At the policy level** (integration): two real authenticated clients, one attempting
what the other owns. Covers tenancy, conversations, groups, ratings, meetings,
match scores and the AI log.

**At the journey level** (e2e): that the guard produces the right *experience*. A
group you are not in is a 404. A negative rating appears nowhere on the rated
student's profile — asserted as an absence across the whole page, not just the
section it would normally render in.

**At the role level**: admin-only operations are attempted as a plain member and
refused; a member of a group sees no fit score on it, while a prospective applicant
does.

## 8. Known failing test

One end-to-end test fails, and it is left failing on purpose because it is reporting a
real defect:

> `account.spec.ts` › *the password can be changed, and the account deleted, from
> settings* — **mobile Safari only**

The fixed bottom navigation bar (`position: fixed; bottom: 0; z-index: 50`)
intercepts pointer events on the password dialog's Save button at phone width. The
dialog is being rendered below the navigation rather than in the browser's top layer.

It was verified as pre-existing by stashing all current work, rebuilding at the
previous commit, and reproducing it there. It is a genuine mobile bug and belongs on
the fix list, not on the silenced list. Deleting the assertion would remove the only
thing currently reporting it.

## 9. What is not covered

Stated honestly, since a testing document that claims total coverage is not credible:

- **Third-party integrations are not exercised against live services.** Google
  Calendar and Brevo SMTP are tested up to the boundary — tables, grants, link
  lifecycle, token storage — but no test calls Google or sends a real email.
- **AI responses are not tested for quality**, only that a missing key degrades to
  the deterministic fallback.
- **No load or performance testing.** Scaling behaviour is reasoned about in
  `docs/scaling.md` from indexes and query shapes, not measured under load.
- **Visual regression is not automated.** Layout is checked by hand and by screenshot
  during development.
- **Browsers other than Chromium and mobile WebKit** are not covered.

# StudyBuddy — Product Requirements Document

```
File:        docs/product-requirements.md
Authors:     Roni Amiel & Eden Bitran
Course:      Internet Technologies, Reichman University
Description: What StudyBuddy is for, who it serves, and what was built to serve
             them. Describes the product AS IMPLEMENTED, not as originally
             proposed — see §9 for where the two differ.
Version:     1.0
Date:        August 2026
```

---

## 1. The problem

A student who wants to revise with somebody faces a coordination problem that has
nothing to do with studying.

Finding a partner means asking in a course WhatsApp group of 200 people and hoping
the right one answers. The people who reply are the people who happen to be looking
at their phone, not the people who are free when you are, study the way you do, or
are taking the course seriously. Agreeing on a time then means a second negotiation,
in a thread where it scrolls away.

Three specific failures follow, and StudyBuddy is built around them:

**Discovery is loudest-voice-first.** A group chat surfaces whoever answers fastest.
It has no notion of who shares your course, your free hours, or your working style,
so the match quality is chance.

**Compatibility is invisible until it has cost you an evening.** Whether somebody
wants a silent library or a talkative café, mornings or nights, a pair or a group of
six, is knowable in advance and is normally discovered by wasting a session.

**Nothing is a commitment.** "Sounds good, maybe Tuesday" in a chat is not a
calendar entry. Nobody is expected, nobody is missed, and there is no record that
the session happened — which means there is also no basis for knowing who is worth
studying with again.

WhatsApp is not a bad chat application. It is simply not a matching system, a
scheduler, or a record, and students are using it as all three.

## 2. Who the users are

**Enrolled university students, verified by institutional email.** Registration
accepts only academic addresses — domains ending `.ac.il` or `.edu` — and the domain
decides which institution the account belongs to. A student at Reichman signing up
with `@post.runi.ac.il` is placed in the Reichman tenant and will only ever be shown
Reichman students.

Verification is not cosmetic. It is what makes every other guarantee in the product
meaningful: that the person you are matched with is a real classmate, that the
course you share is a course you are both actually enrolled in, and that a
university's students are not visible to another university's.

The design assumes a student who:

- is taking several courses at once, with different partners appropriate to each;
- has a week with a shape — free some hours, not others — that is stable across a
  semester;
- has preferences about how they study that they can state, and that predict
  whether a session will work;
- owns a phone and will do most of this on it.

**Secondary user: the group administrator.** A student who creates a study group
acquires responsibilities the product has to support — approving requests, promoting
co-admins, removing members, and calling sessions off. This is the same person in a
different role, not a different class of account.

## 3. Who the customer is

For this project the **user and the customer are the same person**: the student.
There is no paying third party, no institutional buyer, and no advertiser. That is a
deliberate scoping decision and it has design consequences worth stating, because
they explain choices that would otherwise look arbitrary:

- **No engagement metrics as a goal.** Nothing in the product is designed to
  maximise time spent. A student who finds a partner in ninety seconds and closes
  the tab is the success case.
- **The institution is a tenancy boundary, not a customer.** Universities are
  modelled (`universities`, `university_domains`) so that data can be separated
  per institution, but no university has an administrative view, a dashboard, or
  any ability to see student data.
- **Privacy defaults are set for the student.** Negative ratings are private to
  their author; a student's meeting history is visible only to themselves; contact
  details are the most restricted table in the schema.

A plausible future customer is the university itself, buying it as a student-success
tool. That would require an institutional dashboard and is out of scope here.

## 4. Business and product goals

| Goal | What it means concretely | How the product delivers it |
|---|---|---|
| **Save the student time** | Finding a compatible partner should take under two minutes, not a week of group-chat negotiation | Ranked match list computed from real enrolment, availability and preference data; one-click conversation opening |
| **Improve academic outcomes** | Sessions should actually happen, with people worth studying with | Scheduling built into the chat, calendar sync, and a reputation signal derived only from sessions that really took place |
| **Replace an unstructured environment with a structured one** | The commitment, the people and the record should all be first-class objects | `meetings` with attendees and RSVPs; `study_groups` with roles and requests; a private meeting history per student |
| **Make trust cheap** | A student should be able to tell whether a stranger is worth an evening | Institutional email verification, per-course compatibility scores, and public positive connections |
| **Be usable on a phone in a corridor** | The primary device is a phone between classes | Mobile-first layout with a fixed bottom navigation bar; every flow works at 390px |

### Non-goals

Stated explicitly, because leaving them ambiguous invites scope creep:

- Not a learning-management system. No assignments, grades, or course materials.
- Not a social network. There is no follow graph, no feed of strangers, and no
  discovery outside your own institution and courses.
- Not a tutoring marketplace. No payments, no tutor/student asymmetry — every
  participant is a peer.

## 5. Software capabilities built to enable those goals

Each capability below exists to serve a goal in §4, and each is implemented.

### 5.1 Institutional identity
Sign-up restricted to academic domains; the domain resolves to an institution, and
an institution not yet known is provisioned on first sight so the product works at a
university nobody has registered from before. Email confirmation by six-digit code.

### 5.2 Structured onboarding
Four steps that collect exactly what the matching engine consumes and nothing else:
personal basics and degree, current courses, study preferences, and a weekly
availability grid. Availability can be drawn by hand or derived from a connected
Google Calendar.

### 5.3 The matching engine
A ranked list of candidate partners per course, computed in the database
(`rpc_find_candidates`) from shared enrolment, overlapping free time measured in
minutes, preference agreement, cohort and city proximity, and reputation. Scores are
cached with a TTL so a dashboard load is not a full recompute.

### 5.4 Per-course preferences
A student studies differently for different subjects. Global preferences are
inherited by every course and can be overridden per course, with the resolution rule
implemented identically in the UI and in the matching SQL.

### 5.5 In-app messaging
One-to-one conversations and group chats, delivered live over Supabase Realtime, with
AI-generated icebreakers so the first message is not the hardest one.

### 5.6 Study groups
Course-scoped groups with capacity, admin roles, join requests, invitations, and a
fit score so an admin can see how well an applicant matches the group.

### 5.7 Scheduling and calendar sync
A picker that intersects every participant's free time, subtracts what is already
booked, and books one or several sessions in a single transaction. Sessions
optionally sync into Google Calendar, and calendar-derived busy time flows back into
availability.

### 5.8 Reputation
After a session has actually finished, each attendee may rate the others. Positive
ratings appear publicly as "study connections"; negative ratings are private to their
author and quietly remove the pair from each other's candidates.

### 5.9 Notifications and social layer
A notification feed covering requests, matches, sessions, birthdays and wall
activity; profile walls with posts, comments, likes and shares; course walls and
course tips.

### 5.10 Private meeting history
Every session a student has scheduled, past and upcoming, with who it was with —
visible only to that student, and structured to support statistics later.

## 6. Core user flows

### 6.1 Registration and authentication
1. Student submits an academic email and password at `/signup`.
2. The domain is resolved to an institution; a domain that belongs to no known
   institution provisions one, with a default set of degrees.
3. Supabase Auth creates the user; a database trigger creates their profile and
   pins it to the resolved institution.
4. A six-digit confirmation code is emailed. The student enters it at
   `/verify-email` — a code rather than a link, so they finish in the tab they
   started in.
5. Password reset runs by emailed link to `/reset-password`.

### 6.2 Onboarding
`/onboarding` → basics and degree → `/onboarding/courses` → `/onboarding/preferences`
→ `/onboarding/availability`. The student cannot reach the application until all four
are complete; a partially onboarded student is returned to the step they stopped at.

### 6.3 Matching
`/dashboard` shows the top match prominently and a ranked list beneath it. Each card
explains itself — shared courses, overlapping hours, agreeing preferences — because a
score with no reason attached is not actionable. "Message" opens a conversation with
an icebreaker already drafted.

### 6.4 Messaging
`/messages` lists conversations and group chats together, newest activity first.
`/messages/[conversationId]` is the thread, live-updating, with the scheduling picker
behind the calendar icon in the composer.

### 6.5 Scheduling
From any chat: open the picker, which shows a Sunday–Saturday grid of hours everyone
is free, with anything already booked removed. Select one or several blocks,
fine-tune the hours, name the session — the default names the partner — and book. All
sessions commit in one transaction, so a clash books nothing rather than half.

### 6.6 Groups
Groups are created and discovered on a course page. A student asks to join; an admin
reviews the request with a fit score attached and approves or rejects it. Admins can
invite directly, promote co-admins, remove members, edit the group and call sessions
off.

### 6.7 Profile and reputation
`/students/[profileId]` is the social view — the wall and the student's public study
connections. `/students/[profileId]/study-info` holds the study data: compatibility,
shared courses, how they study, shared groups. `/students/[profileId]/meeting-history`
is private to its owner. `/settings` is where a student edits their own details,
preferences, week and calendar connection.

## 7. Success criteria

| Criterion | Measure |
|---|---|
| A new student reaches a ranked match list | Under 3 minutes from landing page, including email confirmation |
| Matches are explainable | Every card states the shared course and overlapping hours it is based on |
| Sessions become commitments | A booked session appears in both students' calendars and in both chats |
| A student is never shown someone from another institution | Enforced by row-level security, not by query hygiene |
| The product works on a phone | Every flow verified at 390×844 in the automated test suite |

## 8. Constraints and assumptions

- **Israeli academic week.** The availability grid runs Sunday to Saturday, and
  campus wall-clock times are projected using the university's own timezone.
- **Free-tier infrastructure.** Supabase and Vercel free plans, which sets the
  scaling ceiling described in the scaling document.
- **AI is optional.** Course generation and icebreakers degrade to deterministic
  fallbacks when no AI key is configured; nothing becomes unusable.
- **No mobile app.** A responsive web application, installable as a PWA-style
  bookmark but not shipped to an app store.

## 9. Deviations from the original PRD

`docs/prd.md` (v1.2, 3 August 2026) is the pre-implementation design document and is
kept for history. Two of its decisions were reversed during the build and it should
be read with that in mind:

1. **WhatsApp handoff was replaced by in-app chat.** The original design deliberately
   had no in-app messaging and handed conversations to WhatsApp. In-app conversations,
   group chats and Realtime delivery were built instead — without them, scheduling had
   nowhere to live and the product could not observe that a session happened, which
   the entire reputation system depends on.
2. **Study tracks were removed in favour of degrees.** Tracks added a level of
   hierarchy that nothing in matching used.

Section 7 of `docs/technical-design.md` records the deviations that were known at the
time; this section records the two that matter to the product description.

# StudyBuddy — Architecture & Technical Design

```
File:        docs/architecture.md
Authors:     Roni Amiel & Eden Bitran
Course:      Internet Technologies, Reichman University
Description: The system as built — components, stack, schema, routes, data flow,
             permissions and third-party services. Figures are measured from the
             repository and the local database, not estimated.
Version:     1.0
Date:        August 2026
```

---

## 1. System overview

StudyBuddy is a **single Next.js application** talking to a **managed PostgreSQL
database (Supabase)**. There is no separate backend service: the server half of the
application is Next.js Server Components, Server Actions and Route Handlers running
on Vercel, and the database enforces its own access rules through Row Level Security.

```
┌──────────────────────────── Browser ────────────────────────────┐
│  React 19 client components — chat, pickers, dialogs, forms     │
│  Supabase Realtime websocket (messages, meetings)               │
└───────────────┬──────────────────────────────┬──────────────────┘
                │ form POST / RPC              │ websocket
┌───────────────▼──────────────────────────────┼──────────────────┐
│  Next.js 16 on Vercel                        │                  │
│   • Server Components   (reads)              │                  │
│   • Server Actions      (writes, 76)         │                  │
│   • Route Handlers      (OAuth, AI, catalog) │                  │
│   • proxy.ts middleware (session refresh)    │                  │
└───────────────┬──────────────────────────────┼──────────────────┘
                │ PostgREST + RPC (as the user) │
┌───────────────▼──────────────────────────────▼──────────────────┐
│  Supabase                                                        │
│   • PostgreSQL 17 — 42 tables, 117 RLS policies, 117 indexes    │
│   • 16 rpc_* functions, 30 app_* helpers, 64 triggers           │
│   • Auth (email + password, OTP confirmation)                    │
│   • Storage (avatars bucket)                                     │
│   • Realtime (messages, meetings, meeting_attendees)             │
└─────────────────────────┬────────────────────────────────────────┘
                          │
        ┌─────────────────┴──────────────────┐
        │  Google Calendar API   Brevo SMTP  │
        │  Anthropic Messages API            │
        └────────────────────────────────────┘
```

**The load-bearing architectural decision** is that authorisation lives in the
database. Every query the application makes runs as the signed-in student, and Row
Level Security decides what comes back. The middleware and the UI are conveniences;
they are not the security boundary. This is what makes it safe for a client component
to hold a Supabase connection at all.

## 2. Technology stack

### Runtime dependencies

| Package | Version | Role |
|---|---|---|
| `next` | 16.2.12 | App Router, Server Components, Server Actions |
| `react` / `react-dom` | 19.2.4 | UI runtime |
| `typescript` | ^5 | Types across the whole codebase, `strict` |
| `@supabase/supabase-js` | 2.112.0 | Database, auth, storage, realtime client |
| `@supabase/ssr` | 0.12.4 | Cookie-based session handling across server/client |
| `zod` | 4.4.3 | Input validation at every write boundary (21 modules) |
| `tailwindcss` | ^4 | Styling |
| `@base-ui/react` | ^1.6.0 | Unstyled accessible primitives |
| `lucide-react` | ^1.28.0 | Icons |
| `class-variance-authority`, `clsx`, `tailwind-merge` | — | Component variants and class composition |
| `next-themes` | ^0.4.6 | Colour scheme |

### Development and test dependencies

`vitest` ^4.1.10 with `jsdom` and `@testing-library/react` for unit and integration
tests; `@playwright/test` ^1.62.1 for end-to-end; `eslint` ^9 with
`eslint-config-next`; the `supabase` CLI ^2.111.0 for local database and migrations.

### Hosting

Vercel (application) and Supabase (database, auth, storage, realtime). Both on free
tiers.

## 3. Database schema

**42 tables**, all in the `public` schema, all with Row Level Security enabled.
PostgreSQL 17. Managed as 60 sequential migrations under `supabase/migrations/`, each
one forward-only and applied identically to local and production.

### 3.1 Tenancy and academic reference data

| Table | Purpose |
|---|---|
| `universities` | Tenant root. Every scoped row carries a `university_id`. |
| `university_domains` | `domain` is the primary key; maps an email domain to an institution and says whether it is a student domain. This is what resolves a tenant at sign-up. |
| `degrees` | Degree programmes offered by an institution. |
| `terms` | Academic terms, one flagged `is_current`. |
| `courses` | Course catalogue, with provenance (`seed`, `placeholder`, `ai_generated`). |
| `course_offerings` | A course in a term — the thing students actually enrol in. |

### 3.2 People

| Table | Purpose |
|---|---|
| `profiles` | The student. Created by the `handle_new_user` trigger the instant an auth user appears. |
| `profile_private` | Date of birth and sync flags. Never exposed; age is returned by a function, never a birth date. |
| `profile_contacts` | The strictest table in the schema — readable only by its owner. |
| `learning_preferences` | Global study preferences. |
| `availability_slots` | The weekly free-time grid. `day_of_week` + `time`, no dates: a recurring template, with a `source` distinguishing hand-drawn from calendar-synced. |
| `enrollments` | Which offerings a student takes, plus per-course preference overrides. |
| `blocked_users` | Mutual invisibility. |

### 3.3 Matching

| Table | Purpose |
|---|---|
| `match_scores` | Cached scores with a TTL, so a dashboard render is not a full recompute. |
| `connection_requests` | Requests between students. |
| `study_ratings` | Post-session reputation. Positive rows are public; negative rows are visible only to their author. |

### 3.4 Communication

| Table | Purpose |
|---|---|
| `conversations`, `messages` | One-to-one chat. Realtime-published. |
| `study_groups`, `study_group_members`, `study_group_messages` | Group chat and membership with roles. |
| `group_requests` | Join requests, with full history retained. |
| `hidden_threads`, `hidden_messages` | Per-user hiding without destroying anyone else's copy. |

### 3.5 Scheduling

| Table | Purpose |
|---|---|
| `meetings` | A dated session, belonging to exactly one chat (`meetings_one_scope`). |
| `meeting_attendees` | One row per invitee with an RSVP, kept after cancellation — it is the evidence a session was attended, which the rating rule depends on. |
| `dismissed_meetings` | Per-user banner dismissal. |
| `calendar_connections`, `calendar_event_links` | Google OAuth tokens, and the mapping from a meeting to the event written into one student's calendar. |
| `group_meeting_ratings` | Ratings scoped to a group session. |

### 3.6 Social

`wall_posts`, `post_comments`, `post_likes`, `comment_likes` for profile walls;
`course_posts`, `course_post_comments`, `course_post_likes`,
`course_comment_likes` for course walls; `course_tips`, `course_tip_ratings` for
course advice; `notifications` for the feed; `ai_generation_log` for AI rate
limiting and cost tracking.

### 3.7 Key relationships

```
universities ─┬─< university_domains
              ├─< degrees ──< courses ──< course_offerings ──< enrollments >── profiles
              ├─< terms ────────────────────^                                   │
              └─< profiles ─┬─< availability_slots                              │
                            ├── profile_private (1:1)                           │
                            ├── learning_preferences (1:1)                      │
                            └─< wall_posts ──< post_comments                    │
                                                                                │
conversations >── profiles (participant_a, participant_b) ──< messages          │
study_groups ──< study_group_members >── profiles                               │
             └─< group_requests                                                 │
meetings ──< meeting_attendees >────────────────────────────────────────────────┘
   │  (conversation_id XOR group_id)
   └─< calendar_event_links
```

### 3.8 Constraints that carry product rules

The schema enforces product invariants rather than trusting application code:

- `meetings_one_scope` — `num_nonnulls(conversation_id, group_id) = 1`. A session
  belongs to exactly one chat.
- `meetings_bounded` — `ends_at <= starts_at + interval '8 hours'`, a guard against
  a typo in a date field.
- `university_domains.domain` — primary key with `check (domain = lower(domain))`,
  so a domain maps to exactly one institution unambiguously.
- **The RSVP freeze** — a `BEFORE UPDATE` trigger refuses to change an RSVP once the
  meeting has started. Without it the whole rating rule is bypassable in three
  clicks: cancel, skip the session, set yourself back to going, then rate people you
  never met.
- **Busy time is derived, never stored.** A timeslot is blocked because a meeting
  exists that the student is going to. Both readers agree on that definition, so a
  cancelled RSVP frees the slot everywhere at once.

## 4. Pages and views

**22 page routes** across three route groups.

### `(auth)` — signed out
| Route | Purpose |
|---|---|
| `/login` | Sign in |
| `/signup` | Register with an academic email |
| `/verify-email` | Enter the six-digit confirmation code |
| `/forgot-password` | Request a reset link |
| `/reset-password` | Set a new password |

### `(onboarding)` — signed in, not yet complete
| Route | Purpose |
|---|---|
| `/onboarding` | Basics and degree |
| `/onboarding/courses` | Current courses |
| `/onboarding/preferences` | Study preferences |
| `/onboarding/availability` | Weekly free-time grid |

### `(app)` — signed in and onboarded
| Route | Purpose |
|---|---|
| `/dashboard` | Ranked matches — the product's home |
| `/courses` | The student's courses |
| `/courses/[offeringId]` | One course: classmates, groups, wall |
| `/courses/[offeringId]/tips` | Course tips |
| `/messages` | Conversations and group chats |
| `/messages/[conversationId]` | A thread, live |
| `/groups/[groupId]` | Group workspace and chat |
| `/notifications` | The feed, invitations and join requests |
| `/students/[profileId]` | Profile wall and study connections |
| `/students/[profileId]/study-info` | Compatibility and study data |
| `/students/[profileId]/meeting-history` | Private session history (self only) |
| `/settings` | Own profile, preferences, week, calendar |

Plus `/` — the public marketing landing page, deliberately excluded from middleware
so it renders with no session.

## 5. Backend surface

### 5.1 Server Actions — 76 across 15 modules

All writes go through Server Actions. Every one validates with Zod, authenticates
with `requireUser()`, and returns a discriminated `ActionResult` rather than throwing.

| Module | Actions |
|---|---|
| `features/auth/actions.ts` | 9 — signUp, verifyEmailCode, resendVerificationCode, signIn, signOut, requestPasswordReset, resetPassword, changePassword, deleteAccount |
| `features/groups/actions.ts` | 12 — createGroup, requestToJoin, decideRequest, postGroupMessage, leaveGroup, setGroupStatus, updateGroup, setMemberRole, removeMember, inviteToGroup, decideInvitation, markGroupRead |
| `features/course-wall/actions.ts` | 9 — posts, comments, likes and tips on a course wall |
| `features/wall/actions.ts` | 8 — profile wall posts, comments, likes, shares |
| `features/profile/actions.ts` | 7 — avatar, details, preferences, availability, status |
| `features/meetings/actions.ts` | 5 — findMeetingSlots, createMeeting, setMeetingRsvp, dismissMeeting, cancelMeeting |
| `features/courses/actions.ts` + `gatekeeper-actions.ts` | 6 — join, drop, per-course preferences, missing-course check |
| `features/chat/actions.ts` | 4 — sendMessage, markConversationRead, dismissMessage, hideThread |
| `features/onboarding/actions.ts` | 4 — one per step |
| `features/profiles/actions.ts` | 4 — rate, withdraw rating, block, unblock |
| `features/notifications/actions.ts` | 3 — mark read, mark all read, dismiss |
| `features/calendar/actions.ts` | 3 — connect, sync now, disconnect |
| `features/search/actions.ts`, `course-wall/member-actions.ts` | 2 — search, paginate members |

### 5.2 Route Handlers — 4

| Route | Why it is a handler rather than an action |
|---|---|
| `GET /auth/callback` | Supabase redirects a browser here after an email link; a redirect target must be a URL |
| `GET /api/auth/google-calendar/callback` | Google's OAuth redirect URI, same reason |
| `GET /api/courses` | Course catalogue lookup, consumed by a debounced client-side search |
| `POST /api/icebreaker` | AI icebreaker generation, called from the client with its own loading state |

### 5.3 Database functions — 16 `rpc_*`, 30 `app_*` helpers

Work goes into SQL when it is either **multi-row and must be atomic**, or **too
expensive to do over the wire**.

| Function | Why it exists |
|---|---|
| `rpc_find_candidates` | The matching engine. Scoring across every candidate in a course, per shared course, with preference resolution and reputation folded in. Impossible to assemble client-side without shipping the whole cohort. |
| `rpc_meeting_slots` | Intersects every participant's availability, projects the weekly grid onto real dates in the campus timezone, and subtracts existing meetings. |
| `rpc_create_meetings` | Books an entire selection in one transaction under an advisory lock per participant, so two students booking the last free evening from two phones cannot both win. |
| `rpc_cancel_meeting`, `rpc_approve_group_request`, `rpc_reject_group_request` | Multi-row state transitions that must not half-apply. |
| `rpc_my_schedule` | Derived busy time — the same definition the scheduler subtracts. |
| `rpc_sync_notifications` | Materialises derived notifications (birthdays, suggestions, rating prompts). |
| `rpc_group_candidate_score`, `rpc_group_request_scores`, `rpc_course_group_scores` | Group fit scores. |
| `app_*` helpers | Predicates used inside RLS policies — `app_can_see_profile`, `app_is_group_member`, `app_is_meeting_attendee`, `app_current_university_id`, `app_overlap_minutes`, and others. `SECURITY DEFINER` where a policy would otherwise recurse into the table it protects. |

## 6. Data flow

### 6.1 Reading — server-rendered by default

```
Page (Server Component)
  → features/<domain>/queries.ts        ('server-only')
      → createClient()  — Supabase client carrying the user's cookies
          → PostgREST   — RLS narrows rows to what this student may see
      → row → view model  (features/<domain>/<domain>-view.ts)
  → props → components
```

Query modules are marked `'server-only'` so a client component importing one fails at
build time rather than leaking a service call into the browser bundle. Row shapes are
converted to view models in pure, testable modules that hold no database access —
which is why 373 unit tests can cover presentation logic with no database at all.

### 6.2 Writing — Server Actions

```
<form action={serverAction}>  or  useActionState
  → 'use server' function
      → requireUser()            — 401 if not signed in
      → zodSchema.parse(input)   — 400 with a field-level message if invalid
      → supabase write, or rpc_* for anything multi-row
      → revalidatePath(...)      — the affected screens refresh
      → ActionResult<T>          — { ok: true, data } | { ok: false, error }
```

Errors never reach the user as a stack trace. `ActionResult` carries one of nine
`ERROR_CODES` (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`,
`CONFLICT`, `RATE_LIMITED`, `ONBOARDING_INCOMPLETE`, `AI_UNAVAILABLE`, `UNEXPECTED`)
and a sentence the student can act on.

### 6.3 Live updates

Chat rooms and the conversation list subscribe to `postgres_changes` over Supabase
Realtime on `messages`, `conversations`, `meetings` and `meeting_attendees`. **RLS
applies to the stream**, so a socket only ever carries rows its owner could already
read — the subscription is not a way around the policies.

### 6.4 Session handling

`src/proxy.ts` runs as middleware on every non-public route. It refreshes the
Supabase access token (which is short-lived, so without this a student is silently
signed out mid-session) and redirects signed-out visitors to `/login`, signed-in
visitors away from `/login` and `/signup`, and partially onboarded students back into
onboarding. Its own header states that it is a convenience layer and not the security
boundary.

## 7. Users and permissions

Three database roles, and the difference between them is the whole authorisation
model.

| Role | Who | What it can do |
|---|---|---|
| `anon` | An unauthenticated visitor | **Granted nothing.** The landing page needs no data. |
| `authenticated` | A signed-in student | Table-level `GRANT`s narrowed further by 117 RLS policies. |
| `service_role` | Trusted server code only | Bypasses RLS entirely. Restricted to a short list of operations. |

### Application-level roles

- **Student** — the default. Sees their own institution's discoverable students, their
  own courses, the groups and chats they belong to.
- **Group admin** — a `study_group_members.role = 'admin'`. May approve requests,
  invite, promote, remove members, edit the group.
- **Meeting organiser** — `meetings.created_by`. The only person who may call a
  session off.

### How a policy is written

Access rules are expressed as SQL predicates, not as `WHERE` clauses in application
code. The clearest example is the promise that only positive ratings are public:

```sql
using (rater_id = auth.uid()
       or (sentiment = 'positive' and app_can_see_profile(ratee_id)))
```

A negative rating is therefore invisible to the person it is about, to their
classmates, and to every other rater. Its author is the only reader — and no query
anywhere in the application can accidentally undo that, because the rule is not in
the query.

### The service-role client

`src/lib/supabase/admin.ts` bypasses RLS and is restricted by its own file header to
a narrow list: writing `match_scores` from the AI re-rank route, writing
`ai_generation_log` for rate limiting, seeding reference data, resolving an
institution at sign-up (before a session exists), and calendar sync on behalf of
several attendees at once. Every other path goes through the user-scoped client.

## 8. External services and libraries

| Service | Used for | Failure behaviour |
|---|---|---|
| **Supabase Auth** | Email + password, six-digit OTP confirmation, password reset links, session cookies | Hard dependency |
| **Supabase Storage** | The `avatars` bucket | Profile renders an initial badge instead |
| **Supabase Realtime** | Live chat and meeting updates | Falls back to server-rendered data on navigation |
| **Brevo SMTP** | Transactional email — confirmation codes and reset links | Configured as Supabase custom SMTP; the built-in sender is rate-limited and development-only |
| **Google Calendar API** | Two-way sync: sessions written out, busy time read in | Optional. Absent credentials switch the integration off and the Connect button explains why |
| **Anthropic Messages API** | Course catalogue generation, icebreakers, match re-ranking | Optional. Without a key the app falls back to a placeholder catalogue, written icebreakers, and the deterministic SQL ranking |

### Configuration

Fourteen environment variables, validated at boot by Zod schemas in `src/lib/env.ts`.
`clientEnv()` exposes only `NEXT_PUBLIC_*` values; `serverEnv()` throws if it is ever
called in the browser. A malformed or missing variable fails at start-up with a named
error rather than at the moment a student happens to hit the feature.

## 9. Repository structure

```
src/
  app/            Routes only — pages, layouts, route handlers
    (auth)/       Signed out
    (onboarding)/ Signed in, incomplete
    (app)/        The application
    api/          Route handlers
  components/     Presentation, grouped by domain
  features/       Domain logic — one folder per domain, each holding:
      actions.ts    'use server'  — writes
      queries.ts    'server-only' — reads
      schema.ts     Zod validation
      *-view.ts     Pure view models and formatting (no I/O — the unit-tested half)
  lib/            Supabase clients, env, errors, Google client, utilities
  types/          Generated database types
supabase/
  migrations/     60 forward-only migrations
  seed/           Reference data
  templates/      Auth email templates
tests/
  unit/           19 files
  integration/    15 files
  e2e/            14 files
docs/             This document and its siblings
```

The `features/*-view.ts` split is deliberate and is what makes the test suite
possible: every rule that can be expressed as a pure function is, so it can be tested
without a database, a browser, or a clock.

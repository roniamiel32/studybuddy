# StudyBuddy

Matchmaking that connects university students who share a course, have overlapping
free time, and study in compatible ways — then gets them to actually meet.

Built as the final project for the Internet Technologies course at Reichman
University.

**Authors:** Roni Amiel & Eden Bitran

---

## What it does

A student who wants to revise with somebody currently asks in a 200-person course
WhatsApp group and hopes the right person answers. Discovery is loudest-voice-first,
compatibility is invisible until it has cost you an evening, and "sounds good, maybe
Tuesday" is not a commitment anybody is held to.

StudyBuddy replaces all three: a ranked list of real classmates, an explanation of
why each one was ranked there, and scheduling built into the conversation so a
session becomes a calendar entry both people can see.

## Features

**Identity and access**
- Sign-up restricted to academic domains (`.ac.il`, `.edu`); the domain resolves the
  institution, and an unknown one is provisioned on first sight
- Six-digit email confirmation code, password reset by link, account deletion
- Multi-tenant by institution, enforced by Row Level Security

**Onboarding** — four steps: basics and degree, courses, study preferences, weekly
availability grid

**Matching** — ranked candidates per course from a SQL scoring function, using shared
enrolment, overlapping free minutes, preference agreement, cohort and city proximity,
and reputation. Cards explain the score rather than just showing it.

**Courses** — a course grid, a page per course with classmates, groups and a wall,
course tips with ratings, and per-course preference overrides that inherit from your
global answers

**Messaging** — one-to-one conversations and group chats, delivered live over Supabase
Realtime, with AI-written icebreakers

**Study groups** — course-scoped, with capacity, admin roles, join requests,
invitations, and a fit score so an admin can see how well an applicant matches

**Scheduling** — a picker that intersects everyone's free time, subtracts what is
already booked, and books one or several sessions in a single transaction. Sessions
sync to Google Calendar, and calendar busy time flows back into availability.

**Reputation** — after a session has finished, attendees can rate each other. Positive
ratings appear publicly as study connections; negative ratings are private to their
author and quietly remove the pair from each other's candidates.

**Social and notifications** — profile walls with posts, comments, likes and shares; a
notification feed; status messages; and a private Meeting History on your own profile.

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4,
  Base UI primitives, lucide-react
- **Backend:** Supabase — PostgreSQL 17, Auth, Storage, Realtime, Row Level Security
- **Validation:** Zod at every write boundary
- **AI (optional):** Anthropic Messages API — course-catalogue generation and
  conversation openers
- **Email:** Supabase Auth with custom SMTP (Brevo)
- **Testing:** Vitest + Testing Library, Playwright
- **Hosting:** Vercel

## By the numbers

| | |
|---|---|
| Database tables | 42, all with RLS enabled |
| RLS policies | 117 |
| Indexes | 117 |
| Database functions | 16 `rpc_*`, 30 `app_*` helpers, 64 triggers |
| Migrations | 60, forward-only |
| Page routes | 22 |
| Server Actions | 76 across 15 modules |
| Route handlers | 4 |
| Unit + integration tests | 658 across 34 files |
| End-to-end tests | 67, run on desktop Chrome and mobile Safari |

## Getting started

Requires Node 20.9+ and Docker Desktop (for the local Supabase stack).

```bash
npm install
cp .env.example .env.local
```

Start the local database, then copy the printed API URL and keys into `.env.local`:

```bash
npm run db:start
```

Run the app:

```bash
npm run dev
```

The landing page is at http://localhost:3000. Sign up with any address ending
`.ac.il` or `.edu` — the domain decides which institution you join. Use
`@post.runi.ac.il` to land in the seeded Reichman catalogue; an unseeded domain
provisions its own institution with a default degree list and an empty catalogue.

Create some classmates, or the matching screens will be empty:

```bash
npm run seed:students
```

They share the password `demo-student-1234`; `demo1@post.runi.ac.il` has the most
overlap with the others.

The landing page renders without Supabase configured. Everything behind sign-in needs
the local stack, and the integration tests skip with a warning if it is not running.

## Deploying

Four things are easy to get wrong, and each has cost us a debugging session:

1. **All three Supabase variables must match the same project.** `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Recreating a
   Supabase project changes the ref *and* every key. Set them for **both** the
   Production and Preview environments in Vercel, then redeploy — changing a variable
   does not rebuild on its own.
2. **`supabase db push` moves migrations, not seed data.** After pushing to a fresh
   project, run `supabase/seed/*.sql` against it or onboarding will have no degrees
   and no courses to offer.
3. **Custom SMTP is required.** Supabase's built-in email sender is development-only
   and heavily rate-limited, and Supabase will not let you edit the auth email
   templates until custom SMTP is configured. The confirmation template must contain
   `{{ .Token }}` (the six-digit code), not `{{ .ConfirmationURL }}` — see
   `supabase/templates/confirmation.html`.
4. **Set Site URL and the redirect allow-list** in Supabase Auth to your deployed
   origin, including `/auth/callback`. Without it, password-reset links silently drop
   their redirect and land the student on the landing page with an unspent code.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run verify` | lint + typecheck + test + build, in that order |
| `npm run db:start` / `db:stop` | Local Supabase stack |
| `npm run db:reset` | Drop, re-run all migrations, re-seed |
| `npm run db:diff` | Diff the local schema against the migrations |
| `npm run gen:types` | Regenerate `src/types/database.types.ts` from the live schema |
| `npm run seed:students` | Create a demo cohort so the matching screens have people to rank |

Run `npm run verify` before every commit — it is the definition of "done" here.

### Running the e2e suite

Playwright starts a dev server by default, but the dev server compiles each route on
first request, so a cold cache looks exactly like a broken redirect. Running against a
production build removes that entire class of false failure:

```bash
npm run build
npm start -- --port 3200
PLAYWRIGHT_BASE_URL=http://localhost:3200 npx playwright test
```

Note that `npm start` loads the build once at boot — rebuild *before* starting it, or
the server keeps serving the previous build.

## How it works

1. A student signs up with their university email; the mail domain decides which
   institution's data they can see, and a database trigger pins their profile to it
   the instant the account is created.
2. Onboarding collects their degree, courses, study preferences and weekly
   availability.
3. `rpc_find_candidates` scores every classmate sharing a current-term course and
   returns a ranked list, cached with a TTL.
4. Opening a conversation drafts an icebreaker so the first message is not the hardest
   one.
5. The calendar icon in the composer opens a picker showing only hours both students
   are free, with existing bookings removed. Booking writes the meeting, its attendees
   and both calendar events.
6. Once the session has finished, each attendee can say how it went — which is what
   feeds reputation back into step 3.

## Project layout

```
docs/            Documentation — start with architecture.md
src/app/         Next.js App Router routes only
src/features/    Domain logic, one folder per domain:
                   actions.ts   'use server'  — writes
                   queries.ts   'server-only' — reads
                   schema.ts    Zod validation
                   *-view.ts    Pure view models (no I/O — the unit-tested half)
src/components/  Rendering, grouped by domain
src/lib/         Infrastructure — env, Supabase clients, errors, Google client
supabase/        Migrations, seed data, auth email templates, CLI config
tests/           unit + integration (Vitest), e2e (Playwright)
```

The `features/*-view.ts` split is what makes the test suite possible: every rule that
can be a pure function is one, so it can be tested without a database, a browser, or a
clock.

Most files carry a header block naming their authors, what the file is for, and why it
is the way it is. A few small primitives under `src/components/ui/` were scaffolded
from shadcn/ui and do not.

## Documentation

Written for submission, from the implemented codebase:

- [Product Requirements](docs/product-requirements.md) — problem, users, goals,
  capabilities, user flows
- [Architecture & Technical Design](docs/architecture.md) — stack, schema, routes,
  data flow, permissions, external services
- [Testing](docs/testing.md) — what is tested at which level, and why
- [Scaling](docs/scaling.md) — heavy queries, indexes, pagination, current limits
- [Security](docs/security.md) — auth, RLS, validation, secrets, open risks

Kept for history, and **superseded** by the above:

- [Original SDD/PRD](docs/prd.md) — the pre-implementation design. Note that two of
  its decisions were reversed during the build: in-app chat replaced the planned
  WhatsApp handoff, and study tracks were dropped in favour of degrees.
- [Technical Design Document](docs/technical-design.md) — the engineering log through
  Phase 6, including the design system (§8) and every decision with its reasoning
- [Design source](docs/design/stitch/) — the Google Stitch export the visual design is
  transcribed from

Also: [commit convention](.claude/commit-convention.md) and the [changelog](CHANGELOG.md).

## Known issues

- **Mobile Safari:** the fixed bottom navigation bar intercepts taps on the password
  dialog's Save button in Settings, because the dialog renders below the bar rather
  than in the browser's top layer. One end-to-end test fails on this, deliberately
  left visible.
- **Typo'd academic domains provision real institutions.** Mistyping your domain
  silently creates a new one-person university with no classmates. The fix is an MX
  lookup before provisioning.

## Versioning

Semantic versioning, tracked in `package.json` and in each file's header block.

# StudyBuddy — Security

```
File:        docs/security.md
Authors:     Roni Amiel & Eden Bitran
Course:      Internet Technologies, Reichman University
Description: The authentication and authorisation model as implemented, how input
             is validated, how secrets are handled, and what is still open.
Version:     1.0
Date:        August 2026
```

---

## 1. The central decision

**Authorisation lives in the database, not in the application.**

Every query StudyBuddy makes on behalf of a student runs as that student, and
PostgreSQL's Row Level Security decides what comes back. There are **117 policies**
across **42 tables**, and every table has RLS enabled.

This is not a defence-in-depth flourish; it is the design. It means:

- A missing `WHERE` clause is not a data breach. The policy is not in the query.
- A client component holding a Supabase connection is safe, because the connection
  cannot see anything its owner could not already see.
- The Realtime websocket is safe, because RLS applies to the stream too.
- A new query written by a tired developer at 2am inherits the rules automatically.

`src/proxy.ts` — the middleware that redirects signed-out visitors — says so in its
own header: *"This is a convenience layer, not the security boundary."* Getting past
the middleware gains an attacker nothing.

## 2. Authentication

### Mechanism

Supabase Auth, email and password, with sessions carried in **HTTP-only cookies**
managed by `@supabase/ssr`. Tokens are never placed in `localStorage`, so they are not
reachable from JavaScript and not exfiltrable by an XSS payload.

### Registration

1. The address must be academic — `.ac.il` or `.edu`. Anything else is refused before
   an account exists.
2. The domain resolves to an institution through `university_domains`, whose primary
   key is the domain itself. A domain maps to exactly one institution, unambiguously.
3. `is_student_domain = false` marks a staff-only domain and refuses registration —
   a university's faculty addresses must not grant access to student matching.
4. Supabase creates the auth user; the `handle_new_user` trigger creates the profile
   and **pins it to the resolved institution in the same transaction**. A profile
   cannot exist without a tenant.
5. A six-digit OTP is emailed; the account cannot be used until it is entered.

### Password handling

Passwords are hashed by Supabase Auth (bcrypt). The application never sees, stores or
logs a password.

Changing a password re-verifies the current one first
(`src/lib/supabase/credential-check.ts`). Reset runs by single-use emailed link to a
redirect URI that must appear in the project's allow-list — a link that arrives with a
`redirectTo` not on the list is ignored rather than followed.

### Deliberately uninformative errors

Sign-in and sign-up failures return one message covering several causes. Supabase
reports an existing address as a generic failure so the form cannot be used to
enumerate who has an account, and the application preserves that property. Likewise a
wrong confirmation code and an expired one produce the same sentence — distinguishing
them tells someone guessing which attempt was close.

## 3. Authorisation and access control

### Three database roles

| Role | Who | Grants |
|---|---|---|
| `anon` | Unauthenticated visitor | **Nothing.** The landing page needs no data, so the anonymous role is granted no table access at all. |
| `authenticated` | Signed-in student | Table-level `GRANT`s, narrowed by 117 RLS policies. |
| `service_role` | Trusted server code | Bypasses RLS. Restricted by convention to a documented list. |

That `anon` is granted nothing is worth emphasising: an attacker holding the public
anon key — which ships in the client bundle by design — can read nothing.

### Tenancy

Every scoped table carries a denormalised `university_id`, deliberately, so the
tenancy check on every row read never needs a join. Policies compare it against
`app_current_university_id()`. A student cannot read another institution's students,
courses, offerings, availability or contact details, and cannot move themselves into
another institution — a `BEFORE UPDATE` trigger freezes the column.

### Policies as product promises

Access rules encode product guarantees directly. The clearest is the promise that
only *positive* ratings are public:

```sql
using (rater_id = auth.uid()
       or (sentiment = 'positive' and app_can_see_profile(ratee_id)))
```

A negative rating is invisible to the person it is about, to their classmates, and to
every other rater. Its author is the only reader — and no query anywhere can
accidentally undo that, because the rule is not in any query.

Others in the same shape:

- **Meetings** are visible only to their attendees — not to the rest of the group and
  not to the class. Where two students are meeting on Tuesday is more sensitive than
  the fact that a group exists.
- **Contact details** (`profile_contacts`) are the strictest table in the schema:
  readable only by their owner.
- **Dates of birth** are never returned. `app_profile_age_years` returns an age.
- **Blocking produces absence, not an error.** A blocked student cannot detect that
  they were blocked, because an error message is itself information.

### Actions restricted to authenticated users

Every one of the **76 Server Actions** begins with `requireUser()`, which throws
`UNAUTHENTICATED` if there is no session. That is the application-level check; the
database-level check is that an anonymous role holds no grants, so even a bypass of
the first reaches nothing.

The middleware adds a third, ergonomic layer: signed-out visitors are redirected to
`/login`, and students who have not finished onboarding are returned to the step they
stopped at.

### Preventing access to other users' data

Beyond the policies, two implementation habits matter:

**404, not 403.** A conversation, group, course or profile you are not entitled to see
returns *not found*. A "forbidden" page confirms the resource exists, which is itself
a leak. Four separate end-to-end tests assert this.

**Queries that take no id at all.** `getMyMeetingHistory()` reads the caller's own
rows and accepts no profile parameter. There is no id anybody could put in the URL
that would return somebody else's sessions — the guarantee is structural rather than
a check that could be forgotten.

### `SECURITY DEFINER` and what it obliges

Several helpers run as definer, because a policy that queried the table it protects
would recurse infinitely. Each one is written with `set search_path = ''` and
fully-qualified names, so it cannot be captured by a caller-controlled search path —
the standard privilege-escalation route against definer functions in PostgreSQL.
`EXECUTE` is revoked from `public` and granted to `authenticated` explicitly.

## 4. Input validation and sanitisation

**Zod at every write boundary** — 21 modules define schemas, and every Server Action
parses its input before touching the database. Validation bounds mirror the database
`CHECK` constraints, so a rejection arrives as a sentence rather than a 500.

Validation happens **on the server**, in the Server Action. Client-side constraints
(`maxLength`, `required`, `type="email"`) exist for feedback only and are never
trusted — the action re-validates everything.

**Parameterised queries throughout.** All database access goes through the Supabase
client or `rpc_*` functions with typed parameters. There is no string-concatenated
SQL anywhere in `src/`, so SQL injection has no surface.

**XSS.** React escapes interpolated content by default, and the codebase uses no
`dangerouslySetInnerHTML`. User content — messages, posts, comments, session titles,
status messages — is rendered as text.

**Constraints in the schema as a second line.** Length bounds, enum membership,
`num_nonnulls` scope checks and ordering constraints are enforced in PostgreSQL, so a
write that somehow skipped validation still cannot produce a malformed row.

**Uploads.** Avatars go to a dedicated Supabase Storage bucket with type and size
validation before upload.

## 5. Protecting API calls

| Surface | Protection |
|---|---|
| Server Actions (76) | `requireUser()` + Zod + RLS. Next.js protects the action endpoints with its own encrypted action ids, so they are not arbitrary callable URLs |
| `POST /api/icebreaker` | Requires a session; per-user daily quota counted in `ai_generation_log`, which students cannot write to (asserted by an integration test — being able to write it would erase their own rate limit) |
| `GET /api/courses` | Requires a session; results scoped to the caller's institution |
| `GET /auth/callback` | Single-use code exchange; redirect targets restricted to the allow-list |
| `GET /api/auth/google-calendar/callback` | OAuth `state` carried in a signed cookie (`state-cookie.ts`) and verified before the code is exchanged — CSRF protection on the OAuth flow |

**Cost controls double as abuse controls.** `AI_RERANK_DAILY_LIMIT`,
`AI_ICEBREAKER_DAILY_LIMIT` and `AI_COURSE_GENERATION_DAILY_LIMIT` cap per-user daily
usage of the model-backed endpoints, which are the only ones where a request costs
real money.

## 6. Secrets management

**No secret is committed.** `.env.local` is gitignored; `.env.example` documents every
variable by name with no values.

| Variable | Exposure |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public by design — ships in the bundle |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public by design — safe because `anon` is granted nothing and RLS applies |
| `NEXT_PUBLIC_SITE_URL` | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Bypasses RLS entirely |
| `AI_API_KEY`, `AI_MODEL`, `AI_PROVIDER` | Server only |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Server only |
| Daily limits, TTLs, calendar horizon | Server only, non-secret tuning |

The separation is enforced in code, not by discipline. `src/lib/env.ts` defines two
schemas; `serverEnv()` throws if it is ever called in the browser, with an error that
names the fix. A secret cannot reach the client bundle by accident, and a malformed
or missing variable fails at boot with a named error rather than at the moment a
student hits the feature.

`src/lib/supabase/admin.ts` is marked `'server-only'` and its header lists the
operations permitted to use the service-role client. Everything user-facing goes
through `src/lib/supabase/server.ts` so that RLS applies.

## 7. Remaining risks

Listed with an honest severity, because a security document that finds nothing is not
a security document.

### High

**Typo'd academic domains provision real institutions.** `resolveInstitution`
creates an institution the first time it sees an unknown academic domain. A student
who mistypes `post.runi.ac.il` as `pot.runi.ac.il` silently gets their own private
university, alone, with no classmates and no possibility of a match — and is told
nothing is wrong. This has already happened twice in production. The fix is an **MX
lookup before provisioning**: a domain with no mail exchanger cannot receive the
confirmation email anyway, so refusing to create a tenant for it costs nothing.

**Email deliverability is a single point of failure.** One SMTP account, one free
plan, no fallback sender and no alerting. If it stops, registration stops, and the
symptom is silence.

### Medium

**No rate limiting on ordinary write actions.** Message and post creation rely on
Supabase's platform limits. A determined authenticated student could flood a wall or
a chat.

**Group-promotion self-notification.** `notify_group_promotion` writes a notification
for a student's own self-promotion. Cosmetic, not a data leak.

**No audit log.** Admin actions — promotions, removals, request decisions — leave no
trail beyond the resulting state. There is no way to answer "who removed this member,
and when".

**Service-role discipline is documented, not enforced.** `admin.ts` lists the
permitted operations in a comment. Nothing in the type system stops a future call
site from using it improperly.

**Account deletion cascade.** Deletion relies on foreign-key cascades and `set null`
behaviour. The interaction between `on delete set null` and the RSVP freeze trigger
has bitten before and deserves a dedicated test.

### Low

**Vercel deployment protection was left on for all deployments**, which put the whole
application behind a Vercel login. Harmless in itself — nobody could reach the app —
but it masked a real configuration bug for some time.

**Dependency currency.** No automated vulnerability scanning is configured.

**No Content-Security-Policy header.** React's escaping is the current XSS defence; a
CSP would be a second layer.

## 8. Future improvements

Roughly in order of value:

1. **MX-record validation before provisioning an institution**, closing the highest
   item above.
2. **Rate limiting on write actions**, keyed by user, for messages, posts and
   comments.
3. **An audit table for admin actions** — group role changes, removals, request
   decisions.
4. **A Content-Security-Policy** and the associated security headers
   (`X-Frame-Options`, `Referrer-Policy`).
5. **Automated dependency scanning** in CI.
6. **Two-factor authentication**, optional, for students who want it.
7. **Alerting on email delivery failures**, so a broken sender is noticed rather than
   inferred from an empty signup funnel.
8. **A periodic RLS regression suite in CI.** The integration tests already prove the
   policies; running them on every pull request would stop a future migration
   loosening one silently.

## 9. Security testing already in place

The claims in this document are not assertions of intent — most are covered by tests
that would fail if they stopped being true. From the integration suite:

- A Reichman student cannot read a Tel Aviv student's availability, enrolments,
  preferences or phone number — **including by exact primary key**
- Cannot enrol itself in another institution's course
- Cannot move itself into another institution
- Cannot create or edit a profile belonging to someone else
- Cannot forge a match score, and reads only its own
- Cannot write to the AI usage log
- A blocked student cannot detect that they were blocked
- The person who cancelled a session cannot rate the one who attended
- An uninvolved student cannot read a join request

And from the end-to-end suite: a conversation, group, course or profile belonging to
someone else is a **404**; a negative rating appears nowhere on the rated student's
profile; an account cannot be used before its emailed code is entered.

See `docs/testing.md` for the full inventory.

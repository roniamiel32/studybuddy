# StudyBuddy — Scaling

```
File:        docs/scaling.md
Authors:     Roni Amiel & Eden Bitran
Course:      Internet Technologies, Reichman University
Description: How the product behaves as users are added, which queries are the
             expensive ones, and where it would break first. Reasoned from the
             implemented schema and query shapes; no load testing was performed.
Version:     1.0
Date:        August 2026
```

---

## 1. The target, honestly stated

The design target is **dozens to a few hundred concurrent students within one
institution** — a course cohort, a faculty, a small university. That is the load a
course project is realistically asked to survive, and it is what the architecture is
tuned for.

Everything below distinguishes what is *already true* from what would have to change.
Nothing here has been measured under load; it is reasoned from the schema, the
indexes and the shape of each query.

## 2. Why the baseline is comfortable

Three structural properties do most of the work before any optimisation:

**Most pages are server-rendered and read very little.** A page is a Server Component
that runs a handful of scoped queries and streams HTML. There is no client-side data
layer refetching on every mount, no global store hydrating the whole domain, and no
"load everything then filter in the browser" anywhere on a hot path.

**Every query is already narrowed by Row Level Security.** A student's queries return
their own rows because the policy says so, not because the application asked
politely. That means the planner is working with a predicate on an indexed column on
essentially every read — the security boundary and the performance boundary are the
same predicate.

**Expensive work happens in the database, once.** Matching, slot intersection and
booking are SQL functions. The alternative — pulling a cohort's enrolments and
availability into Node and intersecting there — would multiply both bandwidth and
latency by the size of the cohort.

## 3. The heavy queries, and what protects each

### 3.1 `rpc_find_candidates` — the matching engine

**The most expensive query in the product by a wide margin.** For one student it
scores every classmate sharing a current-term course, across every shared course,
folding in availability overlap in minutes, preference agreement, cohort and city
proximity, and reputation.

Cost grows with **cohort size × courses taken**, not with total users. A student in
five courses of 200 people is scoring at most a thousand pairs; a student at a
university of 50,000 in five courses of 200 is scoring the same thousand.

Protections in place:

- **A cache table.** `match_scores` stores results with an `expires_at`, indexed by
  `match_scores_expires_at_idx` and read through
  `match_scores_viewer_offering_rank_idx`. TTL is configurable via
  `MATCH_CACHE_TTL_HOURS` (default 24). A dashboard load is normally an indexed read
  of pre-computed rows.
- **A hard `p_limit`.** Callers pass a bound; the dashboard asks for 200 rows and
  folds them to 24 candidates in JavaScript, because rows are per shared course and
  one person can be several rows.
- **Current-term scoping.** A shared course from a finished term cannot produce a
  match, which keeps the candidate set from growing with the institution's history.

### 3.2 `rpc_meeting_slots` — the scheduling picker

Intersects every participant's weekly availability, projects it onto real dates in
the campus timezone, and subtracts meetings already booked. Cost grows with
participants × days.

Protections: the window is clamped to a maximum of 60 days and requested at 7; the
picker is a **Server Action called on dialog open**, never on page load, precisely
because the intersection is too expensive to compute for a chat nobody has opened the
scheduler on.

### 3.3 `rpc_sync_notifications` — derived notifications

Materialises birthdays, match suggestions and rating prompts. It runs on a visit to
the notifications page, and it is the one place where a page view triggers real
computation.

Protections: every insert carries `on conflict do nothing` against partial unique
indexes — `notifications_birthday_once_a_year_idx`,
`notifications_match_once_per_person_idx`,
`notifications_suggestion_once_per_person_idx`,
`notifications_rate_partner_once_idx` — so repeat visits within a day are cheap
no-ops rather than duplicate work. Deliberately **not** run by the unread-count query,
which the navigation bar renders on every page.

### 3.4 `rpc_create_meetings` — booking

Books a whole selection in one transaction under an **advisory lock per participant**.
The lock is the correctness mechanism, not a performance one: two students booking
the last free evening from two phones cannot both win. It serialises only the
participants involved, so contention is limited to the people actually double-booking.

## 4. Index usage

**117 indexes** across 42 tables. Every index exists to serve a query the application
actually makes; the shape of each one is chosen from the access pattern.

| Index | Serves |
|---|---|
| `messages_conversation_created_idx` | The thread, newest-first — the hottest read in the product |
| `messages_unread_by_sender_idx` | Unread badges without scanning a conversation |
| `conversations_participant_a_recent_idx` / `_b_` | The message list, ordered by recent activity. **Two indexes**, one per participant column, because a conversation has no single "owner" |
| `notifications_recipient_recent_idx` | The feed — `(recipient_id, created_at desc)`, matching the query's exact ordering |
| `notifications_unread_idx`, `notifications_visible_idx` | The bell count, and the feed's dismissal filter |
| `meetings_group_starts_idx`, `meetings_conversation_starts_idx` | **Partial indexes**, each `where … is not null`, so each skips the other scope's rows entirely |
| `meeting_attendees_profile_idx` | "My meetings", read on every schedule render and inside every slot intersection |
| `availability_slots_profile_day_idx` | Overlap computation, the inner loop of matching |
| `enrollments_profile_idx`, `enrollments_offering_university_idx` | Both directions: a student's courses, and a course's students |
| `study_group_members_admins_idx` | Finding a group's admins for request notifications, without scanning members |
| `match_scores_viewer_offering_rank_idx` | Cached matches, pre-sorted by rank |
| `wall_posts_owner_recent_idx` | A profile wall, newest first |

Two patterns worth calling out because they are deliberate:

**Partial indexes for exclusive scopes.** `meetings` carries either a
`conversation_id` or a `group_id`, never both. Two partial indexes mean a group query
never touches a page of one-to-one rows.

**Partial unique indexes as idempotency keys.** The notification "once per year",
"once per person" indexes are not there for read speed. They are what makes
`rpc_sync_notifications` safe to run on every page visit.

## 5. Avoiding unnecessary data loading

**Column selection.** Queries name their columns. `MEETING_SELECT`,
`CONVERSATION_SELECT` and friends are explicit constants. The codebase contains a
single row-returning `select('*')` — a one-row primary-key lookup inside a
delete-authorisation check — plus three `select('*', { count: 'exact', head: true })`
counts, which return no rows at all.

**Embedded joins instead of N+1.** PostgREST resolves nested relationships in one
round trip. The meeting history reads `meetings → meeting_attendees → profiles` as a
single query rather than fetching attendee ids and then a name per attendee.

**Server-side pagination** where the data set is unbounded:

| Surface | Mechanism |
|---|---|
| Course members | `.range(offset, offset + limit)` behind a "load more" Server Action |
| Notifications | `.limit(20)` server-side, then a 7-at-a-time client reveal |
| Wall and course-wall posts | `.limit(limit)` with a caller-supplied bound |
| Search | `PER_KIND` cap per result type |
| Group thread previews | `PREVIEW_WINDOW` — enough for a preview line, not the thread |

**Client-side reveal for already-bounded lists.** Threads and notifications page at
`PAGE_SIZE = 7` in the component. The server has already capped the set; the
component is only deciding how much of a small list to show at once, which costs no
extra round trip.

**Deliberate non-loading.** The scheduling intersection is not computed until the
dialog opens. Derived notifications are not synced by the badge query. Study data
lives at `/study-info` rather than on the profile wall, so arriving at a profile does
not pay for compatibility scoring.

## 6. Client/server separation

The split is enforced by the module system, not by convention:

- `features/*/queries.ts` are marked **`'server-only'`**. A client component
  importing one fails the build rather than shipping a database call to the browser.
- `features/*/actions.ts` are marked **`'use server'`**. They are the only write path.
- `features/*/*-view.ts` are **pure** — no I/O — so they can be imported from either
  side. This is what lets a client component format a timestamp without pulling in a
  server module.
- `src/lib/env.ts` exposes `clientEnv()` and `serverEnv()`, and `serverEnv()` throws
  if called in the browser. Secrets cannot reach the bundle by accident.

Client components are used only where interactivity requires them: chat, the
scheduling picker, dialogs, forms with optimistic state, and anything formatting a
timestamp in the reader's own timezone.

**Realtime is scoped, not global.** Subscriptions are per-conversation channels, and
RLS applies to the stream — a socket carries only rows its owner could already read.
There is no firehose subscription that every client shares.

## 7. Current limitations

Honest list of what breaks first, roughly in the order it would.

1. **Email throughput.** Transactional email runs through one Brevo account on a free
   plan with a daily allowance in the low hundreds. Every registration costs one
   message. This is the **first hard ceiling** — a lecture hall of 300 students
   signing up in one session would hit it.
2. **Free-tier connection limits.** Supabase's free plan caps concurrent database
   connections. Serverless functions each want a connection, so a burst of traffic
   can exhaust the pool before CPU is anywhere near saturated.
3. **`rpc_sync_notifications` runs on a page visit.** It is idempotent and cheap on
   repeat, but the first visit of a day does real work in the request path. Under
   heavy simultaneous load this becomes the slowest page.
4. **No caching layer above the database.** No Redis, no edge cache on authenticated
   pages. `match_scores` is the only cache, and it is a table.
5. **Cold starts.** Vercel free-tier functions sleep; the first request after
   idleness pays a start-up cost.
6. **Search is filtered in memory.** Courses and groups are filtered in Node rather
   than by the database, because the searchable name sits across a join table. It is
   bounded by one person's timetable, so it is free today — and would not be if the
   scope ever widened beyond the caller's own rows.
7. **No rate limiting on most Server Actions.** AI endpoints have per-user daily caps
   in `ai_generation_log`; ordinary writes rely on Supabase's own limits.
8. **Realtime connection count** is capped on the free plan, and every open chat holds
   one.

## 8. Future improvements

In the order they would actually pay off:

**Immediate, if usage grew past a few hundred students**

- Move to a paid Supabase tier and enable **connection pooling (PgBouncer)** — the
  cheapest fix for the ceiling most likely to be hit.
- Move email to a plan sized for the cohort, or batch confirmations.
- Move `rpc_sync_notifications` out of the request path onto a **scheduled job**, so a
  page visit only ever reads.

**Next**

- **Cursor-based pagination** for chat history and walls. Offset pagination degrades
  as offsets grow; a `(created_at, id)` cursor stays constant-cost.
- **Cache the dashboard at the edge** per user for a short TTL. Matches change slowly;
  the ranked list does not need recomputing on every navigation.
- **Precompute availability overlap.** `app_overlap_minutes` is called inside the
  matching loop. A materialised pair-overlap table refreshed on availability change
  would remove the most repeated work in the heaviest query.
- **Add rate limiting to write actions**, keyed by user, for message and post
  creation.

**Later, and only if the shape of the product changed**

- **Partition by institution.** Tenancy is already a column on every scoped table, so
  partitioning `messages`, `notifications` and `meetings` by `university_id` is a
  migration rather than a redesign. Worth it at the point where one university's
  traffic degrades another's.
- **Full-text search** in PostgreSQL, replacing the in-memory filter, if search ever
  covers rows outside the caller's own.
- **Read replicas** for the matching engine, which is read-only and the most
  expensive thing in the system.

The reason most of these are deferrable is the same reason the baseline is
comfortable: tenancy is a column on every scoped table and a predicate on every
query, so the natural sharding boundary is already in the schema.

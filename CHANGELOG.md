# Changelog

All notable changes to StudyBuddy. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.15.0] — 2026-08-10

Phase 5 — study groups, join requests, and a group chat. Closes design conflict
**C4**, open since Phase 1.5.

### Added
- **Four tables.** `study_groups` (one course, one admin, `max_participants`,
  `status`), `study_group_members`, `group_requests`, and
  `study_group_messages`. Membership is its own table rather than an array on the
  group: an array of uuids cannot be constrained, cannot cascade when a student is
  deleted, and cannot be joined against without unnesting it on every read.
- **Create a study group** from the course page, setting the size and becoming its
  admin. The creator is added as a member by trigger, so a group can never exist
  with an admin who is not in it.
- **Discovery and join requests.** Open groups are listed to the whole class —
  a group nobody can find has nobody to join it — with `Request to join`, and the
  specific reason when that is unavailable ("Full", "Waiting for the admin to
  reply", "Not accepting requests" are three different situations and a single
  greyed-out button explains none of them).
- **Admin notification**: a red badge on the Courses tab, seeded server-side and
  kept live by Realtime, plus a count on the group card so they know *which* group.
- **Applicant review**: opening a request shows the applicant's profile with
  **Accept** and **Reject** on it, so the decision is made while looking at the
  person it concerns.
- **Rejection flow**: a dropdown of four polite canned messages plus **Other** for
  custom text, the exact wording shown before sending, and the result delivered to
  the rejected student as a real one-to-one message from the admin — reusing Phase
  3's conversations, so it arrives where they already read messages.
- **Acceptance flow**: `rpc_approve_group_request` marks the request, adds the
  member and posts `Welcome [name] to the group!` as a system message, in **one
  transaction**.
- **Group chat**, live over Realtime, with sender names (a group needs them; a
  one-to-one thread does not) and system messages rendered as centred events
  rather than as something a person said.
- 58 tests: 27 integration on the policies, 25 unit on capacity, blocked-reasons
  and the canned messages, and 6 e2e covering create → request → notify → accept
  and → reject.

### Why approval is one SQL function
The members insert policy requires an already-approved request, so the application
would have to approve first and insert second. If the insert then failed — and it
can, because the capacity trigger rejects a group that filled up in between — the
request would be left approved with no membership, and the freeze trigger
deliberately forbids re-deciding it. That is an unrecoverable state reachable by
two clicks at the same moment. Inside one function it is one transaction: capacity
fails, everything rolls back, the request stays pending. There is a test that fills
a group and asserts exactly this.

### Security notes
- **Discovery and privacy are different rules.** The class can see that a group
  exists and how full it is; only members can read its chat. Both are tested from
  the position of a classmate who can see the group and must not read a word of it.
- **An admin cannot add someone who never asked** — the members policy requires an
  approved request, which is what makes joining consensual rather than something
  done to you.
- **A member cannot forge a system message.** `not is_system` in the insert policy
  means "Welcome X to the group!" can only come from the approval function, so
  nobody can fake a decision the admin never made.
- `rpc_approve_group_request` is SECURITY DEFINER and therefore restates its own
  authorisation: caller must be the group's admin and the request must be pending.
  Two tests attack it as a non-admin and as the requester.

### Fixed
- **A SELECT policy that broke `insert().select()`.** The `study_groups` read
  policy originally called `app_can_see_group(id)`, a STABLE definer function that
  re-reads `study_groups` — so during an insert-with-returning it evaluated against
  the pre-insert snapshot, could not find the new row, and failed with a policy
  violation. Rewritten against the row's own columns. Found because a test used
  `.select('id')` after inserting; the helper is still correct for the other three
  tables, where the group id is a foreign key to a row that already exists.

### Known limitations
- **Saturday and languages are not overridable per group**, and group membership
  does not yet feed the match score.
- **The admin cannot leave or hand over a group** — leaving would orphan it, so the
  delete policy excludes them. They can close it to new requests.
- **A rejected student can ask again.** Deliberate: circumstances change, and a
  permanent ban after one "not right now" is harsher than anyone meant.
- **C5, C8 and C9 remain open** — session scheduling, meeting times and sections.
  The group has no calendar, so "Next: Thu 6:00 PM" from the design is still absent.

### Verification
`npm run verify` passes: lint, typecheck, 318 tests, production build. Playwright:
66 e2e tests across chromium and mobile-safari.

## [0.14.1] — 2026-08-10

Header logo, and brand-only course banners.

### Changed
- The app header carries a logo image and wordmark (`src/components/ui/logo.tsx`)
  in place of the text-only `Wordmark`, and the profile badge is now the avatar
  alone — the name it used to show is repeated by the logo beside it.
- Course-card banners use purple and orange only, dropping the green, teal and
  maroon gradients that did not belong to the brand.

### Fixed
- **`public/logo.PNG` renamed to `public/logo.png`.** The component requests
  `/logo.png`, and macOS resolves that case-insensitively while Linux does not —
  so the logo worked locally and would have 404'd on Vercel. The kind of bug that
  only appears once it is deployed.

### Note
The banner gradients and the wordmark use literal hex values rather than the
theme tokens (`brand-bright`, `grape-bright`, `sunset`). Everything else in the
app derives its colour from `@theme`, which is what keeps a palette change in one
place — worth converting when convenient. See design section 8.3.

### Verification
`npm run verify` passes: lint, typecheck, 266 tests, production build.

## [0.14.0] — 2026-08-10

Phase 4 — the Profile and Courses tabs, and per-course preference overrides.

### Added
- **Per-course preference overrides**, on `enrollments`. That table is already
  keyed by exactly `(profile_id, course_offering_id)`, already holds a per-course
  answer in `intent`, and already has owner-scoped insert/update/delete policies —
  so the four nullable columns needed no new policy and no new join. **NULL means
  inherit**, not "no preference", which is why they are nullable arrays rather
  than empty ones.
- **`rpc_find_candidates` v3**, which resolves preferences PER COURSE. This is what
  makes the feature real rather than decorative: a student who sets "in person" for
  one class is filtered against that class on that basis, while every other course
  keeps using the global answer. An `effective` CTE resolves each side's
  preferences once, so the coalesce cannot be forgotten at one of a dozen
  comparison sites.
- **The Profile tab** (`/settings`): photo upload to Supabase Storage that updates
  the header and every match card in the same navigation, personal details, and
  the global study preferences. Three independent forms, so a rejected photo does
  not discard preference edits made in the same visit.
- **The Courses tab** (`/courses`): a Moodle-style grid of course cards with a
  colour banner derived from the course code — stable per course, on every
  student's screen, with no colour column to seed or migrate. Add a course from a
  degree-scoped picker; drop one behind a two-press confirmation.
- **The per-course page** (`/courses/[offeringId]`): course facts, the preferences
  in force, and matches scoped to that course alone — `rpc_find_candidates` has
  accepted an offering id since Phase 2 precisely so this screen could exist.
- **"Edit preferences for this course"**, a native `<dialog>` so focus trapping,
  Escape and the backdrop come from the platform. Every question shows the global
  answer beneath it, and there is a one-press way back to inheriting.
- 38 tests: 10 integration proving an override changes who is matched for that
  course and nothing else, 19 unit for the resolution rules, and 9 e2e across the
  three screens.

### Changed
- The last course cannot be dropped. Matching is anchored to a shared course, so a
  student with none is unmatchable — the same rule step 2 of onboarding enforces.
  The control is hidden rather than offered and then refused.
- An override equal to the global answer is stored as **NULL, not a copy**.
  Otherwise a later change to the global preference would silently skip that
  course and the student would have no way to find out why.
- Changing global preferences does **not** overwrite a course that has its own
  answers, and the Profile tab says so. Without that line a student changes a
  default, sees one course not move, and concludes the save is broken.
- `uploadAvatar` moved to `src/features/profile/avatar.ts`, shared by onboarding
  and the Profile tab rather than duplicated. Two copies of an upload that fails
  *silently* on a rejected file would be two places for that behaviour to drift,
  invisibly.
- `getOnboardingProfile` additionally returns `isDiscoverable` and `degreeName`.
- Vitest now runs **one test file at a time** with a 90s hook timeout. Every
  integration suite creates real auth users in the same local Supabase, and a
  fourth suite was enough to make `createUser` blow the default 5s timeout — a
  failure that looks like a broken schema and is really contention. Same reason
  Playwright already runs with a single worker.

### Deviations from the supplied design
| Design | What was built | Why |
|---|---|---|
| Meeting times, room, lecturer, "View syllabus" | Code, faculty, classmate count | The schema has no columns for any of it — design conflicts C8 and C9. Inventing a room for a course whose *name* is already unverified would compound one guess with three more |
| "Study Groups — join the next session" | Not built | Study groups are conflict C4 and session scheduling C5. A CTA that does nothing is worse than its absence |
| "Same Section" / "Project Partners" filter chips | Not built | Sections are C9. `intent` exists and could power a "project partners" filter, but a row of chips where one works and three are dead reads as broken |
| "High Match" badge, `Connect` button | The existing score badge and "Send message" | Both already exist from Phases 2 and 3; a second visual language for the same two actions would be the drift this project has been avoiding |
| Material Symbols, its own palette and fonts | lucide-react and the Kinetic Learning tokens | The layout is reproduced — breadcrumb, title, sidebar-plus-grid, card shapes. Copying the palette would give the app two colour systems that disagree the first time either changes |

### Known limitations
- **Saturday and spoken languages are not overridable.** Neither is a property of
  a course: a student who does not study on Saturday does not study on Saturday
  for Linear Algebra either.
- **The override cannot be set from the Courses grid**, only from a course page.
  The grid marks which courses carry one.
- **Availability is still edited through the onboarding step.** The Profile tab
  links to it rather than duplicating the grid.

### Verification
`npm run verify` passes: lint, typecheck, 266 tests, production build — twice in a
row, to confirm the parallelism fix. Playwright: 54 e2e tests across chromium and
mobile-safari.

The override was verified end to end rather than assumed: the integration suite
sets "in person" on one course and asserts the remote-only classmate disappears
from that course and stays visible on the other, and the e2e suite does the same
thing through the modal, checks the grid's "Custom here" badge, then clears it and
watches the classmate come back.

## [0.13.0] — 2026-08-10

Renamed the Requests tab to Messages.

### Changed
- **"Requests" is now "Messages"** in the navigation, the page title, the heading
  and the empty state. The name came from design conflict C2, where the tab stood
  in for an accept/decline flow that did not exist yet; once it held real
  conversations, "Requests" described something the screen no longer did.
- **The route moved with it**, `/requests` → `/messages`. A tab labelled Messages
  pointing at `/requests` is the kind of drift that turns into a bug later, and
  the rename frees `/requests` for the connection-request flow decision D2
  actually describes — a genuinely different feature, still unbuilt.
- The tab icon changed from an inbox to a speech bubble, for the same reason.

### Verification
`npm run verify` passes; 36 e2e tests still pass after the route change.

## [0.12.0] — 2026-08-10

Phase 3 — conversations, the Smart Icebreaker, and realtime chat.

### Added
- **`conversations` and `messages`**, with `is_read` on messages. One
  conversation per PAIR rather than per course: a connection request is
  per-course because the unit of interest is "a partner for Computational
  Models", but a conversation is between two people, and splitting the same two
  students into one thread per shared course would fragment a single human
  exchange. The course they matched on is recorded on the row instead, so the
  chat header can still name it.
- **RLS restricted to the two participants** — a stricter rule than anywhere
  else in the app. Elsewhere the condition is "your university"; here that is
  necessary but nowhere near sufficient, since every classmate shares a
  university and none of them may read the thread. 24 integration tests attack
  it as a real student: an outsider reading it, writing into it, marking it read,
  a participant forging a message as the other person, and a participant editing
  what was said.
- **`POST /api/icebreaker`** — creates the conversation, generates the opener
  with the specified prompt, and inserts it as the first message. Authorisation
  is the insert policy, not the handler: the row goes in through the caller's own
  client, so a student can only open a thread with someone the matches list would
  have shown them.
- **The Requests tab** (`/requests`) listing conversations with previews, unread
  pills and relative times, and **the chat room** (`/requests/[conversationId]`)
  built from the supplied design.
- **Realtime.** Both sides see a new message without a refresh, and receipts flip
  to "Read" when the other person opens the thread. Verified in a browser with
  two real signed-in students.
- **The unread badge** over the Requests tab: a red circle with a white count,
  seeded server-side so it is right on first paint, then kept live by the same
  subscription. Hidden completely at zero — not a zero in a circle.
- **Mark as read on open**, which clears the badge and stamps `read_at`.
- 41 tests: 24 RLS, 17 for the chat formatting and the icebreaker's pure parts,
  and 5 e2e including two that prove a message arrives with no reload.

### Changed
- The match-card button is now **"Send message"**. It was "Send smart
  icebreaker", which promised which kind of opener would be written — the button
  sends a model-written one when a model is configured and a hand-built one when
  not, and the label should not claim which.
- `messages.model` and `is_icebreaker` record provenance, and the chat labels a
  generated opener "AI ICEBREAKER". The recipient is told a message was drafted
  rather than typed — the same honesty rule the course catalog follows. The
  fallback opener is deliberately NOT labelled: a sentence assembled from two
  facts the sender already knew is their own message, and calling it AI would be
  a lie in the other direction.

### Deviations from the supplied design
| Design | What was built | Why |
|---|---|---|
| Green dot and "Online" | Degree and course code | There is no presence tracking (conflict C7). A green dot that means nothing is worse than none: a student would wait for a reply that was never coming |
| Material Symbols icon font | lucide-react | Already a dependency; a second icon font is ~100 KB of render-blocking request for glyphs we have |
| "Schedule Session" quick action | Not built | Session scheduling is conflicts C5/C7, still unresolved. A control that silently does nothing is worse than its absence |
| Its own colour tokens and fonts | The existing Kinetic Learning tokens | Layout, spacing and bubble shapes are reproduced exactly, including the asymmetric corner that makes direction readable without reading the text. Copying the literal palette would have given the app two disagreeing colour systems |
| "AI Icebreaker" as a card with "Send Suggestion" | Label on the message itself | The specification is that the API sends the opener, so by the time the student sees the thread it is already sent. A "send" button on a sent message would be a lie |

### Fixed
- A shared Realtime channel name crashed the app. `createBrowserClient`
  memoises its client and that client keeps one channel per name, so the second
  badge to mount called `.on()` on a channel the first had already subscribed —
  which throws and took the whole page down. Channel names are now unique per
  component instance. Found by running it, not by reading it.
- The mobile nav dimmed inactive tabs with `opacity-60` on the link, which faded
  the unread badge with everything else — on the one tab where it matters, since
  Requests is inactive exactly when a student needs to notice something arrived.
  The dimming now applies to the icon and label only.
- A screen reader announced the badge before the label ("2 unread messages,
  Requests"). The count is now a hook, so the visual circle sits over the icon
  and the spoken sentence comes after the label.

### Known limitations
- **A thread is not paginated.** Fine for two study partners; it would not be for
  a year of history.
- **The fallback opener is not a model's work**, and reads like it. That is the
  cost of working without an API key, which is how this will be graded.
- **No typing indicator, presence, or attachments.** None were specified, and
  each needs its own store.

### Verification
`npm run verify` passes: lint, typecheck, 238 tests, production build.
Playwright: 36 e2e tests across chromium and mobile-safari.

Verified by hand in the browser with two signed-in students: pressing "Send
message" opened a thread with an opener in it; a message sent by the other
student appeared with no reload; the badge went 0 → 2 live and cleared on
opening; read receipts moved to "Read" only for the recipient's side.

## [0.11.0] — 2026-08-09

Step 2 always has courses to pick, and now requires one.

### Added
- **A placeholder catalog per degree**, so `/api/courses` never returns an empty
  list for a degree it recognises. With no API key — the state the graders will
  run in — it stores the stock curriculum for the subject instead: Law gets
  Introduction to Law, Constitutional Law, Contract Law and nine more. Keyword
  matching covers every seeded degree and every degree a new institution is
  provisioned with; a combined degree ("Economics & Computer Science") draws from
  both subjects, because those students really do sit in both sets of lectures.
- `course_source` value **`placeholder`**, distinct from `ai_generated`. Both are
  unverified, but they are different claims: a generated list is a model's
  attempt at *this* university's syllabus, a placeholder list is a generic
  curriculum that was never about this university at all. Keeping them apart is
  what makes it possible to find and replace the placeholders once a key is
  configured. The picker words the warning differently for each.
- 13 unit tests for the catalog, written as invariants over every degree the app
  can offer: never empty, always passes the same schema a model's reply must
  pass, and codes unique *across* degrees — `courses` is unique on
  `(university_id, code)` with one `degree_id` per row, so a shared code would be
  inserted once and silently missing from the second degree's list.

### Changed
- **Continue on step 2 is disabled until a course is selected**, with the reason
  beside it ("Choose a course first — we match you on the courses you share")
  and wired to the button through `aria-describedby`, so a disabled control is
  never a dead end with no explanation. The server action already enforced the
  same rule; this makes it visible before it is broken.
- The unverified warning is now read off the courses themselves rather than the
  API response, so a catalog rendered from the database on a later visit still
  carries it.
- The model is no longer called when no key is configured, so an unconfigured
  deployment stops writing `not_configured` rows to `ai_generation_log` — which
  had been consuming the student's daily generation cap for calls that never
  happened.
- Course buttons carry an explicit `aria-label` ("Constitutional Law (LAW-102)").
  The name and code sit in adjacent spans and were announced run together.
- `generate.ts` split: the schema moved to `catalog-schema.ts`, which has no
  `server-only` marker, so the placeholder catalog and its tests can use it.

### Removed
- The "Automatic course lookup is not switched on yet" dead end.

### Known limitation
- The placeholder path is not rate-limited, since it costs nothing and its
  upserts are idempotent. It is reachable only when a degree's catalog is empty,
  which stops being true after the first call.

### Verification
`npm run verify` passes: lint, typecheck, 180 tests, production build.
Playwright: 26 e2e tests pass across chromium and mobile-safari, including a run
from a deliberately emptied Law catalog that proves the fallback stores and
returns a list rather than leaving the student stuck.

## [0.10.0] — 2026-08-09

The Smart Course API, the respecified step 1, and the removal of study tracks.

### Added
- **`POST /api/courses` — the Smart Course API.** Checks the database for the
  chosen degree's catalog and, only on a miss, asks a model for that degree's
  typical syllabus, then saves the result as ordinary FK-linked `courses` and
  current-term `course_offerings`. Step 2 shows "Fetching syllabus…" while it
  runs. Generated courses carry `source = 'ai_generated'`, and the picker states
  plainly that the list is unverified — a model's guess at a university's
  syllabus is plausible, not authoritative.
- Guards on that endpoint, because an LLM call behind a public route is where
  this could go wrong: the degree is read through the **caller's** client so RLS
  is the tenancy check; requests are rate-limited per user from
  `ai_generation_log`; the model's JSON is validated with zod (≤40 courses,
  deduplicated by code) and discarded whole if any entry is invalid; upserts use
  `onConflict: 'university_id,code'` so a repeat request is idempotent. With no
  provider key configured the endpoint returns an empty catalog and an
  explanation — onboarding still completes.
- An e2e regression test that signs up, picks Law, and asserts no Computer
  Science course appears *and* that the student can still continue.

### Changed
- **Step 1 is now** University (read-only, from the email domain), Degree level,
  Degree, Year of study, City, Date of birth. Choosing a degree is what triggers
  the course fetch.
- Section 11 of the design doc records decisions D15–D17.

### Removed
- **Study tracks, completely** — UI, React form state, schema. Every track had
  exactly one same-named degree above it, so the level carried no information
  while giving two fields that could disagree; `degree_level` + `degree_id`
  classify a student on their own. Migration
  `20260809130000_remove_study_tracks.sql` drops the three track triggers,
  `profiles.study_track_id`, `course_tracks` and `study_tracks`, and rebuilds
  `rpc_find_candidates` without `track_name`. It refuses to run while any course
  still derives its degree through `course_tracks`, which would orphan those
  courses. `03_study_tracks.sql` became `03_degrees.sql`.

### Fixed
- **Course filtering (critical).** Choosing Law listed Computer Science courses.
  `/api/courses` was already filtering on `degree_id` correctly and was not the
  cause: the page read the catalog with `getCurrentTermOfferings()`, which
  filtered only on `terms.is_current` and so returned the whole university
  catalog. Because that list was non-empty, the picker's `offerings.length === 0`
  guard was false and the course API was **never called** — the bug was hiding
  the condition that triggers the generator. Replaced with
  `getDegreeOfferings(degreeId)`, which constrains `courses.degree_id`; search
  narrows that degree-scoped list rather than reaching across degrees.
- The requirement to pick at least one course is now counted per **degree**, so a
  Law student with an empty catalog is not forced to enroll in a CS course to
  leave step 2.
- Name placeholder was a real name from testing; now a generic "Jane Doe".
- Two misleading strings in the empty state: the picker no longer offers "search
  instead" when there is nothing to search, nor asks for a pick when the catalog
  is empty.

### Verification
`npm run verify` passes: lint, typecheck, unit and integration tests, production
build. Playwright: 26 e2e tests pass across chromium and mobile-safari.

## [0.9.0] — 2026-08-09

Schema for the reworked onboarding, matching algorithm v2, and the dashboard
grid fix.

### Added
- **`degrees`** as the parent of `study_tracks`: universities → degrees →
  tracks. What the schema called a "study track" was really a degree, so those
  rows were promoted and each keeps a same-named track. Courses now hang off the
  degree, which is what the course API will fetch on.
- `profile_private` for **date of birth**. A separate table for the same reason
  as `profile_contacts`: RLS is table-level, and `profiles` is readable by every
  discoverable classmate, so a DOB stored there would be visible to all of them.
  Matching derives an age *gap* from it with definer rights — the date never
  leaves the database.
- `profiles.city`, `profiles.degree_id`; `learning_preferences.study_formats`;
  `courses.degree_id`, `courses.source` and `courses.generated_at` for
  provenance.
- Same-university triggers for degree↔track and profile↔degree.
- 6 integration tests for the v2 rules, and the demo cohort now carries cities,
  birth years and study formats so every bonus is demonstrable.

### Changed — matching algorithm v2
- **Study format is a strict filter.** Disjoint formats are an exclusion, not a
  penalty: someone who will only meet in person and someone who will only meet
  on Zoom have nothing to arrange. Verified — an in-person-only viewer does not
  see an otherwise-identical remote-only student.
- **Disjoint study hours halve the whole core score.** Weights alone could not
  guarantee the rule you asked for, because enough other terms would let
  opposite hours still win. The halving makes it hold at any course count:
  exact hours + environment + one shared course now beats three shared courses
  with opposite hours, and there is a test asserting exactly that.
- Core is out of 85 (hours 28, environment 22, schedule overlap 18, shared
  courses ≤9, language 4, group 2, Saturday 2), bonuses out of 15 (same city 6,
  age gap ≤3 years 5, same year *and* degree level 4). Capped at 100.
- `degree_level` lives on `degrees`, not `profiles` — a degree *is* a level, and
  storing it twice would let a student's stated level disagree with the degree
  they picked. Step 1 uses it to filter the degree list.
- City comparison is case- and whitespace-insensitive.

### Fixed
- **Dashboard grid alignment.** Grid items default to `stretch`, so expanding
  "Why this match?" dragged its row-mates' cards taller and left them with dead
  space. `items-start` lets each card size to its own content. Chosen over CSS
  masonry because masonry reorders items into columns, which would scramble the
  score ranking — the whole point of the screen. Verified: the expanded card
  goes 264→371px while its neighbours stay at 264.

### Verification
`npm run verify` passes: lint, typecheck, 163 tests, production build.

## [0.8.0] — 2026-08-05

Phase 2 — the matching engine and the matches dashboard. Students now see real
classmates, ranked.

### Added
- **`rpc_find_candidates`** — scores classmates out of 100 and returns them
  ranked. One function serves both the cross-course matches view and a future
  per-course dashboard.
- The 100-point model from design §1.7, implemented: schedule overlap (0–40),
  time-of-day Jaccard (0–20), environment (0–15), group size (0–8), language
  (0–7), Saturday (0–5), intent complementarity (2–5).
- `app_array_jaccard` and `app_shared_days` helpers, neither exposed to clients.
- **Matches dashboard** at `/dashboard`: top-match bento card and a grid, wired
  to real Supabase data, with an empty state that names the specific reason
  there is nothing to show.
- Primary navigation — desktop top bar and mobile bottom bar, four
  destinations.
- `npm run seed:students` — a demo cohort varied across every scoring term,
  plus a Tel Aviv student as a cross-tenant control. This is the §6.1
  cold-start mitigation: a matching engine with one user looks broken.
- `.clay-card`, `.clay-btn-primary`, `.clay-btn-secondary`, `.bg-pattern` as
  named classes, **derived from the theme tokens** rather than copied with
  literal rgba values, so they cannot drift from `shadow-clay`.
- 24 tests: 12 adversarial integration tests against the RPC, 12 unit tests for
  the presentation helpers, and 3 e2e tests that create their own students.

### Changed
- `/dashboard` replaces the Phase 1c "you are all set" placeholder.
- Titled "Your matches", not the template's "AI-Powered Matches": the ranking is
  entirely rule based at this phase, and the AI re-rank is 3b.

### Notes
- **`rpc_find_candidates` is SECURITY DEFINER, deliberately.** It must exclude a
  candidate who blocked the caller, and `blocked_users` is readable in one
  direction only, so under invoker rights that block is invisible. Definer
  rights mean every RLS rule is restated in its WHERE clause — and each one is
  attacked by a test, including a Tel Aviv student getting nothing from
  Reichman.
- Template deviations, all in design §10.5: lucide instead of a second icon
  font; a disabled icebreaker button rather than one that silently does nothing;
  "View profile" became an in-place "Why this match?" disclosure since no
  profile route exists yet.
- The course dashboard template is **not** built: it depends on course meeting
  times, rooms and sections (conflicts C8 and C9), which are still unresolved.
  The RPC already accepts the offering id it will need.
- One webkit timing flake was seen in the form-preservation e2e during a full
  run; it passes in isolation and on re-run.

### Verification
`npm run verify` passes: lint, typecheck, 157 tests, production build.
`npm run test:e2e` passes 24 tests across Chromium and mobile Safari. The
dashboard was also loaded in a browser as a seeded student and checked at
desktop and mobile widths.

## [0.7.1] — 2026-08-05

### Fixed
- **Avatar uploads over 1 MB failed** with "Body exceeded 1 MB limit". Server
  actions default to a 1 MB request body, and the photo is posted through the
  action rather than straight to Storage, so the whole image counted against
  that limit. `next.config.ts` now sets `serverActions.bodySizeLimit` to 5 MB.
  Deliberately higher than the bucket's own 2 MB file cap, because this limit
  applies to the entire multipart body — image plus every other form field plus
  overhead — so matching it to the file size would reject a valid 2 MB photo.
  The real size rule stays in the action and the bucket. Verified with a 1.4 MB
  upload that previously threw.

## [0.7.0] — 2026-08-05

Onboarding and auth UX fixes, completing Phase 1c.

### Fixed
- **Forms no longer lose what you typed.** React 19 resets an uncontrolled form
  once its action returns — including when it returned an error — so a mistyped
  password wiped a perfectly good email address too. Text inputs, selects and
  the preference choice groups are now controlled, so their values come from
  React state and the reset cannot reach them. The password field stays
  uncontrolled and is therefore cleared, which is the one field that should be
  retyped. Covered by an e2e test.

### Added
- **Any `.ac.il` or `.edu` address may register.** An unknown domain provisions
  its institution on first sight, with a default track list, so signup no
  longer depends on a domain being seeded. Addresses are trimmed and lowercased
  before anything else, so stray spaces or capitals cannot fork an account.
- **Profile photos.** Optional upload on step 1 with a live preview, stored in
  a Supabase Storage bucket under a folder named after the owner's uuid — which
  is what the storage policy checks, so one student cannot overwrite another's.
  Shown top-left in the app header, with an initial as fallback.
- Name pre-filled by parsing the email prefix, and still editable.
  `roni.amiel2024@…` becomes "Roni Amiel"; an opaque handle like `ra4839@…`
  yields nothing rather than the nonsense "Ra".
- Eight more study tracks, including two joint degrees that share the Computer
  Science core — another case the many-to-many `course_tracks` exists for.
- 9 more unit tests and 4 more e2e tests.

### Changed
- **"Other" removed from the study-hours question**, and from the `time_block`
  enum. It was a non-answer: it told the matching engine nothing it could
  overlap against, and every scoring rule needed a special case for a value
  that could never match meaningfully. Choosing all three blocks is how a
  student says "any time".
- **Nunito replaces Be Vietnam Pro for headings**, overriding the Stitch
  design. Rounded terminals suit the claymorphic surfaces; the geometric
  display face was working against them.
- Email placeholder is now the generic `student@university.edu`.
- "Pick at least one course" is enforced in the action rather than the schema,
  because the rule is conditional — it must not apply to the first student at
  an institution whose catalog has not been loaded yet, who would otherwise be
  trapped on step 2.
- Roadmap versions after this shift up one minor; Phase 2 is now `0.8.0`.

### Notes
- Email confirmations remain **off**, as requested, so mock accounts stay easy
  to create. This still must be switched on before any real deployment.
- Provisioning has caveats worth reading before launch — a plausible typo
  inside a valid academic suffix creates a private empty institution, and
  derived names like "Harvard" are guesses from a domain. Both are recorded in
  design doc §9.6, along with the recommendation to replace this with a domain
  allow-list for real users.

### Verification
`npm run verify` passes: lint, typecheck, 133 tests, production build.
`npm run test:e2e` passes 18 tests across Chromium and mobile Safari. Avatar
upload, storage round-trip and the heading font were also confirmed in a real
browser.

## [0.6.0] — 2026-08-05

Phase 1c — authentication and onboarding. A new student can now sign up and
reach a working dashboard.

### Added
- **Email + password auth** (D8). The university email domain is the enrolment
  check: an unrecognised domain is refused with a message a person can act on,
  rather than a database error. Sign-in and sign-up both return a single
  generic failure message so neither form can be used to discover who has an
  account.
- **`src/proxy.ts`** — session refresh and route guarding. Signed out goes to
  `/login?next=…`; signed in but unfinished goes to `/onboarding`; finished
  students are kept out of it. The landing page is excluded from the matcher,
  so the marketing site still renders with no Supabase configured.
- **Study tracks** (D9): `study_tracks` and `course_tracks`, the latter
  many-to-many because Linear Algebra genuinely belongs to Computer Science,
  Data Science and Economics — duplicating it per track would split the very
  matching pool the product exists to create.
- **Four-step onboarding**: basics, course picker, preferences, availability.
- Dashboard placeholder showing what was saved.
- 23 unit tests for the validation schemas and 4 end-to-end tests, including a
  full signup-to-dashboard run that passes on both desktop Chromium and mobile
  Safari.

### Changed
- `profiles.degree_program` (free text) replaced by `profiles.study_track_id`.
- **`learning_preferences` reworked to multi-select** — three enum arrays plus
  Saturday and languages. The old single-value enums could not express
  "mornings and evenings", which is a normal answer.
- Dropped `study_style`, `noise_preference`, `place_preference`,
  `group_size_preference`, `pace`, `goal`, `notes` and their enum types.
  Destructive on purpose: the app has never been deployed, so a compatibility
  shim would be dead weight.
- **Match scoring model revised** in the design doc. Every preference term is
  now a set overlap rather than a value comparison, so two students who both
  answer "mornings and evenings" score full marks where the old model might
  have counted them a mismatch.
- The course picker is **never filtered by year of study** (D10). Students
  extend degrees and take courses out of sequence.
- Migrated `middleware.ts` to `proxy.ts`, the convention Next 16 renamed it to.

### Fixed
- A preference row in the RLS suite was being inserted with the old column
  names and failing silently, which made "cannot read another tenant's
  preferences" a **vacuous pass** — the row it claimed to be denied never
  existed. Vitest does not typecheck, so only `tsc` caught it. The seed is now
  checked, and the test asserts the row exists before asserting it cannot be
  read.
- Duplicate heading on the course step.

### Notes
- **Phone numbers are not collected during onboarding** (D11). They are asked
  for at the first connection request instead, where the consent notice
  actually means something. Phase 4a cannot ship the WhatsApp handoff without
  building that prompt.
- Local Supabase has `enable_confirmations = false`, so signup returns a
  session immediately. **Turn confirmations on before any real deployment** —
  without them, anyone can register using someone else's university address.
- The e2e suite now runs with a single worker. Parallel workers all block on
  the same Turbopack build against the dev server and time out, which looks
  like a broken redirect but is only a cold cache.

### Verification
`npm run verify` passes: lint, typecheck, 101 tests, production build.
`npm run test:e2e` passes 12 tests across Chromium and mobile Safari.

## [0.5.0] — 2026-08-05

Phase 1b — Row Level Security. The schema was fully inaccessible to clients
after Phase 1a; this opens it deliberately, table by table.

### Added
- **33 policies across all 14 tables**, in the shape of design §1.9. `anon`
  receives no policy at all.
- `app_can_see_profile(uuid)` — the shared visibility predicate for `profiles`,
  `learning_preferences`, `availability_slots` and `enrollments`.
  `SECURITY DEFINER`, so the profiles policy that calls it cannot recurse. An
  accepted connection counts as visibility in its own right, so a student who
  switches discoverability off does not vanish from partners they already
  agreed to meet.
- Two immutability triggers, covering what RLS structurally cannot express —
  a `WITH CHECK` sees only the new row, never the old one:
  - `prevent_profile_tenant_change()` — a student cannot move themselves
    between institutions.
  - `freeze_request_content()` — an addressee may accept or decline, but cannot
    rewrite the icebreaker they were sent. That text is reused verbatim in the
    WhatsApp handoff, so an editable one would let the addressee put words in
    the requester's mouth.
- **35 adversarial integration tests**, each run as a real signed-in student.
  Twelve are dedicated to cross-tenant isolation, including the case that
  matters most: both universities offer a course named "Data Structures", and a
  Reichman student querying by that name gets exactly one row — theirs.

### Notes
- **The test suite was verified to have teeth.** A deliberately permissive
  policy was added to `courses`, and exactly the three cross-tenant course
  tests failed; removing it returned the suite to green. A security test that
  cannot fail proves nothing.
- Requests use **two update policies rather than one**. Permissive policies are
  OR'd, so the requester gets `pending → cancelled` and the addressee gets
  `pending → accepted | declined`, and neither can perform the other's
  transition.
- `blocked_users` is readable in one direction only — you see blocks you
  created, never ones naming you.
- A **pending** request grants no contact access. Consent is the acceptance.
- Test clients now use a unique Supabase `storageKey` each. Sharing one lets a
  second sign-in overwrite the first client's session, which would let a
  security test unknowingly run as the wrong user and pass while proving
  nothing.

### Verification
`npm run verify` passes: lint, typecheck, 78 tests, production build.
`supabase db reset` applies all ten migrations and both seeds cleanly.

## [0.4.0] — 2026-08-03

Visual design system. Transcribed from the Google Stitch "Kinetic Learning"
design, which is archived in `docs/design/stitch/`.

### Added
- Full token layer in `src/app/globals.css`: the purple/sunset/grape palette,
  the tinted surface ramp, the Be Vietnam Pro + Plus Jakarta Sans type scale,
  the ultra-rounded radius scale, and seven claymorphic shadow tokens.
- `Chip` — pill-shaped trait labels with eight tones.
- `Wordmark` and `PhoneShowcase` marketing components.
- Design source archived under `docs/design/stitch/`, so the reference is
  version-controlled next to the implementation.
- Design doc §8: tokens, the claymorphism spec, deliberate substitutions, the
  screen-to-route map, and **C1–C9, the nine points where the design and the
  approved architecture disagree**. All nine are unresolved and need decisions.

### Changed
- `Button` rewritten: gradient fills with a white inner top glow, a 2px
  physical depression on press, a `sunset` variant for the single
  highest-intent action per screen, and 44px+ touch targets throughout.
- `Card` restyled to the clay surface — 24px radius, purple-tinted ambient
  shadow, white inset highlight.
- `Input` now rests on a faint purple wash and turns white on focus.
- Landing page rebuilt to the Stitch design.
- Roadmap versions after Phase 1a shift up one minor to make room for this
  phase; Phase 1b is now `0.5.0`.

### Fixed
- **`cn()` silently dropped custom font sizes.** `cn('text-label-sm',
  'text-brand')` returned only the colour, because tailwind-merge cannot tell a
  custom font-size from a custom colour when both use the `text-` prefix — so
  chips rendered at 16px/400 instead of 12px/700. The custom `font-size` and
  `shadow` scales are now registered with tailwind-merge. This failed with no
  error or warning and would have affected every component using the type
  scale.
- Landing footer no longer strands itself below the closing band on tall
  viewports.

### Notes
- **The 3D illustrations could not be reproduced.** The hero phone is rebuilt
  as real DOM styled from the same tokens as the product's match cards, which
  stays sharp, reflows on mobile, and cannot drift from the real UI.
- The landing page's fabricated university crests were replaced with an honest
  statement that the app serves Reichman University today.
- Dark mode is deliberately not implemented; the source supplies no dark
  palette.

### Verification
`npm run verify` passes (lint, typecheck, 43 tests, build) and `npm run
test:e2e` passes 4 tests across chromium and mobile Safari. The landing page
was compared against the Stitch reference at 1280px and 375px, and computed
styles were checked against the token spec.

## [0.3.0] — 2026-08-03

Phase 1a — database schema. The schema exists, is seeded, and is completely
inaccessible to clients until the Phase 1b policies land.

### Added
- Nine migrations under `supabase/migrations/`: enum types, tenancy roots,
  profiles/contacts/preferences, the academic catalog and availability,
  connection requests and blocks, the AI cache and generation log, helper
  functions and triggers, RLS enablement, and the Data API grants.
- 14 tables, 12 enum types, 12 triggers and 3 helper functions.
- Seed data for two universities. Reichman is the rollout target; Tel Aviv
  exists so the Phase 1b RLS tests have a real cross-tenant boundary to attack,
  and both offer a course of the same name as a leakage tripwire. Reichman has
  a past and a current term so the term dimension is actually exercised.
- 20 schema integration tests covering tenant resolution at signup, the
  denormalised `university_id` triggers, the unordered-pair request constraint,
  the availability overlap function, and the E.164 phone check. They skip with
  a warning when the local stack is not configured.
- `scripts/gen-types.mjs`, so regenerating database types preserves the file
  header instead of stripping it.

### Changed — decision D7, hybrid availability
- Availability may be entered manually **or** derived from a connected
  calendar. `availability_source` and `availability_mode` enums,
  `availability_slots.source` and `profiles.availability_mode` ship now, with
  safe defaults, so no backfill is needed when the sync itself is built.
- `source` is part of the uniqueness constraint on `availability_slots`, so a
  calendar resync replaces only its own rows and never discards hand-added
  slots.
- Design doc gains §1.4.1 (input modes and the `calendar_connections` sketch),
  roadmap Phase 4c, and §6.6 covering the risks.
- PRD to rev 1.2: Smart Onboarding now describes both input paths.

### Changed — schema corrections found while building
- `profiles.full_name` is nullable. The row is created by a trigger the moment
  the auth user exists, which is before the student has entered a name.
  Inventing one from the email address was the alternative, and it is worse.
- `app_are_connected(a, b)` became `app_is_connected_to(other)`. The
  two-argument form let any authenticated user probe whether two strangers were
  connected; the new form derives the caller from `auth.uid()`.
- Every function pins an empty `search_path` and fully qualifies its
  references, closing the privilege-escalation path a `SECURITY DEFINER`
  function with a mutable search path would leave open.
- `connection_requests` gained a trigger asserting both parties belong to the
  offering's university, making a cross-institution request impossible at the
  storage layer regardless of application code.
- ESLint now ignores `supabase/.temp/`, the generated types, and test
  artefacts; the Supabase CLI cache contains a minified bundle that produced
  ~150 spurious errors.
- `rpc_find_candidates` deferred to Phase 2, where it is the deliverable and
  can be tested against real student data.

### Notes
- **Course codes in the seed are placeholders.** The course names are real Efi
  Arazi School subjects; the codes were invented. Replace them from the
  official course list before submission — only
  `supabase/seed/02_course_catalog.sql` needs changing. Lecturer is left NULL
  rather than populated with invented names.
- Explicit `GRANT`s were required: Supabase no longer auto-exposes new
  public-schema objects, and the legacy opt-out is removed on 2026-10-30.
  Access now needs both a grant and an RLS policy.

### Verification
`npm run verify` passes: lint, typecheck, 43 tests (23 unit + 20 integration),
production build. `supabase db reset` applies all nine migrations and both
seeds cleanly from scratch.

## [0.2.0] — 2026-08-03

Phase 0.5 — project scaffold. The application now builds, runs and tests, but
implements no product features.

### Added
- Next.js 16.2.12 App Router project with React 19.2.4, TypeScript strict mode,
  Tailwind CSS 4 and ESLint. `src/` layout with the `@/*` import alias.
- shadcn/ui (4.16, on Base UI) with `Button`, `Card`, `Input`, `Label` and
  `Badge` as a starter set. Component source is copied into
  `src/components/ui/`, so there is no runtime UI dependency.
- `src/lib/env.ts` — zod-validated environment split into browser-safe and
  server-only halves. Names every offending variable in a single error;
  `serverEnv()` throws if called from a client bundle.
- `src/lib/supabase/{client,server,admin,middleware}.ts` — browser, request-
  scoped, service-role and session-refresh clients. `requireUser()` uses
  `getUser()` rather than `getSession()` so authorization never rests on an
  unvalidated JWT. `admin.ts` is marked `server-only` and documents the three
  operations permitted to bypass RLS.
- `src/lib/errors.ts` — the `ActionResult<T>` contract, `AppError`, and
  `toActionError()`, which reduces unexpected errors to a generic message while
  logging the detail server-side.
- Vitest (jsdom) and Playwright (chromium + mobile Safari) configured, with 23
  unit tests over the env validator and error contract, and a landing-page e2e
  smoke test.
- `supabase init` — local CLI config as `project_id = "studybuddy"`, plus the
  `migrations/` and `seed/` directories Phase 1a fills.
- `.env.example` documenting every variable, with local-CLI instructions.
- Landing page and root layout replacing the create-next-app default.
- `.claude/launch.json` so the dev server can be started by tooling.

### Changed
- Version now lives in `package.json`; the root `VERSION` file is deleted.
- `docs/technical-design.md` (0.1.2) reconciled with the scaffold as actually
  built: no `tailwind.config.ts` (Tailwind v4 is CSS-first), `vitest.config.mts`
  instead of `.ts`, shadcn/ui adopted and `components/ui/` exempted from the
  file-header convention, pinned versions table added, and the npm audit
  position recorded.
- `README.md` rewritten with setup instructions, a script table and the project
  layout.

### Notes
- `npm audit` reports three high-severity advisories in `postcss` and `sharp`,
  both transitive dependencies of `next@16.2.12`. npm's only offered fix is
  downgrading to `next@9`. Left in place; neither is reachable by untrusted
  input in this app.
- `AI_MODEL` deliberately has no default, so no model id is hardcoded in
  source. AI features report as unconfigured unless both a key and a model are
  set.

### Verification
`npm run lint`, `npm run typecheck`, `npm test` (23 passed), `npm run test:e2e`
(4 passed across chromium and mobile Safari) and `npm run build` all pass. The
dev server was loaded in a browser and the landing page confirmed rendering at
desktop and mobile widths.

## [0.1.1] — 2026-08-03

Documentation alignment. No code, no functional change.

### Added
- `docs/prd.md` — the SDD/PRD, previously held outside the repository, now
  version-controlled alongside the technical design.

### Changed
- **PRD §3: "Smart Interaction" renamed to "WhatsApp Handoff"** (PRD rev 1.1).
  The feature now states plainly that the AI-generated icebreaker is handed
  off into WhatsApp through a `wa.me` deep link, that no in-app chat is built,
  and that contact details are exchanged only after a request is accepted.
- PRD §5 Phase 4: "smart messaging feature" → "WhatsApp handoff feature".
- `docs/technical-design.md` §7 item 1 struck through and marked resolved —
  the PRD/design divergence it flagged no longer exists. Design doc header
  bumped to 0.1.1.
- `README.md` — PRD added to the documentation index.

## [0.1.0] — 2026-08-03

Initial commit. Design only — no application code.

### Added
- `docs/technical-design.md` — full technical design: PostgreSQL schema with
  enums, constraints, indexes, helper functions and an RLS policy matrix; the
  `rpc_find_candidates` scoring model; Next.js App Router folder structure;
  server-action and route-handler surface; React component tree; an
  eleven-step phased implementation plan; risk register.
- `README.md` — project overview, stack, status table.
- `CHANGELOG.md` — this file.
- `VERSION` — `0.1.0`. Placeholder until `package.json` exists (Phase 0.5).
- `.gitignore` — Node, Next.js, Supabase, macOS, test artefacts; blocks `.env`
  while allowing `.env.example`.
- `.claude/commit-convention.md` — commit title format
  `[vX.Y.Z] type(scope): summary`, body requirements, branching rules.

### Design decisions recorded
- Seeded course catalog with per-term `course_offerings`, rather than
  free-text course names.
- Connection model is a direct request with accept/decline, not mutual opt-in.
- No in-app chat: an AI-generated icebreaker is handed off to WhatsApp via a
  `wa.me` deep link. `profile_contacts` is a separate table so a phone number
  is unreadable until a request is accepted.
- AI runs as a re-ranker over a SQL prefilter, cached in `match_scores` with a
  24-hour TTL, and degrades to the deterministic ranking on failure.
- Multi-tenancy is row-level on `university_id`, asserted in both RLS policies
  and query predicates.

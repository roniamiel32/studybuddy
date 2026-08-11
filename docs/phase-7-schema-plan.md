# Phase 7 — Schema plan: group admin roles, and scheduled meetings

```
File:        docs/phase-7-schema-plan.md
Authors:     Roni Amiel & Eden Bitran
Description: Proposed Supabase schema for two features — advanced group
             management with multiple admins, and the in-chat meeting
             scheduler with calendar blocking and verified-meeting ratings.
             Schema only; no application code. For review before implementation.
Version:     0.19.0

Modifications:
    0.19.0 - 2026-08-11 - Initial proposal
```

This closes **conflict C5** (session scheduling), open since §8.4, and extends the
C4 study-group schema from Phase 5.

Four migrations, in dependency order:

| # | File | What it does |
|---|---|---|
| A | `20260811100000_group_admin_roles.sql` | Admin becomes a role on membership, not a column on the group |
| B | `20260811110000_group_invitations.sql` | Admins add members by invitation, not by insert |
| C | `20260811120000_meetings.sql` | Meetings, RSVPs, the availability intersection, derived busy time |
| D | `20260811130000_verified_ratings.sql` | Ratings require a shared attended meeting; group ratings |

A and B are independently shippable. C and D should land together — D tightens a
rule that only C can satisfy.

---

## Migration A — admin roles

### The problem with `admin_id`

`study_groups.admin_id` is `not null references profiles on delete cascade`, and
three things authorise off it: `app_is_group_admin()`, the group UPDATE policy,
and `rpc_approve_group_request`. One column cannot hold two admins.

The tempting fix — keep `admin_id` *and* add a role — gives the same fact two
homes. This schema already rejects that twice, in writing: "Full is NOT a status:
it is a count against `max_participants`, and storing it would be a second copy
of a number the members table already knows", and the rating score effect is
"deliberately NOT stored" on the profile. A group would drift the same way the
moment a founder was demoted.

### Proposal

```sql
create type study_group_role as enum ('member', 'admin');

alter table study_group_members
  add column role study_group_role not null default 'member';

-- Backfill: the founder is the first admin.
update study_group_members m
set role = 'admin'
from study_groups g
where g.id = m.group_id and g.admin_id = m.profile_id;

-- The admin list is read on every policy check.
create index study_group_members_admins_idx
  on study_group_members (group_id)
  where role = 'admin';
```

`app_is_group_admin()` is redefined to read **only** `study_group_members`:

```sql
create or replace function public.app_is_group_admin(target_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.study_group_members m
    where m.group_id = target_group_id
      and m.profile_id = auth.uid()
      and m.role = 'admin'
  );
$$;
```

Same name, same signature, same semantics for a single-admin group — so every
existing policy and both RPCs keep working untouched. That is the reason for
putting the role on membership rather than in a new `study_group_admins` table:
the existing authorisation surface does not move.

### What happens to `study_groups.admin_id`

It stays, keeps its name, and stops being an authorisation source. It becomes
provenance: who created the group. Two changes are still needed:

```sql
alter table study_groups
  alter column admin_id drop not null,
  drop constraint study_groups_admin_id_fkey,
  add constraint study_groups_admin_id_fkey
    foreign key (admin_id) references profiles (id) on delete set null;
```

**Why this is not optional.** Today `on delete cascade` means deleting the
founder's account deletes the group. With multiple admins that is a live bug: a
group with four members and two other admins would vanish because one person
closed their account. `set null` keeps the group and loses only the provenance.

`check_study_group_consistency()` currently requires `admin_id` to be enrolled —
it must tolerate NULL, and the enrolment requirement moves to the promotion rule
below.

### Three new invariants, each a trigger

RLS decides *who may write*; none of these are about who.

1. **A group always has at least one admin.** Blocks demoting or removing the
   last admin, and blocks the last admin leaving. Fires on `update` and `delete`
   of `study_group_members`. Without it the group becomes unadministrable —
   nobody can approve, edit or promote, and there is no recovery path.
2. **An admin must be a member of the group** — guaranteed structurally, since
   the role lives on the membership row. Worth stating because it is the reason
   for the design.
3. **`max_participants` cannot be set below the current member count.** A CHECK
   cannot see other tables, so this is a `before update on study_groups` trigger.
   Admins can now edit this number; without the trigger an admin can set it to 2
   with six people in the group, and the capacity trigger then reports a group
   that is over capacity forever.

### Promotion

Grant `update` on `study_group_members` to `authenticated` (currently only
`select, insert, delete`), with a policy narrow enough that it cannot become a
back door:

```sql
create policy "an admin can change a member's role"
  on public.study_group_members for update to authenticated
  using (public.app_is_group_admin(group_id))
  with check (public.app_is_group_admin(group_id));
```

plus a trigger asserting that **only `role` changed** — `group_id`, `profile_id`
and `joined_at` are frozen, exactly as `freeze_group_request` does for requests.
An UPDATE privilege granted for one column is otherwise a privilege to rewrite
the row.

Promotion is symmetric by requirement ("the exact same rights"), so an admin can
demote another admin, subject to invariant 1. **Open question 1** below asks
whether you want that.

### Join requests — what already works

"Visible to all admins" needs no change: the SELECT policy is
`requester_id = auth.uid() or app_is_group_admin(group_id)`, and redefining that
helper makes every admin a reader. `group_requests` is already in the Realtime
publication, so a second admin's screen updates when the first decides.

"First admin to respond wins" is already the behaviour of
`freeze_group_request`: it raises `42501` when `old.status <> 'pending'`. One
gap to close — `rpc_approve_group_request` reads the request and then updates it
in two statements, so under READ COMMITTED two admins can both pass the read.
The freeze trigger still catches the loser on re-read, but the fix is one word:

```sql
  select r.group_id, r.requester_id
  into   v_group_id, v_requester_id
  from   public.group_requests r
  join   public.study_groups g on g.id = r.group_id
  where  r.id = p_request_id and r.status = 'pending'
  for update of r;          -- <-- serialises the two admins
```

Rejection currently runs as a direct `UPDATE` from `decideRequest`. It should
become `rpc_reject_group_request` for symmetry, so both paths lock the row the
same way and both return the same "already decided by another admin" error.

---

## Migration B — adding a member

The requirement says admins can *add* users. The current insert policy
deliberately forbids it, and the comment says why: "without the request check an
admin could add any classmate to a group without consent."

That reasoning still holds. Being added to a group means being added to a chat
whose history you can then read, by someone you may not know.

### Proposal: invitations, as the mirror of a request

Extend `group_requests` rather than adding a table — the lifecycle is identical
(one live row per pair, decided once, frozen after, never deleted):

```sql
create type group_request_kind as enum ('request', 'invite');

alter table group_requests
  add column kind group_request_kind not null default 'request',
  add column invited_by uuid references profiles (id) on delete set null,
  add constraint group_requests_invite_has_inviter
    check ((kind = 'invite') = (invited_by is not null));
```

- `kind = 'request'` — student asks, any admin decides. Today's flow, unchanged.
- `kind = 'invite'` — admin asks, **the student decides**. Approving their own
  invite is what inserts the membership.

The existing partial unique index already covers both directions once `kind` is
added to it, so an invite and a request cannot coexist for the same pair.

Two policy additions: an admin may insert a row with `kind = 'invite'` for a
student enrolled in the course; the invitee may decide a row where
`requester_id = auth.uid() and kind = 'invite'`. `rpc_approve_group_request`
needs one extra authorisation branch — caller is the group admin **for a
request**, or the invitee **for an invite** — and everything downstream (capacity
trigger, membership insert, welcome message) is reused as-is.

**Removal** needs no change. The existing delete policy already lets an admin
remove anyone but themselves, and invariant 1 stops the last admin being removed.

If you would rather have direct add with no consent step, say so — it is a
smaller migration (one policy), and I will note the trade in the doc rather than
argue it twice.

---

## Migration C — meetings

### The modelling question you asked: meetings vs weekly templates

They are different kinds of fact and must stay in different tables.

`availability_slots` is a **weekly recurring template of free time**:
`day_of_week smallint`, `starts_at time`, `ends_at time`. No date. It answers
"which hours am I generally free?" and it feeds `app_overlap_minutes`, which is
28 + 18 points of the match score.

A meeting is a **single concrete interval**: `starts_at timestamptz`. It answers
"where am I on Tuesday the 18th?"

Writing meetings into `availability_slots` would break the table in two ways: it
has no column for a date, and every row in it means *free* — a "busy" row would
invert the meaning of a table the matching engine sums. So:

> **Nothing is written to `availability_slots` when a meeting is booked.**
> Busy is *derived* from the meeting itself.

This is the same call the schema already makes for group fullness and for
reputation. The timeslot is still blocked everywhere it matters, because both
readers — the intersection RPC and the personal schedule — subtract meetings.

### Tables

```sql
create type meeting_status as enum ('scheduled', 'cancelled');
create type meeting_rsvp   as enum ('going', 'cancelled');

create table meetings (
  id                 uuid primary key default gen_random_uuid(),
  university_id      uuid not null references universities (id) on delete cascade,

  -- Exactly one of these. A meeting belongs to the chat it was booked from.
  conversation_id    uuid references conversations (id) on delete cascade,
  group_id           uuid references study_groups (id) on delete cascade,

  course_offering_id uuid references course_offerings (id) on delete set null,
  created_by         uuid references profiles (id) on delete set null,

  title              text not null check (char_length(btrim(title)) between 3 and 120),
  location           text check (char_length(location) <= 200),
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  status             meeting_status not null default 'scheduled',
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),

  constraint meetings_one_scope check (num_nonnulls(conversation_id, group_id) = 1),
  constraint meetings_ordered   check (ends_at > starts_at),
  constraint meetings_bounded   check (ends_at <= starts_at + interval '8 hours')
);

create table meeting_attendees (
  meeting_id   uuid not null references meetings (id) on delete cascade,
  profile_id   uuid not null references profiles (id) on delete cascade,
  rsvp         meeting_rsvp not null default 'going',
  responded_at timestamptz,
  primary key (meeting_id, profile_id)
);
```

Indexes: `meetings (group_id, starts_at)`, `meetings (conversation_id, starts_at)`,
and `meeting_attendees (profile_id, meeting_id)` for the reverse lookup — "my
meetings" is read on every schedule render and every intersection.

### Why `rsvp = 'cancelled'` instead of deleting the row

Three requirements depend on the row surviving a cancellation:

- The person forfeits the right to rate — which needs a record that they were in
  the meeting *and* pulled out, not an absence of evidence.
- Other attendees should see who dropped.
- It stops a cancel-then-rejoin loop from being invisible.

A `before update` trigger freezes `rsvp` once `now() >= meetings.starts_at`.
Without that freeze the whole rating constraint is bypassable: cancel, skip the
session, then flip back to `going` afterwards and rate people you never met.
This is the single most important trigger in the feature.

### Timezone — the one thing that needs a decision now

`availability_slots.starts_at` is a `time` with no zone: local wall-clock, and
the schema comment says the week starts on Sunday because it is an Israeli
academic week. `meetings.starts_at` is `timestamptz`. Projecting one onto the
other requires knowing *which* local time:

```sql
alter table universities
  add column timezone text not null default 'Asia/Jerusalem';
```

On the university rather than the profile: a course meets where the campus is.
Putting it on the profile would mean two students in one group disagreeing about
when "Tuesday 18:00" is.

### The intersection, as one RPC

```sql
rpc_meeting_slots(
  p_conversation_id uuid default null,
  p_group_id        uuid default null,
  p_from            date default current_date,
  p_days            int  default 14
) returns table (starts_at timestamptz, ends_at timestamptz, attendee_count int)
```

`security definer`, restating its own authorisation the way
`rpc_approve_group_request` does: the caller must be a participant of the
conversation, or a member of the group. Definer because it reads other students'
availability, and because it must give the same answer regardless of whether the
caller can see each participant's profile individually.

Steps, all in SQL — PostgreSQL 17, so multirange operators are available:

1. Resolve participants: two `conversations` columns, or all
   `study_group_members` for the group.
2. Project each participant's weekly slots onto real dates over the window:
   `generate_series` of days × their slots for that `day_of_week`, materialised
   as `tstzrange` in the university's timezone.
3. `range_agg` per participant per day, then `range_intersect_agg` across
   participants → the common free time.
4. Subtract busy: `range_agg` of every scheduled meeting where any participant
   has `rsvp = 'going'`, then multirange difference (`-`).
5. Return the remaining intervals, split to the same 2-hour grid the UI uses.

Using ranges rather than matching the fixed `TIME_SLOTS` blocks costs a little
SQL and buys correctness for Phase 4c: calendar-synced slots are inverted from
real busy intervals and will not be grid-aligned, and a `group by (day, start,
end)` intersection silently drops everything that does not line up.

### The personal schedule

```sql
rpc_my_schedule(p_from timestamptz, p_to timestamptz)
  returns table (starts_at timestamptz, ends_at timestamptz,
                 meeting_id uuid, title text, location text,
                 scope text, other_attendee_count int)
```

Invoker rights — it only ever reads the caller's own meetings. This is what
"marked Busy in their schedule, containing the meeting's info" reads from. One
row per meeting the caller is `going` to; a cancelled RSVP disappears from it
immediately, which is the requirement "that timeslot is immediately freed up".

### Booking, atomically

`rpc_create_meeting(...)` — one function, for the same reason approval is one
function. It must insert the meeting and all attendee rows in one transaction,
and re-verify inside that transaction that the slot is still inside the
intersection and still free for everyone. Checking in the application and then
inserting is two statements, and two people booking the last common Tuesday
evening from two phones both see it free.

---

## Migration D — ratings that require a real meeting

### What the rule is today

`study_ratings` INSERT policy requires only a `conversations` row between the
pair — "someone you pressed Send message on". The new requirement is strictly
stronger: a shared meeting, in the past, that **neither** cancelled.

### The predicate

```sql
create or replace function public.app_shared_completed_meeting(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.meeting_attendees ma
    join public.meeting_attendees mb on mb.meeting_id = ma.meeting_id
    join public.meetings m           on m.id = ma.meeting_id
    where ma.profile_id = a and ma.rsvp = 'going'
      and mb.profile_id = b and mb.rsvp = 'going'
      and m.status = 'scheduled'
      and m.ends_at <= now()
  );
$$;
```

### Why a policy is not enough, and a trigger is

You asked for the database to make it *impossible*. RLS alone does not:

1. **The existing UPDATE policy is a hole.** It checks `rater_id = auth.uid()`
   and nothing else — so a student with one legitimate rating can `UPDATE` its
   `ratee_id` to anyone they like. The strict constraint would be bypassable on
   day one, through a policy that predates it.
2. **RLS does not apply to `service_role`**, which is what every server action
   using the service key, every seed script and every future admin tool runs as.
3. A policy is checked at the row the writer names; a trigger is checked on the
   row that is actually stored.

So D adds **both**:

```sql
-- Policy: replaces the conversations check with the meeting predicate.
create policy "you can rate someone you met" on public.study_ratings
  for insert to authenticated
  with check (
    rater_id = auth.uid() and ratee_id <> auth.uid()
    and public.app_can_see_profile(ratee_id)
    and public.app_shared_completed_meeting(auth.uid(), ratee_id)
  );

-- Trigger: the same rule, on every writer, on insert AND update.
create trigger study_ratings_require_meeting
  before insert or update on public.study_ratings
  for each row execute function public.check_rating_has_shared_meeting();
```

and freezes `rater_id` / `ratee_id` on update, so "changing your mind" stays what
it is called.

The trigger does **not** exempt `service_role`. `freeze_group_request` does
exempt it, deliberately, so support tooling can fix a stuck request — but here
the requirement is that no path exists, and the seed does not write ratings, so
there is nothing to grandfather.

### Rating the group as a whole

`study_ratings` is person→person: `ratee_id not null`, unique on
`(rater_id, ratee_id)`, read by the profile page and by `rpc_find_candidates`.
Making `ratee_id` nullable to fit a group in would loosen a constraint two
features depend on, to serve a third.

A separate table instead:

```sql
create table group_meeting_ratings (
  id         uuid primary key default gen_random_uuid(),
  rater_id   uuid not null references profiles (id) on delete cascade,
  group_id   uuid not null references study_groups (id) on delete cascade,
  meeting_id uuid not null references meetings (id) on delete cascade,
  sentiment  rating_sentiment not null,
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rater_id, meeting_id)
);
```

Per meeting, not per group: "how was that session" is answerable, "how is this
group, all time" is a different and much vaguer question. It reuses
`rating_sentiment`, and its own trigger requires the rater to have attended that
meeting with `rsvp = 'going'`.

### One row per pair, still

Ratings stay unique on `(rater_id, ratee_id)`; a second meeting updates the
existing row. `meeting_id` is added to `study_ratings` as **nullable provenance
only** — which meeting prompted it.

Making ratings per-meeting instead would let one enthusiastic partner add five
positive ratings across five sessions, and `rpc_find_candidates` counts positive
rows for a bonus that saturates at three. Per-pair keeps that bonus meaning what
§15 says it means. It also leaves the existing unique index alone.

---

## What this breaks

| Thing | Effect | Fix |
|---|---|---|
| `tests/integration/ratings-rls.test.ts` | Every insert now needs a past meeting | Add a meeting fixture; ~23 references |
| Rating e2e in `profiles.spec.ts` | Same | Same fixture |
| Existing `study_ratings` rows | Grandfathered — the trigger only fires on write | Note it; they cannot be *edited* afterwards without a meeting |
| `study_groups.admin_id` readers | `hasOverride`-style reads and `getMyGroups` | Point them at the members role; `app_is_group_admin` keeps its meaning |
| `check_study_group_consistency` | Must tolerate a null `admin_id` | Rewrite the enrolment check |
| `database.types.ts` | Regenerate | `npm run gen:types` |

Migration A must run before B; C before D. None of them require a `db reset` —
all four are additive plus three constraint swaps, so your local test account and
demo data survive.

---

## Open questions

1. **Can an admin demote another admin, or only promote?** "Exactly the same
   rights" implies yes, but it means the person who founded the group can be
   demoted by someone they promoted an hour ago. A `founder cannot be demoted`
   rule is one line in the trigger if you want it.
2. **Direct add, or invitation?** Migration B assumes invitation, to preserve the
   consent rule Phase 5 wrote down. Direct add is smaller and matches the
   requirement more literally.
3. **When does a meeting become rateable — `ends_at` or `starts_at`?** The plan
   uses `ends_at <= now()`, so the session is over rather than merely begun.
4. **Should a meeting cancelled by its creator (`status = 'cancelled'`) count for
   ratings?** The plan says no: nobody attended it.
5. **Is a DM meeting between two people who are *not* in a shared course
   allowed?** `meetings.course_offering_id` is nullable, so yes as drafted.
6. **The chat needs to show the meeting.** `study_group_messages` has
   `is_system`; `messages` (DM) has no such column and requires a sender. Two
   options: add `is_system` to `messages` and relax `sender_id`, or render the
   meeting card in the thread from the `meetings` table in both places. The plan
   assumes the second — no migration, and one renderer instead of two.

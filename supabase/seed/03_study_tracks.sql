-- =============================================================================
-- File:        supabase/seed/03_study_tracks.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Degree programmes, and which courses belong to each.
--
--              !! TRACK CODES ARE PLACEHOLDERS, like the course codes !!
--              The programme names are real Reichman schools; the codes were
--              invented. Replace both from the official catalog before
--              submission — see 02_course_catalog.sql.
--
--              Courses are mapped to MULTIPLE tracks wherever that is true in
--              reality. Linear Algebra and Probability are taken by Computer
--              Science, Data Science and Economics students alike, and keeping
--              them as one shared course is what puts all those students in the
--              same matching pool.
-- Version:     0.6.0
--
-- Modifications:
--     0.6.0 - 2026-08-05 - Initial seed (Phase 1c)
-- =============================================================================

insert into study_tracks (id, university_id, code, name)
values
  ('7ac00001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'CS',   'Computer Science'),
  ('7ac00002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'DS',   'Data Science'),
  ('7ac00003-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'ECON', 'Economics'),
  ('7ac00004-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'PSY',  'Psychology'),
  ('7ac00101-0000-4000-8000-000000000101', '22222222-2222-4222-8222-222222222222', 'CS',   'Computer Science')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Course to track mapping
--
-- Joined on course code rather than id, so this survives the placeholder codes
-- being replaced with the registrar's real ones.
-- -----------------------------------------------------------------------------

-- Computer Science: the full core.
insert into course_tracks (course_id, track_id)
select c.id, '7ac00001-0000-4000-8000-000000000001'
from courses c
where c.university_id = '11111111-1111-4111-8111-111111111111'
on conflict do nothing;

-- Data Science: the mathematical and data-facing subset, plus programming.
insert into course_tracks (course_id, track_id)
select c.id, '7ac00002-0000-4000-8000-000000000002'
from courses c
where c.university_id = '11111111-1111-4111-8111-111111111111'
  and c.code in ('CS-1001', 'CS-1030', 'CS-2010', 'CS-2040', 'CS-3030', 'CS-4010')
on conflict do nothing;

-- Economics: the shared maths courses only. This is the case that proves the
-- many-to-many design — an Economics student taking Probability must be
-- matchable with a Computer Science student in the same class.
insert into course_tracks (course_id, track_id)
select c.id, '7ac00003-0000-4000-8000-000000000003'
from courses c
where c.university_id = '11111111-1111-4111-8111-111111111111'
  and c.code in ('CS-1020', 'CS-1030', 'CS-2040')
on conflict do nothing;

-- Psychology: statistics, and an elective.
insert into course_tracks (course_id, track_id)
select c.id, '7ac00004-0000-4000-8000-000000000004'
from courses c
where c.university_id = '11111111-1111-4111-8111-111111111111'
  and c.code in ('CS-2040', 'CS-4010')
on conflict do nothing;

-- Tel Aviv, so the second tenant has a usable track too.
insert into course_tracks (course_id, track_id)
select c.id, '7ac00101-0000-4000-8000-000000000101'
from courses c
where c.university_id = '22222222-2222-4222-8222-222222222222'
on conflict do nothing;

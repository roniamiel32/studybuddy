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
-- Version:     0.9.0
--
-- Modifications:
--     0.6.0 - 2026-08-05 - Initial seed (Phase 1c)
--     0.9.0 - 2026-08-09 - Degrees added as the parent of tracks, and courses
--                          linked to their degree
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Degrees
--
-- The parent of a study track, and the unit the course API fetches a syllabus
-- for. Everything seeded here is a bachelor's programme; a master's degree is
-- included so the degree-level filter in onboarding has more than one answer and
-- the "same cohort" matching bonus has something to distinguish.
-- -----------------------------------------------------------------------------

insert into degrees (id, university_id, name, level)
values
  ('de600001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Computer Science',            'bachelors'),
  ('de600002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Data Science',                'bachelors'),
  ('de600003-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Economics',                   'bachelors'),
  ('de600004-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Psychology',                  'bachelors'),
  ('de600005-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Business Administration',     'bachelors'),
  ('de600006-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'Law',                         'bachelors'),
  ('de600007-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 'Government',                  'bachelors'),
  ('de600008-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 'Communications',              'bachelors'),
  ('de600009-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111', 'Entrepreneurship',            'bachelors'),
  ('de60000a-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'Electrical Engineering',      'bachelors'),
  ('de60000b-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111', 'Business & Computer Science', 'bachelors'),
  ('de60000c-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111', 'Economics & Computer Science','bachelors'),
  ('de60000d-0000-4000-8000-00000000000d', '11111111-1111-4111-8111-111111111111', 'Computer Science',            'masters'),
  ('de600101-0000-4000-8000-000000000101', '22222222-2222-4222-8222-222222222222', 'Computer Science',            'bachelors')
on conflict (id) do nothing;

-- The four tracks with seeded courses come first; the rest exist so the
-- dropdown reflects a real university rather than one faculty. A track with no
-- courses yet is honest — the student simply sees an empty catalog and can
-- search for whatever they are actually taking.
insert into study_tracks (id, university_id, degree_id, code, name)
values
  ('7ac00001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS',    'Computer Science'),
  ('7ac00002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'de600002-0000-4000-8000-000000000002', 'DS',    'Data Science'),
  ('7ac00003-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'de600003-0000-4000-8000-000000000003', 'ECON',  'Economics'),
  ('7ac00004-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'de600004-0000-4000-8000-000000000004', 'PSY',   'Psychology'),
  ('7ac00005-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'de600005-0000-4000-8000-000000000005', 'BA',    'Business Administration'),
  ('7ac00006-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'de600006-0000-4000-8000-000000000006', 'LAW',   'Law'),
  ('7ac00007-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 'de600007-0000-4000-8000-000000000007', 'GOV',   'Government'),
  ('7ac00008-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 'de600008-0000-4000-8000-000000000008', 'COMM',  'Communications'),
  ('7ac00009-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111', 'de600009-0000-4000-8000-000000000009', 'ENT',   'Entrepreneurship'),
  ('7ac0000a-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'de60000a-0000-4000-8000-00000000000a', 'EE',    'Electrical Engineering'),
  ('7ac0000b-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111', 'de60000b-0000-4000-8000-00000000000b', 'BIZCS', 'Business & Computer Science'),
  ('7ac0000c-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111', 'de60000c-0000-4000-8000-00000000000c', 'ECCS',  'Economics & Computer Science'),
  ('7ac00101-0000-4000-8000-000000000101', '22222222-2222-4222-8222-222222222222', 'de600101-0000-4000-8000-000000000101', 'CS',    'Computer Science')
on conflict (id) do nothing;

-- The two joint degrees genuinely share the Computer Science core, which is
-- exactly the many-to-many case this table exists for.
insert into course_tracks (course_id, track_id)
select c.id, '7ac0000b-0000-4000-8000-00000000000b'
from courses c
where c.university_id = '11111111-1111-4111-8111-111111111111'
  and c.code in ('CS-1001', 'CS-1020', 'CS-2010', 'CS-2030', 'CS-3030', 'CS-3040')
on conflict do nothing;

insert into course_tracks (course_id, track_id)
select c.id, '7ac0000c-0000-4000-8000-00000000000c'
from courses c
where c.university_id = '11111111-1111-4111-8111-111111111111'
  and c.code in ('CS-1001', 'CS-1030', 'CS-2010', 'CS-2040', 'CS-4010')
on conflict do nothing;

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

-- -----------------------------------------------------------------------------
-- Courses belong to a degree
--
-- Derived from the track mapping above, so the two never disagree. This is what
-- the Smart Course API looks up before deciding whether to generate anything.
-- -----------------------------------------------------------------------------

update courses c
set degree_id = sub.degree_id,
    source = 'seed'
from (
  select ct.course_id, min(t.degree_id::text)::uuid as degree_id
  from course_tracks ct
  join study_tracks t on t.id = ct.track_id
  group by ct.course_id
) sub
where sub.course_id = c.id;

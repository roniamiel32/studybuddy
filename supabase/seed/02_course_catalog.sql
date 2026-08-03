-- =============================================================================
-- File:        supabase/seed/02_course_catalog.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Course catalog and per-term offerings.
--
--              !! COURSE CODES ARE PLACEHOLDERS !!
--              The course NAMES are real Efi Arazi School of Computer Science
--              subjects, but the CODES were invented because the registrar's
--              real ones were not to hand. Replace them from the official
--              course list before submission: the catalog is the one place a
--              reader can check StudyBuddy against reality, and invented codes
--              are the sort of detail that undermines an otherwise solid
--              project. Only this file needs changing — nothing joins on the
--              code except this seed.
--
--              Lecturer is deliberately left NULL rather than populated with
--              invented names, because inventing the names of real academics
--              is worse than leaving the column empty.
-- Version:     0.3.0
--
-- Modifications:
--     0.3.0 - 2026-08-03 - Initial seed (Phase 1a)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Terms
--
-- Two Reichman terms on purpose. Course dashboards read the CURRENT term only,
-- and seeding a past term is what actually proves course_offerings earns its
-- place: a student who took Data Structures last semester must not surface as a
-- candidate for someone taking it now. With one term in the database that bug
-- is invisible.
-- -----------------------------------------------------------------------------

insert into terms (id, university_id, name, starts_on, ends_on, is_current)
values
  (
    'dddd0001-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '2025/26 Semester B',
    '2026-03-01',
    '2026-06-26',
    false
  ),
  (
    'dddd0002-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '2026/27 Semester A',
    '2026-10-18',
    '2027-01-29',
    true
  ),
  (
    'dddd0003-0000-4000-8000-000000000003',
    '22222222-2222-4222-8222-222222222222',
    '2026/27 Semester A',
    '2026-10-25',
    '2027-02-05',
    true
  )
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Reichman course catalog
-- -----------------------------------------------------------------------------

insert into courses (id, university_id, code, name, faculty)
values
  ('c0000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'CS-1001', 'Introduction to Computer Science',      'Efi Arazi School of Computer Science'),
  ('c0000002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'CS-1020', 'Discrete Mathematics',                  'Efi Arazi School of Computer Science'),
  ('c0000003-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'CS-1030', 'Linear Algebra',                        'Efi Arazi School of Computer Science'),
  ('c0000004-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'CS-2010', 'Data Structures',                       'Efi Arazi School of Computer Science'),
  ('c0000005-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'CS-2020', 'Algorithms',                            'Efi Arazi School of Computer Science'),
  ('c0000006-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'CS-2030', 'Object-Oriented Programming',           'Efi Arazi School of Computer Science'),
  ('c0000007-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 'CS-2040', 'Probability and Statistics',            'Efi Arazi School of Computer Science'),
  ('c0000008-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 'CS-3010', 'Computational Models',                  'Efi Arazi School of Computer Science'),
  ('c0000009-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111', 'CS-3020', 'Operating Systems',                     'Efi Arazi School of Computer Science'),
  ('c000000a-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'CS-3030', 'Database Systems',                      'Efi Arazi School of Computer Science'),
  ('c000000b-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111', 'CS-3040', 'Full-Stack Web Development',            'Efi Arazi School of Computer Science'),
  ('c000000c-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111', 'CS-4010', 'Introduction to Machine Learning',      'Efi Arazi School of Computer Science')
on conflict (id) do nothing;

-- Second tenant. Same course NAMES on purpose: if a tenancy bug ever lets a
-- join escape its university, matching students across institutions on a
-- shared course name is exactly how it would show up.
insert into courses (id, university_id, code, name, faculty)
values
  ('c0000101-0000-4000-8000-000000000101', '22222222-2222-4222-8222-222222222222', 'TAU-2010', 'Data Structures',            'School of Computer Science'),
  ('c0000102-0000-4000-8000-000000000102', '22222222-2222-4222-8222-222222222222', 'TAU-3040', 'Full-Stack Web Development', 'School of Computer Science')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Offerings
--
-- Joined on code rather than hardcoded so this section stays correct when the
-- placeholder codes above are replaced with the registrar's real ones.
-- -----------------------------------------------------------------------------

-- Current Reichman term: every course is offered.
insert into course_offerings (course_id, term_id)
select c.id, 'dddd0002-0000-4000-8000-000000000002'
from courses c
where c.university_id = '11111111-1111-4111-8111-111111111111'
on conflict (course_id, term_id) do nothing;

-- Past Reichman term: a subset, so tests can assert that an enrollment in a
-- non-current offering never appears as a candidate in the current one.
insert into course_offerings (course_id, term_id)
select c.id, 'dddd0001-0000-4000-8000-000000000001'
from courses c
where c.university_id = '11111111-1111-4111-8111-111111111111'
  and c.code in ('CS-2010', 'CS-3010', 'CS-3040')
on conflict (course_id, term_id) do nothing;

-- Current Tel Aviv term.
insert into course_offerings (course_id, term_id)
select c.id, 'dddd0003-0000-4000-8000-000000000003'
from courses c
where c.university_id = '22222222-2222-4222-8222-222222222222'
on conflict (course_id, term_id) do nothing;

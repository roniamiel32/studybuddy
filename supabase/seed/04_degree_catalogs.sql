-- =============================================================================
-- File:        supabase/seed/04_degree_catalogs.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Degree catalogs with academic years, and the placeholder degrees
--              used to prove the course list is scoped per degree.
--
--              THIS FILE IS ADDITIVE AND RE-RUNNABLE. Every statement upserts by
--              primary key, and nothing is ever deleted. That is deliberate:
--              `courses` cascades to `course_offerings` and on to `enrollments`,
--              so a DELETE here would silently unenrol real students from real
--              courses. Re-running it against a database that already has this
--              data is a no-op; running it against one that does not fills in
--              the years.
--
--              The Computer Science years are the ones the department actually
--              publishes. Every other degree here is PLACEHOLDER DATA whose
--              years were reasoned about rather than looked up — plausible
--              orderings so the year tabs have something to group, not a claim
--              about any real syllabus. Their courses carry source='placeholder'
--              so the UI keeps saying so.
--
--              COURSE CODES ARE STILL INVENTED, as 02_course_catalog.sql already
--              warns. Nothing joins on the code.
-- Version:     0.43.0
--
-- Modifications:
--     0.43.0 - 2026-08-17 - Initial seed (year grouping)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Degrees
--
-- Already seeded by 03_degrees.sql; repeated here so this file stands alone if
-- it is run against a database that has the migrations but not that seed.
-- -----------------------------------------------------------------------------

insert into degrees (id, university_id, name, level)
values
  ('de600001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Computer Science',        'bachelors'),
  ('de600003-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Economics',               'bachelors'),
  ('de600004-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Psychology',              'bachelors'),
  ('de600005-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Business Administration', 'bachelors'),
  ('de600006-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'Law',                     'bachelors')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Computer Science — the real year mapping
--
-- The first twelve rows already exist from 02_course_catalog.sql and are
-- upserted rather than re-inserted, so their ids survive and every enrollment
-- pointing at them survives with them. Three are renamed to the department's
-- own wording: 'Linear Algebra' becomes 'Linear Algebra 1' now that there is a
-- 2, 'Probability and Statistics' becomes 'Introduction to Probability', and
-- 'Introduction to Machine Learning' becomes 'Machine Learning'. Renaming keeps
-- one row per course; adding the new name alongside would have put a duplicate
-- in front of every student on the degree.
-- -----------------------------------------------------------------------------

insert into courses (id, university_id, degree_id, code, name, faculty, year, source, is_user_generated)
values
  -- Year 1 -------------------------------------------------------------------
  ('c0000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-1001', 'Introduction to Computer Science',                    'Efi Arazi School of Computer Science', 1, 'seed', false),
  ('c0000002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-1020', 'Discrete Mathematics',                               'Efi Arazi School of Computer Science', 1, 'seed', false),
  ('c0000011-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-1040', 'Infinitesimal Calculus 1',                           'Efi Arazi School of Computer Science', 1, 'seed', false),
  ('c0000003-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-1030', 'Linear Algebra 1',                                   'Efi Arazi School of Computer Science', 1, 'seed', false),
  ('c0000012-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-1090', 'Advanced English B',                                 'Efi Arazi School of Computer Science', 1, 'seed', false),
  ('c0000013-0000-4000-8000-000000000013', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-1070', 'Logic and Set Theory',                               'Efi Arazi School of Computer Science', 1, 'seed', false),
  ('c0000004-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-2010', 'Data Structures',                                    'Efi Arazi School of Computer Science', 1, 'seed', false),
  ('c0000014-0000-4000-8000-000000000014', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-1050', 'Infinitesimal Calculus 2',                           'Efi Arazi School of Computer Science', 1, 'seed', false),
  ('c0000015-0000-4000-8000-000000000015', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-1060', 'Linear Algebra 2',                                   'Efi Arazi School of Computer Science', 1, 'seed', false),
  ('c0000016-0000-4000-8000-000000000016', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-1080', 'Systems Programming in C',                           'Efi Arazi School of Computer Science', 1, 'seed', false),

  -- Year 2 -------------------------------------------------------------------
  ('c0000017-0000-4000-8000-000000000017', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-2050', 'Advanced Programming',                               'Efi Arazi School of Computer Science', 2, 'seed', false),
  ('c0000018-0000-4000-8000-000000000018', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-2060', 'Digital Architectures',                              'Efi Arazi School of Computer Science', 2, 'seed', false),
  ('c0000019-0000-4000-8000-000000000019', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-2070', 'Building Digital Systems',                           'Efi Arazi School of Computer Science', 2, 'seed', false),
  ('c0000005-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-2020', 'Algorithms',                                         'Efi Arazi School of Computer Science', 2, 'seed', false),
  ('c0000007-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-2040', 'Introduction to Probability',                        'Efi Arazi School of Computer Science', 2, 'seed', false),
  ('c000001a-0000-4000-8000-00000000001a', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-2080', 'Microeconomics',                                     'Efi Arazi School of Computer Science', 2, 'seed', false),
  ('c000001b-0000-4000-8000-00000000001b', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-2090', 'Fundamentals of Finance',                            'Efi Arazi School of Computer Science', 2, 'seed', false),
  ('c0000009-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-3020', 'Operating Systems',                                  'Efi Arazi School of Computer Science', 2, 'seed', false),
  ('c0000008-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-3010', 'Computational Models',                               'Efi Arazi School of Computer Science', 2, 'seed', false),
  ('c000000c-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-4010', 'Machine Learning',                                   'Efi Arazi School of Computer Science', 2, 'seed', false),

  -- Year 3 -------------------------------------------------------------------
  ('c000001c-0000-4000-8000-00000000001c', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-3050', 'Computability and Complexity',                       'Efi Arazi School of Computer Science', 3, 'seed', false),
  ('c000001d-0000-4000-8000-00000000001d', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-3060', 'Computer Networks',                                  'Efi Arazi School of Computer Science', 3, 'seed', false),
  ('c000001e-0000-4000-8000-00000000001e', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-3070', 'Deep Learning',                                      'Efi Arazi School of Computer Science', 3, 'seed', false),
  ('c000001f-0000-4000-8000-00000000001f', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-3080', 'Computer Graphics',                                  'Efi Arazi School of Computer Science', 3, 'seed', false),
  ('c0000020-0000-4000-8000-000000000020', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-3090', 'Software Engineering Using Artificial Intelligence Tools', 'Efi Arazi School of Computer Science', 3, 'seed', false),

  -- Already in the catalog and NOT on the published year list ------------------
  -- Kept rather than deleted: students are enrolled in these, CS-3040 is what
  -- the seeded past term and the e2e fixtures hang off, and a DELETE cascades
  -- to their enrollments. Placed in the year they are normally taken.
  ('c0000006-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-2030', 'Object-Oriented Programming',                        'Efi Arazi School of Computer Science', 2, 'seed', false),
  ('c000000a-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-3030', 'Database Systems',                                   'Efi Arazi School of Computer Science', 3, 'seed', false),
  ('c000000b-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111', 'de600001-0000-4000-8000-000000000001', 'CS-3040', 'Full-Stack Web Development',                         'Efi Arazi School of Computer Science', 3, 'seed', false)
on conflict (id) do update set
  degree_id         = excluded.degree_id,
  code              = excluded.code,
  name              = excluded.name,
  faculty           = excluded.faculty,
  year              = excluded.year,
  source            = excluded.source,
  is_user_generated = excluded.is_user_generated;

-- -----------------------------------------------------------------------------
-- Placeholder degrees
--
-- Four courses each, enough to fill two or three year tabs. The years are a
-- reasoned ordering of a normal curriculum — foundations before methods, methods
-- before application — not a real syllabus, which is what source='placeholder'
-- is telling every student who sees them.
-- -----------------------------------------------------------------------------

with proposed (id, university_id, degree_id, code, name, faculty, year) as (
values
  -- Business Administration --------------------------------------------------
  ('c0000201-0000-4000-8000-000000000201', '11111111-1111-4111-8111-111111111111', 'de600005-0000-4000-8000-000000000005', 'BA-1010', 'Principles of Management',           'Arison School of Business', 1),
  ('c0000202-0000-4000-8000-000000000202', '11111111-1111-4111-8111-111111111111', 'de600005-0000-4000-8000-000000000005', 'BA-1020', 'Financial Accounting',               'Arison School of Business', 1),
  ('c0000203-0000-4000-8000-000000000203', '11111111-1111-4111-8111-111111111111', 'de600005-0000-4000-8000-000000000005', 'BA-2010', 'Marketing Management',               'Arison School of Business', 2),
  ('c0000204-0000-4000-8000-000000000204', '11111111-1111-4111-8111-111111111111', 'de600005-0000-4000-8000-000000000005', 'BA-3010', 'Strategic Management',               'Arison School of Business', 3),

  -- Psychology ---------------------------------------------------------------
  -- Statistics before research methods before the applied clinical course: the
  -- ordering most psychology degrees use, because each is the next one's tool.
  ('c0000301-0000-4000-8000-000000000301', '11111111-1111-4111-8111-111111111111', 'de600004-0000-4000-8000-000000000004', 'PS-1010', 'Introduction to Psychology',         'Baruch Ivcher School of Psychology', 1),
  ('c0000302-0000-4000-8000-000000000302', '11111111-1111-4111-8111-111111111111', 'de600004-0000-4000-8000-000000000004', 'PS-1020', 'Statistics for Social Sciences',     'Baruch Ivcher School of Psychology', 1),
  ('c0000303-0000-4000-8000-000000000303', '11111111-1111-4111-8111-111111111111', 'de600004-0000-4000-8000-000000000004', 'PS-2010', 'Research Methods in Psychology',     'Baruch Ivcher School of Psychology', 2),
  ('c0000304-0000-4000-8000-000000000304', '11111111-1111-4111-8111-111111111111', 'de600004-0000-4000-8000-000000000004', 'PS-3010', 'Abnormal Psychology',                'Baruch Ivcher School of Psychology', 3),

  -- Law ----------------------------------------------------------------------
  ('c0000401-0000-4000-8000-000000000401', '11111111-1111-4111-8111-111111111111', 'de600006-0000-4000-8000-000000000006', 'LW-1010', 'Introduction to Legal Studies',      'Harry Radzyner Law School', 1),
  ('c0000402-0000-4000-8000-000000000402', '11111111-1111-4111-8111-111111111111', 'de600006-0000-4000-8000-000000000006', 'LW-1020', 'Contract Law',                       'Harry Radzyner Law School', 1),
  ('c0000403-0000-4000-8000-000000000403', '11111111-1111-4111-8111-111111111111', 'de600006-0000-4000-8000-000000000006', 'LW-2010', 'Constitutional Law',                 'Harry Radzyner Law School', 2),
  ('c0000404-0000-4000-8000-000000000404', '11111111-1111-4111-8111-111111111111', 'de600006-0000-4000-8000-000000000006', 'LW-3010', 'Criminal Procedure',                 'Harry Radzyner Law School', 3),

  -- Economics ----------------------------------------------------------------
  ('c0000501-0000-4000-8000-000000000501', '11111111-1111-4111-8111-111111111111', 'de600003-0000-4000-8000-000000000003', 'EC-1010', 'Principles of Microeconomics',       'Tiomkin School of Economics', 1),
  ('c0000502-0000-4000-8000-000000000502', '11111111-1111-4111-8111-111111111111', 'de600003-0000-4000-8000-000000000003', 'EC-1020', 'Principles of Macroeconomics',       'Tiomkin School of Economics', 1),
  ('c0000503-0000-4000-8000-000000000503', '11111111-1111-4111-8111-111111111111', 'de600003-0000-4000-8000-000000000003', 'EC-2010', 'Econometrics',                       'Tiomkin School of Economics', 2),
  ('c0000504-0000-4000-8000-000000000504', '11111111-1111-4111-8111-111111111111', 'de600003-0000-4000-8000-000000000003', 'EC-3010', 'Game Theory',                        'Tiomkin School of Economics', 3)
)
insert into courses (id, university_id, degree_id, code, name, faculty, year, source, is_user_generated)
select
  p.id::uuid,
  p.university_id::uuid,
  p.degree_id::uuid,
  p.code,
  p.name,
  p.faculty,
  p.year::smallint,
  'placeholder',
  false
from proposed p
-- Skip a name this degree already has.
--
-- The Smart Course API writes placeholder catalogs at RUNTIME, so a database
-- that has been clicked through already holds courses this file also proposes.
-- Inserting anyway would put two "Contract Law" rows in front of every Law
-- student and split the people who could have matched on it into two groups
-- that never meet. A fresh database skips nothing.
where not exists (
  select 1
  from courses existing
  where existing.degree_id = p.degree_id::uuid
    and lower(existing.name) = lower(p.name)
    and existing.id <> p.id::uuid
)
on conflict (id) do update set
  degree_id         = excluded.degree_id,
  code              = excluded.code,
  name              = excluded.name,
  faculty           = excluded.faculty,
  year              = excluded.year,
  source            = excluded.source,
  is_user_generated = excluded.is_user_generated;

-- -----------------------------------------------------------------------------
-- Years for the Tel Aviv catalog
--
-- Two courses, seeded to prove cross-university isolation rather than to be a
-- catalog. They still need years, or they land in "General & electives" and the
-- tabs look broken on the one degree at the other institution.
-- -----------------------------------------------------------------------------

update courses set year = 2 where id = 'c0000101-0000-4000-8000-000000000101' and year is null;
update courses set year = 3 where id = 'c0000102-0000-4000-8000-000000000102' and year is null;

-- -----------------------------------------------------------------------------
-- Offerings
--
-- A course with no offering in the current term cannot be enrolled in, so every
-- course added above needs one. Selected rather than listed, so this stays
-- correct as courses are added.
-- -----------------------------------------------------------------------------

insert into course_offerings (course_id, term_id)
select c.id, 'dddd0002-0000-4000-8000-000000000002'
from courses c
where c.university_id = '11111111-1111-4111-8111-111111111111'
on conflict (course_id, term_id) do nothing;

insert into course_offerings (course_id, term_id)
select c.id, 'dddd0003-0000-4000-8000-000000000003'
from courses c
where c.university_id = '22222222-2222-4222-8222-222222222222'
on conflict (course_id, term_id) do nothing;

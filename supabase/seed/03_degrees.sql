-- =============================================================================
-- File:        supabase/seed/03_degrees.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Degree programmes, and which degree each course belongs to.
--
--              !! CODES ARE PLACEHOLDERS, like the course codes !!
--              Replace the programme names and course codes from the official
--              catalog before submission.
--
--              Study tracks were removed: degree level and degree are the only
--              academic classification, and courses link straight to a degree.
-- Version:     0.10.0
--
-- Modifications:
--     0.6.0  - 2026-08-05 - Initial seed (Phase 1c)
--     0.9.0  - 2026-08-09 - Degrees added as the parent of tracks
--     0.10.0 - 2026-08-09 - Tracks removed; courses mapped directly to degrees
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

-- -----------------------------------------------------------------------------
-- Courses belong to a degree
--
-- Every course needs one: it is what the Smart Course API filters on, and a
-- course without a degree is invisible in the picker.
--
-- The seeded courses are the Computer Science core. Data Science, Economics and
-- the rest deliberately start EMPTY so the Smart Course API generates a list for
-- the degree actually chosen — which is the behaviour the course-filtering bug
-- was hiding. A course row carries one degree_id, so sharing a class across
-- degrees would mean duplicating the course and splitting its matching pool.
-- -----------------------------------------------------------------------------

update courses set degree_id = 'de600001-0000-4000-8000-000000000001', source = 'seed'
where university_id = '11111111-1111-4111-8111-111111111111';

update courses set degree_id = 'de600101-0000-4000-8000-000000000101', source = 'seed'
where university_id = '22222222-2222-4222-8222-222222222222';

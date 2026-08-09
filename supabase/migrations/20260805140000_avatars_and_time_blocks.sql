-- =============================================================================
-- File:        supabase/migrations/20260805140000_avatars_and_time_blocks.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Two UX-driven changes.
--
--              1. "Other" is removed from the study-hours question. It was a
--                 non-answer: a student choosing it told the matching engine
--                 nothing, and every scoring rule had to carry a special case
--                 for a value that could never overlap meaningfully.
--
--              2. Profile photos, stored in Supabase Storage rather than as
--                 bytes in a column. Postgres is a poor CDN, and images in a
--                 row make every profile query heavier for no benefit.
-- Version:     0.6.1
--
-- Modifications:
--     0.6.1 - 2026-08-05 - Remove the 'other' time block; add avatar storage
-- =============================================================================

-- -----------------------------------------------------------------------------
-- time_block loses 'other'
--
-- PostgreSQL cannot drop a value from an enum in place, so the type is rebuilt
-- and the column cast through text. Existing rows are cleaned FIRST: dropping
-- the check constraint before the update, and restoring it after, means a row
-- that held only 'other' cannot briefly violate the "at least one" rule
-- mid-migration.
-- -----------------------------------------------------------------------------

alter table learning_preferences
  drop constraint learning_preferences_preferred_time_blocks_check;

-- A student whose only answer was 'other' has expressed no usable preference.
-- Defaulting them to 'evening' would invent an answer, so they are given the
-- full set instead: "no stated preference" and "any time works" produce the
-- same matching behaviour, and only one of them is a lie.
update learning_preferences
set preferred_time_blocks =
  case
    when array_remove(preferred_time_blocks, 'other') = '{}'::time_block[]
      then array['morning', 'noon', 'evening']::time_block[]
    else array_remove(preferred_time_blocks, 'other')
  end
where 'other' = any (preferred_time_blocks);

alter type time_block rename to time_block_deprecated;

create type time_block as enum ('morning', 'noon', 'evening');

alter table learning_preferences
  alter column preferred_time_blocks type time_block[]
  using preferred_time_blocks::text[]::time_block[];

drop type time_block_deprecated;

alter table learning_preferences
  add constraint learning_preferences_preferred_time_blocks_check
  check (array_length(preferred_time_blocks, 1) between 1 and 3);

-- -----------------------------------------------------------------------------
-- Avatar storage
--
-- The bucket is public: an avatar is shown next to a student's name on every
-- match card, and signing each URL would add a round trip to every card for a
-- picture the student chose to show their classmates. Public means URL-guessable
-- rather than listable — object names are prefixed with the owner's uuid, so
-- they cannot be enumerated.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MiB. Enough for a profile photo, small enough to stop uploads of camera originals.
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "avatars are readable by anyone"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Writes are confined to a folder named after the caller's own uuid, which is
-- what stops one student overwriting another's photo.
create policy "students upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "students replace their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "students delete their own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

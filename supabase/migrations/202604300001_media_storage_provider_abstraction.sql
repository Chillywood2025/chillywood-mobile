alter table public."videos"
  add column if not exists "storage_provider" text default 'supabase'::text not null,
  add column if not exists "storage_bucket" text default 'creator-videos'::text not null,
  add column if not exists "storage_object_key" text;

update public."videos"
set
  "storage_provider" = coalesce(nullif("storage_provider", ''), 'supabase'),
  "storage_bucket" = coalesce(nullif("storage_bucket", ''), 'creator-videos'),
  "storage_object_key" = coalesce(nullif("storage_object_key", ''), nullif("storage_path", ''), nullif("playback_url", ''));

alter table public."videos"
  alter column "storage_provider" set default 'supabase',
  alter column "storage_provider" set not null,
  alter column "storage_bucket" set default 'creator-videos',
  alter column "storage_bucket" set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'videos_storage_provider_check'
  ) then
    alter table public."videos"
      add constraint "videos_storage_provider_check"
      check ("storage_provider" in ('supabase', 's3'));
  end if;
end $$;

create index if not exists "videos_storage_provider_bucket_key_idx"
  on public."videos" using btree ("storage_provider", "storage_bucket", "storage_object_key");

alter table public."social_attachments"
  add column if not exists "storage_provider" text default 'supabase'::text not null,
  add column if not exists "storage_object_key" text;

update public."social_attachments"
set
  "storage_provider" = coalesce(nullif("storage_provider", ''), 'supabase'),
  "storage_object_key" = coalesce(nullif("storage_object_key", ''), nullif("storage_path", ''));

alter table public."social_attachments"
  alter column "storage_provider" set default 'supabase',
  alter column "storage_provider" set not null;

alter table public."social_attachments"
  drop constraint if exists "social_attachments_bucket_check";

alter table public."social_attachments"
  add constraint "social_attachments_bucket_check"
  check (
    (
      "storage_provider" = 'supabase'
      and "storage_bucket" = 'social-attachments'
    )
    or (
      "storage_provider" = 's3'
      and "storage_bucket" = 'chillywood-media-prod'
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'social_attachments_storage_provider_check'
  ) then
    alter table public."social_attachments"
      add constraint "social_attachments_storage_provider_check"
      check ("storage_provider" in ('supabase', 's3'));
  end if;
end $$;

create unique index if not exists "social_attachments_provider_bucket_key_idx"
  on public."social_attachments" ("storage_provider", "storage_bucket", coalesce("storage_object_key", "storage_path"));

drop policy if exists "social_attachments_insert_own_surface" on public."social_attachments";
create policy "social_attachments_insert_own_surface"
  on public."social_attachments"
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and "owner_user_id" = auth.uid()::text
    and (
      (
        "storage_provider" = 'supabase'
        and "storage_bucket" = 'social-attachments'
      )
      or (
        "storage_provider" = 's3'
        and "storage_bucket" = 'chillywood-media-prod'
      )
    )
    and split_part(coalesce(nullif("storage_object_key", ''), "storage_path"), '/', 1) = auth.uid()::text
    and "deleted_at" is null
    and "moderation_status" = 'clean'
    and "size_bytes" <= 262144000
    and (
      (
        "surface_type" = 'profile_post'
        and exists (
          select 1
          from public."profile_posts" post
          where post."id" = "social_attachments"."surface_id"
            and post."user_id" = auth.uid()::text
            and post."deleted_at" is null
        )
      )
      or (
        "surface_type" = 'profile_post_comment'
        and exists (
          select 1
          from public."profile_post_comments" comment
          where comment."id" = "social_attachments"."surface_id"
            and comment."user_id" = auth.uid()::text
            and comment."deleted_at" is null
        )
      )
      or (
        "surface_type" = 'creator_video_comment'
        and exists (
          select 1
          from public."creator_video_comments" comment
          where comment."id" = "social_attachments"."surface_id"
            and comment."user_id" = auth.uid()::text
            and comment."deleted_at" is null
        )
      )
      or (
        "surface_type" = 'chat_message'
        and exists (
          select 1
          from public."chat_messages" message
          where message."id" = "social_attachments"."surface_id"
            and message."sender_user_id" = auth.uid()::text
            and public.can_access_chat_thread(message."thread_id")
        )
      )
      or (
        "surface_type" = 'watch_party_room_message'
        and exists (
          select 1
          from public."watch_party_room_messages" message
          where message."id" = "social_attachments"."surface_id"
            and message."user_id" = auth.uid()::text
        )
      )
    )
  );

alter table public."profile_post_comments"
  add column if not exists "parent_comment_id" uuid;

alter table public."creator_video_comments"
  add column if not exists "parent_comment_id" uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profile_post_comments_parent_comment_id_fkey'
  ) then
    alter table public."profile_post_comments"
      add constraint "profile_post_comments_parent_comment_id_fkey"
      foreign key ("parent_comment_id") references public."profile_post_comments"("id") on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profile_post_comments_parent_not_self_check'
  ) then
    alter table public."profile_post_comments"
      add constraint "profile_post_comments_parent_not_self_check"
      check ("parent_comment_id" is null or "parent_comment_id" <> "id");
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creator_video_comments_parent_comment_id_fkey'
  ) then
    alter table public."creator_video_comments"
      add constraint "creator_video_comments_parent_comment_id_fkey"
      foreign key ("parent_comment_id") references public."creator_video_comments"("id") on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creator_video_comments_parent_not_self_check'
  ) then
    alter table public."creator_video_comments"
      add constraint "creator_video_comments_parent_not_self_check"
      check ("parent_comment_id" is null or "parent_comment_id" <> "id");
  end if;
end $$;

create index if not exists "profile_post_comments_parent_created_idx"
  on public."profile_post_comments" using btree ("parent_comment_id", "created_at" asc)
  where "deleted_at" is null;

create index if not exists "creator_video_comments_parent_created_idx"
  on public."creator_video_comments" using btree ("parent_comment_id", "created_at" asc)
  where "deleted_at" is null;

create or replace function public."ensure_profile_post_comment_reply_valid"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_post_id uuid;
  parent_parent_id uuid;
  parent_deleted_at timestamp with time zone;
  parent_status text;
begin
  if new."parent_comment_id" is null then
    return new;
  end if;

  select
    parent."post_id",
    parent."parent_comment_id",
    parent."deleted_at",
    parent."moderation_status"
  into parent_post_id, parent_parent_id, parent_deleted_at, parent_status
  from public."profile_post_comments" parent
  where parent."id" = new."parent_comment_id";

  if parent_post_id is null then
    raise exception 'Parent profile post comment does not exist.';
  end if;

  if parent_post_id <> new."post_id" then
    raise exception 'Profile post replies must stay on the same post.';
  end if;

  if parent_parent_id is not null then
    raise exception 'Profile post replies are limited to one level.';
  end if;

  if parent_deleted_at is not null or parent_status not in ('clean', 'reported') then
    raise exception 'Profile post replies require a visible parent comment.';
  end if;

  return new;
end;
$$;

drop trigger if exists "profile_post_comments_reply_guard" on public."profile_post_comments";
create trigger "profile_post_comments_reply_guard"
  before insert or update of "parent_comment_id", "post_id"
  on public."profile_post_comments"
  for each row execute function public."ensure_profile_post_comment_reply_valid"();

create or replace function public."ensure_creator_video_comment_reply_valid"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_video_id uuid;
  parent_parent_id uuid;
  parent_deleted_at timestamp with time zone;
  parent_status text;
begin
  if new."parent_comment_id" is null then
    return new;
  end if;

  select
    parent."video_id",
    parent."parent_comment_id",
    parent."deleted_at",
    parent."moderation_status"
  into parent_video_id, parent_parent_id, parent_deleted_at, parent_status
  from public."creator_video_comments" parent
  where parent."id" = new."parent_comment_id";

  if parent_video_id is null then
    raise exception 'Parent creator-video comment does not exist.';
  end if;

  if parent_video_id <> new."video_id" then
    raise exception 'Creator-video replies must stay on the same video.';
  end if;

  if parent_parent_id is not null then
    raise exception 'Creator-video replies are limited to one level.';
  end if;

  if parent_deleted_at is not null or parent_status not in ('clean', 'reported') then
    raise exception 'Creator-video replies require a visible parent comment.';
  end if;

  return new;
end;
$$;

drop trigger if exists "creator_video_comments_reply_guard" on public."creator_video_comments";
create trigger "creator_video_comments_reply_guard"
  before insert or update of "parent_comment_id", "video_id"
  on public."creator_video_comments"
  for each row execute function public."ensure_creator_video_comment_reply_valid"();

insert into storage.buckets ("id", "name", "public", "file_size_limit", "allowed_mime_types")
values (
  'social-attachments',
  'social-attachments',
  false,
  262144000,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream'
  ]::text[]
)
on conflict ("id") do update
set
  "public" = excluded."public",
  "file_size_limit" = excluded."file_size_limit",
  "allowed_mime_types" = excluded."allowed_mime_types";

create table if not exists public."social_attachments" (
  "id" uuid default gen_random_uuid() not null,
  "owner_user_id" text not null,
  "surface_type" text not null,
  "surface_id" uuid not null,
  "storage_bucket" text default 'social-attachments'::text not null,
  "storage_path" text not null,
  "mime_type" text not null,
  "size_bytes" bigint default 0 not null,
  "original_file_name" text,
  "moderation_status" text default 'clean'::text not null,
  "moderation_reason" text,
  "moderated_at" timestamp with time zone,
  "moderated_by" text,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "deleted_at" timestamp with time zone,
  constraint "social_attachments_pkey" primary key ("id"),
  constraint "social_attachments_bucket_path_key" unique ("storage_bucket", "storage_path"),
  constraint "social_attachments_bucket_check" check ("storage_bucket" = 'social-attachments'),
  constraint "social_attachments_surface_type_check" check ("surface_type" in ('profile_post', 'profile_post_comment', 'creator_video_comment', 'chat_message')),
  constraint "social_attachments_size_bytes_check" check ("size_bytes" >= 0 and "size_bytes" <= 262144000),
  constraint "social_attachments_moderation_status_check" check ("moderation_status" in ('clean', 'reported', 'hidden', 'removed'))
);

create index if not exists "social_attachments_surface_idx"
  on public."social_attachments" using btree ("surface_type", "surface_id", "created_at" asc)
  where "deleted_at" is null;

create index if not exists "social_attachments_owner_created_idx"
  on public."social_attachments" using btree ("owner_user_id", "created_at" desc);

alter table public."social_attachments" enable row level security;

drop policy if exists "chat_messages_delete_own_for_attachment_rollback" on public."chat_messages";
create policy "chat_messages_delete_own_for_attachment_rollback"
  on public."chat_messages"
  for delete
  to authenticated
  using (
    auth.uid() is not null
    and "sender_user_id" = auth.uid()::text
    and public.can_access_chat_thread("thread_id")
  );

drop policy if exists "social_attachments_select_authorized" on public."social_attachments";
create policy "social_attachments_select_authorized"
  on public."social_attachments"
  for select
  to public
  using (
    "deleted_at" is null
    and "moderation_status" in ('clean', 'reported')
    and (
      (
        auth.uid() is not null
        and "owner_user_id" = auth.uid()::text
      )
      or public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
      or (
        "surface_type" = 'profile_post'
        and exists (
          select 1
          from public."profile_posts" post
          where post."id" = "social_attachments"."surface_id"
            and post."deleted_at" is null
            and post."visibility" = 'public'
            and post."moderation_status" in ('clean', 'reported')
        )
      )
      or (
        "surface_type" = 'profile_post_comment'
        and exists (
          select 1
          from public."profile_post_comments" comment
          join public."profile_posts" post on post."id" = comment."post_id"
          where comment."id" = "social_attachments"."surface_id"
            and comment."deleted_at" is null
            and comment."moderation_status" in ('clean', 'reported')
            and post."deleted_at" is null
            and post."visibility" = 'public'
            and post."moderation_status" in ('clean', 'reported')
        )
      )
      or (
        "surface_type" = 'creator_video_comment'
        and exists (
          select 1
          from public."creator_video_comments" comment
          join public."videos" video on video."id" = comment."video_id"
          where comment."id" = "social_attachments"."surface_id"
            and comment."deleted_at" is null
            and comment."moderation_status" in ('clean', 'reported')
            and video."visibility" = 'public'
            and video."moderation_status" in ('clean', 'reported')
        )
      )
      or (
        "surface_type" = 'chat_message'
        and auth.uid() is not null
        and exists (
          select 1
          from public."chat_messages" message
          where message."id" = "social_attachments"."surface_id"
            and public.can_access_chat_thread(message."thread_id")
        )
      )
    )
  );

drop policy if exists "social_attachments_insert_own_surface" on public."social_attachments";
create policy "social_attachments_insert_own_surface"
  on public."social_attachments"
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and "owner_user_id" = auth.uid()::text
    and "storage_bucket" = 'social-attachments'
    and split_part("storage_path", '/', 1) = auth.uid()::text
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
    )
  );

drop policy if exists "social_attachments_delete_own_or_operator" on public."social_attachments";
create policy "social_attachments_delete_own_or_operator"
  on public."social_attachments"
  for delete
  to authenticated
  using (
    (
      auth.uid() is not null
      and "owner_user_id" = auth.uid()::text
    )
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

drop policy if exists "social_attachments_storage_owner_insert" on storage.objects;
create policy "social_attachments_storage_owner_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'social-attachments'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists "social_attachments_storage_owner_update" on storage.objects;
create policy "social_attachments_storage_owner_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'social-attachments'
    and (storage.foldername(name))[1] = (auth.uid())::text
  )
  with check (
    bucket_id = 'social-attachments'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists "social_attachments_storage_owner_delete" on storage.objects;
create policy "social_attachments_storage_owner_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'social-attachments'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists "social_attachments_storage_select_authorized" on storage.objects;
create policy "social_attachments_storage_select_authorized"
  on storage.objects
  for select
  to public
  using (
    bucket_id = 'social-attachments'
    and exists (
      select 1
      from public."social_attachments" attachment
      where attachment."storage_bucket" = storage.objects.bucket_id
        and attachment."storage_path" = storage.objects.name
        and attachment."deleted_at" is null
        and attachment."moderation_status" in ('clean', 'reported')
        and (
          (
            auth.uid() is not null
            and attachment."owner_user_id" = auth.uid()::text
          )
          or public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
          or (
            attachment."surface_type" = 'profile_post'
            and exists (
              select 1
              from public."profile_posts" post
              where post."id" = attachment."surface_id"
                and post."deleted_at" is null
                and post."visibility" = 'public'
                and post."moderation_status" in ('clean', 'reported')
            )
          )
          or (
            attachment."surface_type" = 'profile_post_comment'
            and exists (
              select 1
              from public."profile_post_comments" comment
              join public."profile_posts" post on post."id" = comment."post_id"
              where comment."id" = attachment."surface_id"
                and comment."deleted_at" is null
                and comment."moderation_status" in ('clean', 'reported')
                and post."deleted_at" is null
                and post."visibility" = 'public'
                and post."moderation_status" in ('clean', 'reported')
            )
          )
          or (
            attachment."surface_type" = 'creator_video_comment'
            and exists (
              select 1
              from public."creator_video_comments" comment
              join public."videos" video on video."id" = comment."video_id"
              where comment."id" = attachment."surface_id"
                and comment."deleted_at" is null
                and comment."moderation_status" in ('clean', 'reported')
                and video."visibility" = 'public'
                and video."moderation_status" in ('clean', 'reported')
            )
          )
          or (
            attachment."surface_type" = 'chat_message'
            and auth.uid() is not null
            and exists (
              select 1
              from public."chat_messages" message
              where message."id" = attachment."surface_id"
                and public.can_access_chat_thread(message."thread_id")
            )
          )
        )
    )
  );

alter table public."safety_reports"
  drop constraint if exists "safety_reports_target_type_check";

alter table public."safety_reports"
  add constraint "safety_reports_target_type_check"
  check ("target_type" in ('participant', 'room', 'title', 'creator_video', 'profile_post', 'profile_post_comment', 'creator_video_comment', 'social_attachment'));

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."social_attachments" to "anon";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."social_attachments" to "authenticated";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."social_attachments" to "postgres";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."social_attachments" to "service_role";

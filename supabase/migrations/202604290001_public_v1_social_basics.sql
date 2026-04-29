create table if not exists public."profile_posts" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" text not null,
  "body" text not null,
  "visibility" text default 'public'::text not null,
  "moderation_status" text default 'clean'::text not null,
  "moderation_reason" text,
  "moderated_at" timestamp with time zone,
  "moderated_by" text,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "deleted_at" timestamp with time zone,
  constraint "profile_posts_pkey" primary key ("id"),
  constraint "profile_posts_body_length_check" check (char_length(trim("body")) between 1 and 500),
  constraint "profile_posts_visibility_check" check ("visibility" in ('public', 'draft')),
  constraint "profile_posts_moderation_status_check" check ("moderation_status" in ('clean', 'reported', 'hidden', 'removed'))
);

create index if not exists "profile_posts_user_created_idx"
  on public."profile_posts" using btree ("user_id", "created_at" desc);

create index if not exists "profile_posts_public_moderation_created_idx"
  on public."profile_posts" using btree ("visibility", "moderation_status", "created_at" desc)
  where "deleted_at" is null;

alter table public."profile_posts" enable row level security;

drop policy if exists "profile_posts_select_public_clean_or_owner" on public."profile_posts";
create policy "profile_posts_select_public_clean_or_owner"
  on public."profile_posts"
  for select
  to public
  using (
    (
      "deleted_at" is null
      and "visibility" = 'public'
      and "moderation_status" in ('clean', 'reported')
    )
    or (
      auth.uid() is not null
      and "user_id" = auth.uid()::text
      and "deleted_at" is null
    )
    or public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
  );

drop policy if exists "profile_posts_insert_own_clean" on public."profile_posts";
create policy "profile_posts_insert_own_clean"
  on public."profile_posts"
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and "user_id" = auth.uid()::text
    and "deleted_at" is null
    and "moderation_status" = 'clean'
    and "visibility" in ('public', 'draft')
  );

drop policy if exists "profile_posts_delete_own_or_operator" on public."profile_posts";
create policy "profile_posts_delete_own_or_operator"
  on public."profile_posts"
  for delete
  to authenticated
  using (
    (
      auth.uid() is not null
      and "user_id" = auth.uid()::text
    )
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

create table if not exists public."creator_video_comments" (
  "id" uuid default gen_random_uuid() not null,
  "video_id" uuid not null,
  "user_id" text not null,
  "body" text not null,
  "moderation_status" text default 'clean'::text not null,
  "moderation_reason" text,
  "moderated_at" timestamp with time zone,
  "moderated_by" text,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "deleted_at" timestamp with time zone,
  constraint "creator_video_comments_pkey" primary key ("id"),
  constraint "creator_video_comments_video_id_fkey" foreign key ("video_id") references public."videos"("id") on delete cascade,
  constraint "creator_video_comments_body_length_check" check (char_length(trim("body")) between 1 and 500),
  constraint "creator_video_comments_moderation_status_check" check ("moderation_status" in ('clean', 'reported', 'hidden', 'removed'))
);

create index if not exists "creator_video_comments_video_created_idx"
  on public."creator_video_comments" using btree ("video_id", "created_at" desc);

create index if not exists "creator_video_comments_user_created_idx"
  on public."creator_video_comments" using btree ("user_id", "created_at" desc);

alter table public."creator_video_comments" enable row level security;

drop policy if exists "creator_video_comments_select_public_clean_or_owner" on public."creator_video_comments";
create policy "creator_video_comments_select_public_clean_or_owner"
  on public."creator_video_comments"
  for select
  to public
  using (
    (
      "deleted_at" is null
      and "moderation_status" in ('clean', 'reported')
      and exists (
        select 1
        from public."videos" video
        where video."id" = "creator_video_comments"."video_id"
          and video."visibility" = 'public'
          and video."moderation_status" in ('clean', 'reported')
      )
    )
    or (
      auth.uid() is not null
      and "user_id" = auth.uid()::text
      and "deleted_at" is null
    )
    or public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
  );

drop policy if exists "creator_video_comments_insert_own_on_public_video" on public."creator_video_comments";
create policy "creator_video_comments_insert_own_on_public_video"
  on public."creator_video_comments"
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and "user_id" = auth.uid()::text
    and "deleted_at" is null
    and "moderation_status" = 'clean'
    and exists (
      select 1
      from public."videos" video
      where video."id" = "creator_video_comments"."video_id"
        and video."visibility" = 'public'
        and video."moderation_status" in ('clean', 'reported')
    )
  );

drop policy if exists "creator_video_comments_delete_own_or_operator" on public."creator_video_comments";
create policy "creator_video_comments_delete_own_or_operator"
  on public."creator_video_comments"
  for delete
  to authenticated
  using (
    (
      auth.uid() is not null
      and "user_id" = auth.uid()::text
    )
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

alter table public."safety_reports"
  drop constraint if exists "safety_reports_target_type_check";

alter table public."safety_reports"
  add constraint "safety_reports_target_type_check"
  check ("target_type" in ('participant', 'room', 'title', 'creator_video', 'profile_post', 'creator_video_comment'));

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."profile_posts" to "anon";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."profile_posts" to "authenticated";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."profile_posts" to "postgres";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."profile_posts" to "service_role";

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."creator_video_comments" to "anon";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."creator_video_comments" to "authenticated";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."creator_video_comments" to "postgres";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."creator_video_comments" to "service_role";

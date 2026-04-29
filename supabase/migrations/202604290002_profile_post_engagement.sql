create table if not exists public."profile_post_comments" (
  "id" uuid default gen_random_uuid() not null,
  "post_id" uuid not null,
  "user_id" text not null,
  "body" text not null,
  "moderation_status" text default 'clean'::text not null,
  "moderation_reason" text,
  "moderated_at" timestamp with time zone,
  "moderated_by" text,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "deleted_at" timestamp with time zone,
  constraint "profile_post_comments_pkey" primary key ("id"),
  constraint "profile_post_comments_post_id_fkey" foreign key ("post_id") references public."profile_posts"("id") on delete cascade,
  constraint "profile_post_comments_body_length_check" check (char_length(trim("body")) between 1 and 500),
  constraint "profile_post_comments_moderation_status_check" check ("moderation_status" in ('clean', 'reported', 'hidden', 'removed'))
);

create index if not exists "profile_post_comments_post_created_idx"
  on public."profile_post_comments" using btree ("post_id", "created_at" asc)
  where "deleted_at" is null;

create index if not exists "profile_post_comments_user_created_idx"
  on public."profile_post_comments" using btree ("user_id", "created_at" desc);

alter table public."profile_post_comments" enable row level security;

drop policy if exists "profile_post_comments_select_public_clean_or_owner" on public."profile_post_comments";
create policy "profile_post_comments_select_public_clean_or_owner"
  on public."profile_post_comments"
  for select
  to public
  using (
    (
      "deleted_at" is null
      and "moderation_status" in ('clean', 'reported')
      and exists (
        select 1
        from public."profile_posts" post
        where post."id" = "profile_post_comments"."post_id"
          and post."deleted_at" is null
          and post."visibility" = 'public'
          and post."moderation_status" in ('clean', 'reported')
      )
    )
    or (
      auth.uid() is not null
      and "user_id" = auth.uid()::text
      and "deleted_at" is null
    )
    or public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
  );

drop policy if exists "profile_post_comments_insert_own_on_public_clean_post" on public."profile_post_comments";
create policy "profile_post_comments_insert_own_on_public_clean_post"
  on public."profile_post_comments"
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and "user_id" = auth.uid()::text
    and "deleted_at" is null
    and "moderation_status" = 'clean'
    and exists (
      select 1
      from public."profile_posts" post
      where post."id" = "profile_post_comments"."post_id"
        and post."deleted_at" is null
        and post."visibility" = 'public'
        and post."moderation_status" = 'clean'
    )
  );

drop policy if exists "profile_post_comments_delete_own_post_owner_or_operator" on public."profile_post_comments";
create policy "profile_post_comments_delete_own_post_owner_or_operator"
  on public."profile_post_comments"
  for delete
  to authenticated
  using (
    (
      auth.uid() is not null
      and "user_id" = auth.uid()::text
    )
    or (
      auth.uid() is not null
      and exists (
        select 1
        from public."profile_posts" post
        where post."id" = "profile_post_comments"."post_id"
          and post."user_id" = auth.uid()::text
      )
    )
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

create table if not exists public."profile_post_likes" (
  "post_id" uuid not null,
  "user_id" text not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "profile_post_likes_pkey" primary key ("post_id", "user_id"),
  constraint "profile_post_likes_post_id_fkey" foreign key ("post_id") references public."profile_posts"("id") on delete cascade
);

create index if not exists "profile_post_likes_user_created_idx"
  on public."profile_post_likes" using btree ("user_id", "created_at" desc);

alter table public."profile_post_likes" enable row level security;

drop policy if exists "profile_post_likes_select_public_clean" on public."profile_post_likes";
create policy "profile_post_likes_select_public_clean"
  on public."profile_post_likes"
  for select
  to public
  using (
    exists (
      select 1
      from public."profile_posts" post
      where post."id" = "profile_post_likes"."post_id"
        and post."deleted_at" is null
        and post."visibility" = 'public'
        and post."moderation_status" in ('clean', 'reported')
    )
    or (
      auth.uid() is not null
      and "user_id" = auth.uid()::text
    )
    or public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
  );

drop policy if exists "profile_post_likes_insert_own_on_public_clean_post" on public."profile_post_likes";
create policy "profile_post_likes_insert_own_on_public_clean_post"
  on public."profile_post_likes"
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and "user_id" = auth.uid()::text
    and exists (
      select 1
      from public."profile_posts" post
      where post."id" = "profile_post_likes"."post_id"
        and post."deleted_at" is null
        and post."visibility" = 'public'
        and post."moderation_status" = 'clean'
    )
  );

drop policy if exists "profile_post_likes_delete_own" on public."profile_post_likes";
create policy "profile_post_likes_delete_own"
  on public."profile_post_likes"
  for delete
  to authenticated
  using (
    auth.uid() is not null
    and "user_id" = auth.uid()::text
  );

alter table public."safety_reports"
  drop constraint if exists "safety_reports_target_type_check";

alter table public."safety_reports"
  add constraint "safety_reports_target_type_check"
  check ("target_type" in ('participant', 'room', 'title', 'creator_video', 'profile_post', 'profile_post_comment', 'creator_video_comment'));

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."profile_post_comments" to "anon";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."profile_post_comments" to "authenticated";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."profile_post_comments" to "postgres";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."profile_post_comments" to "service_role";

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."profile_post_likes" to "anon";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."profile_post_likes" to "authenticated";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."profile_post_likes" to "postgres";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."profile_post_likes" to "service_role";

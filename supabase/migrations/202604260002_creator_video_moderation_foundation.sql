alter table public."videos"
  add column if not exists "moderation_status" text default 'clean'::text not null,
  add column if not exists "moderated_at" timestamp with time zone,
  add column if not exists "moderated_by" text,
  add column if not exists "moderation_reason" text;

update public."videos"
set "moderation_status" = coalesce(nullif("moderation_status", ''), 'clean');

alter table public."videos"
  alter column "moderation_status" set default 'clean',
  alter column "moderation_status" set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'videos_moderation_status_check'
  ) then
    alter table public."videos"
      add constraint "videos_moderation_status_check"
      check ("moderation_status" in ('clean', 'pending_review', 'reported', 'hidden', 'removed', 'banned'));
  end if;
end $$;

create index if not exists "videos_owner_visibility_moderation_created_idx"
  on public."videos" using btree ("owner_id", "visibility", "moderation_status", "created_at" desc);

create or replace function public.protect_creator_video_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    old."moderation_status" is distinct from new."moderation_status"
    or old."moderated_at" is distinct from new."moderated_at"
    or old."moderated_by" is distinct from new."moderated_by"
    or old."moderation_reason" is distinct from new."moderation_reason"
  ) and not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception 'Only owner/operator admin roles can update creator video moderation fields.';
  end if;

  return new;
end;
$$;

drop trigger if exists "protect_creator_video_moderation_fields_trigger" on public."videos";
create trigger "protect_creator_video_moderation_fields_trigger"
  before update on public."videos"
  for each row
  execute function public.protect_creator_video_moderation_fields();

drop policy if exists "videos_select_public_or_owner" on public."videos";
drop policy if exists "videos_select_public_owner_or_reviewer" on public."videos";
create policy "videos_select_public_owner_or_reviewer"
  on public."videos"
  for select
  to public
  using (
    (
      "visibility" = 'public'
      and "moderation_status" in ('clean', 'reported')
    )
    or ((auth.uid() is not null) and ("owner_id" = auth.uid()))
    or public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
  );

drop policy if exists "videos_update_operator_moderation" on public."videos";
create policy "videos_update_operator_moderation"
  on public."videos"
  for update
  to public
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_videos_storage_select_public_or_owner" on storage.objects;
create policy "creator_videos_storage_select_public_or_owner"
  on storage.objects
  for select
  to public
  using (
    bucket_id = 'creator-videos'
    and (
      ((auth.uid() is not null) and ((storage.foldername(name))[1] = (auth.uid())::text))
      or exists (
        select 1
        from public."videos" video
        where video."visibility" = 'public'
          and video."moderation_status" in ('clean', 'reported')
          and (
            video."storage_path" = storage.objects.name
            or video."thumb_storage_path" = storage.objects.name
          )
      )
    )
  );

alter table public."safety_reports"
  drop constraint if exists "safety_reports_target_type_check";

alter table public."safety_reports"
  add constraint "safety_reports_target_type_check"
  check ("target_type" in ('participant', 'room', 'title', 'creator_video'));

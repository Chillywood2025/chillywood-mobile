alter table public."videos"
  add column if not exists "visibility" text default 'draft'::text not null,
  add column if not exists "storage_path" text,
  add column if not exists "thumb_storage_path" text,
  add column if not exists "mime_type" text,
  add column if not exists "file_size_bytes" bigint,
  add column if not exists "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null;

update public."videos"
set "visibility" = coalesce(nullif("visibility", ''), 'draft');

alter table public."videos"
  alter column "visibility" set default 'draft',
  alter column "visibility" set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'videos_visibility_check'
  ) then
    alter table public."videos"
      add constraint "videos_visibility_check"
      check ("visibility" in ('draft', 'public'));
  end if;
end $$;

create index if not exists "videos_owner_visibility_created_idx"
  on public."videos" using btree ("owner_id", "visibility", "created_at" desc);

drop policy if exists "Public videos readable" on public."videos";
drop policy if exists "videos_select_public_or_owner" on public."videos";
create policy "videos_select_public_or_owner"
  on public."videos"
  for select
  to public
  using (
    "visibility" = 'public'
    or ((auth.uid() is not null) and ("owner_id" = auth.uid()))
  );

drop policy if exists "Users can update own videos" on public."videos";
create policy "Users can update own videos"
  on public."videos"
  for update
  to public
  using ((auth.uid() is not null) and ("owner_id" = auth.uid()))
  with check ((auth.uid() is not null) and ("owner_id" = auth.uid()));

insert into storage.buckets ("id", "name", "public", "file_size_limit", "allowed_mime_types")
values (
  'creator-videos',
  'creator-videos',
  false,
  524288000,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']::text[]
)
on conflict ("id") do update
set
  "public" = excluded."public",
  "file_size_limit" = excluded."file_size_limit",
  "allowed_mime_types" = excluded."allowed_mime_types";

drop policy if exists "creator_videos_storage_owner_insert" on storage.objects;
create policy "creator_videos_storage_owner_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists "creator_videos_storage_owner_update" on storage.objects;
create policy "creator_videos_storage_owner_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = (auth.uid())::text
  )
  with check (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists "creator_videos_storage_owner_delete" on storage.objects;
create policy "creator_videos_storage_owner_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

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
          and (
            video."storage_path" = storage.objects.name
            or video."thumb_storage_path" = storage.objects.name
          )
      )
    )
  );

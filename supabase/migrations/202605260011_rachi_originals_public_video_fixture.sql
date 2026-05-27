create table if not exists public."official_rachi_original_videos" (
  "video_id" uuid primary key references public."videos"("id") on delete cascade,
  "official_account_id" text not null default 'platform_rachi_official',
  "status" text not null default 'published',
  "source_attribution" text,
  "proof_scope" text,
  "created_by_user_id" uuid,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "official_rachi_original_videos_account_check"
    check ("official_account_id" = 'platform_rachi_official'),
  constraint "official_rachi_original_videos_status_check"
    check ("status" in ('draft', 'published', 'hidden', 'removed'))
);

create index if not exists "official_rachi_original_videos_status_updated_idx"
  on public."official_rachi_original_videos" ("official_account_id", "status", "updated_at" desc);

alter table public."official_rachi_original_videos" enable row level security;

drop policy if exists "official_rachi_original_videos_select_published" on public."official_rachi_original_videos";
create policy "official_rachi_original_videos_select_published"
  on public."official_rachi_original_videos"
  for select
  to public
  using (
    "official_account_id" = 'platform_rachi_official'
    and "status" = 'published'
    and exists (
      select 1
      from public."videos" video
      where video."id" = public."official_rachi_original_videos"."video_id"
        and video."visibility" = 'public'
        and video."moderation_status" in ('clean', 'reported')
    )
  );

drop policy if exists "official_rachi_original_videos_operator_manage" on public."official_rachi_original_videos";
create policy "official_rachi_original_videos_operator_manage"
  on public."official_rachi_original_videos"
  for all
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

grant select on table public."official_rachi_original_videos" to anon;
grant select on table public."official_rachi_original_videos" to authenticated;
grant all on table public."official_rachi_original_videos" to service_role;

comment on table public."official_rachi_original_videos" is
  'Official Rachi Originals link table. Public surfaces may read only published links, and the public card resolver still requires the linked creator video to be public and clean/reported.';

comment on column public."official_rachi_original_videos"."proof_scope" is
  'Optional proof/test scope label. Proof rows must stay honest and use public-safe media attribution.';

do $$
declare
  rachi_original_video_id uuid := '6e1c3405-7db8-4cb2-98f3-5a7642e82126';
  rachi_original_owner_uuid uuid := '0f53ad26-0b27-4f7f-9d6f-000000000001';
  rachi_original_owner_text text := 'platform_rachi_official';
  videos_owner_udt text;
begin
  select column_udt.udt_name
  into videos_owner_udt
  from information_schema.columns column_udt
  where column_udt.table_schema = 'public'
    and column_udt.table_name = 'videos'
    and column_udt.column_name = 'owner_id'
  limit 1;

  if videos_owner_udt = 'uuid' then
    insert into public."videos" (
      "id",
      "owner_id",
      "title",
      "description",
      "playback_url",
      "thumb_url",
      "visibility",
      "moderation_status",
      "storage_provider",
      "storage_bucket",
      "storage_object_key",
      "storage_path",
      "thumb_storage_path",
      "mime_type",
      "file_size_bytes",
      "created_at",
      "updated_at"
    ) values (
      rachi_original_video_id,
      rachi_original_owner_uuid,
      'Chi''llwood Originals Proof Fixture',
      'Proof-scoped public-safe Rachi Original fixture using Big Buck Bunny by Blender Foundation, CC BY 3.0.',
      'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
      'https://peach.blender.org/wp-content/uploads/title_anouncement.jpg?x11217',
      'public',
      'clean',
      'supabase',
      'creator-videos',
      null,
      null,
      null,
      'video/mp4',
      null,
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    )
    on conflict ("id") do update
    set
      "title" = excluded."title",
      "description" = excluded."description",
      "playback_url" = excluded."playback_url",
      "thumb_url" = excluded."thumb_url",
      "visibility" = excluded."visibility",
      "moderation_status" = excluded."moderation_status",
      "storage_provider" = excluded."storage_provider",
      "storage_bucket" = excluded."storage_bucket",
      "storage_object_key" = excluded."storage_object_key",
      "storage_path" = excluded."storage_path",
      "thumb_storage_path" = excluded."thumb_storage_path",
      "mime_type" = excluded."mime_type",
      "file_size_bytes" = excluded."file_size_bytes",
      "updated_at" = excluded."updated_at";
  else
    execute $sql$
      insert into public."videos" (
        "id",
        "owner_id",
        "title",
        "description",
        "playback_url",
        "thumb_url",
        "visibility",
        "moderation_status",
        "storage_provider",
        "storage_bucket",
        "storage_object_key",
        "storage_path",
        "thumb_storage_path",
        "mime_type",
        "file_size_bytes",
        "created_at",
        "updated_at"
      ) values (
        $1,
        $2,
        'Chi''llwood Originals Proof Fixture',
        'Proof-scoped public-safe Rachi Original fixture using Big Buck Bunny by Blender Foundation, CC BY 3.0.',
        'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
        'https://peach.blender.org/wp-content/uploads/title_anouncement.jpg?x11217',
        'public',
        'clean',
        'supabase',
        'creator-videos',
        null,
        null,
        null,
        'video/mp4',
        null,
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
      )
      on conflict ("id") do update
      set
        "owner_id" = excluded."owner_id",
        "title" = excluded."title",
        "description" = excluded."description",
        "playback_url" = excluded."playback_url",
        "thumb_url" = excluded."thumb_url",
        "visibility" = excluded."visibility",
        "moderation_status" = excluded."moderation_status",
        "storage_provider" = excluded."storage_provider",
        "storage_bucket" = excluded."storage_bucket",
        "storage_object_key" = excluded."storage_object_key",
        "storage_path" = excluded."storage_path",
        "thumb_storage_path" = excluded."thumb_storage_path",
        "mime_type" = excluded."mime_type",
        "file_size_bytes" = excluded."file_size_bytes",
        "updated_at" = excluded."updated_at";
    $sql$ using rachi_original_video_id, rachi_original_owner_text;
  end if;

  insert into public."official_rachi_original_videos" (
    "video_id",
    "official_account_id",
    "status",
    "source_attribution",
    "proof_scope",
    "updated_at"
  ) values (
    rachi_original_video_id,
    'platform_rachi_official',
    'published',
    'Big Buck Bunny by Blender Foundation, CC BY 3.0.',
    'rachi_originals_public_video_fixture_20260526',
    timezone('utc'::text, now())
  )
  on conflict ("video_id") do update
  set
    "official_account_id" = excluded."official_account_id",
    "status" = excluded."status",
    "source_attribution" = excluded."source_attribution",
    "proof_scope" = excluded."proof_scope",
    "updated_at" = excluded."updated_at";
end $$;

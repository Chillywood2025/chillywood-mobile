insert into storage.buckets ("id", "name", "public", "file_size_limit", "allowed_mime_types")
values (
  'platform-brand-assets',
  'platform-brand-assets',
  false,
  262144000,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]::text[]
)
on conflict ("id") do update
set
  "public" = false,
  "file_size_limit" = excluded."file_size_limit",
  "allowed_mime_types" = excluded."allowed_mime_types";

create table if not exists public."platform_brand_assets" (
  "id" uuid primary key default gen_random_uuid(),
  "owner_user_id" text not null,
  "asset_type" text not null,
  "asset_state" text not null default 'draft',
  "storage_provider" text not null default 'supabase',
  "storage_bucket" text not null default 'platform-brand-assets',
  "storage_object_key" text not null,
  "storage_path" text not null,
  "mime_type" text not null,
  "width" integer,
  "height" integer,
  "duration_ms" integer,
  "file_size_bytes" bigint not null default 0,
  "original_file_name" text,
  "moderation_status" text not null default 'pending_review',
  "moderation_reason" text,
  "moderated_at" timestamptz,
  "moderated_by" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "deleted_at" timestamptz,
  constraint "platform_brand_assets_owner_nonempty_check" check (btrim("owner_user_id") <> ''),
  constraint "platform_brand_assets_type_check" check (
    "asset_type" in (
      'hero_image',
      'hero_video',
      'hero_poster',
      'background_image',
      'avatar',
      'logo',
      'watermark'
    )
  ),
  constraint "platform_brand_assets_state_check" check ("asset_state" in ('draft', 'published', 'archived')),
  constraint "platform_brand_assets_provider_check" check ("storage_provider" in ('supabase', 's3')),
  constraint "platform_brand_assets_bucket_check" check ("storage_bucket" = 'platform-brand-assets'),
  constraint "platform_brand_assets_mime_check" check (
    "mime_type" in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'video/webm'
    )
  ),
  constraint "platform_brand_assets_moderation_check" check (
    "moderation_status" in ('pending_review', 'clean', 'reported', 'hidden', 'removed', 'rejected')
  ),
  constraint "platform_brand_assets_dimensions_check" check (
    ("width" is null or "width" >= 0)
    and ("height" is null or "height" >= 0)
    and ("duration_ms" is null or "duration_ms" >= 0)
    and "file_size_bytes" >= 0
  ),
  constraint "platform_brand_assets_path_unique" unique ("storage_bucket", "storage_path")
);

create index if not exists "platform_brand_assets_owner_type_updated_idx"
  on public."platform_brand_assets" ("owner_user_id", "asset_type", "updated_at" desc)
  where "deleted_at" is null;

create index if not exists "platform_brand_assets_public_safe_idx"
  on public."platform_brand_assets" ("asset_state", "moderation_status", "updated_at" desc)
  where "deleted_at" is null;

create table if not exists public."platform_brand_profiles" (
  "owner_user_id" text primary key,
  "hero_image_asset_id" uuid references public."platform_brand_assets"("id") on delete set null,
  "hero_video_asset_id" uuid references public."platform_brand_assets"("id") on delete set null,
  "hero_poster_asset_id" uuid references public."platform_brand_assets"("id") on delete set null,
  "background_image_asset_id" uuid references public."platform_brand_assets"("id") on delete set null,
  "avatar_asset_id" uuid references public."platform_brand_assets"("id") on delete set null,
  "logo_asset_id" uuid references public."platform_brand_assets"("id") on delete set null,
  "watermark_asset_id" uuid references public."platform_brand_assets"("id") on delete set null,
  "spotlight_video_id" text,
  "theme_preset" text not null default 'city_night',
  "accent_color" text not null default '#DC143C',
  "hero_fit_mode" text not null default 'fill',
  "hero_focal_x" numeric not null default 0.5,
  "hero_focal_y" numeric not null default 0.5,
  "hero_crop_scale" numeric not null default 1,
  "background_fit_mode" text not null default 'fill',
  "background_focal_x" numeric not null default 0.5,
  "background_focal_y" numeric not null default 0.5,
  "overlay_strength" numeric not null default 0.7,
  "blur_strength" numeric not null default 0,
  "published_at" timestamptz,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "platform_brand_profiles_owner_nonempty_check" check (btrim("owner_user_id") <> ''),
  constraint "platform_brand_profiles_theme_check" check (
    "theme_preset" in ('city_night', 'studio_red', 'clean_dark', 'spotlight', 'classic')
  ),
  constraint "platform_brand_profiles_accent_check" check ("accent_color" ~ '^#[0-9A-Fa-f]{6}$'),
  constraint "platform_brand_profiles_hero_fit_check" check ("hero_fit_mode" in ('fill', 'fit', 'center')),
  constraint "platform_brand_profiles_background_fit_check" check ("background_fit_mode" in ('fill', 'fit', 'center')),
  constraint "platform_brand_profiles_crop_check" check (
    "hero_focal_x" between 0 and 1
    and "hero_focal_y" between 0 and 1
    and "hero_crop_scale" between 1 and 3
    and "background_focal_x" between 0 and 1
    and "background_focal_y" between 0 and 1
    and "overlay_strength" between 0 and 1
    and "blur_strength" between 0 and 1
  )
);

create index if not exists "platform_brand_profiles_published_idx"
  on public."platform_brand_profiles" ("published_at" desc)
  where "published_at" is not null;

create or replace function public."touch_platform_brand_updated_at"()
returns trigger
language plpgsql
as $$
begin
  new."updated_at" = now();
  return new;
end;
$$;

drop trigger if exists "touch_platform_brand_assets_updated_at" on public."platform_brand_assets";
create trigger "touch_platform_brand_assets_updated_at"
  before update on public."platform_brand_assets"
  for each row execute function public."touch_platform_brand_updated_at"();

drop trigger if exists "touch_platform_brand_profiles_updated_at" on public."platform_brand_profiles";
create trigger "touch_platform_brand_profiles_updated_at"
  before update on public."platform_brand_profiles"
  for each row execute function public."touch_platform_brand_updated_at"();

create or replace function public."guard_platform_brand_asset_client_update"()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' then
    if new."owner_user_id" is distinct from old."owner_user_id"
      or new."asset_type" is distinct from old."asset_type"
      or new."storage_provider" is distinct from old."storage_provider"
      or new."storage_bucket" is distinct from old."storage_bucket"
      or new."storage_object_key" is distinct from old."storage_object_key"
      or new."storage_path" is distinct from old."storage_path"
      or new."mime_type" is distinct from old."mime_type"
      or new."width" is distinct from old."width"
      or new."height" is distinct from old."height"
      or new."duration_ms" is distinct from old."duration_ms"
      or new."file_size_bytes" is distinct from old."file_size_bytes"
      or new."original_file_name" is distinct from old."original_file_name"
      or new."moderation_status" is distinct from old."moderation_status"
      or new."moderation_reason" is distinct from old."moderation_reason"
      or new."moderated_at" is distinct from old."moderated_at"
      or new."moderated_by" is distinct from old."moderated_by"
    then
      raise exception 'Platform brand asset safety fields cannot be changed by the client.';
    end if;

    if new."asset_state" = 'published' and old."moderation_status" not in ('clean', 'reported') then
      raise exception 'Platform brand asset must pass review before publishing.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists "guard_platform_brand_asset_client_update" on public."platform_brand_assets";
create trigger "guard_platform_brand_asset_client_update"
  before update on public."platform_brand_assets"
  for each row execute function public."guard_platform_brand_asset_client_update"();

create or replace function public."assert_platform_brand_profile_references"()
returns trigger
language plpgsql
as $$
declare
  asset_id uuid;
  asset_ids uuid[];
begin
  asset_ids := array[
    new."hero_image_asset_id",
    new."hero_video_asset_id",
    new."hero_poster_asset_id",
    new."background_image_asset_id",
    new."avatar_asset_id",
    new."logo_asset_id",
    new."watermark_asset_id"
  ];

  foreach asset_id in array asset_ids loop
    if asset_id is null then
      continue;
    end if;

    if not exists (
      select 1
      from public."platform_brand_assets" asset
      where asset."id" = asset_id
        and asset."owner_user_id" = new."owner_user_id"
        and asset."deleted_at" is null
    ) then
      raise exception 'Platform brand asset does not belong to this platform.';
    end if;
  end loop;

  if nullif(btrim(coalesce(new."spotlight_video_id", '')), '') is not null
    and not exists (
      select 1
      from public."videos" video
      where video."id" = new."spotlight_video_id"
        and video."owner_id" = new."owner_user_id"
        and video."visibility" = 'public'
        and video."moderation_status" in ('clean', 'reported')
    )
  then
    raise exception 'Spotlight video must be a public reviewed upload owned by this platform.';
  end if;

  return new;
end;
$$;

drop trigger if exists "assert_platform_brand_profile_references" on public."platform_brand_profiles";
create trigger "assert_platform_brand_profile_references"
  before insert or update on public."platform_brand_profiles"
  for each row execute function public."assert_platform_brand_profile_references"();

alter table public."platform_brand_assets" enable row level security;
alter table public."platform_brand_profiles" enable row level security;

drop policy if exists "platform_brand_assets_select_owner_or_public_safe" on public."platform_brand_assets";
create policy "platform_brand_assets_select_owner_or_public_safe"
  on public."platform_brand_assets" for select to anon, authenticated
  using (
    "deleted_at" is null
    and (
      "owner_user_id" = auth.uid()::text
      or (
        "asset_state" = 'published'
        and "moderation_status" in ('clean', 'reported')
      )
    )
  );

drop policy if exists "platform_brand_assets_insert_owner_draft" on public."platform_brand_assets";
create policy "platform_brand_assets_insert_owner_draft"
  on public."platform_brand_assets" for insert to authenticated
  with check (
    "owner_user_id" = auth.uid()::text
    and "asset_state" = 'draft'
    and "moderation_status" = 'pending_review'
    and "deleted_at" is null
  );

drop policy if exists "platform_brand_assets_update_owner_safe_fields" on public."platform_brand_assets";
create policy "platform_brand_assets_update_owner_safe_fields"
  on public."platform_brand_assets" for update to authenticated
  using ("owner_user_id" = auth.uid()::text)
  with check ("owner_user_id" = auth.uid()::text);

drop policy if exists "platform_brand_assets_delete_owner_draft" on public."platform_brand_assets";
create policy "platform_brand_assets_delete_owner_draft"
  on public."platform_brand_assets" for delete to authenticated
  using ("owner_user_id" = auth.uid()::text and "asset_state" <> 'published');

drop policy if exists "platform_brand_profiles_select_owner" on public."platform_brand_profiles";
create policy "platform_brand_profiles_select_owner"
  on public."platform_brand_profiles" for select to authenticated
  using ("owner_user_id" = auth.uid()::text);

drop policy if exists "platform_brand_profiles_write_owner" on public."platform_brand_profiles";
create policy "platform_brand_profiles_write_owner"
  on public."platform_brand_profiles" for all to authenticated
  using ("owner_user_id" = auth.uid()::text)
  with check ("owner_user_id" = auth.uid()::text);

drop policy if exists "platform_brand_storage_select_owner_or_public_safe" on storage.objects;
create policy "platform_brand_storage_select_owner_or_public_safe"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'platform-brand-assets'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or exists (
        select 1
        from public."platform_brand_assets" asset
        where asset."storage_bucket" = storage.objects.bucket_id
          and asset."storage_path" = storage.objects.name
          and asset."asset_state" = 'published'
          and asset."moderation_status" in ('clean', 'reported')
          and asset."deleted_at" is null
      )
    )
  );

drop policy if exists "platform_brand_storage_insert_owner_prefix" on storage.objects;
create policy "platform_brand_storage_insert_owner_prefix"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'platform-brand-assets'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "platform_brand_storage_update_owner_prefix" on storage.objects;
create policy "platform_brand_storage_update_owner_prefix"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'platform-brand-assets'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'platform-brand-assets'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "platform_brand_storage_delete_owner_prefix" on storage.objects;
create policy "platform_brand_storage_delete_owner_prefix"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'platform-brand-assets'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create or replace function public."read_public_platform_brand_profile"(profile_user_id text)
returns table (
  owner_user_id text,
  hero_image_asset_id uuid,
  hero_video_asset_id uuid,
  hero_poster_asset_id uuid,
  background_image_asset_id uuid,
  avatar_asset_id uuid,
  logo_asset_id uuid,
  watermark_asset_id uuid,
  spotlight_video_id text,
  theme_preset text,
  accent_color text,
  hero_fit_mode text,
  hero_focal_x numeric,
  hero_focal_y numeric,
  hero_crop_scale numeric,
  background_fit_mode text,
  background_focal_x numeric,
  background_focal_y numeric,
  overlay_strength numeric,
  blur_strength numeric,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile."owner_user_id",
    profile."hero_image_asset_id",
    profile."hero_video_asset_id",
    profile."hero_poster_asset_id",
    profile."background_image_asset_id",
    profile."avatar_asset_id",
    profile."logo_asset_id",
    profile."watermark_asset_id",
    profile."spotlight_video_id",
    profile."theme_preset",
    profile."accent_color",
    profile."hero_fit_mode",
    profile."hero_focal_x",
    profile."hero_focal_y",
    profile."hero_crop_scale",
    profile."background_fit_mode",
    profile."background_focal_x",
    profile."background_focal_y",
    profile."overlay_strength",
    profile."blur_strength",
    profile."published_at",
    profile."updated_at"
  from public."platform_brand_profiles" profile
  where profile."owner_user_id" = nullif(btrim(coalesce(profile_user_id, '')), '')
    and profile."published_at" is not null
  limit 1;
$$;

revoke all on function public."read_public_platform_brand_profile"(text) from public;
grant execute on function public."read_public_platform_brand_profile"(text) to anon;
grant execute on function public."read_public_platform_brand_profile"(text) to authenticated;
grant execute on function public."read_public_platform_brand_profile"(text) to service_role;

revoke all on table public."platform_brand_assets" from anon, authenticated;
grant select on table public."platform_brand_assets" to anon;
grant select, insert, update, delete on table public."platform_brand_assets" to authenticated;
grant all on table public."platform_brand_assets" to service_role;

revoke all on table public."platform_brand_profiles" from anon, authenticated;
grant select, insert, update, delete on table public."platform_brand_profiles" to authenticated;
grant all on table public."platform_brand_profiles" to service_role;

comment on table public."platform_brand_assets" is
  'Creator-owned Platform Brand Studio assets. Public reads require published state, moderation-safe status, and storage RLS; draft/pending assets remain owner-only.';

comment on table public."platform_brand_profiles" is
  'Creator-owned Platform Brand Studio presentation metadata. Public reads use read_public_platform_brand_profile so draft-only fields and object internals are not exposed.';

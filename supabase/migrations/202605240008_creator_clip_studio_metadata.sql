insert into storage.buckets ("id", "name", "public", "file_size_limit", "allowed_mime_types")
values (
  'creator-videos',
  'creator-videos',
  false,
  5368709120,
  array[
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-m4v',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict ("id") do update
set
  "public" = false,
  "file_size_limit" = greatest(storage.buckets."file_size_limit", excluded."file_size_limit"),
  "allowed_mime_types" = excluded."allowed_mime_types";

create table if not exists public."creator_clip_edits" (
  "video_id" uuid primary key references public."videos"("id") on delete cascade,
  "owner_user_id" text not null,
  "clip_format" text not null default 'vertical_9_16',
  "fit_mode" text not null default 'fill',
  "trim_start_ms" integer,
  "trim_end_ms" integer,
  "cover_storage_path" text,
  "cover_mime_type" text,
  "cover_file_size_bytes" bigint,
  "title_overlay_text" text,
  "title_overlay_subtitle" text,
  "title_overlay_position" text not null default 'bottom',
  "title_overlay_style" text not null default 'clean',
  "template_preset" text not null default 'highlight',
  "brand_mark_enabled" boolean not null default false,
  "brand_asset_id" uuid references public."platform_brand_assets"("id") on delete set null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "creator_clip_edits_owner_nonempty_check" check (btrim("owner_user_id") <> ''),
  constraint "creator_clip_edits_format_check" check ("clip_format" in ('vertical_9_16', 'square_1_1', 'landscape_16_9')),
  constraint "creator_clip_edits_fit_check" check ("fit_mode" in ('fill', 'fit', 'center')),
  constraint "creator_clip_edits_trim_check" check (
    ("trim_start_ms" is null or "trim_start_ms" >= 0)
    and ("trim_end_ms" is null or "trim_end_ms" >= 0)
    and (
      "trim_start_ms" is null
      or "trim_end_ms" is null
      or "trim_end_ms" > "trim_start_ms"
    )
  ),
  constraint "creator_clip_edits_cover_mime_check" check (
    "cover_mime_type" is null
    or "cover_mime_type" in ('image/jpeg', 'image/png', 'image/webp')
  ),
  constraint "creator_clip_edits_cover_size_check" check (
    "cover_file_size_bytes" is null or "cover_file_size_bytes" >= 0
  ),
  constraint "creator_clip_edits_overlay_position_check" check ("title_overlay_position" in ('top', 'center', 'bottom')),
  constraint "creator_clip_edits_overlay_style_check" check ("title_overlay_style" in ('clean', 'bold', 'spotlight')),
  constraint "creator_clip_edits_template_check" check (
    "template_preset" in ('trailer', 'highlight', 'promo', 'event', 'reaction', 'platform_intro')
  )
);

create index if not exists "creator_clip_edits_owner_updated_idx"
  on public."creator_clip_edits" ("owner_user_id", "updated_at" desc);

create or replace function public."touch_creator_clip_edits_updated_at"()
returns trigger
language plpgsql
as $$
begin
  new."updated_at" = now();
  return new;
end;
$$;

drop trigger if exists "touch_creator_clip_edits_updated_at" on public."creator_clip_edits";
create trigger "touch_creator_clip_edits_updated_at"
  before update on public."creator_clip_edits"
  for each row execute function public."touch_creator_clip_edits_updated_at"();

create or replace function public."assert_creator_clip_edit_references"()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public."videos" video
    where video."id" = new."video_id"
      and video."owner_id" = new."owner_user_id"
  ) then
    raise exception 'Clip Studio edit must belong to a creator video owned by this account.';
  end if;

  if new."cover_storage_path" is not null
    and not exists (
      select 1
      from public."videos" video
      where video."id" = new."video_id"
        and video."owner_id" = new."owner_user_id"
        and video."thumb_storage_path" = new."cover_storage_path"
    )
  then
    raise exception 'Clip Studio cover must match the saved creator-video cover path.';
  end if;

  if coalesce(new."brand_mark_enabled", false) then
    if new."brand_asset_id" is null then
      raise exception 'Clip Studio brand mark requires an approved published Platform asset.';
    end if;

    if not exists (
      select 1
      from public."platform_brand_assets" asset
      where asset."id" = new."brand_asset_id"
        and asset."owner_user_id" = new."owner_user_id"
        and asset."asset_type" in ('avatar', 'logo', 'watermark')
        and asset."asset_state" = 'published'
        and asset."moderation_status" in ('clean', 'reported')
        and asset."deleted_at" is null
    ) then
      raise exception 'Clip Studio brand mark must be an approved published Platform asset.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists "assert_creator_clip_edit_references" on public."creator_clip_edits";
create trigger "assert_creator_clip_edit_references"
  before insert or update on public."creator_clip_edits"
  for each row execute function public."assert_creator_clip_edit_references"();

alter table public."creator_clip_edits" enable row level security;

drop policy if exists "creator_clip_edits_select_owner" on public."creator_clip_edits";
create policy "creator_clip_edits_select_owner"
  on public."creator_clip_edits" for select to authenticated
  using ("owner_user_id" = auth.uid()::text);

drop policy if exists "creator_clip_edits_insert_owner" on public."creator_clip_edits";
create policy "creator_clip_edits_insert_owner"
  on public."creator_clip_edits" for insert to authenticated
  with check ("owner_user_id" = auth.uid()::text);

drop policy if exists "creator_clip_edits_update_owner" on public."creator_clip_edits";
create policy "creator_clip_edits_update_owner"
  on public."creator_clip_edits" for update to authenticated
  using ("owner_user_id" = auth.uid()::text)
  with check ("owner_user_id" = auth.uid()::text);

drop policy if exists "creator_clip_edits_delete_owner" on public."creator_clip_edits";
create policy "creator_clip_edits_delete_owner"
  on public."creator_clip_edits" for delete to authenticated
  using ("owner_user_id" = auth.uid()::text);

revoke all on table public."creator_clip_edits" from anon, authenticated;
grant select, insert, update, delete on table public."creator_clip_edits" to authenticated;
grant all on table public."creator_clip_edits" to service_role;

comment on table public."creator_clip_edits" is
  'Owner-only Clip Studio preparation metadata. Crop, trim, title overlay, template, and brand mark choices are not public rendering contracts until a backed renderer explicitly reads them.';

comment on column public."creator_clip_edits"."trim_start_ms" is
  'Reserved for real trim/export support. The MVP stores no fake trim result and the client keeps trim/export unavailable.';

comment on column public."creator_clip_edits"."brand_asset_id" is
  'Optional Platform brand mark reference. When enabled, the asset must be owner-owned, published, moderation-safe, and not deleted.';

-- Historical draft upserts resend the publication timestamp they last read.
-- Remember committed timestamps so a stale draft can be saved without rolling
-- server publication metadata back. Unknown timestamps are not publication
-- authority: old Publish uses the same write shape as Save Draft.
create table public.platform_brand_publication_metadata (
  owner_user_id text not null references public.platform_brand_profiles(owner_user_id) on delete cascade,
  published_at timestamptz not null,
  primary key (owner_user_id, published_at)
);
alter table public.platform_brand_publication_metadata enable row level security;
alter table public.platform_brand_publication_metadata force row level security;
revoke all on table public.platform_brand_publication_metadata from public, anon, authenticated, service_role;
grant select on table public.platform_brand_publication_metadata to authenticated, service_role;
-- RLS runs as the table caller; keep private session helpers behind this
-- caller-bounded boolean gate instead of granting their execution to clients.
create function public.platform_brand_publication_metadata_read_allowed(p_owner_user_id text)
returns boolean language sql volatile security definer set search_path = ''
as $$
  select coalesce(p_owner_user_id = auth.uid()::text
    and public.whole_app_exact_current_session_authority_internal()
    and not public.is_account_access_restricted(auth.uid()::text)
    and exists (select 1 from auth.users subject join auth.sessions session_row
      on session_row.user_id = subject.id
      where subject.id = auth.uid() and subject.deleted_at is null
        and session_row.id::text = auth.jwt() ->> 'session_id'
        and (session_row.not_after is null or session_row.not_after > clock_timestamp())), false);
$$;
revoke all on function public.platform_brand_publication_metadata_read_allowed(text)
  from public, anon, authenticated, service_role;
grant execute on function public.platform_brand_publication_metadata_read_allowed(text) to authenticated;
create policy platform_brand_publication_metadata_read_own
  on public.platform_brand_publication_metadata for select to authenticated
  using (public.platform_brand_publication_metadata_read_allowed(owner_user_id));
insert into public.platform_brand_publication_metadata (owner_user_id, published_at)
  select owner_user_id, published_at from public.platform_brand_publications
  where published_at is not null;

create function public.record_platform_brand_publication_metadata()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.published_at is not null then
    insert into public.platform_brand_publication_metadata (owner_user_id, published_at)
      values (new.owner_user_id, new.published_at) on conflict do nothing;
  end if;
  return null;
end;
$$;
revoke all on function public.record_platform_brand_publication_metadata()
  from public, anon, authenticated, service_role;
create trigger record_platform_brand_publication_metadata
  after insert or update on public.platform_brand_publications
  for each row execute function public.record_platform_brand_publication_metadata();

create or replace function public.guard_platform_brand_profile_publication_metadata()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user = 'service_role'
    or current_user::regrole::oid = (
      select relation.relowner from pg_catalog.pg_class relation where relation.oid = tg_relid
    ) then return new; end if;
  if new.published_at is not null and not exists (
    select 1 from public.platform_brand_publication_metadata known
    where known.owner_user_id = new.owner_user_id and known.published_at = new.published_at
  ) then
    raise exception using errcode = '42501', message = 'brand_publish_rpc_required',
      detail = 'Update the app to Publish. For an older cached draft, reload Studio before saving.';
  end if;
  -- BEFORE INSERT normalization also becomes EXCLUDED on an upsert. The
  -- UPDATE leg preserves its locked OLD row, including a concurrent Publish.
  if tg_op = 'INSERT' then new.published_at := null;
  else new.published_at := old.published_at; end if;
  return new;
end;
$$;
drop trigger guard_platform_brand_profile_publication_metadata on public.platform_brand_profiles;
create trigger guard_platform_brand_profile_publication_metadata
  before insert or update on public.platform_brand_profiles
  for each row execute function public.guard_platform_brand_profile_publication_metadata();

-- The initial snapshot was copied from the former mixed draft/public row.
-- Keep only media that was already public-safe at cutover. Otherwise a later
-- asset review could expose a former draft without a completed Publish.
update public.platform_brand_publications snapshot set
  hero_image_asset_id = case when public.platform_brand_publication_asset_safe_internal(hero_image_asset_id, owner_user_id) then hero_image_asset_id end,
  hero_video_asset_id = case when public.platform_brand_publication_asset_safe_internal(hero_video_asset_id, owner_user_id) then hero_video_asset_id end,
  hero_poster_asset_id = case when public.platform_brand_publication_asset_safe_internal(hero_poster_asset_id, owner_user_id) then hero_poster_asset_id end,
  background_image_asset_id = case when public.platform_brand_publication_asset_safe_internal(background_image_asset_id, owner_user_id) then background_image_asset_id end,
  avatar_asset_id = case when public.platform_brand_publication_asset_safe_internal(avatar_asset_id, owner_user_id) then avatar_asset_id end,
  logo_asset_id = case when public.platform_brand_publication_asset_safe_internal(logo_asset_id, owner_user_id) then logo_asset_id end,
  watermark_asset_id = case when public.platform_brand_publication_asset_safe_internal(watermark_asset_id, owner_user_id) then watermark_asset_id end,
  spotlight_video_id = case when exists (
    select 1 from public.videos video where video.id::text = snapshot.spotlight_video_id
      and video.owner_id::text = snapshot.owner_user_id and video.visibility = 'public'
      and video.moderation_status in ('clean', 'reported')
      and public.media_scan_public_safe(video.scan_status) and video.quarantined_at is null
  ) then spotlight_video_id end;

-- Retain the existing review/audit implementation behind the atomic Publish
-- authority. An old direct call fails before any asset or review mutation.
alter function public.publish_platform_brand_profile_assets(uuid[],text)
  rename to publish_platform_brand_profile_assets_internal;
revoke all on function public.publish_platform_brand_profile_assets_internal(uuid[],text)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_platform_brand_profile_assets_internal(uuid[],text) to service_role;
create function public.publish_platform_brand_profile_assets(
  p_asset_ids uuid[], p_reason text default 'Approved by the creator during Brand Studio publish.'
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user <> 'service_role'
    and current_user::regrole::oid <> (
      select relation.relowner from pg_catalog.pg_class relation
      where relation.oid = 'public.platform_brand_profiles'::regclass
    ) then
    raise exception using errcode = '42501', message = 'brand_publish_rpc_required',
      detail = 'Update the app to Publish. Draft editing remains available.';
  end if;
  return public.publish_platform_brand_profile_assets_internal(p_asset_ids, p_reason);
end;
$$;
revoke all on function public.publish_platform_brand_profile_assets(uuid[],text)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_platform_brand_profile_assets(uuid[],text) to authenticated, service_role;

create function public.platform_brand_published_object_visible_internal(
  p_owner_user_id text, p_bucket text, p_object_key text
)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_brand_publications snapshot
      join public.platform_brand_assets asset on asset.id = any(array[
        snapshot.hero_image_asset_id, snapshot.hero_video_asset_id, snapshot.hero_poster_asset_id,
        snapshot.background_image_asset_id, snapshot.avatar_asset_id, snapshot.logo_asset_id, snapshot.watermark_asset_id
      ])
    where snapshot.owner_user_id = p_owner_user_id and snapshot.published_at is not null
      and asset.owner_user_id = snapshot.owner_user_id
      and asset.storage_bucket = p_bucket and asset.storage_object_key = p_object_key
      and public.platform_brand_publication_asset_safe_internal(asset.id, snapshot.owner_user_id)
      and (snapshot.owner_user_id = 'platform_rachi_official' or exists (
        select 1 from auth.users subject where subject.id::text = snapshot.owner_user_id and subject.deleted_at is null
      ))
      and coalesce((public.resolve_platform_visibility_access(snapshot.owner_user_id, auth.uid()::text) ->> 'allowed')::boolean, false)
      and (auth.uid() is null or not public.has_channel_audience_block_between(snapshot.owner_user_id, auth.uid()::text))
  );
$$;
revoke all on function public.platform_brand_published_object_visible_internal(text,text,text)
  from public, anon, authenticated, service_role;

-- An owner must be able to satisfy UPDATE's SELECT check on the archived
-- result row. That metadata visibility must not become permission to restore
-- a removed file or reset its retention timestamp through a later request.
create function public.guard_platform_brand_asset_archive_transition()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user = 'service_role' or current_user::regrole::oid = (
    select relation.relowner from pg_catalog.pg_class relation where relation.oid = tg_relid
  ) then return new; end if;
  if old.asset_state = 'archived' or old.deleted_at is not null then
    if new.asset_state is distinct from 'archived'
      or (old.deleted_at is not null and new.deleted_at is null) then
      raise exception using errcode = '42501', message = 'brand_archived_asset_restore_forbidden';
    end if;
    if old.deleted_at is not null then new.deleted_at := old.deleted_at; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_platform_brand_asset_archive_transition()
  from public, anon, authenticated, service_role;
create trigger guard_platform_brand_asset_archive_transition
  before update on public.platform_brand_assets
  for each row execute function public.guard_platform_brand_asset_archive_transition();

create or replace function public.platform_brand_asset_row_access_allowed(
  p_owner_user_id text, p_asset_state text, p_moderation_status text, p_scan_status text,
  p_storage_provider text, p_storage_bucket text, p_storage_object_key text, p_storage_path text,
  p_quarantined_at timestamptz, p_deleted_at timestamptz
)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare v_actor_id text := auth.uid()::text;
begin
  if p_quarantined_at is not null
    or nullif(btrim(coalesce(p_owner_user_id, '')), '') is null
    or lower(btrim(coalesce(p_storage_provider, ''))) <> 'supabase'
    or p_storage_bucket is distinct from 'platform-brand-assets'
    or nullif(btrim(coalesce(p_storage_object_key, '')), '') is null
    or p_storage_object_key is distinct from p_storage_path
    or (storage.foldername(p_storage_path))[1] is distinct from p_owner_user_id
  then return false; end if;
  if p_deleted_at is not null then
    return p_asset_state = 'archived'
      and public.platform_brand_publication_metadata_read_allowed(p_owner_user_id);
  end if;
  if p_asset_state = 'published' and p_moderation_status in ('clean', 'reported')
    and public.media_scan_public_safe(p_scan_status)
    and public.platform_brand_published_object_visible_internal(p_owner_user_id, p_storage_bucket, p_storage_object_key)
  then return true; end if;
  if v_actor_id is null or not public.whole_app_exact_current_session_authority_internal()
    or public.is_account_access_restricted(v_actor_id)
  then return false; end if;
  if p_owner_user_id = v_actor_id then return true; end if;
  return public.has_platform_role(array['owner'::text, 'operator'::text])
    or public.has_platform_permission('content_moderation')
    or public.has_platform_permission('reports_review');
exception when others then return false;
end;
$$;

create or replace function public.platform_brand_asset_public_safe(p_asset_id uuid, p_owner_user_id text default null)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_brand_assets asset
    where asset.id = p_asset_id and (p_owner_user_id is null or asset.owner_user_id = p_owner_user_id)
      and public.platform_brand_publication_asset_safe_internal(asset.id, asset.owner_user_id)
      and public.platform_brand_published_object_visible_internal(asset.owner_user_id, asset.storage_bucket, asset.storage_object_key)
  );
$$;

create or replace function public.platform_brand_storage_access_allowed(p_bucket text, p_object_key text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  v_bucket text := coalesce(p_bucket, '');
  v_object_key text := nullif(btrim(coalesce(p_object_key, '')), '');
  v_actor_id text := auth.uid()::text;
begin
  if v_bucket <> 'platform-brand-assets' or v_object_key is null then return false; end if;
  return exists (
    select 1 from public.platform_brand_assets asset
    where lower(btrim(coalesce(asset.storage_provider, ''))) = 'supabase'
      and asset.storage_bucket = v_bucket and asset.storage_object_key = v_object_key
      and asset.storage_path = v_object_key
      and (storage.foldername(v_object_key))[1] = asset.owner_user_id
      and asset.quarantined_at is null and asset.deleted_at is null
      and (
        (public.platform_brand_publication_asset_safe_internal(asset.id, asset.owner_user_id)
          and public.platform_brand_published_object_visible_internal(asset.owner_user_id, v_bucket, v_object_key))
        or (v_actor_id is not null and asset.owner_user_id = v_actor_id
          and public.whole_app_exact_current_session_authority_internal()
          and not public.is_account_access_restricted(v_actor_id))
      )
  );
exception when others then return false;
end;
$$;

comment on table public.platform_brand_publication_metadata is
  'Server-recorded publication timestamps accepted as cached draft metadata. Clients cannot create publication authority through this table.';
comment on function public.publish_platform_brand_profile_assets(uuid[],text) is
  'Compatibility endpoint: direct legacy Publish requires an app update; atomic Publish retains the existing asset review/audit workflow.';

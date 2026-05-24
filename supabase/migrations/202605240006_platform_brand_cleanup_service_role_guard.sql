create or replace function public."platform_brand_asset_cleanup_candidates"(
  p_retention_days integer default 30,
  p_limit integer default 100
)
returns table (
  asset_id uuid,
  owner_user_id text,
  asset_type text,
  asset_state text,
  moderation_status text,
  storage_bucket text,
  storage_path text,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz,
  cleanup_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'platform_brand_cleanup_service_role_required';
  end if;

  return query
  with settings as (
    select
      greatest(7, least(365, coalesce(p_retention_days, 30)))::integer as retention_days,
      greatest(1, least(500, coalesce(p_limit, 100)))::integer as result_limit
  ),
  referenced_assets as (
    select distinct refs.asset_id
    from public."platform_brand_profiles" profile
    cross join lateral (
      values
        (profile."hero_image_asset_id"),
        (profile."hero_video_asset_id"),
        (profile."hero_poster_asset_id"),
        (profile."background_image_asset_id"),
        (profile."avatar_asset_id"),
        (profile."logo_asset_id"),
        (profile."watermark_asset_id")
    ) as refs(asset_id)
    where refs.asset_id is not null
  ),
  candidates as (
    select
      asset."id" as candidate_asset_id,
      asset."owner_user_id" as candidate_owner_user_id,
      asset."asset_type" as candidate_asset_type,
      asset."asset_state" as candidate_asset_state,
      asset."moderation_status" as candidate_moderation_status,
      asset."storage_bucket" as candidate_storage_bucket,
      asset."storage_path" as candidate_storage_path,
      asset."created_at" as candidate_created_at,
      asset."updated_at" as candidate_updated_at,
      asset."deleted_at" as candidate_deleted_at,
      case
        when asset."deleted_at" is not null then 'deleted_asset_retained'
        when asset."asset_state" = 'archived' then 'archived_asset_retained'
        when asset."moderation_status" in ('rejected', 'removed', 'hidden') then 'moderation_terminal_retained'
        when asset."asset_state" = 'draft'
          and asset."moderation_status" = 'pending_review'
          and asset."updated_at" < timezone('utc'::text, now()) - (settings.retention_days::text || ' days')::interval
          then 'orphaned_old_draft_pending_review'
        else null
      end as candidate_cleanup_reason,
      settings.result_limit
    from public."platform_brand_assets" asset
    cross join settings
    left join referenced_assets referenced on referenced.asset_id = asset."id"
    where referenced.asset_id is null
      and asset."asset_state" <> 'published'
  )
  select
    candidates.candidate_asset_id,
    candidates.candidate_owner_user_id,
    candidates.candidate_asset_type,
    candidates.candidate_asset_state,
    candidates.candidate_moderation_status,
    candidates.candidate_storage_bucket,
    candidates.candidate_storage_path,
    candidates.candidate_created_at,
    candidates.candidate_updated_at,
    candidates.candidate_deleted_at,
    candidates.candidate_cleanup_reason
  from candidates
  where candidates.candidate_cleanup_reason is not null
  order by candidates.candidate_updated_at asc
  limit (select result_limit from settings);
end;
$$;

revoke all on function public."platform_brand_asset_cleanup_candidates"(integer, integer) from public;
grant execute on function public."platform_brand_asset_cleanup_candidates"(integer, integer) to service_role;

comment on function public."platform_brand_asset_cleanup_candidates"(integer, integer) is
  'Service-role-only helper that lists Brand Studio assets eligible for manual storage cleanup. It raises for anon/authenticated callers, never returns published assets or assets still referenced by Platform brand profiles, and does not delete storage objects.';

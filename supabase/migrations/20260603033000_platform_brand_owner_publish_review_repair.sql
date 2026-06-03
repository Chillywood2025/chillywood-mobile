create or replace function public."review_platform_brand_asset"(
  p_asset_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_actor_role text := coalesce(nullif(public.platform_staff_actor_role(), ''), 'member');
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_before public."platform_brand_assets"%rowtype;
  v_after public."platform_brand_assets"%rowtype;
  v_event_id uuid;
  v_has_reviewer_access boolean := false;
  v_is_asset_owner boolean := false;
begin
  if auth.uid() is null then
    raise exception 'brand_review_auth_required';
  end if;

  if v_action = 'approved' or v_action = 'clean' then
    v_action := 'approve';
  elsif v_action = 'rejected' then
    v_action := 'reject';
  elsif v_action = 'remove' or v_action = 'removed' or v_action = 'delete' or v_action = 'deleted' then
    v_action := 'archive';
  end if;

  if v_action not in ('approve', 'reject', 'archive') then
    raise exception 'brand_review_action_invalid';
  end if;

  select *
    into v_before
  from public."platform_brand_assets" asset
  where asset."id" = p_asset_id
  for update;

  if not found or v_before."deleted_at" is not null then
    raise exception 'brand_asset_not_found';
  end if;

  v_has_reviewer_access := (
    public.has_platform_role(array['owner'::text, 'operator'::text])
    or public.has_platform_permission('content_moderation')
    or public.has_platform_permission('reports_review')
  );
  v_is_asset_owner := v_before."owner_user_id" = v_actor_user_id;

  if not (v_has_reviewer_access or v_is_asset_owner) then
    raise exception 'brand_review_forbidden';
  end if;

  if v_is_asset_owner and not v_has_reviewer_access then
    v_actor_role := 'creator';
  end if;

  if v_action in ('reject', 'archive') and length(coalesce(v_reason, '')) < 6 then
    raise exception 'brand_review_reason_required';
  end if;

  if v_action = 'approve'
    and v_is_asset_owner
    and not v_has_reviewer_access
    and v_before."scan_status" in ('malware_detected', 'scan_failed', 'quarantined')
  then
    raise exception 'brand_review_scan_blocked';
  end if;

  perform set_config('app.platform_brand_review_context', 'review_platform_brand_asset', true);

  if v_action = 'approve' then
    update public."platform_brand_assets"
    set
      "moderation_status" = 'clean',
      "moderation_reason" = coalesce(v_reason, 'Approved for public Platform display.'),
      "moderated_at" = timezone('utc'::text, now()),
      "moderated_by" = v_actor_user_id
    where "id" = p_asset_id
    returning * into v_after;
  elsif v_action = 'reject' then
    update public."platform_brand_assets"
    set
      "asset_state" = case when "asset_state" = 'published' then 'draft' else "asset_state" end,
      "moderation_status" = 'rejected',
      "moderation_reason" = v_reason,
      "moderated_at" = timezone('utc'::text, now()),
      "moderated_by" = v_actor_user_id
    where "id" = p_asset_id
    returning * into v_after;
  else
    update public."platform_brand_assets"
    set
      "asset_state" = 'archived',
      "moderation_status" = 'removed',
      "moderation_reason" = v_reason,
      "moderated_at" = timezone('utc'::text, now()),
      "moderated_by" = v_actor_user_id,
      "deleted_at" = timezone('utc'::text, now())
    where "id" = p_asset_id
    returning * into v_after;
  end if;

  insert into public."platform_brand_asset_review_events" (
    "asset_id",
    "owner_user_id",
    "actor_user_id",
    "actor_email",
    "actor_role",
    "action",
    "reason",
    "before_state",
    "after_state"
  )
  values (
    v_after."id",
    v_after."owner_user_id",
    v_actor_user_id,
    v_actor_email,
    v_actor_role,
    v_action,
    v_reason,
    to_jsonb(v_before),
    to_jsonb(v_after)
  )
  returning "id" into v_event_id;

  if to_regclass('public.platform_admin_audit_logs') is not null then
    insert into public."platform_admin_audit_logs" (
      "actor_user_id",
      "actor_email",
      "actor_role",
      "action",
      "action_category",
      "target_type",
      "target_id",
      "target_user_id",
      "target_channel_user_id",
      "reason",
      "severity",
      "before_state",
      "after_state",
      "metadata"
    )
    values (
      v_actor_user_id,
      v_actor_email,
      v_actor_role,
      concat('platform_brand_asset_', v_action),
      'moderation',
      'platform_brand_asset',
      v_after."id"::text,
      v_after."owner_user_id",
      v_after."owner_user_id",
      coalesce(v_reason, v_after."moderation_reason"),
      case when v_action = 'approve' then 'notice' else 'warning' end,
      to_jsonb(v_before),
      to_jsonb(v_after),
      jsonb_build_object(
        'surface', 'platform_brand_studio',
        'asset_type', v_after."asset_type",
        'review_event_id', v_event_id,
        'public_asset_state', v_after."asset_state",
        'moderation_status', v_after."moderation_status",
        'raw_storage_path_logged', false,
        'fake_approval', false,
        'self_review', v_is_asset_owner,
        'reviewer_access', v_has_reviewer_access,
        'review_context', current_setting('app.platform_brand_review_context', true)
      )
    );
  end if;

  return jsonb_build_object(
    'id', v_after."id",
    'ownerUserId', v_after."owner_user_id",
    'assetType', v_after."asset_type",
    'assetState', v_after."asset_state",
    'moderationStatus', v_after."moderation_status",
    'moderationReason', v_after."moderation_reason",
    'moderatedAt', v_after."moderated_at",
    'reviewEventId', v_event_id
  );
end;
$$;

revoke all on function public."review_platform_brand_asset"(uuid, text, text) from public;
grant execute on function public."review_platform_brand_asset"(uuid, text, text) to authenticated;
grant execute on function public."review_platform_brand_asset"(uuid, text, text) to service_role;

comment on function public."review_platform_brand_asset"(uuid, text, text) is
  'Platform Brand Studio asset review workflow. Owner/operator/moderation reviewers can review the queue; creators may review their own Brand Studio assets so Publish Changes can approve selected safe owned media before public publish.';

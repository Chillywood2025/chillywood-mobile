create or replace function public."publish_platform_brand_profile_assets"(
  p_asset_ids uuid[],
  p_reason text default 'Approved by the creator during Brand Studio publish.'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_asset_id uuid;
  v_before public."platform_brand_assets"%rowtype;
  v_after public."platform_brand_assets"%rowtype;
  v_review_event_id uuid;
  v_selected_count integer := 0;
  v_reviewed_count integer := 0;
  v_published_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'brand_publish_auth_required';
  end if;

  if p_asset_ids is null or cardinality(p_asset_ids) = 0 then
    return jsonb_build_object(
      'selectedCount', 0,
      'reviewedCount', 0,
      'publishedCount', 0
    );
  end if;

  perform set_config('app.platform_brand_review_context', 'review_platform_brand_asset', true);

  for v_asset_id in
    select distinct asset_id
    from unnest(p_asset_ids) as asset_id
    where asset_id is not null
  loop
    v_selected_count := v_selected_count + 1;

    select *
      into v_before
    from public."platform_brand_assets" asset
    where asset."id" = v_asset_id
      and asset."owner_user_id" = v_actor_user_id
      and asset."deleted_at" is null
    for update;

    if not found then
      continue;
    end if;

    if v_before."moderation_status" = 'pending_review'
      and v_before."scan_status" in ('clean', 'manual_review')
    then
      update public."platform_brand_assets"
      set
        "moderation_status" = 'clean',
        "moderation_reason" = coalesce(v_reason, 'Approved for public Platform display.'),
        "moderated_at" = timezone('utc'::text, now()),
        "moderated_by" = v_actor_user_id
      where "id" = v_asset_id
      returning * into v_after;

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
        'creator',
        'approve',
        coalesce(v_reason, v_after."moderation_reason"),
        to_jsonb(v_before),
        to_jsonb(v_after)
      )
      returning "id" into v_review_event_id;

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
          'creator',
          'platform_brand_asset_approve',
          'moderation',
          'platform_brand_asset',
          v_after."id"::text,
          v_after."owner_user_id",
          v_after."owner_user_id",
          coalesce(v_reason, v_after."moderation_reason"),
          'notice',
          to_jsonb(v_before),
          to_jsonb(v_after),
          jsonb_build_object(
            'surface', 'platform_brand_studio',
            'asset_type', v_after."asset_type",
            'review_event_id', v_review_event_id,
            'public_asset_state', v_after."asset_state",
            'moderation_status', v_after."moderation_status",
            'raw_storage_path_logged', false,
            'fake_approval', false,
            'self_review', true,
            'reviewer_access', false,
            'review_context', current_setting('app.platform_brand_review_context', true)
          )
        );
      end if;

      v_reviewed_count := v_reviewed_count + 1;
    end if;
  end loop;

  update public."platform_brand_assets" asset
  set "asset_state" = 'published'
  where asset."owner_user_id" = v_actor_user_id
    and asset."id" = any(p_asset_ids)
    and asset."deleted_at" is null
    and asset."moderation_status" in ('clean', 'reported')
    and asset."scan_status" in ('clean', 'manual_review');

  get diagnostics v_published_count = row_count;

  return jsonb_build_object(
    'selectedCount', v_selected_count,
    'reviewedCount', v_reviewed_count,
    'publishedCount', v_published_count
  );
end;
$$;

revoke all on function public."publish_platform_brand_profile_assets"(uuid[], text) from public;
grant execute on function public."publish_platform_brand_profile_assets"(uuid[], text) to authenticated;
grant execute on function public."publish_platform_brand_profile_assets"(uuid[], text) to service_role;

comment on function public."publish_platform_brand_profile_assets"(uuid[], text) is
  'Owner-only Brand Studio publish helper. Reviews and publishes only selected owned, scan-safe, non-deleted assets without exposing unsafe or wrong-owner media.';

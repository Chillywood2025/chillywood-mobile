create or replace function public."admin_content_assert_operator"()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
begin
  if auth.uid() is null then
    raise exception 'admin_content_auth_required';
  end if;

  if public.has_platform_role(array['owner'::text]) then
    actor_role := 'owner';
  elsif public.has_platform_role(array['operator'::text]) then
    actor_role := 'operator';
  else
    raise exception 'admin_content_operator_required';
  end if;

  return actor_role;
end;
$$;

create or replace function public."admin_content_write_audit"(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_reason text,
  p_before_state jsonb default null,
  p_after_state jsonb default null,
  p_metadata jsonb default '{}'::jsonb,
  p_target_user_id text default null,
  p_severity text default 'notice'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  audit_id uuid;
  safe_reason text := nullif(trim(coalesce(p_reason, '')), '');
  safe_action text := nullif(trim(coalesce(p_action, '')), '');
  safe_target_type text := nullif(trim(coalesce(p_target_type, '')), '');
begin
  actor_role := public."admin_content_assert_operator"();

  if safe_action is null then
    raise exception 'admin_content_audit_action_required';
  end if;

  if safe_reason is null then
    raise exception 'admin_content_reason_required';
  end if;

  insert into public."platform_admin_audit_logs" (
    "actor_user_id",
    "actor_email",
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "target_id",
    "target_user_id",
    "reason",
    "severity",
    "before_state",
    "after_state",
    "metadata"
  )
  values (
    auth.uid()::text,
    nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''),
    actor_role,
    safe_action,
    'content',
    coalesce(safe_target_type, 'content_programming'),
    nullif(trim(coalesce(p_target_id, '')), ''),
    nullif(trim(coalesce(p_target_user_id, '')), ''),
    safe_reason,
    case when p_severity in ('info', 'notice', 'warning', 'critical') then p_severity else 'notice' end,
    p_before_state,
    p_after_state,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'admin_content_programming_center', true,
      'audit_source', 'admin_content_programming_rpc'
    )
  )
  returning "id" into audit_id;

  return audit_id;
end;
$$;

create or replace function public."get_admin_content_config"()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  config_row public."app_configurations"%rowtype;
begin
  actor_role := public."admin_content_assert_operator"();

  select *
    into config_row
  from public."app_configurations"
  where "config_key" = 'global';

  return jsonb_build_object(
    'connected', true,
    'source', case when config_row."config_key" is null then 'default_missing_row' else 'app_configurations' end,
    'operatorRole', actor_role,
    'config', coalesce(config_row."config", '{}'::jsonb),
    'updatedAt', config_row."updated_at",
    'updatedBy', config_row."updated_by"
  );
end;
$$;

create or replace function public."save_admin_content_config"(
  p_config_patch jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  safe_reason text := nullif(trim(coalesce(p_reason, '')), '');
  previous_config jsonb;
  next_config jsonb;
  audit_id uuid;
begin
  actor_role := public."admin_content_assert_operator"();

  if safe_reason is null then
    raise exception 'admin_content_reason_required';
  end if;

  if jsonb_typeof(coalesce(p_config_patch, '{}'::jsonb)) <> 'object' then
    raise exception 'admin_content_config_object_required';
  end if;

  select "config"
    into previous_config
  from public."app_configurations"
  where "config_key" = 'global';

  next_config := public."sanitize_app_configuration"(coalesce(p_config_patch, '{}'::jsonb));

  insert into public."app_configurations" ("config_key", "config", "updated_at", "updated_by")
  values ('global', next_config, timezone('utc'::text, now()), auth.uid()::text)
  on conflict ("config_key") do update
    set "config" = excluded."config",
        "updated_at" = excluded."updated_at",
        "updated_by" = excluded."updated_by";

  audit_id := public."admin_content_write_audit"(
    'content_config_saved',
    'app_configurations',
    'global',
    safe_reason,
    previous_config,
    next_config,
    jsonb_build_object('operator_role', actor_role),
    null,
    'notice'
  );

  return jsonb_build_object(
    'status', 'saved',
    'config', next_config,
    'updatedAt', timezone('utc'::text, now()),
    'auditLogId', audit_id
  );
end;
$$;

create or replace function public."admin_content_title_patch_allowed"(p_patch jsonb)
returns boolean
language sql
immutable
as $$
  select not exists (
    select 1
    from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) as key_name
    where key_name not in (
      'title',
      'category',
      'year',
      'runtime',
      'synopsis',
      'poster_url',
      'video_url',
      'featured',
      'is_published',
      'sort_order',
      'hero',
      'trending',
      'status',
      'release_date',
      'top_row',
      'is_hero',
      'is_trending',
      'pin_to_top_row',
      'release_at',
      'content_access_rule',
      'ads_enabled',
      'sponsor_placement',
      'sponsor_label'
    )
  );
$$;

create or replace function public."apply_admin_title_programming_action"(
  p_title_id uuid,
  p_action_type text,
  p_patch jsonb default '{}'::jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  action_type text := lower(nullif(trim(coalesce(p_action_type, '')), ''));
  safe_reason text := nullif(trim(coalesce(p_reason, '')), '');
  safe_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  before_row jsonb;
  after_row jsonb;
  next_id uuid := p_title_id;
  audit_id uuid;
begin
  actor_role := public."admin_content_assert_operator"();

  if action_type is null then
    raise exception 'admin_content_title_action_required';
  end if;

  if safe_reason is null then
    raise exception 'admin_content_reason_required';
  end if;

  if jsonb_typeof(safe_patch) <> 'object' then
    raise exception 'admin_content_title_patch_object_required';
  end if;

  if not public."admin_content_title_patch_allowed"(safe_patch) then
    raise exception 'admin_content_title_patch_not_allowed';
  end if;

  if action_type not in (
    'create_title',
    'update_title',
    'feature',
    'unfeature',
    'pin_top_row',
    'unpin_top_row',
    'trend',
    'untrend',
    'set_hero',
    'remove_hero',
    'sort_increment',
    'sort_decrement',
    'publish',
    'unpublish',
    'archive',
    'restore'
  ) then
    raise exception 'admin_content_title_action_not_allowed';
  end if;

  if action_type = 'create_title' then
    if nullif(trim(coalesce(safe_patch ->> 'title', '')), '') is null then
      raise exception 'admin_content_title_required';
    end if;

    insert into public."titles" (
      "title",
      "category",
      "year",
      "runtime",
      "synopsis",
      "poster_url",
      "video_url",
      "featured",
      "is_published",
      "sort_order",
      "hero",
      "trending",
      "status",
      "release_date",
      "top_row",
      "is_hero",
      "is_trending",
      "pin_to_top_row",
      "release_at",
      "content_access_rule",
      "ads_enabled",
      "sponsor_placement",
      "sponsor_label"
    )
    values (
      nullif(trim(coalesce(safe_patch ->> 'title', '')), ''),
      nullif(trim(coalesce(safe_patch ->> 'category', '')), ''),
      nullif(trim(coalesce(safe_patch ->> 'year', '')), '')::integer,
      nullif(trim(coalesce(safe_patch ->> 'runtime', '')), ''),
      nullif(trim(coalesce(safe_patch ->> 'synopsis', '')), ''),
      nullif(trim(coalesce(safe_patch ->> 'poster_url', '')), ''),
      nullif(trim(coalesce(safe_patch ->> 'video_url', '')), ''),
      coalesce((safe_patch ->> 'featured')::boolean, false),
      coalesce((safe_patch ->> 'is_published')::boolean, false),
      nullif(trim(coalesce(safe_patch ->> 'sort_order', '')), '')::bigint,
      coalesce((safe_patch ->> 'hero')::boolean, coalesce((safe_patch ->> 'is_hero')::boolean, false)),
      coalesce((safe_patch ->> 'trending')::boolean, coalesce((safe_patch ->> 'is_trending')::boolean, false)),
      coalesce(nullif(trim(coalesce(safe_patch ->> 'status', '')), ''), 'draft'),
      nullif(trim(coalesce(safe_patch ->> 'release_date', safe_patch ->> 'release_at', '')), '')::timestamptz,
      coalesce((safe_patch ->> 'top_row')::boolean, coalesce((safe_patch ->> 'pin_to_top_row')::boolean, false)),
      coalesce((safe_patch ->> 'is_hero')::boolean, coalesce((safe_patch ->> 'hero')::boolean, false)),
      coalesce((safe_patch ->> 'is_trending')::boolean, coalesce((safe_patch ->> 'trending')::boolean, false)),
      coalesce((safe_patch ->> 'pin_to_top_row')::boolean, coalesce((safe_patch ->> 'top_row')::boolean, false)),
      nullif(trim(coalesce(safe_patch ->> 'release_at', safe_patch ->> 'release_date', '')), '')::timestamptz,
      coalesce(nullif(trim(coalesce(safe_patch ->> 'content_access_rule', '')), ''), 'open'),
      coalesce((safe_patch ->> 'ads_enabled')::boolean, false),
      coalesce(nullif(trim(coalesce(safe_patch ->> 'sponsor_placement', '')), ''), 'none'),
      nullif(trim(coalesce(safe_patch ->> 'sponsor_label', '')), '')
    )
    returning "id" into next_id;

    if coalesce((safe_patch ->> 'is_hero')::boolean, coalesce((safe_patch ->> 'hero')::boolean, false)) then
      update public."titles"
      set "is_hero" = false,
          "hero" = false
      where "id" <> next_id;
    end if;
  else
    if next_id is null then
      raise exception 'admin_content_title_id_required';
    end if;

    select to_jsonb(title_row)
      into before_row
    from public."titles" title_row
    where title_row."id" = next_id;

    if before_row is null then
      raise exception 'admin_content_title_not_found';
    end if;

    if action_type = 'set_hero' then
      update public."titles"
      set "is_hero" = false,
          "hero" = false
      where "id" <> next_id;
    end if;

    update public."titles"
    set
      "title" = case when safe_patch ? 'title' then nullif(trim(safe_patch ->> 'title'), '') else "title" end,
      "category" = case when safe_patch ? 'category' then nullif(trim(safe_patch ->> 'category'), '') else "category" end,
      "year" = case when safe_patch ? 'year' then nullif(trim(safe_patch ->> 'year'), '')::integer else "year" end,
      "runtime" = case when safe_patch ? 'runtime' then nullif(trim(safe_patch ->> 'runtime'), '') else "runtime" end,
      "synopsis" = case when safe_patch ? 'synopsis' then nullif(trim(safe_patch ->> 'synopsis'), '') else "synopsis" end,
      "poster_url" = case when safe_patch ? 'poster_url' then nullif(trim(safe_patch ->> 'poster_url'), '') else "poster_url" end,
      "video_url" = case when safe_patch ? 'video_url' then nullif(trim(safe_patch ->> 'video_url'), '') else "video_url" end,
      "featured" = case
        when action_type = 'feature' then true
        when action_type = 'unfeature' then false
        when safe_patch ? 'featured' then (safe_patch ->> 'featured')::boolean
        else "featured"
      end,
      "is_published" = case
        when action_type = 'publish' then true
        when action_type in ('unpublish', 'archive') then false
        when action_type = 'restore' then false
        when safe_patch ? 'is_published' then (safe_patch ->> 'is_published')::boolean
        else "is_published"
      end,
      "sort_order" = case
        when action_type = 'sort_increment' then coalesce("sort_order", 0) + 1
        when action_type = 'sort_decrement' then greatest(0, coalesce("sort_order", 0) - 1)
        when safe_patch ? 'sort_order' then nullif(trim(safe_patch ->> 'sort_order'), '')::bigint
        else "sort_order"
      end,
      "hero" = case
        when action_type = 'set_hero' then true
        when action_type = 'remove_hero' then false
        when safe_patch ? 'hero' then (safe_patch ->> 'hero')::boolean
        when safe_patch ? 'is_hero' then (safe_patch ->> 'is_hero')::boolean
        else "hero"
      end,
      "is_hero" = case
        when action_type = 'set_hero' then true
        when action_type = 'remove_hero' then false
        when safe_patch ? 'is_hero' then (safe_patch ->> 'is_hero')::boolean
        when safe_patch ? 'hero' then (safe_patch ->> 'hero')::boolean
        else "is_hero"
      end,
      "trending" = case
        when action_type = 'trend' then true
        when action_type = 'untrend' then false
        when safe_patch ? 'trending' then (safe_patch ->> 'trending')::boolean
        when safe_patch ? 'is_trending' then (safe_patch ->> 'is_trending')::boolean
        else "trending"
      end,
      "is_trending" = case
        when action_type = 'trend' then true
        when action_type = 'untrend' then false
        when safe_patch ? 'is_trending' then (safe_patch ->> 'is_trending')::boolean
        when safe_patch ? 'trending' then (safe_patch ->> 'trending')::boolean
        else "is_trending"
      end,
      "top_row" = case
        when action_type = 'pin_top_row' then true
        when action_type = 'unpin_top_row' then false
        when safe_patch ? 'top_row' then (safe_patch ->> 'top_row')::boolean
        when safe_patch ? 'pin_to_top_row' then (safe_patch ->> 'pin_to_top_row')::boolean
        else "top_row"
      end,
      "pin_to_top_row" = case
        when action_type = 'pin_top_row' then true
        when action_type = 'unpin_top_row' then false
        when safe_patch ? 'pin_to_top_row' then (safe_patch ->> 'pin_to_top_row')::boolean
        when safe_patch ? 'top_row' then (safe_patch ->> 'top_row')::boolean
        else "pin_to_top_row"
      end,
      "status" = case
        when action_type = 'publish' then 'published'
        when action_type = 'unpublish' then 'draft'
        when action_type = 'archive' then 'archived'
        when action_type = 'restore' then 'draft'
        when safe_patch ? 'status' then nullif(trim(safe_patch ->> 'status'), '')
        else "status"
      end,
      "release_at" = case
        when action_type in ('publish', 'unpublish', 'archive', 'restore') then null
        when safe_patch ? 'release_at' then nullif(trim(safe_patch ->> 'release_at'), '')::timestamptz
        else "release_at"
      end,
      "release_date" = case
        when action_type in ('publish', 'unpublish', 'archive', 'restore') then null
        when safe_patch ? 'release_date' then nullif(trim(safe_patch ->> 'release_date'), '')::timestamptz
        when safe_patch ? 'release_at' then nullif(trim(safe_patch ->> 'release_at'), '')::timestamptz
        else "release_date"
      end,
      "content_access_rule" = case when safe_patch ? 'content_access_rule' then coalesce(nullif(trim(safe_patch ->> 'content_access_rule'), ''), 'open') else "content_access_rule" end,
      "ads_enabled" = case when safe_patch ? 'ads_enabled' then (safe_patch ->> 'ads_enabled')::boolean else "ads_enabled" end,
      "sponsor_placement" = case when safe_patch ? 'sponsor_placement' then coalesce(nullif(trim(safe_patch ->> 'sponsor_placement'), ''), 'none') else "sponsor_placement" end,
      "sponsor_label" = case when safe_patch ? 'sponsor_label' then nullif(trim(safe_patch ->> 'sponsor_label'), '') else "sponsor_label" end
    where "id" = next_id;
  end if;

  select to_jsonb(title_row)
    into after_row
  from public."titles" title_row
  where title_row."id" = next_id;

  audit_id := public."admin_content_write_audit"(
    'title_' || action_type,
    'title',
    next_id::text,
    safe_reason,
    before_row,
    after_row,
    jsonb_build_object('operator_role', actor_role, 'action_type', action_type),
    null,
    case when action_type in ('publish', 'unpublish', 'archive', 'restore', 'set_hero') then 'warning' else 'notice' end
  );

  return jsonb_build_object(
    'status', 'applied',
    'actionType', action_type,
    'titleId', next_id,
    'title', after_row,
    'auditLogId', audit_id
  );
end;
$$;

create or replace function public."save_admin_creator_grants"(
  p_target_user_id text,
  p_grants jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  safe_user_id text := nullif(trim(coalesce(p_target_user_id, '')), '');
  safe_reason text := nullif(trim(coalesce(p_reason, '')), '');
  safe_grants jsonb := coalesce(p_grants, '{}'::jsonb);
  before_row jsonb;
  after_row jsonb;
  audit_id uuid;
begin
  actor_role := public."admin_content_assert_operator"();

  if safe_user_id is null then
    raise exception 'admin_content_creator_user_required';
  end if;

  if safe_reason is null then
    raise exception 'admin_content_reason_required';
  end if;

  if jsonb_typeof(safe_grants) <> 'object' then
    raise exception 'admin_content_grants_object_required';
  end if;

  select to_jsonb(grant_row)
    into before_row
  from public."creator_permissions" grant_row
  where grant_row."user_id" = safe_user_id;

  insert into public."creator_permissions" (
    "user_id",
    "can_use_party_pass_rooms",
    "can_use_premium_rooms",
    "can_publish_premium_titles",
    "can_use_sponsor_placements",
    "can_use_player_ads",
    "updated_at"
  )
  values (
    safe_user_id,
    coalesce((safe_grants ->> 'canUsePartyPassRooms')::boolean, false),
    coalesce((safe_grants ->> 'canUsePremiumRooms')::boolean, false),
    coalesce((safe_grants ->> 'canPublishPremiumTitles')::boolean, true),
    coalesce((safe_grants ->> 'canUseSponsorPlacements')::boolean, false),
    coalesce((safe_grants ->> 'canUsePlayerAds')::boolean, false),
    timezone('utc'::text, now())
  )
  on conflict ("user_id") do update
    set "can_use_party_pass_rooms" = excluded."can_use_party_pass_rooms",
        "can_use_premium_rooms" = excluded."can_use_premium_rooms",
        "can_publish_premium_titles" = excluded."can_publish_premium_titles",
        "can_use_sponsor_placements" = excluded."can_use_sponsor_placements",
        "can_use_player_ads" = excluded."can_use_player_ads",
        "updated_at" = excluded."updated_at";

  select to_jsonb(grant_row)
    into after_row
  from public."creator_permissions" grant_row
  where grant_row."user_id" = safe_user_id;

  audit_id := public."admin_content_write_audit"(
    'creator_grants_saved',
    'creator_permissions',
    safe_user_id,
    safe_reason,
    before_row,
    after_row,
    jsonb_build_object('operator_role', actor_role),
    safe_user_id,
    'warning'
  );

  return jsonb_build_object(
    'status', 'saved',
    'targetUserId', safe_user_id,
    'grants', after_row,
    'auditLogId', audit_id
  );
end;
$$;

create or replace function public."list_admin_content_audit_events"(p_limit integer default 12)
returns setof public."platform_admin_audit_logs"
language sql
stable
security definer
set search_path = public
as $$
  select audit.*
  from public."platform_admin_audit_logs" audit
  where public."admin_content_assert_operator"() in ('owner', 'operator')
    and audit."action_category" = 'content'
    and (
      audit."metadata" ->> 'admin_content_programming_center' = 'true'
      or audit."target_type" in ('app_configurations', 'title', 'creator_permissions')
      or audit."action" like 'content_%'
      or audit."action" like 'title_%'
      or audit."action" = 'creator_grants_saved'
    )
  order by audit."created_at" desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

revoke all on function public."admin_content_assert_operator"() from public;
revoke all on function public."admin_content_write_audit"(text, text, text, text, jsonb, jsonb, jsonb, text, text) from public;
revoke all on function public."get_admin_content_config"() from public;
revoke all on function public."save_admin_content_config"(jsonb, text) from public;
revoke all on function public."apply_admin_title_programming_action"(uuid, text, jsonb, text) from public;
revoke all on function public."save_admin_creator_grants"(text, jsonb, text) from public;
revoke all on function public."list_admin_content_audit_events"(integer) from public;

grant execute on function public."get_admin_content_config"() to authenticated;
grant execute on function public."save_admin_content_config"(jsonb, text) to authenticated;
grant execute on function public."apply_admin_title_programming_action"(uuid, text, jsonb, text) to authenticated;
grant execute on function public."save_admin_creator_grants"(text, jsonb, text) to authenticated;
grant execute on function public."list_admin_content_audit_events"(integer) to authenticated;

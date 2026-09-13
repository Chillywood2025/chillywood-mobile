-- Close product-integrity classes found by whole-app adversarial review.
-- This migration does not enable production money, payouts, cashout, provider
-- products, public rollout, or store submission.

create or replace function public."creator_sandbox_source_owned_by_current_user_internal"(
  p_source_type text,
  p_source_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case btrim(coalesce(p_source_type, ''))
    when 'creator_tip' then p_source_id = auth.uid()
    when 'merch_physical_good' then p_source_id = auth.uid()
    when 'paid_content' then exists (
      select 1
      from public."videos" video
      where video."id" = p_source_id
        and video."owner_id" = auth.uid()
    )
    when 'watch_party_live' then exists (
      select 1
      from public."paid_watch_party_offers" offer
      where offer."id" = p_source_id
        and offer."creator_id" = auth.uid()
        and offer."host_id" = auth.uid()
    )
    when 'event' then exists (
      select 1
      from public."creator_events" event_row
      where event_row."id" = p_source_id
        and event_row."host_user_id" = auth.uid()
    )
    when 'live_watch_party_access' then exists (
      select 1
      from public."paid_live_watch_party_offers" offer
      where offer."id" = p_source_id
        and offer."creator_id" = auth.uid()
        and offer."host_user_id" = auth.uid()
        and offer."pass_type" = 'live_watch_party_access_pass'
    )
    when 'live_watch_party_seat' then exists (
      select 1
      from public."paid_live_watch_party_offers" offer
      where offer."id" = p_source_id
        and offer."creator_id" = auth.uid()
        and offer."host_user_id" = auth.uid()
        and offer."pass_type" = 'live_watch_party_seat_pass'
    )
    when 'channel_subscription' then exists (
      select 1
      from public."creator_channel_subscription_offers" offer
      where offer."id" = p_source_id
        and offer."creator_id" = auth.uid()
    )
    when 'vip_pass' then exists (
      select 1
      from public."creator_vip_pass_offers" offer
      where offer."id" = p_source_id
        and offer."creator_id" = auth.uid()
    )
    else false
  end;
$$;

revoke all on function public."creator_sandbox_source_owned_by_current_user_internal"(text,uuid)
  from public,anon,authenticated,service_role;

alter function public."save_creator_sandbox_monetization_config"(text,text,uuid,text,jsonb)
  rename to "save_creator_sandbox_monetization_config_pre_adversarial_integrity";
alter function public."save_creator_sandbox_monetization_config_pre_adversarial_integrity"(text,text,uuid,text,jsonb)
  set search_path = '';
revoke all on function public."save_creator_sandbox_monetization_config_pre_adversarial_integrity"(text,text,uuid,text,jsonb)
  from public,anon,authenticated,service_role;

create or replace function public."save_creator_sandbox_monetization_config"(
  p_product_key text,
  p_source_type text,
  p_source_id uuid,
  p_display_name text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(auth.uid()::text)
    or not public."wave1_creator_money_subject_authorized_internal"(auth.uid())
  then
    raise exception 'creator_authority_not_current';
  end if;

  if p_source_id is null
    or not public."creator_sandbox_source_owned_by_current_user_internal"(
      p_source_type,
      p_source_id
    )
  then
    raise exception 'creator_sandbox_source_not_owned' using errcode = '42501';
  end if;

  return public."save_creator_sandbox_monetization_config_pre_adversarial_integrity"(
    p_product_key,
    p_source_type,
    p_source_id,
    p_display_name,
    p_metadata
  );
end;
$$;

revoke all on function public."save_creator_sandbox_monetization_config"(text,text,uuid,text,jsonb)
  from public,anon;
grant execute on function public."save_creator_sandbox_monetization_config"(text,text,uuid,text,jsonb)
  to authenticated,service_role;

comment on function public."save_creator_sandbox_monetization_config"(text,text,uuid,text,jsonb) is
  'Saves sandbox/not-payable creator configuration only when the exact current authenticated creator owns the target source. It does not create access, charges, provider events, payouts, or production authority.';

drop function public."admin_create_official_rachi_post"(text,text,text);

create function public."admin_create_official_rachi_post"(
  p_body text,
  p_visibility text default 'public',
  p_reason text default 'Official Rachi update',
  p_operation_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  safe_body text := nullif(btrim(coalesce(p_body, '')), '');
  safe_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  safe_operation_key text := lower(btrim(coalesce(p_operation_key, '')));
  created_post public."profile_posts"%rowtype;
  audit_id uuid;
  prior_target_id text;
  prior_reason text;
begin
  actor_role := public."admin_content_assert_operator"();

  if safe_body is null then raise exception 'rachi_post_body_required'; end if;
  if char_length(safe_body) > 500 then raise exception 'rachi_post_body_too_long'; end if;
  if btrim(coalesce(p_visibility, '')) <> 'public' then
    raise exception 'rachi_post_public_visibility_required';
  end if;
  safe_reason := coalesce(safe_reason, 'Official Rachi update');
  if safe_operation_key !~ '^rachi-post:[0-9a-f]{32}$' then
    raise exception 'rachi_post_operation_key_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'official-rachi-post:' || auth.uid()::text || ':' || safe_operation_key,
    0
  ));

  select audit."id", audit."target_id", audit."reason"
    into audit_id, prior_target_id, prior_reason
  from public."platform_admin_audit_logs" audit
  where audit."actor_user_id" = auth.uid()::text
    and audit."action" = 'official_rachi_post_created'
    and audit."metadata"->>'operation_key' = safe_operation_key
  order by audit."created_at" asc, audit."id" asc
  limit 1;

  if prior_target_id is not null then
    select post.* into created_post
    from public."profile_posts" post
    where post."id"::text = prior_target_id
      and post."user_id" = 'platform_rachi_official'
    limit 1;

    if created_post."id" is null
      or created_post."body" is distinct from safe_body
      or prior_reason is distinct from safe_reason
    then
      raise exception 'rachi_post_operation_key_conflict';
    end if;

    return jsonb_build_object(
      'id', created_post."id",
      'userId', created_post."user_id",
      'body', created_post."body",
      'visibility', created_post."visibility",
      'moderationStatus', created_post."moderation_status",
      'moderationReason', created_post."moderation_reason",
      'moderatedAt', created_post."moderated_at",
      'moderatedBy', created_post."moderated_by",
      'createdAt', created_post."created_at",
      'updatedAt', created_post."updated_at",
      'auditId', audit_id,
      'actorRole', actor_role,
      'idempotent', true
    );
  end if;

  insert into public."profile_posts" (
    "user_id",
    "body",
    "visibility",
    "moderation_status",
    "updated_at"
  ) values (
    'platform_rachi_official',
    safe_body,
    'public',
    'clean',
    timezone('utc'::text, now())
  ) returning * into created_post;

  audit_id := public."admin_content_write_audit"(
    'official_rachi_post_created',
    'profile_post',
    created_post."id"::text,
    safe_reason,
    null,
    to_jsonb(created_post),
    jsonb_build_object(
      'official_account_id', 'platform_rachi_official',
      'rachi_official_account', true,
      'surface', 'admin_rachi_tab',
      'visibility', 'public',
      'profile_post_draft_state', 'not_supported',
      'operation_key', safe_operation_key
    ),
    'platform_rachi_official',
    'notice'
  );

  return jsonb_build_object(
    'id', created_post."id",
    'userId', created_post."user_id",
    'body', created_post."body",
    'visibility', created_post."visibility",
    'moderationStatus', created_post."moderation_status",
    'moderationReason', created_post."moderation_reason",
    'moderatedAt', created_post."moderated_at",
    'moderatedBy', created_post."moderated_by",
    'createdAt', created_post."created_at",
    'updatedAt', created_post."updated_at",
    'auditId', audit_id,
    'actorRole', actor_role,
    'idempotent', false
  );
end;
$$;

revoke all on function public."admin_create_official_rachi_post"(text,text,text,text)
  from public,anon;
grant execute on function public."admin_create_official_rachi_post"(text,text,text,text)
  to authenticated;

comment on function public."admin_create_official_rachi_post"(text,text,text,text) is
  'Creates one exact public Rachi post per operator-bound operation key. Ambiguous retries return the original post and audit result instead of duplicating public content.';

create table if not exists public."privileged_mutation_operation_receipts" (
  "operation_family" text not null,
  "actor_user_id" text not null,
  "operation_key" text not null,
  "request_fingerprint" jsonb not null,
  "result_payload" jsonb not null,
  "result_target_id" text,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "privileged_mutation_operation_receipts_pkey"
    primary key ("operation_family", "actor_user_id", "operation_key"),
  constraint "privileged_mutation_operation_receipts_family_check"
    check ("operation_family" in ('staff_role_grant', 'dmca_strike')),
  constraint "privileged_mutation_operation_receipts_key_check"
    check ("operation_key" ~ '^(staff-role-grant|dmca-strike):[0-9a-f]{32}$')
);

alter table public."privileged_mutation_operation_receipts" enable row level security;
revoke all on table public."privileged_mutation_operation_receipts"
  from public,anon,authenticated;

create or replace function public."admin_grant_platform_role_by_email"(
  p_target_email text,
  p_role text,
  p_reason text,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_target_email text := public."platform_staff_normalize_email"(p_target_email);
  v_target_role text := public."platform_staff_normalize_role"(p_role);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_operation_key text := lower(btrim(coalesce(p_operation_key, '')));
  v_request_fingerprint jsonb;
  v_prior_request jsonb;
  v_prior_result jsonb;
  v_result jsonb;
begin
  if v_actor_user_id is null
    or not public."platform_exact_current_session_authority_internal"()
  then
    raise exception 'platform_staff_auth_required';
  end if;
  if v_target_email is null then raise exception 'platform_staff_email_required'; end if;
  if v_target_role is null then raise exception 'platform_staff_role_invalid'; end if;
  if v_reason is null or length(v_reason) < 6 then
    raise exception 'platform_staff_reason_required';
  end if;
  if v_operation_key !~ '^staff-role-grant:[0-9a-f]{32}$' then
    raise exception 'platform_staff_operation_key_required';
  end if;

  v_request_fingerprint := jsonb_build_object(
    'target_email', v_target_email,
    'target_role', v_target_role,
    'reason', v_reason
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'staff-role-grant:' || v_actor_user_id || ':' || v_operation_key,
    0
  ));

  select receipt."request_fingerprint", receipt."result_payload"
    into v_prior_request, v_prior_result
  from public."privileged_mutation_operation_receipts" receipt
  where receipt."operation_family" = 'staff_role_grant'
    and receipt."actor_user_id" = v_actor_user_id
    and receipt."operation_key" = v_operation_key;

  if found then
    if v_prior_request is distinct from v_request_fingerprint then
      raise exception 'platform_staff_operation_key_conflict';
    end if;
    return v_prior_result || jsonb_build_object('idempotent', true);
  end if;

  v_result := public."admin_grant_platform_role_by_email"(
    v_target_email,
    v_target_role,
    v_reason
  );

  insert into public."privileged_mutation_operation_receipts" (
    "operation_family",
    "actor_user_id",
    "operation_key",
    "request_fingerprint",
    "result_payload",
    "result_target_id"
  ) values (
    'staff_role_grant',
    v_actor_user_id,
    v_operation_key,
    v_request_fingerprint,
    v_result,
    v_result->>'id'
  );

  return v_result || jsonb_build_object('idempotent', false);
end;
$$;

revoke all on function public."admin_grant_platform_role_by_email"(text,text,text,text)
  from public,anon;
grant execute on function public."admin_grant_platform_role_by_email"(text,text,text,text)
  to authenticated;

comment on function public."admin_grant_platform_role_by_email"(text,text,text,text) is
  'Grants one exact staff role per current operator-bound operation key. Ambiguous retries return the original exact result and conflicting reuse fails closed.';

create or replace function public."admin_dmca_add_strike"(
  p_case_id uuid,
  p_user_id text,
  p_channel_id text,
  p_content_type text,
  p_content_id text,
  p_severity text,
  p_reason text,
  p_operation_key text
)
returns public."dmca_strikes"
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_user_id text := nullif(btrim(coalesce(p_user_id, '')), '');
  v_channel_id text := nullif(btrim(coalesce(p_channel_id, '')), '');
  v_content_type text := btrim(coalesce(p_content_type, ''));
  v_content_id text := nullif(btrim(coalesce(p_content_id, '')), '');
  v_severity text := case when p_severity in ('standard', 'severe') then p_severity else 'standard' end;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_operation_key text := lower(btrim(coalesce(p_operation_key, '')));
  v_request_fingerprint jsonb;
  v_prior_request jsonb;
  v_prior_target_id text;
  v_row public."dmca_strikes"%rowtype;
begin
  if v_actor_user_id is null
    or not public."platform_exact_current_session_authority_internal"()
  then
    raise exception 'dmca_operator_auth_required';
  end if;
  perform public."dmca_assert_owner_operator"();
  if v_operation_key !~ '^dmca-strike:[0-9a-f]{32}$' then
    raise exception 'dmca_strike_operation_key_required';
  end if;

  v_request_fingerprint := jsonb_build_object(
    'case_id', p_case_id,
    'user_id', v_user_id,
    'channel_id', v_channel_id,
    'content_type', v_content_type,
    'content_id', v_content_id,
    'severity', v_severity,
    'reason', v_reason
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'dmca-strike:' || v_actor_user_id || ':' || v_operation_key,
    0
  ));

  select receipt."request_fingerprint", receipt."result_target_id"
    into v_prior_request, v_prior_target_id
  from public."privileged_mutation_operation_receipts" receipt
  where receipt."operation_family" = 'dmca_strike'
    and receipt."actor_user_id" = v_actor_user_id
    and receipt."operation_key" = v_operation_key;

  if found then
    if v_prior_request is distinct from v_request_fingerprint then
      raise exception 'dmca_strike_operation_key_conflict';
    end if;
    select strike.* into v_row
    from public."dmca_strikes" strike
    where strike."id"::text = v_prior_target_id;
    if v_row."id" is null then
      raise exception 'dmca_strike_operation_receipt_invalid';
    end if;
    return v_row;
  end if;

  v_row := public."admin_dmca_add_strike"(
    p_case_id,
    v_user_id,
    v_channel_id,
    v_content_type,
    v_content_id,
    v_severity,
    v_reason
  );

  insert into public."privileged_mutation_operation_receipts" (
    "operation_family",
    "actor_user_id",
    "operation_key",
    "request_fingerprint",
    "result_payload",
    "result_target_id"
  ) values (
    'dmca_strike',
    v_actor_user_id,
    v_operation_key,
    v_request_fingerprint,
    to_jsonb(v_row),
    v_row."id"::text
  );

  return v_row;
end;
$$;

revoke all on function public."admin_dmca_add_strike"(uuid,text,text,text,text,text,text,text)
  from public,anon;
grant execute on function public."admin_dmca_add_strike"(uuid,text,text,text,text,text,text,text)
  to authenticated;

comment on function public."admin_dmca_add_strike"(uuid,text,text,text,text,text,text,text) is
  'Creates one exact copyright strike per current operator-bound operation key. Ambiguous retries replay the original strike and conflicting reuse fails closed.';

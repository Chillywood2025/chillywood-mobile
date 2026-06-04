-- Sandbox money failure-path proof and event-pass resolver backing.
-- This migration does not activate production money, payouts, public buy buttons,
-- or any LiveKit/host/speaker/admin authority.

create unique index if not exists "access_grants_provider_event_grant_unique"
  on public."access_grants" ("provider_event_id", "user_id", "grant_type")
  where "provider_event_id" is not null;

create unique index if not exists "money_access_ledger_provider_event_unique"
  on public."money_access_ledger_events" ("provider_event_id")
  where "provider_event_id" is not null;

create or replace function public."admin_revoke_money_access_grant_for_proof"(
  p_grant_id uuid,
  p_reason text default 'Sandbox proof admin revoke.'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grant public."access_grants"%rowtype;
  v_ledger_id uuid;
  v_reason text := left(coalesce(nullif(btrim(p_reason), ''), 'Sandbox proof admin revoke.'), 280);
begin
  if auth.uid() is null or not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception 'owner_or_operator_required';
  end if;

  select * into v_grant
  from public."access_grants"
  where "id" = p_grant_id
  for update;

  if v_grant."id" is null then
    raise exception 'access_grant_not_found';
  end if;
  if v_grant."environment" not in ('setup', 'sandbox') then
    raise exception 'production_revoke_proof_not_allowed';
  end if;
  if v_grant."status" in ('revoked', 'refunded', 'expired', 'blocked') then
    return jsonb_build_object(
      'status', 'already_inactive',
      'accessGrantId', v_grant."id",
      'grantStatus', v_grant."status",
      'environment', v_grant."environment",
      'payableState', 'not_payable',
      'liveMoneyAction', false
    );
  end if;

  update public."access_grants"
  set "status" = 'revoked',
      "revoked_at" = timezone('utc'::text, now()),
      "revoke_reason" = v_reason,
      "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
        'admin_revoke_proof', true,
        'provider_refund_claimed', false,
        'sandbox_only', v_grant."environment" = 'sandbox',
        'not_payable', true,
        'payment_authority', false
      )
  where "id" = p_grant_id
  returning * into v_grant;

  insert into public."money_access_ledger_events" (
    "user_id",
    "creator_id",
    "platform_id",
    "product_id",
    "provider_event_id",
    "event_type",
    "amount_minor",
    "currency",
    "environment",
    "payable_state",
    "status",
    "source_type",
    "source_id",
    "metadata"
  )
  values (
    v_grant."user_id",
    null,
    null,
    v_grant."product_id",
    null,
    'ADMIN_REVOKE',
    0,
    'usd',
    v_grant."environment",
    case when v_grant."environment" = 'sandbox' then 'reversed' else 'not_payable' end,
    case when v_grant."environment" = 'sandbox' then 'reversed' else 'setup_only' end,
    v_grant."grant_type",
    v_grant."source_id",
    jsonb_build_object(
      'access_grant_id', v_grant."id",
      'admin_revoke_proof', true,
      'provider_refund_claimed', false,
      'sandbox_only', v_grant."environment" = 'sandbox',
      'not_payable', true,
      'production_money', false,
      'payout_readiness_proved', false,
      'live_money_enabled_at_verification', false
    )
  )
  returning "id" into v_ledger_id;

  return jsonb_build_object(
    'status', 'revoked',
    'accessGrantId', v_grant."id",
    'grantType', v_grant."grant_type",
    'sourceId', v_grant."source_id",
    'environment', v_grant."environment",
    'ledgerEventId', v_ledger_id,
    'payableState', case when v_grant."environment" = 'sandbox' then 'reversed' else 'not_payable' end,
    'liveMoneyAction', false,
    'providerRefundClaimed', false
  );
end;
$$;

revoke all on function public."admin_revoke_money_access_grant_for_proof"(uuid, text) from public;
grant execute on function public."admin_revoke_money_access_grant_for_proof"(uuid, text) to authenticated;
grant execute on function public."admin_revoke_money_access_grant_for_proof"(uuid, text) to service_role;

create or replace function public."has_event_pass_access"(p_user_id uuid, p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public."creator_events"%rowtype;
  v_access jsonb;
  v_user_id uuid := coalesce(p_user_id, auth.uid());
begin
  if v_user_id is null then
    return jsonb_build_object(
      'allowed', false,
      'status', 'missing',
      'reason', 'auth_required',
      'requiresPurchase', true,
      'canView', false,
      'canEnter', false,
      'canPublish', false,
      'approvalRequired', false
    );
  end if;

  select * into v_event
  from public."creator_events"
  where "id" = p_event_id;

  if v_event."id" is null then
    return jsonb_build_object(
      'allowed', false,
      'status', 'missing',
      'reason', 'event_unavailable',
      'requiresPurchase', true,
      'canView', false,
      'canEnter', false,
      'canPublish', false,
      'approvalRequired', false
    );
  end if;

  if exists (
    select 1
    from public."channel_audience_blocks" block_row
    where (
      block_row."channel_user_id" = v_user_id::text
      and block_row."blocked_user_id" = v_event."host_user_id"::text
    ) or (
      block_row."channel_user_id" = v_event."host_user_id"::text
      and block_row."blocked_user_id" = v_user_id::text
    )
    limit 1
  ) then
    return jsonb_build_object(
      'allowed', false,
      'status', 'blocked',
      'reason', 'blocked_by_creator_policy',
      'requiresPurchase', true,
      'canView', false,
      'canEnter', false,
      'canPublish', false,
      'approvalRequired', false
    );
  end if;

  if v_event."status" in ('draft', 'ended', 'expired', 'canceled') then
    return jsonb_build_object(
      'allowed', false,
      'status', v_event."status",
      'reason', 'event_state_blocks_access',
      'requiresPurchase', true,
      'canView', false,
      'canEnter', false,
      'canPublish', false,
      'approvalRequired', false
    );
  end if;

  if v_event."host_user_id" = v_user_id or public.has_platform_role(array['owner'::text, 'operator'::text]) then
    return jsonb_build_object(
      'allowed', true,
      'status', 'host_or_admin',
      'reason', 'host_or_admin_preview_route_policy_still_applies',
      'requiresPurchase', false,
      'canView', true,
      'canEnter', true,
      'canPublish', false,
      'approvalRequired', true
    );
  end if;

  if v_event."status" not in ('scheduled', 'live_now', 'replay_available') then
    return jsonb_build_object(
      'allowed', false,
      'status', v_event."status",
      'reason', 'event_not_available',
      'requiresPurchase', true,
      'canView', false,
      'canEnter', false,
      'canPublish', false,
      'approvalRequired', false
    );
  end if;

  v_access := public."has_access_grant"('event_pass', p_event_id, v_user_id);

  return jsonb_build_object(
    'allowed', coalesce((v_access->>'allowed')::boolean, false),
    'status', coalesce(v_access->>'status', 'missing'),
    'reason', case
      when coalesce((v_access->>'allowed')::boolean, false) then 'event_pass_grant_allows_viewing_only'
      else 'event_pass_required'
    end,
    'requiresPurchase', not coalesce((v_access->>'allowed')::boolean, false),
    'canView', coalesce((v_access->>'allowed')::boolean, false),
    'canEnter', coalesce((v_access->>'allowed')::boolean, false),
    'canPublish', false,
    'approvalRequired', true
  );
end;
$$;

revoke all on function public."has_event_pass_access"(uuid, uuid) from public;
grant execute on function public."has_event_pass_access"(uuid, uuid) to authenticated;
grant execute on function public."has_event_pass_access"(uuid, uuid) to service_role;

-- Keep sandbox revoke proof metadata inside access_grants' existing safety
-- constraint: no LiveKit/publish/admin-power strings are written to grant metadata.

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
  if current_user not in ('postgres', 'service_role')
    and (auth.uid() is null or not public.has_platform_role(array['owner'::text, 'operator'::text]))
  then
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
        'payment_authority', false,
        'payout_access', false
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

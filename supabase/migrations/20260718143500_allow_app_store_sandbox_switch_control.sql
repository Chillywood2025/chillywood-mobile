-- Keep the audited owner/operator switch control aligned with the constrained
-- switch catalog. The App Store row was added after the original setter and
-- could not be changed through the supported audited path.

create or replace function public."set_platform_money_kill_switch_state"(
  p_key text,
  p_state text,
  p_reason text,
  p_owner_only_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
  v_actor_role text;
  v_actor_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_actor_user_id uuid := auth.uid();
  v_key text := lower(trim(coalesce(p_key, '')));
  v_state text := lower(trim(coalesce(p_state, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_owner_only_reason text := nullif(trim(coalesce(p_owner_only_reason, '')), '');
  v_metadata jsonb := case
    when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object'
      then coalesce(p_metadata, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_old_state text;
  v_security_context_id uuid;
  v_admin_audit_id uuid;
  v_high_risk boolean;
begin
  if v_request_role = 'service_role' then
    v_actor_role := 'service_role';
  elsif public.has_platform_role(array['owner'::text]) then
    v_actor_role := 'owner';
  elsif public.has_platform_role(array['operator'::text]) then
    v_actor_role := 'operator';
  else
    raise exception 'money_kill_switch_admin_required';
  end if;

  -- The table has a constrained key catalog and is the canonical allowlist.
  -- This avoids silently orphaning later additive switches from the audited
  -- control path while still rejecting arbitrary input.
  if not exists (
    select 1
    from public."platform_money_kill_switches" flag
    where flag."key" = v_key
  ) then
    raise exception 'money_kill_switch_key_invalid';
  end if;

  if v_state not in ('off', 'on', 'locked', 'maintenance', 'sandbox_only') then
    raise exception 'money_kill_switch_state_invalid';
  end if;

  v_high_risk := v_key in (
    'live_money_enabled',
    'payouts_enabled',
    'digital_sales_enabled',
    'tips_enabled',
    'watch_party_tickets_enabled',
    'watch_party_seats_enabled',
    'live_watch_party_access_enabled',
    'live_watch_party_seats_enabled',
    'paid_content_enabled',
    'stripe_connect_enabled',
    'revenuecat_google_play_enabled',
    'revenuecat_app_store_enabled',
    'provider_webhooks_enabled',
    'creator_monetization_enabled'
  );

  if v_reason is null or length(v_reason) < 6 then
    raise exception 'money_kill_switch_reason_required';
  end if;

  if v_state = 'on' and v_high_risk and length(v_reason) < 12 then
    raise exception 'money_kill_switch_high_risk_reason_required';
  end if;

  select flag."state"
    into v_old_state
  from public."platform_money_kill_switches" flag
  where flag."key" = v_key
  for update;

  if v_old_state is null then
    raise exception 'money_kill_switch_missing';
  end if;

  v_security_context_id := public."security_context_id_from_metadata"(v_metadata);

  update public."platform_money_kill_switches"
  set
    "state" = v_state,
    "reason" = v_reason,
    "owner_only_reason" = v_owner_only_reason,
    "updated_by" = v_actor_user_id,
    "updated_at" = timezone('utc'::text, now())
  where "key" = v_key;

  insert into public."platform_money_kill_switch_audit" (
    "actor_user_id",
    "switch_key",
    "old_state",
    "new_state",
    "reason",
    "security_context_id",
    "metadata"
  )
  values (
    v_actor_user_id,
    v_key,
    v_old_state,
    v_state,
    v_reason,
    v_security_context_id,
    v_metadata || jsonb_build_object(
      'actor_role', v_actor_role,
      'high_risk_switch', v_high_risk,
      'secret_values_returned', false,
      'live_money_action', false,
      'checkout_created', false,
      'payout_created', false,
      'transfer_created', false
    )
  );

  if to_regclass('public.platform_admin_audit_logs') is null then
    if v_high_risk then
      raise exception 'money_kill_switch_admin_audit_required';
    end if;
  else
    insert into public."platform_admin_audit_logs" (
      "actor_user_id",
      "actor_email",
      "actor_role",
      "action",
      "action_category",
      "target_type",
      "target_id",
      "reason",
      "severity",
      "before_state",
      "after_state",
      "metadata",
      "security_context_id"
    )
    values (
      v_actor_user_id::text,
      v_actor_email,
      v_actor_role,
      'money_kill_switch_changed',
      case when v_key = 'payouts_enabled' then 'payout' else 'finance' end,
      'platform_money_kill_switch',
      v_key,
      v_reason,
      case
        when v_key = 'live_money_enabled' or (v_high_risk and v_state = 'on') then 'critical'
        when v_high_risk then 'warning'
        else 'notice'
      end,
      jsonb_build_object('state', v_old_state),
      jsonb_build_object('state', v_state),
      v_metadata || jsonb_build_object(
        'owner_only_reason_present', v_owner_only_reason is not null,
        'high_risk_switch', v_high_risk,
        'secret_values_returned', false,
        'live_money_action', false,
        'provider_call', false,
        'checkout_created', false,
        'payout_created', false,
        'transfer_created', false
      ),
      v_security_context_id
    )
    returning "id" into v_admin_audit_id;

    if v_high_risk and v_admin_audit_id is null then
      raise exception 'money_kill_switch_admin_audit_required';
    end if;
  end if;

  return jsonb_build_object(
    'key', v_key,
    'oldState', v_old_state,
    'state', v_state,
    'displayLabel', public."money_kill_switch_state_label"(v_state),
    'reason', v_reason,
    'auditWritten', true,
    'adminAuditLogId', v_admin_audit_id,
    'liveMoneyAction', false,
    'checkoutCreated', false,
    'payoutCreated', false,
    'transferCreated', false
  );
end;
$$;

comment on function public."set_platform_money_kill_switch_state"(text, text, text, text, jsonb)
  is 'Owner/operator/service-role audited control for constrained platform money switches. Sandbox states do not enable live money, payouts, transfers, withdrawals, cash-out, or payable balances.';

revoke all on function public."set_platform_money_kill_switch_state"(text, text, text, text, jsonb)
  from public, anon;
grant execute on function public."set_platform_money_kill_switch_state"(text, text, text, text, jsonb)
  to authenticated, service_role;

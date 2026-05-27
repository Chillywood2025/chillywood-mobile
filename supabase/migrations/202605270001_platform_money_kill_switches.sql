-- Money Center owner/admin kill switches.
-- This is a control scaffold only. It does not enable checkout, tips, paid
-- content, Watch-Party seat sales, merch checkout, balances, transfers,
-- withdrawals, payouts, provider grants, or live money movement.

create table if not exists public."platform_money_kill_switches" (
  "id" uuid primary key default gen_random_uuid(),
  "key" text unique not null,
  "state" text not null,
  "display_label" text not null,
  "description" text,
  "reason" text,
  "owner_only_reason" text,
  "updated_by" uuid,
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "platform_money_kill_switches_key_check"
    check ("key" in (
      'money_center_visible',
      'digital_sales_enabled',
      'tips_enabled',
      'watch_party_seats_enabled',
      'paid_content_enabled',
      'merch_enabled',
      'creator_balance_visible',
      'payouts_enabled',
      'stripe_connect_enabled',
      'revenuecat_google_play_enabled',
      'provider_webhooks_enabled',
      'live_money_enabled',
      'creator_monetization_enabled',
      'creator_revenue_imports_enabled',
      'tax_kyc_collection_enabled',
      'ads_revenue_enabled',
      'sponsorships_enabled'
    )),
  constraint "platform_money_kill_switches_state_check"
    check ("state" in ('off', 'on', 'locked', 'maintenance', 'sandbox_only')),
  constraint "platform_money_kill_switches_live_money_default_safe_check"
    check ("key" <> 'live_money_enabled' or "state" <> 'on' or nullif(trim(coalesce("reason", '')), '') is not null)
);

create index if not exists "platform_money_kill_switches_state_idx"
  on public."platform_money_kill_switches" using btree ("state", "key");

create table if not exists public."platform_money_kill_switch_audit" (
  "id" uuid primary key default gen_random_uuid(),
  "actor_user_id" uuid,
  "switch_key" text not null,
  "old_state" text,
  "new_state" text not null,
  "reason" text not null,
  "security_context_id" uuid,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "platform_money_kill_switch_audit_switch_key_check"
    check ("switch_key" in (
      'money_center_visible',
      'digital_sales_enabled',
      'tips_enabled',
      'watch_party_seats_enabled',
      'paid_content_enabled',
      'merch_enabled',
      'creator_balance_visible',
      'payouts_enabled',
      'stripe_connect_enabled',
      'revenuecat_google_play_enabled',
      'provider_webhooks_enabled',
      'live_money_enabled',
      'creator_monetization_enabled',
      'creator_revenue_imports_enabled',
      'tax_kyc_collection_enabled',
      'ads_revenue_enabled',
      'sponsorships_enabled'
    )),
  constraint "platform_money_kill_switch_audit_state_check"
    check (
      ("old_state" is null or "old_state" in ('off', 'on', 'locked', 'maintenance', 'sandbox_only'))
      and "new_state" in ('off', 'on', 'locked', 'maintenance', 'sandbox_only')
    ),
  constraint "platform_money_kill_switch_audit_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object')
);

create index if not exists "platform_money_kill_switch_audit_created_at_idx"
  on public."platform_money_kill_switch_audit" using btree ("created_at" desc);

create index if not exists "platform_money_kill_switch_audit_key_created_at_idx"
  on public."platform_money_kill_switch_audit" using btree ("switch_key", "created_at" desc);

create or replace function public."touch_platform_money_kill_switch_updated_at"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new."updated_at" = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists "touch_platform_money_kill_switch_updated_at" on public."platform_money_kill_switches";
create trigger "touch_platform_money_kill_switch_updated_at"
  before update on public."platform_money_kill_switches"
  for each row execute function public."touch_platform_money_kill_switch_updated_at"();

create or replace function public."prevent_platform_money_kill_switch_audit_mutation"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'platform_money_kill_switch_audit_is_append_only';
end;
$$;

drop trigger if exists "prevent_platform_money_kill_switch_audit_mutation" on public."platform_money_kill_switch_audit";
create trigger "prevent_platform_money_kill_switch_audit_mutation"
  before update or delete on public."platform_money_kill_switch_audit"
  for each row execute function public."prevent_platform_money_kill_switch_audit_mutation"();

alter table public."platform_money_kill_switches" enable row level security;
alter table public."platform_money_kill_switch_audit" enable row level security;

drop policy if exists "platform_money_kill_switches_select_owner_operator" on public."platform_money_kill_switches";
create policy "platform_money_kill_switches_select_owner_operator"
  on public."platform_money_kill_switches"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "platform_money_kill_switch_audit_select_owner_operator" on public."platform_money_kill_switch_audit";
create policy "platform_money_kill_switch_audit_select_owner_operator"
  on public."platform_money_kill_switch_audit"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."platform_money_kill_switches" from anon, authenticated;
revoke all on table public."platform_money_kill_switch_audit" from anon, authenticated;
grant select on table public."platform_money_kill_switches" to authenticated;
grant select on table public."platform_money_kill_switch_audit" to authenticated;
grant all on table public."platform_money_kill_switches" to service_role;
grant all on table public."platform_money_kill_switch_audit" to service_role;

insert into public."platform_money_kill_switches" (
  "key",
  "state",
  "display_label",
  "description",
  "reason",
  "owner_only_reason"
)
values
  ('money_center_visible', 'on', 'Money Center visible', 'Controls whether creators can see the consolidated Money Center surface.', 'Money Center is visible as a read-only production scaffold.', 'Default on so creators have one honest place to see setup and readiness.'),
  ('digital_sales_enabled', 'off', 'Digital sales', 'Controls paid digital access claims and sale controls.', 'Digital sales are not active yet.', 'Keep off until RevenueCat/Google Play provider proof, product policy, refund handling, and live-money approval pass.'),
  ('tips_enabled', 'off', 'Tips', 'Controls creator-support tip products and tip checkout claims.', 'Tips are not active yet.', 'Keep off until Android billing/provider policy, product setup, refund handling, and payout ledger proof pass.'),
  ('watch_party_seats_enabled', 'off', 'Watch-Party seats', 'Controls paid Watch-Party seat access claims and sale controls.', 'Watch-Party seats are not active yet.', 'Keep off until digital seat products, entitlement checks, room authority policy, and provider proof pass.'),
  ('paid_content_enabled', 'off', 'Paid content', 'Controls paid videos, posts, collections, and digital content access claims.', 'Paid content is not active yet.', 'Keep off until Google Play/RevenueCat access products, entitlement checks, refund handling, and policy proof pass.'),
  ('merch_enabled', 'off', 'Merch', 'Controls physical merch checkout and merch-order claims.', 'Merch is not active yet.', 'Keep off until physical-goods provider, tax, shipping, fulfillment, refund, and dispute review pass.'),
  ('creator_balance_visible', 'on', 'Creator balance visible', 'Controls the read-only creator balance section.', 'Creator balance is visible as a ledger-first empty/readiness section.', 'Default on because the section shows no dollar amounts without verified ledger rows.'),
  ('payouts_enabled', 'off', 'Payouts', 'Controls payout and cash-out availability claims.', 'Payouts are unavailable.', 'Keep off until Stripe Connect, KYC/tax, ledger, hold, fraud, owner approval, and payout-release proof pass.'),
  ('stripe_connect_enabled', 'sandbox_only', 'Stripe Connect', 'Controls Stripe Connect setup/readiness surfaces.', 'Stripe setup can be reviewed in sandbox only.', 'Sandbox-only allows provider setup proof without creating transfers, payouts, or live money.'),
  ('revenuecat_google_play_enabled', 'sandbox_only', 'RevenueCat / Google Play', 'Controls store readiness surfaces for Android digital purchases.', 'Store setup can be reviewed in sandbox only.', 'Sandbox-only allows provider checks without activating production digital sales.'),
  ('provider_webhooks_enabled', 'sandbox_only', 'Provider webhooks', 'Controls provider webhook processing beyond audit/readiness.', 'Webhook checks are sandbox/readiness only.', 'Webhook shells may audit readiness but must not activate money while live money is off.'),
  ('live_money_enabled', 'off', 'Live money', 'Global switch for production money movement and live money claims.', 'Live money is off.', 'This must stay off until provider proof, legal/accounting approval, rollback plan, and owner-documented launch approval exist.'),
  ('creator_monetization_enabled', 'sandbox_only', 'Creator monetization', 'Optional global scaffold for creator monetization readiness.', 'Creator monetization checks are readiness-only.', 'Sandbox/readiness state only; no creator money is active.'),
  ('creator_revenue_imports_enabled', 'off', 'Revenue imports', 'Optional switch for provider-backed creator revenue imports.', 'Revenue imports are not active yet.', 'Keep off until real source provider, idempotency, reconciliation, and audit proof pass.'),
  ('tax_kyc_collection_enabled', 'off', 'Tax and KYC collection', 'Optional switch for live tax/KYC collection workflows.', 'Tax and KYC collection are not active yet.', 'Keep off until provider/legal review and privacy handling are approved.'),
  ('ads_revenue_enabled', 'off', 'Ad revenue', 'Optional switch for creator ad revenue sharing.', 'Ad revenue is planned.', 'Keep off until real ad reporting, policy, ledger, and payout checks pass.'),
  ('sponsorships_enabled', 'off', 'Sponsorships', 'Optional switch for creator sponsorship money tools.', 'Sponsorship money tools are planned.', 'Keep off until review, disclosure, brand safety, provider payment, and payout proof pass.')
on conflict ("key") do update
set
  "display_label" = excluded."display_label",
  "description" = excluded."description";

insert into public."platform_money_kill_switch_audit" (
  "switch_key",
  "old_state",
  "new_state",
  "reason",
  "metadata"
)
select
  'live_money_enabled',
  null,
  'off',
  'Money kill-switch scaffold created with live money off. No checkout, tip, paid content, merch sale, balance, transfer, withdrawal, payout, or provider grant was enabled.',
  jsonb_build_object(
    'foundation_only', true,
    'live_money_enabled', false,
    'checkout_created', false,
    'tip_created', false,
    'paid_content_sale_created', false,
    'watch_party_seat_sale_created', false,
    'merch_sale_created', false,
    'balance_created', false,
    'payout_created', false,
    'transfer_created', false,
    'withdrawal_created', false,
    'secret_values_stored', false
  )
where not exists (
  select 1
  from public."platform_money_kill_switch_audit"
  where "switch_key" = 'live_money_enabled'
    and "reason" like 'Money kill-switch scaffold created%'
);

insert into public."platform_admin_audit_logs" (
  "actor_role",
  "action",
  "action_category",
  "target_type",
  "target_id",
  "reason",
  "severity",
  "before_state",
  "after_state",
  "metadata"
)
select
  'foundation',
  'money_kill_switch_scaffold_created',
  'finance',
  'platform_money_kill_switches',
  'live_money_enabled',
  'Money kill-switch scaffold created. Live money remains off and no money movement or checkout was enabled.',
  'notice',
  jsonb_build_object('live_money_enabled', null),
  jsonb_build_object('live_money_enabled', 'off'),
  jsonb_build_object(
    'foundation_only', true,
    'backend_enforced_switches', true,
    'creator_summary_sanitized', true,
    'secret_values_stored', false,
    'live_money_enabled', false
  )
where to_regclass('public.platform_admin_audit_logs') is not null
  and not exists (
    select 1
    from public."platform_admin_audit_logs"
    where "action" = 'money_kill_switch_scaffold_created'
      and "target_type" = 'platform_money_kill_switches'
  );

create or replace function public."money_kill_switch_state_label"(p_state text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_state
    when 'on' then 'Active'
    when 'sandbox_only' then 'Sandbox ready'
    when 'maintenance' then 'Disabled'
    when 'locked' then 'Blocked'
    else 'Disabled'
  end;
$$;

create or replace function public."money_kill_switch_public_summary"(p_state text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_state
    when 'on' then 'Available only when provider checks also pass.'
    when 'sandbox_only' then 'Sandbox checks can be reviewed, but live money is not active.'
    when 'maintenance' then 'Temporarily unavailable.'
    when 'locked' then 'This money feature is unavailable.'
    else 'Turned off by owner.'
  end;
$$;

create or replace function public."get_money_feature_flags_summary"()
returns table (
  "key" text,
  "state" text,
  "display_label" text,
  "display_summary" text,
  "updated_at" timestamptz,
  "public_safe" boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    flag."key",
    flag."state",
    public."money_kill_switch_state_label"(flag."state") as "display_label",
    public."money_kill_switch_public_summary"(flag."state") as "display_summary",
    flag."updated_at",
    true as "public_safe"
  from public."platform_money_kill_switches" flag
  order by
    case flag."key"
      when 'money_center_visible' then 10
      when 'digital_sales_enabled' then 20
      when 'tips_enabled' then 30
      when 'watch_party_seats_enabled' then 40
      when 'paid_content_enabled' then 50
      when 'merch_enabled' then 60
      when 'creator_balance_visible' then 70
      when 'payouts_enabled' then 80
      when 'stripe_connect_enabled' then 90
      when 'revenuecat_google_play_enabled' then 100
      when 'provider_webhooks_enabled' then 110
      when 'live_money_enabled' then 120
      else 200
    end;
end;
$$;

create or replace function public."get_platform_money_kill_switches"()
returns table (
  "key" text,
  "state" text,
  "display_label" text,
  "description" text,
  "reason" text,
  "owner_only_reason" text,
  "updated_by" uuid,
  "updated_at" timestamptz,
  "created_at" timestamptz,
  "latest_audit_at" timestamptz,
  "latest_audit_reason" text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
begin
  if v_request_role <> 'service_role'
    and not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception 'money_kill_switch_admin_required';
  end if;

  return query
  select
    flag."key",
    flag."state",
    flag."display_label",
    flag."description",
    flag."reason",
    flag."owner_only_reason",
    flag."updated_by",
    flag."updated_at",
    flag."created_at",
    latest_audit."created_at" as "latest_audit_at",
    latest_audit."reason" as "latest_audit_reason"
  from public."platform_money_kill_switches" flag
  left join lateral (
    select audit."created_at", audit."reason"
    from public."platform_money_kill_switch_audit" audit
    where audit."switch_key" = flag."key"
    order by audit."created_at" desc
    limit 1
  ) latest_audit on true
  order by
    case flag."key"
      when 'money_center_visible' then 10
      when 'digital_sales_enabled' then 20
      when 'tips_enabled' then 30
      when 'watch_party_seats_enabled' then 40
      when 'paid_content_enabled' then 50
      when 'merch_enabled' then 60
      when 'creator_balance_visible' then 70
      when 'payouts_enabled' then 80
      when 'stripe_connect_enabled' then 90
      when 'revenuecat_google_play_enabled' then 100
      when 'provider_webhooks_enabled' then 110
      when 'live_money_enabled' then 120
      else 200
    end;
end;
$$;

create or replace function public."list_platform_money_kill_switch_audit"(p_limit integer default 25)
returns table (
  "id" uuid,
  "actor_user_id" uuid,
  "switch_key" text,
  "old_state" text,
  "new_state" text,
  "reason" text,
  "security_context_id" uuid,
  "created_at" timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
begin
  if v_request_role <> 'service_role'
    and not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception 'money_kill_switch_admin_required';
  end if;

  return query
  select
    audit."id",
    audit."actor_user_id",
    audit."switch_key",
    audit."old_state",
    audit."new_state",
    audit."reason",
    audit."security_context_id",
    audit."created_at"
  from public."platform_money_kill_switch_audit" audit
  order by audit."created_at" desc
  limit v_limit;
end;
$$;

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
  v_metadata jsonb := case when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object' then coalesce(p_metadata, '{}'::jsonb) else '{}'::jsonb end;
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

  if v_key not in (
    'money_center_visible',
    'digital_sales_enabled',
    'tips_enabled',
    'watch_party_seats_enabled',
    'paid_content_enabled',
    'merch_enabled',
    'creator_balance_visible',
    'payouts_enabled',
    'stripe_connect_enabled',
    'revenuecat_google_play_enabled',
    'provider_webhooks_enabled',
    'live_money_enabled',
    'creator_monetization_enabled',
    'creator_revenue_imports_enabled',
    'tax_kyc_collection_enabled',
    'ads_revenue_enabled',
    'sponsorships_enabled'
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
    'watch_party_seats_enabled',
    'paid_content_enabled',
    'stripe_connect_enabled',
    'provider_webhooks_enabled'
  );

  if v_reason is null or length(v_reason) < 6 then
    raise exception 'money_kill_switch_reason_required';
  end if;

  if v_state = 'on'
    and v_key in (
      'live_money_enabled',
      'payouts_enabled',
      'digital_sales_enabled',
      'tips_enabled',
      'watch_party_seats_enabled',
      'paid_content_enabled'
    )
    and length(v_reason) < 12 then
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
      case when v_key = 'live_money_enabled' or (v_high_risk and v_state = 'on') then 'critical' when v_high_risk then 'warning' else 'notice' end,
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

create or replace function public."is_money_feature_allowed"(
  p_key text,
  p_require_live_money boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(trim(coalesce(p_key, '')));
  v_state text;
  v_live_state text;
begin
  select "state" into v_state
  from public."platform_money_kill_switches"
  where "key" = v_key;

  if v_state is null then
    return false;
  end if;

  if p_require_live_money then
    select "state" into v_live_state
    from public."platform_money_kill_switches"
    where "key" = 'live_money_enabled';

    if v_live_state <> 'on' then
      return false;
    end if;

    return v_state = 'on';
  end if;

  return v_state in ('on', 'sandbox_only');
end;
$$;

create or replace function public."assert_money_feature_allowed"(
  p_key text,
  p_require_live_money boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public."is_money_feature_allowed"(p_key, p_require_live_money) then
    raise exception 'money_feature_disabled';
  end if;
end;
$$;

revoke all on function public."money_kill_switch_state_label"(text) from public;
revoke all on function public."money_kill_switch_public_summary"(text) from public;
revoke all on function public."get_money_feature_flags_summary"() from public;
revoke all on function public."get_platform_money_kill_switches"() from public;
revoke all on function public."list_platform_money_kill_switch_audit"(integer) from public;
revoke all on function public."set_platform_money_kill_switch_state"(text, text, text, text, jsonb) from public;
revoke all on function public."is_money_feature_allowed"(text, boolean) from public;
revoke all on function public."assert_money_feature_allowed"(text, boolean) from public;

grant execute on function public."get_money_feature_flags_summary"() to authenticated;
grant execute on function public."get_money_feature_flags_summary"() to service_role;
grant execute on function public."get_platform_money_kill_switches"() to authenticated, service_role;
grant execute on function public."list_platform_money_kill_switch_audit"(integer) to authenticated, service_role;
grant execute on function public."set_platform_money_kill_switch_state"(text, text, text, text, jsonb) to authenticated, service_role;
grant execute on function public."is_money_feature_allowed"(text, boolean) to authenticated, service_role;
grant execute on function public."assert_money_feature_allowed"(text, boolean) to authenticated, service_role;

comment on table public."platform_money_kill_switches"
  is 'Backend-enforced Money Center kill switches. Do not store provider secrets, raw provider payloads, card data, bank data, balances, payout obligations, checkout instructions, transfer instructions, or live-money credentials.';

comment on table public."platform_money_kill_switch_audit"
  is 'Append-only audit for Money Center kill switch changes. Metadata must stay sanitized and must not contain secret values or raw provider payloads.';

comment on function public."get_money_feature_flags_summary"()
  is 'Creator-safe sanitized Money Center switch summary. Returns states only, not owner-only reasons, provider payloads, or secrets.';

comment on function public."set_platform_money_kill_switch_state"(text, text, text, text, jsonb)
  is 'Owner/Admin security-definer RPC for money kill-switch changes. Requires reason and immutable audit; high-risk switches fail closed if admin audit cannot be written.';

comment on function public."assert_money_feature_allowed"(text, boolean)
  is 'Backend guard for future money actions. Live money actions must pass both the target switch and live_money_enabled.';

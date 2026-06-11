-- Tips V1: Stripe Connect test-mode creator contributions.
-- This migration is additive. It does not grant digital access, room access,
-- badges, VIP, subscriptions, Premium, payout execution, transfers, or live
-- money activation.

create table if not exists public."creator_tip_settings" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_id" uuid not null unique,
  "tips_enabled" boolean not null default false,
  "provider" text not null default 'stripe_connect',
  "provider_environment" text not null default 'test',
  "provider_account_id" text,
  "provider_onboarding_status" text not null default 'setup_required',
  "provider_charges_enabled" boolean not null default false,
  "provider_payouts_enabled" boolean not null default false,
  "default_amount_cents" integer,
  "suggested_amounts_cents" integer[] not null default array[100, 300, 500, 1000],
  "min_amount_cents" integer not null default 100,
  "max_amount_cents" integer not null default 50000,
  "currency" text not null default 'usd',
  "status" text not null default 'setup_incomplete',
  "last_provider_sync_at" timestamptz,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_tip_settings_provider_check"
    check ("provider" in ('stripe_connect', 'manual', 'unknown')),
  constraint "creator_tip_settings_environment_check"
    check ("provider_environment" in ('test', 'live', 'unknown')),
  constraint "creator_tip_settings_onboarding_check"
    check ("provider_onboarding_status" in (
      'setup_required',
      'onboarding_in_progress',
      'action_required',
      'under_review',
      'ready_for_payouts',
      'payouts_disabled',
      'not_configured',
      'unknown'
    )),
  constraint "creator_tip_settings_status_check"
    check ("status" in ('setup_incomplete', 'active', 'paused', 'blocked')),
  constraint "creator_tip_settings_currency_check" check ("currency" ~ '^[a-z]{3}$'),
  constraint "creator_tip_settings_amount_check" check (
    "min_amount_cents" >= 100
    and "max_amount_cents" >= "min_amount_cents"
    and "max_amount_cents" <= 50000
    and ("default_amount_cents" is null or ("default_amount_cents" >= "min_amount_cents" and "default_amount_cents" <= "max_amount_cents"))
    and cardinality("suggested_amounts_cents") between 1 and 6
  ),
  constraint "creator_tip_settings_metadata_secret_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|card|bank|client_secret)')
);

create index if not exists "creator_tip_settings_status_idx"
  on public."creator_tip_settings" using btree ("status", "updated_at" desc);

alter table public."creator_tip_transactions"
  add column if not exists "status" text not null default 'pending',
  add column if not exists "message_private" text,
  add column if not exists "provider_account_id" text,
  add column if not exists "provider_environment" text not null default 'test',
  add column if not exists "provider_checkout_session_id" text,
  add column if not exists "provider_payment_intent_id" text,
  add column if not exists "platform_fee_cents" integer not null default 0,
  add column if not exists "creator_net_cents" integer,
  add column if not exists "checkout_started_at" timestamptz,
  add column if not exists "paid_at" timestamptz,
  add column if not exists "failed_at" timestamptz,
  add column if not exists "refunded_at" timestamptz,
  add column if not exists "disputed_at" timestamptz,
  add column if not exists "idempotency_key" text,
  add column if not exists "metadata" jsonb not null default '{}'::jsonb;

alter table public."creator_tip_transactions"
  drop constraint if exists "creator_tip_transactions_v1_status_check";

alter table public."creator_tip_transactions"
  add constraint "creator_tip_transactions_v1_status_check"
    check ("status" in ('pending', 'checkout_started', 'paid', 'failed', 'canceled', 'refunded', 'disputed'));

alter table public."creator_tip_transactions"
  drop constraint if exists "creator_tip_transactions_v1_environment_check";

alter table public."creator_tip_transactions"
  add constraint "creator_tip_transactions_v1_environment_check"
    check ("provider_environment" in ('test', 'live', 'unknown'));

alter table public."creator_tip_transactions"
  drop constraint if exists "creator_tip_transactions_v1_fee_check";

alter table public."creator_tip_transactions"
  add constraint "creator_tip_transactions_v1_fee_check"
    check (
      "platform_fee_cents" = 0
      and ("creator_net_cents" is null or "creator_net_cents" >= 0)
      and ("message_private" is null or char_length("message_private") <= 280)
      and "metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|card|bank|client_secret)'
    );

create unique index if not exists "creator_tip_transactions_checkout_session_unique"
  on public."creator_tip_transactions" ("provider", "provider_checkout_session_id")
  where "provider_checkout_session_id" is not null;

create unique index if not exists "creator_tip_transactions_payment_intent_unique"
  on public."creator_tip_transactions" ("provider", "provider_payment_intent_id")
  where "provider_payment_intent_id" is not null;

create unique index if not exists "creator_tip_transactions_idempotency_unique"
  on public."creator_tip_transactions" ("provider", "provider_environment", "idempotency_key")
  where "idempotency_key" is not null;

create index if not exists "creator_tip_transactions_creator_status_v1_idx"
  on public."creator_tip_transactions" ("creator_id", "status", "created_at" desc);

create index if not exists "creator_tip_transactions_sender_status_v1_idx"
  on public."creator_tip_transactions" ("sender_id", "status", "created_at" desc);

create table if not exists public."creator_tip_events" (
  "id" uuid primary key default gen_random_uuid(),
  "tip_transaction_id" uuid references public."creator_tip_transactions"("id") on delete cascade,
  "actor_id" uuid,
  "event_type" text not null,
  "provider" text not null default 'stripe_connect',
  "provider_environment" text not null default 'test',
  "provider_event_id" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_tip_events_type_check"
    check ("event_type" in (
      'settings_updated',
      'checkout_created',
      'checkout_started',
      'checkout_completed',
      'payment_succeeded',
      'payment_failed',
      'checkout_canceled',
      'refunded',
      'disputed',
      'webhook_ignored',
      'webhook_duplicate',
      'provider_blocked'
    )),
  constraint "creator_tip_events_environment_check"
    check ("provider_environment" in ('test', 'live', 'unknown')),
  constraint "creator_tip_events_metadata_secret_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|card|bank|client_secret)')
);

create unique index if not exists "creator_tip_events_provider_event_unique"
  on public."creator_tip_events" ("provider", "provider_environment", "provider_event_id", "event_type")
  where "provider_event_id" is not null;

create index if not exists "creator_tip_events_tip_idx"
  on public."creator_tip_events" ("tip_transaction_id", "created_at" desc);

create index if not exists "creator_tip_events_type_idx"
  on public."creator_tip_events" ("event_type", "created_at" desc);

drop trigger if exists "touch_creator_tip_settings_updated_at" on public."creator_tip_settings";
create trigger "touch_creator_tip_settings_updated_at"
  before update on public."creator_tip_settings"
  for each row execute function public."touch_creator_monetization_updated_at"();

drop trigger if exists "touch_creator_tip_transactions_updated_at" on public."creator_tip_transactions";
create trigger "touch_creator_tip_transactions_updated_at"
  before update on public."creator_tip_transactions"
  for each row execute function public."touch_creator_monetization_updated_at"();

alter table public."creator_tip_settings" enable row level security;
alter table public."creator_tip_events" enable row level security;

drop policy if exists "creator_tip_settings_select_creator_admin" on public."creator_tip_settings";
create policy "creator_tip_settings_select_creator_admin"
  on public."creator_tip_settings" for select to authenticated
  using ("creator_id" = auth.uid() or public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_tip_settings_write_creator_admin" on public."creator_tip_settings";
create policy "creator_tip_settings_write_creator_admin"
  on public."creator_tip_settings" for all to authenticated
  using ("creator_id" = auth.uid() or public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check ("creator_id" = auth.uid() or public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_tip_events_select_participant_admin" on public."creator_tip_events";
create policy "creator_tip_events_select_participant_admin"
  on public."creator_tip_events" for select to authenticated
  using (
    public.has_platform_role(array['owner'::text, 'operator'::text])
    or exists (
      select 1
      from public."creator_tip_transactions" tip
      where tip."id" = public."creator_tip_events"."tip_transaction_id"
        and (tip."sender_id" = auth.uid() or tip."creator_id" = auth.uid())
    )
  );

revoke all on table public."creator_tip_settings" from anon, authenticated;
revoke all on table public."creator_tip_events" from anon, authenticated;
grant select on table public."creator_tip_settings" to authenticated;
grant select on table public."creator_tip_events" to authenticated;
grant all on table public."creator_tip_settings" to service_role;
grant all on table public."creator_tip_events" to service_role;

create or replace function public."normalize_tip_settings_status"(
  p_tips_enabled boolean,
  p_charges_enabled boolean,
  p_payouts_enabled boolean,
  p_onboarding_status text
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_tips_enabled, false) = false then 'paused'
    when coalesce(p_charges_enabled, false) = true
      and coalesce(p_payouts_enabled, false) = true
      and coalesce(p_onboarding_status, '') = 'ready_for_payouts' then 'active'
    when coalesce(p_onboarding_status, '') = 'payouts_disabled' then 'blocked'
    else 'setup_incomplete'
  end;
$$;

create or replace function public."upsert_my_creator_tip_settings"(
  p_tips_enabled boolean,
  p_suggested_amounts_cents integer[] default array[100, 300, 500, 1000],
  p_default_amount_cents integer default null,
  p_min_amount_cents integer default 100,
  p_max_amount_cents integer default 50000,
  p_currency text default 'usd'
)
returns public."creator_tip_settings"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_currency text := lower(trim(coalesce(p_currency, 'usd')));
  v_suggested integer[];
  v_payout public."creator_payout_accounts"%rowtype;
  v_row public."creator_tip_settings"%rowtype;
begin
  if v_actor_id is null then
    raise exception 'auth_required';
  end if;

  if v_currency <> 'usd' then
    raise exception 'unsupported_currency';
  end if;

  select coalesce(array_agg(distinct amount order by amount), array[100, 300, 500, 1000])
  into v_suggested
  from unnest(coalesce(p_suggested_amounts_cents, array[100, 300, 500, 1000])) as amount
  where amount between greatest(coalesce(p_min_amount_cents, 100), 100) and least(coalesce(p_max_amount_cents, 50000), 50000);

  if cardinality(v_suggested) = 0 then
    v_suggested := array[100, 300, 500, 1000];
  end if;

  v_suggested := v_suggested[1:6];

  select *
  into v_payout
  from public."creator_payout_accounts"
  where "creator_user_id" = v_actor_id::text
    and "provider" = 'stripe_connect'
    and "provider_environment" = 'test'
  limit 1;

  insert into public."creator_tip_settings" (
    "creator_id",
    "tips_enabled",
    "provider",
    "provider_environment",
    "provider_account_id",
    "provider_onboarding_status",
    "provider_charges_enabled",
    "provider_payouts_enabled",
    "default_amount_cents",
    "suggested_amounts_cents",
    "min_amount_cents",
    "max_amount_cents",
    "currency",
    "status",
    "last_provider_sync_at",
    "metadata"
  )
  values (
    v_actor_id,
    coalesce(p_tips_enabled, false),
    'stripe_connect',
    'test',
    v_payout."provider_account_id",
    coalesce(v_payout."onboarding_status", 'setup_required'),
    coalesce(v_payout."charges_enabled", false),
    coalesce(v_payout."payouts_enabled", false),
    p_default_amount_cents,
    v_suggested,
    greatest(coalesce(p_min_amount_cents, 100), 100),
    least(coalesce(p_max_amount_cents, 50000), 50000),
    v_currency,
    public."normalize_tip_settings_status"(
      coalesce(p_tips_enabled, false),
      coalesce(v_payout."charges_enabled", false),
      coalesce(v_payout."payouts_enabled", false),
      coalesce(v_payout."onboarding_status", 'setup_required')
    ),
    coalesce(v_payout."last_provider_sync_at", timezone('utc'::text, now())),
    jsonb_build_object(
      'tips_v1', true,
      'pure_contribution_only', true,
      'no_digital_access_granted', true,
      'provider_environment', 'test'
    )
  )
  on conflict ("creator_id") do update
  set
    "tips_enabled" = excluded."tips_enabled",
    "provider_account_id" = excluded."provider_account_id",
    "provider_onboarding_status" = excluded."provider_onboarding_status",
    "provider_charges_enabled" = excluded."provider_charges_enabled",
    "provider_payouts_enabled" = excluded."provider_payouts_enabled",
    "default_amount_cents" = excluded."default_amount_cents",
    "suggested_amounts_cents" = excluded."suggested_amounts_cents",
    "min_amount_cents" = excluded."min_amount_cents",
    "max_amount_cents" = excluded."max_amount_cents",
    "currency" = excluded."currency",
    "status" = excluded."status",
    "last_provider_sync_at" = excluded."last_provider_sync_at",
    "metadata" = public."creator_tip_settings"."metadata" || excluded."metadata",
    "updated_at" = timezone('utc'::text, now())
  returning * into v_row;

  insert into public."creator_tip_events" (
    "tip_transaction_id",
    "actor_id",
    "event_type",
    "metadata"
  )
  values (
    null,
    v_actor_id,
    'settings_updated',
    jsonb_build_object(
      'creator_id', v_actor_id,
      'tips_enabled', coalesce(p_tips_enabled, false),
      'status', v_row."status",
      'pure_contribution_only', true,
      'no_access_granted', true
    )
  );

  return v_row;
end;
$$;

create or replace function public."get_my_creator_tip_settings"()
returns public."creator_tip_settings"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_row public."creator_tip_settings"%rowtype;
begin
  if v_actor_id is null then
    raise exception 'auth_required';
  end if;

  select *
  into v_row
  from public."creator_tip_settings"
  where "creator_id" = v_actor_id;

  if v_row."id" is null then
    return public."upsert_my_creator_tip_settings"(false);
  end if;

  return v_row;
end;
$$;

create or replace function public."get_creator_tip_public_status"(p_creator_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings public."creator_tip_settings"%rowtype;
  v_tips_flag text := 'off';
  v_live_flag text := 'off';
begin
  if p_creator_id is null then
    return jsonb_build_object('canTip', false, 'reason', 'creator_missing');
  end if;

  select "state" into v_tips_flag
  from public."platform_money_kill_switches"
  where "key" = 'tips_enabled';

  select "state" into v_live_flag
  from public."platform_money_kill_switches"
  where "key" = 'live_money_enabled';

  select *
  into v_settings
  from public."creator_tip_settings"
  where "creator_id" = p_creator_id;

  if v_settings."id" is null then
    return jsonb_build_object('canTip', false, 'reason', 'tips_not_enabled');
  end if;

  return jsonb_build_object(
    'canTip',
      coalesce(v_settings."tips_enabled", false)
      and v_settings."status" = 'active'
      and coalesce(v_settings."provider_charges_enabled", false)
      and coalesce(v_settings."provider_payouts_enabled", false)
      and coalesce(v_tips_flag, 'off') in ('on', 'sandbox_only'),
    'status', v_settings."status",
    'reason',
      case
        when coalesce(v_tips_flag, 'off') not in ('on', 'sandbox_only') then 'tips_disabled_by_platform'
        when coalesce(v_settings."tips_enabled", false) = false then 'tips_paused'
        when v_settings."status" <> 'active' then v_settings."status"
        when coalesce(v_settings."provider_charges_enabled", false) = false then 'provider_charges_not_ready'
        when coalesce(v_settings."provider_payouts_enabled", false) = false then 'provider_payouts_not_ready'
        else 'ready'
      end,
    'creatorId', p_creator_id,
    'currency', v_settings."currency",
    'suggestedAmountsCents', v_settings."suggested_amounts_cents",
    'defaultAmountCents', v_settings."default_amount_cents",
    'minAmountCents', v_settings."min_amount_cents",
    'maxAmountCents', v_settings."max_amount_cents",
    'providerEnvironment', v_settings."provider_environment",
    'testMode', v_settings."provider_environment" = 'test' or coalesce(v_live_flag, 'off') <> 'on',
    'liveMoneyEnabled', coalesce(v_live_flag, 'off') = 'on',
    'policyCopy', 'Tips support the creator and do not unlock content, badges, room access, VIP, or perks.'
  );
end;
$$;

create or replace function public."list_my_creator_tip_transactions"(p_limit integer default 25)
returns table (
  id uuid,
  creator_id uuid,
  sender_id uuid,
  tip_amount_cents integer,
  currency text,
  status text,
  payment_status text,
  payout_status text,
  platform_fee_cents integer,
  provider_fee_cents integer,
  creator_net_cents integer,
  message_private text,
  provider text,
  provider_environment text,
  provider_checkout_session_id text,
  provider_payment_intent_id text,
  created_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tip."id",
    tip."creator_id",
    tip."sender_id",
    tip."tip_amount_cents",
    tip."currency",
    tip."status",
    tip."payment_status",
    tip."payout_status",
    tip."platform_fee_cents",
    tip."provider_fee_cents",
    tip."creator_net_cents",
    case when tip."creator_id" = auth.uid() then tip."message_private" else null end as "message_private",
    tip."provider",
    tip."provider_environment",
    case when public.has_platform_role(array['owner'::text, 'operator'::text]) then tip."provider_checkout_session_id" else null end as "provider_checkout_session_id",
    case when public.has_platform_role(array['owner'::text, 'operator'::text]) then tip."provider_payment_intent_id" else null end as "provider_payment_intent_id",
    tip."created_at",
    tip."paid_at",
    tip."failed_at",
    tip."refunded_at"
  from public."creator_tip_transactions" tip
  where tip."creator_id" = auth.uid()
     or tip."sender_id" = auth.uid()
     or public.has_platform_role(array['owner'::text, 'operator'::text])
  order by tip."created_at" desc
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

create or replace function public."get_my_tip_transaction_status"(p_tip_transaction_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'id', tip."id",
      'creatorId', tip."creator_id",
      'senderId', tip."sender_id",
      'amountCents', tip."tip_amount_cents",
      'currency', tip."currency",
      'status', tip."status",
      'paymentStatus', tip."payment_status",
      'createdAt', tip."created_at",
      'paidAt', tip."paid_at",
      'failedAt', tip."failed_at",
      'refundedAt', tip."refunded_at",
      'pureContributionOnly', true,
      'accessGranted', false
    )
    from public."creator_tip_transactions" tip
    where tip."id" = p_tip_transaction_id
      and (tip."sender_id" = auth.uid() or tip."creator_id" = auth.uid() or public.has_platform_role(array['owner'::text, 'operator'::text]))
  ), jsonb_build_object('status', 'not_found'));
$$;

revoke all on function public."upsert_my_creator_tip_settings"(boolean, integer[], integer, integer, integer, text) from public;
revoke all on function public."get_my_creator_tip_settings"() from public;
revoke all on function public."get_creator_tip_public_status"(uuid) from public;
revoke all on function public."list_my_creator_tip_transactions"(integer) from public;
revoke all on function public."get_my_tip_transaction_status"(uuid) from public;

grant execute on function public."upsert_my_creator_tip_settings"(boolean, integer[], integer, integer, integer, text) to authenticated;
grant execute on function public."get_my_creator_tip_settings"() to authenticated;
grant execute on function public."get_creator_tip_public_status"(uuid) to anon, authenticated;
grant execute on function public."list_my_creator_tip_transactions"(integer) to authenticated;
grant execute on function public."get_my_tip_transaction_status"(uuid) to authenticated;

comment on table public."creator_tip_settings" is
  'Tips V1 creator settings. Pure contribution only; does not unlock content, badges, VIP, rooms, subscriptions, paid video, event, or Watch-Party access.';

comment on table public."creator_tip_transactions" is
  'Creator tip transaction ledger. Server/webhook verified rows only become paid; tips do not create access grants or digital perks.';

comment on table public."creator_tip_events" is
  'Tips V1 audit events with redacted metadata only. No provider secrets, card data, bank data, or client secrets.';

insert into public."platform_money_kill_switches" (
  "key",
  "state",
  "display_label",
  "description",
  "reason",
  "owner_only_reason"
)
values
  (
    'tips_enabled',
    'sandbox_only',
    'Tips',
    'Controls pure contribution tips. Tips do not unlock digital content, badges, room access, VIP, subscriptions, paid video access, event access, Watch-Party seats, or public rewards.',
    'Tips V1 is enabled for Stripe test-mode checkout only. Live money stays off until explicit approval.',
    'Keep sandbox-only until Stripe test proof, webhook proof, refund/dispute proof, compliance review, and owner live-money approval are complete.'
  )
on conflict ("key") do update
set
  "display_label" = excluded."display_label",
  "description" = excluded."description",
  "reason" = excluded."reason",
  "owner_only_reason" = excluded."owner_only_reason",
  "state" = case
    when public."platform_money_kill_switches"."state" = 'on' then public."platform_money_kill_switches"."state"
    else 'sandbox_only'
  end;

insert into public."provider_readiness_status" (
  "provider",
  "capability",
  "status",
  "environment",
  "proof_source",
  "proof_summary",
  "last_checked_at",
  "is_live_money_enabled",
  "is_client_visible"
)
values (
  'stripe',
  'tips',
  'sandbox_ready',
  'test',
  'repo:tips_v1_stripe_checkout',
  'Tips V1 has server-side Stripe test-mode checkout/webhook code. Live money remains off and tips do not unlock digital access, perks, rooms, VIP, subscriptions, paid videos, or events.',
  timezone('utc'::text, now()),
  false,
  true
)
on conflict ("provider", "capability", "environment") do update
set
  "status" = excluded."status",
  "proof_source" = excluded."proof_source",
  "proof_summary" = excluded."proof_summary",
  "last_checked_at" = excluded."last_checked_at",
  "is_live_money_enabled" = false,
  "is_client_visible" = true,
  "updated_at" = timezone('utc'::text, now());

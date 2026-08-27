-- Stripe Tips V1 webhook lifecycle closeout.
--
-- A delivery claim is a renewable attempt-token lease, so failed/stale work can
-- be retried without allowing two active requests to process the same event.
-- The provider lifecycle projector locks the claim and tip in one transaction,
-- applies a monotonic transition, appends its audit event, and finalizes the
-- delivery atomically.

alter table public."monetization_webhook_events"
  add column if not exists "processing_attempt_id" uuid,
  add column if not exists "processing_started_at" timestamptz,
  add column if not exists "processing_attempt_count" integer not null default 0;

alter table public."creator_tip_transactions"
  add column if not exists "refunded_amount_cents" integer not null default 0;

update public."creator_tip_transactions" tip_row
set "creator_net_cents" = 0,
    "payout_status" = 'reversed',
    "refunded_amount_cents" = tip_row."total_paid_cents"
where tip_row."status" = 'refunded'
   or tip_row."payment_status" = 'refunded';

alter table public."creator_tip_transactions"
  drop constraint if exists "creator_tip_transactions_refunded_amount_check";
alter table public."creator_tip_transactions"
  add constraint "creator_tip_transactions_refunded_amount_check" check (
    "refunded_amount_cents" >= 0
    and "refunded_amount_cents" <= "total_paid_cents"
  );

alter table public."monetization_webhook_events"
  drop constraint if exists "monetization_webhook_events_attempt_count_check";
alter table public."monetization_webhook_events"
  add constraint "monetization_webhook_events_attempt_count_check"
    check ("processing_attempt_count" >= 0);

alter table public."monetization_webhook_events"
  drop constraint if exists "monetization_webhook_events_terminal_attempt_check";
alter table public."monetization_webhook_events"
  add constraint "monetization_webhook_events_terminal_attempt_check" check (
    "status" not in ('processed', 'ignored', 'failed')
    or "processing_attempt_id" is null
  );

create index if not exists "monetization_webhook_events_retryable_idx"
  on public."monetization_webhook_events" ("provider", "status", "processing_started_at")
  where "status" in ('received', 'failed');

-- Completion authority spans Auth, deletion, profile-role, and legal rows. All
-- writers of those inputs take the same exclusive advisory identities while a
-- projector holds shared locks, closing cross-table authority TOCTOU windows.
create or replace function public."serialize_stripe_tip_buyer_authority_user_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_column text := nullif(pg_catalog.btrim(coalesce(tg_argv[0], '')), '');
  v_old_user text;
  v_new_user text;
  v_first_user text;
  v_second_user text;
begin
  if v_column is null then
    raise exception 'stripe_tip_buyer_authority_lock_column_required';
  end if;

  if tg_op <> 'INSERT' then
    v_old_user := nullif(pg_catalog.btrim(coalesce(pg_catalog.to_jsonb(old)->>v_column, '')), '');
  end if;
  if tg_op <> 'DELETE' then
    v_new_user := nullif(pg_catalog.btrim(coalesce(pg_catalog.to_jsonb(new)->>v_column, '')), '');
  end if;

  v_first_user := case
    when v_old_user is null then v_new_user
    when v_new_user is null then v_old_user
    else least(v_old_user, v_new_user)
  end;
  v_second_user := case
    when v_old_user is null or v_new_user is null or v_old_user = v_new_user then null
    else greatest(v_old_user, v_new_user)
  end;

  if v_first_user is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'stripe-tip-buyer-authority-user:' || v_first_user,
      0
    ));
  end if;
  if v_second_user is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'stripe-tip-buyer-authority-user:' || v_second_user,
      0
    ));
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public."serialize_stripe_tip_buyer_authority_global_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'stripe-tip-buyer-authority-global',
    0
  ));
  return null;
end;
$$;

drop trigger if exists "serialize_stripe_tip_buyer_authority_user"
  on auth."users";
create trigger "serialize_stripe_tip_buyer_authority_user"
before insert or update or delete on auth."users"
for each row execute function public."serialize_stripe_tip_buyer_authority_user_internal"('id');

drop trigger if exists "serialize_stripe_tip_buyer_authority_session"
  on auth."sessions";
create trigger "serialize_stripe_tip_buyer_authority_session"
before insert or update or delete on auth."sessions"
for each row execute function public."serialize_stripe_tip_buyer_authority_user_internal"('user_id');

drop trigger if exists "serialize_stripe_tip_buyer_authority_deletion"
  on public."account_deletion_requests";
create trigger "serialize_stripe_tip_buyer_authority_deletion"
before insert or update or delete on public."account_deletion_requests"
for each row execute function public."serialize_stripe_tip_buyer_authority_user_internal"('user_id');

drop trigger if exists "serialize_stripe_tip_buyer_authority_profile"
  on public."user_profiles";
create trigger "serialize_stripe_tip_buyer_authority_profile"
before insert or update or delete on public."user_profiles"
for each row execute function public."serialize_stripe_tip_buyer_authority_user_internal"('user_id');

drop trigger if exists "serialize_stripe_tip_buyer_authority_acceptance"
  on public."wave1_legal_acceptances";
create trigger "serialize_stripe_tip_buyer_authority_acceptance"
before insert or update or delete on public."wave1_legal_acceptances"
for each row execute function public."serialize_stripe_tip_buyer_authority_user_internal"('user_id');

drop trigger if exists "serialize_stripe_tip_buyer_authority_document"
  on public."wave1_legal_document_versions";
create trigger "serialize_stripe_tip_buyer_authority_document"
before insert or update or delete on public."wave1_legal_document_versions"
for each statement execute function public."serialize_stripe_tip_buyer_authority_global_internal"();

revoke all on function public."serialize_stripe_tip_buyer_authority_user_internal"()
  from public, anon, authenticated, service_role;
revoke all on function public."serialize_stripe_tip_buyer_authority_global_internal"()
  from public, anon, authenticated, service_role;

create or replace function public."enforce_stripe_tip_lifecycle_monotonic_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transition_allowed boolean := true;
  v_attempted_event_id text;
  v_attempted_event_type text;
  v_buyer_authority_valid boolean := false;
  v_compensation_required boolean := false;
  v_legacy_claim boolean := false;
  v_projector_attempt_id text := nullif(
    pg_catalog.current_setting('app.stripe_tip_projector_attempt_id', true),
    ''
  );
begin
  -- Scope the rollout guard to the Stripe Tips V1 projector. Other service-side
  -- reconciliation paths retain their existing recovery authority.
  if old."provider" is distinct from 'stripe_connect'
    or old."provider_environment" is distinct from 'test'
    or coalesce(new."metadata"->>'updated_by', '') <> 'stripe-tip-webhook'
    or nullif(new."metadata"->>'provider_event_id', '') is null
  then
    return new;
  end if;

  v_attempted_event_id := new."metadata"->>'provider_event_id';
  v_attempted_event_type := new."metadata"->>'provider_event_type';

  if v_projector_attempt_id is not null then
    if not exists (
      select 1
      from public."monetization_webhook_events" event_row
      where event_row."provider" = 'stripe_tip'
        and event_row."idempotency_key" = v_attempted_event_id
        and event_row."status" = 'received'
        and event_row."processing_attempt_id"::text = v_projector_attempt_id
    )
    then
      raise exception 'stripe_tip_webhook_projector_claim_required';
    end if;
  else
    -- Drain already-running legacy Edge requests only while their pre-migration
    -- claim is still received and unleased. Once a new attempt reclaims it,
    -- old direct writers are fenced out.
    v_legacy_claim := exists (
      select 1
      from public."monetization_webhook_events" event_row
      where event_row."provider" = 'stripe_tip'
        and event_row."idempotency_key" = v_attempted_event_id
        and event_row."status" = 'received'
        and event_row."processing_attempt_id" is null
        and coalesce(event_row."processing_started_at", event_row."created_at")
          > timezone('utc'::text, now()) - interval '5 minutes'
    );
    if not v_legacy_claim then
      raise exception 'stripe_tip_webhook_projector_claim_required';
    end if;
  end if;

  v_transition_allowed := case old."status"
    when 'disputed' then new."status" = 'disputed'
    when 'refunded' then new."status" in ('refunded', 'disputed')
    when 'canceled' then new."status" = 'canceled'
    when 'paid' then new."status" in ('paid', 'refunded', 'disputed')
    else true
  end;

  -- The provider reports cumulative refunds. Never permit a later delivery or
  -- legacy completion worker to move that authority backward.
  new."refunded_amount_cents" := greatest(
    old."refunded_amount_cents",
    new."refunded_amount_cents"
  );

  if v_transition_allowed then
    if v_legacy_claim
      and v_attempted_event_type in ('checkout.session.completed', 'payment_intent.succeeded')
    then
      perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
        'stripe-tip-buyer-authority-global',
        0
      ));
      perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
        'stripe-tip-buyer-authority-user:' || old."sender_id"::text,
        0
      ));

      v_buyer_authority_valid := old."buyer_account_id" is not null
        and old."buyer_account_id" is not distinct from old."sender_id"
        and public."creator_tip_buyer_session_authority_internal"(
          old."sender_id",
          old."buyer_session_generation"
        );
      v_buyer_authority_valid := v_buyer_authority_valid is true;
      v_compensation_required := coalesce(
        old."metadata"->'compensation_required',
        'false'::jsonb
      ) = 'true'::jsonb or not v_buyer_authority_valid;

      new."creator_net_cents" := case
        when v_buyer_authority_valid and not v_compensation_required
          then case
            when new."refunded_amount_cents" > 0 then least(
              coalesce(old."creator_net_cents", old."tip_amount_cents"),
              greatest(0, old."tip_amount_cents" - new."refunded_amount_cents")
            )
            else old."tip_amount_cents"
          end
        else 0
      end;
      new."metadata" := coalesce(old."metadata", '{}'::jsonb)
        || coalesce(new."metadata", '{}'::jsonb)
        || jsonb_build_object(
          'buyer_authority_reason', case
            when coalesce(old."metadata"->'compensation_required', 'false'::jsonb) = 'true'::jsonb
              then 'tip_buyer_session_previously_invalid'
            when not v_buyer_authority_valid then 'buyer_session_authority_not_current'
            else 'exact_buyer_session_current'
          end,
          'buyer_authority_valid_at_completion', v_buyer_authority_valid,
          'compensation_required', v_compensation_required,
          'payout_eligible', false
        );
    end if;
    return new;
  end if;

  new."status" := old."status";
  new."payment_status" := old."payment_status";
  new."payout_status" := old."payout_status";
  new."creator_net_cents" := old."creator_net_cents";
  new."refunded_amount_cents" := old."refunded_amount_cents";
  new."currency" := old."currency";
  new."provider_payment_intent_id" := old."provider_payment_intent_id";
  new."paid_at" := old."paid_at";
  new."failed_at" := old."failed_at";
  new."refunded_at" := old."refunded_at";
  new."disputed_at" := old."disputed_at";
  new."metadata" := coalesce(new."metadata", '{}'::jsonb)
    || coalesce(old."metadata", '{}'::jsonb)
    || jsonb_build_object(
      'lifecycle_status_after', old."status",
      'lifecycle_status_before', old."status",
      'lifecycle_transition_applied', false,
      'suppressed_provider_event_id', v_attempted_event_id,
      'suppressed_provider_event_type', v_attempted_event_type
    );

  if v_attempted_event_type in ('checkout.session.completed', 'payment_intent.succeeded') then
    new."metadata" := new."metadata" || jsonb_build_object(
      'buyer_authority_reason', 'tip_terminal_state_preserved'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists "enforce_stripe_tip_lifecycle_monotonic"
  on public."creator_tip_transactions";
create trigger "enforce_stripe_tip_lifecycle_monotonic"
before update of
  "status",
  "payment_status",
  "payout_status",
  "creator_net_cents",
  "refunded_amount_cents",
  "currency",
  "provider_payment_intent_id",
  "paid_at",
  "failed_at",
  "refunded_at",
  "disputed_at"
on public."creator_tip_transactions"
for each row execute function public."enforce_stripe_tip_lifecycle_monotonic_internal"();

revoke all on function public."enforce_stripe_tip_lifecycle_monotonic_internal"()
  from public, anon, authenticated, service_role;

create or replace function public."reserve_stripe_tip_webhook_event"(
  p_event_id text,
  p_event_type text,
  p_raw_event_hash text,
  p_processing_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public."monetization_webhook_events"%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_previous_status text;
  v_stale_claim boolean := false;
begin
  if p_event_id is null
    or p_event_id <> btrim(p_event_id)
    or char_length(p_event_id) not between 1 and 255
    or p_event_type is null
    or p_event_type <> btrim(p_event_type)
    or char_length(p_event_type) not between 1 and 255
    or p_raw_event_hash is null
    or p_raw_event_hash !~ '^[0-9a-f]{64}$'
    or p_processing_attempt_id is null
  then
    raise exception 'stripe_tip_webhook_claim_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'stripe-tip-webhook-event:' || p_event_id,
    0
  ));

  select event_row.*
  into v_event
  from public."monetization_webhook_events" event_row
  where event_row."provider" = 'stripe_tip'
    and event_row."idempotency_key" = p_event_id
  for update;

  if v_event."id" is null then
    insert into public."monetization_webhook_events" (
      "provider",
      "event_id",
      "event_type",
      "idempotency_key",
      "raw_event_hash",
      "status",
      "processing_attempt_id",
      "processing_started_at",
      "processing_attempt_count"
    ) values (
      'stripe_tip',
      p_event_id,
      p_event_type,
      p_event_id,
      p_raw_event_hash,
      'received',
      p_processing_attempt_id,
      v_now,
      1
    )
    returning * into v_event;

    return jsonb_build_object(
      'claimAcquired', true,
      'disposition', 'claimed',
      'processingAttemptId', p_processing_attempt_id,
      'retry', false,
      'rowId', v_event."id",
      'staleClaim', false
    );
  end if;

  if v_event."event_id" is distinct from p_event_id
    or v_event."event_type" is distinct from p_event_type
    or v_event."raw_event_hash" is distinct from p_raw_event_hash
  then
    raise exception 'stripe_tip_webhook_event_identity_mismatch';
  end if;

  if v_event."status" in ('processed', 'ignored') then
    return jsonb_build_object(
      'claimAcquired', false,
      'disposition', 'duplicate',
      'processingAttemptId', null,
      'retry', false,
      'rowId', v_event."id",
      'staleClaim', false
    );
  end if;

  if v_event."status" = 'received'
    and coalesce(v_event."processing_started_at", v_event."created_at")
      > v_now - interval '5 minutes'
  then
    return jsonb_build_object(
      'claimAcquired', false,
      'disposition', 'in_progress',
      'processingAttemptId', null,
      'retry', false,
      'rowId', v_event."id",
      'staleClaim', false
    );
  end if;

  if v_event."status" not in ('received', 'failed') then
    raise exception 'stripe_tip_webhook_claim_state_invalid';
  end if;

  v_previous_status := v_event."status";
  v_stale_claim := v_event."status" = 'received';

  update public."monetization_webhook_events" event_row
  set "status" = 'received',
      "processed_at" = null,
      "processing_attempt_id" = p_processing_attempt_id,
      "processing_started_at" = v_now,
      "processing_attempt_count" = coalesce(event_row."processing_attempt_count", 0) + 1
  where event_row."id" = v_event."id"
  returning * into v_event;

  return jsonb_build_object(
    'claimAcquired', true,
    'disposition', 'claimed',
    'previousStatus', v_previous_status,
    'processingAttemptId', p_processing_attempt_id,
    'retry', true,
    'rowId', v_event."id",
    'staleClaim', v_stale_claim
  );
end;
$$;

create or replace function public."finalize_stripe_tip_webhook_event"(
  p_event_id text,
  p_processing_attempt_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public."monetization_webhook_events"%rowtype;
begin
  if p_event_id is null
    or p_event_id <> btrim(p_event_id)
    or char_length(p_event_id) not between 1 and 255
    or p_processing_attempt_id is null
    or p_status not in ('processed', 'ignored', 'failed')
  then
    raise exception 'stripe_tip_webhook_finalize_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'stripe-tip-webhook-event:' || p_event_id,
    0
  ));

  select event_row.*
  into v_event
  from public."monetization_webhook_events" event_row
  where event_row."provider" = 'stripe_tip'
    and event_row."idempotency_key" = p_event_id
  for update;

  if v_event."id" is null
    or v_event."status" <> 'received'
    or v_event."processing_attempt_id" is distinct from p_processing_attempt_id
  then
    raise exception 'stripe_tip_webhook_claim_not_current';
  end if;

  update public."monetization_webhook_events" event_row
  set "status" = p_status,
      "processed_at" = timezone('utc'::text, now()),
      "processing_attempt_id" = null,
      "processing_started_at" = null
  where event_row."id" = v_event."id"
  returning * into v_event;

  return jsonb_build_object(
    'rowId', v_event."id",
    'status', v_event."status"
  );
end;
$$;

create or replace function public."process_stripe_tip_webhook_lifecycle"(
  p_webhook_event_id text,
  p_processing_attempt_id uuid,
  p_tip_id uuid,
  p_provider_facts jsonb,
  p_transition jsonb,
  p_tip_event_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_webhook public."monetization_webhook_events"%rowtype;
  v_tip public."creator_tip_transactions"%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_event_type text;
  v_tip_event_type text;
  v_requested_status text;
  v_current_status text;
  v_object_id text := nullif(btrim(coalesce(p_provider_facts->>'object_id', '')), '');
  v_payment_intent_id text := nullif(btrim(coalesce(p_provider_facts->>'payment_intent_id', '')), '');
  v_currency text := lower(nullif(btrim(coalesce(p_provider_facts->>'currency', '')), ''));
  v_metadata_tip_id text := nullif(btrim(coalesce(p_provider_facts->>'metadata_tip_id', '')), '');
  v_metadata_sender_id text := nullif(btrim(coalesce(p_provider_facts->>'metadata_sender_id', '')), '');
  v_metadata_creator_id text := nullif(btrim(coalesce(p_provider_facts->>'metadata_creator_id', '')), '');
  v_amount integer;
  v_amount_refunded integer;
  v_refunded boolean;
  v_previous_refunded integer := 0;
  v_effective_refunded integer := 0;
  v_refund_delta integer := 0;
  v_effective_full_refund boolean := false;
  v_creator_net integer;
  v_buyer_authority_valid boolean;
  v_buyer_authority_reason text;
  v_identity_exact boolean := false;
  v_transition_allowed boolean := false;
  v_old_compensation_required boolean := false;
  v_incoming_compensation_required boolean := false;
  v_effective_compensation_required boolean := false;
  v_transaction_metadata jsonb;
  v_event_metadata jsonb;
  v_result_reason text := 'tip_updated';
begin
  if p_webhook_event_id is null
    or p_webhook_event_id <> btrim(p_webhook_event_id)
    or char_length(p_webhook_event_id) not between 1 and 255
    or p_processing_attempt_id is null
    or p_tip_id is null
    or jsonb_typeof(p_provider_facts) is distinct from 'object'
    or jsonb_typeof(p_transition) is distinct from 'object'
    or jsonb_typeof(coalesce(p_transition->'metadata', '{}'::jsonb)) is distinct from 'object'
    or jsonb_typeof(p_tip_event_metadata) is distinct from 'object'
  then
    raise exception 'stripe_tip_webhook_projection_invalid';
  end if;

  begin
    if jsonb_typeof(p_provider_facts->'amount_cents') = 'number'
      and p_provider_facts->>'amount_cents' ~ '^(0|[1-9][0-9]*)$'
    then
      v_amount := (p_provider_facts->>'amount_cents')::integer;
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    v_amount := null;
  end;

  begin
    if jsonb_typeof(p_provider_facts->'amount_refunded_cents') = 'number'
      and p_provider_facts->>'amount_refunded_cents' ~ '^(0|[1-9][0-9]*)$'
    then
      v_amount_refunded := (p_provider_facts->>'amount_refunded_cents')::integer;
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    v_amount_refunded := null;
  end;

  if jsonb_typeof(p_provider_facts->'refunded') = 'boolean' then
    v_refunded := (p_provider_facts->>'refunded')::boolean;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'stripe-tip-webhook-event:' || p_webhook_event_id,
    0
  ));

  select event_row.*
  into v_webhook
  from public."monetization_webhook_events" event_row
  where event_row."provider" = 'stripe_tip'
    and event_row."idempotency_key" = p_webhook_event_id
  for update;

  if v_webhook."id" is null
    or v_webhook."event_id" is distinct from p_webhook_event_id
    or v_webhook."status" <> 'received'
    or v_webhook."processing_attempt_id" is distinct from p_processing_attempt_id
  then
    raise exception 'stripe_tip_webhook_claim_not_current';
  end if;

  perform pg_catalog.set_config(
    'app.stripe_tip_projector_attempt_id',
    p_processing_attempt_id::text,
    true
  );

  v_event_type := v_webhook."event_type";
  v_tip_event_type := case v_event_type
    when 'checkout.session.completed' then 'checkout_completed'
    when 'checkout.session.expired' then 'checkout_canceled'
    when 'payment_intent.succeeded' then 'payment_succeeded'
    when 'payment_intent.payment_failed' then 'payment_failed'
    when 'charge.refunded' then 'refunded'
    when 'charge.dispute.created' then 'disputed'
    else null
  end;
  v_requested_status := case v_event_type
    when 'checkout.session.completed' then 'paid'
    when 'checkout.session.expired' then 'canceled'
    when 'payment_intent.succeeded' then 'paid'
    when 'payment_intent.payment_failed' then 'failed'
    when 'charge.refunded' then null
    when 'charge.dispute.created' then 'disputed'
    else null
  end;

  if v_tip_event_type is null
    or (v_requested_status is null and v_event_type <> 'charge.refunded')
  then
    raise exception 'stripe_tip_webhook_projection_event_unsupported';
  end if;

  select tip_row.*
  into v_tip
  from public."creator_tip_transactions" tip_row
  where tip_row."id" = p_tip_id
  for update;

  if v_tip."id" is null then
    update public."monetization_webhook_events" event_row
    set "status" = 'ignored',
        "processed_at" = v_now,
        "processing_attempt_id" = null,
        "processing_started_at" = null
    where event_row."id" = v_webhook."id";

    return jsonb_build_object(
      'buyerAuthorityValid', null,
      'compensationRequired', false,
      'reason', 'tip_not_found',
      'status', null,
      'tipId', null,
      'updated', false,
      'webhookFinalized', true
    );
  end if;

  v_current_status := v_tip."status";
  if v_event_type = 'charge.refunded' then
    v_previous_refunded := greatest(
      v_tip."refunded_amount_cents",
      case
        when v_tip."status" = 'refunded' or v_tip."payment_status" = 'refunded'
          then v_tip."total_paid_cents"
        else 0
      end
    );
    v_effective_refunded := least(
      v_tip."total_paid_cents",
      greatest(v_previous_refunded, coalesce(v_amount_refunded, 0))
    );
    v_refund_delta := greatest(0, v_effective_refunded - v_previous_refunded);
    v_effective_full_refund := v_effective_refunded = v_tip."total_paid_cents";
    v_requested_status := case
      when v_effective_full_refund then 'refunded'
      else v_current_status
    end;
  end if;

  v_identity_exact := v_tip."provider" = 'stripe_connect'
    and v_tip."provider_environment" = 'test'
    and (case v_event_type
    when 'checkout.session.completed' then
      v_object_id is not null
      and v_object_id = nullif(v_tip."provider_checkout_session_id", '')
      and (v_payment_intent_id is null
        or v_tip."provider_payment_intent_id" is null
        or v_payment_intent_id = v_tip."provider_payment_intent_id")
      and v_amount = v_tip."tip_amount_cents"
      and v_currency = lower(v_tip."currency")
      and v_metadata_tip_id = v_tip."id"::text
      and v_metadata_sender_id = v_tip."sender_id"::text
      and v_metadata_creator_id = v_tip."creator_id"::text
    when 'payment_intent.succeeded' then
      v_object_id is not null
      and (v_tip."provider_payment_intent_id" is null
        or v_object_id = v_tip."provider_payment_intent_id")
      and v_payment_intent_id = v_object_id
      and v_amount = v_tip."tip_amount_cents"
      and v_currency = lower(v_tip."currency")
      and v_metadata_tip_id = v_tip."id"::text
      and v_metadata_sender_id = v_tip."sender_id"::text
      and v_metadata_creator_id = v_tip."creator_id"::text
    when 'checkout.session.expired' then
      v_object_id is not null
      and v_object_id = nullif(v_tip."provider_checkout_session_id", '')
    when 'payment_intent.payment_failed' then
      v_object_id is not null
      and v_object_id = nullif(v_tip."provider_payment_intent_id", '')
    when 'charge.refunded' then
      v_object_id is not null
      and v_object_id ~ '^ch_[A-Za-z0-9_]+$'
      and v_payment_intent_id is not null
      and v_payment_intent_id = nullif(v_tip."provider_payment_intent_id", '')
      and v_amount = v_tip."total_paid_cents"
      and v_currency = lower(v_tip."currency")
      and v_amount_refunded > 0
      and v_amount_refunded <= v_amount
      and v_refunded is not null
      and v_refunded = (v_amount_refunded = v_amount)
    when 'charge.dispute.created' then
      v_payment_intent_id is not null
      and v_payment_intent_id = nullif(v_tip."provider_payment_intent_id", '')
      else false
    end);

  if v_identity_exact is not true then
    insert into public."creator_tip_events" (
      "tip_transaction_id",
      "actor_id",
      "event_type",
      "provider",
      "provider_environment",
      "provider_event_id",
      "metadata"
    ) values (
      v_tip."id",
      null,
      'webhook_ignored',
      'stripe_connect',
      'test',
      p_webhook_event_id,
      jsonb_build_object(
        'event_type', v_event_type,
        'ignored_reason', 'tip_provider_lifecycle_identity_mismatch',
        'no_access_granted', true,
        'pure_contribution_only', true
      )
    )
    on conflict ("provider", "provider_environment", "provider_event_id", "event_type")
      where "provider_event_id" is not null
      do nothing;

    update public."monetization_webhook_events" event_row
    set "status" = 'ignored',
        "processed_at" = v_now,
        "processing_attempt_id" = null,
        "processing_started_at" = null
    where event_row."id" = v_webhook."id";

    return jsonb_build_object(
      'buyerAuthorityValid', null,
      'compensationRequired', coalesce(
        v_tip."metadata"->'compensation_required',
        'false'::jsonb
      ),
      'reason', 'tip_provider_lifecycle_identity_mismatch',
      'status', v_tip."status",
      'tipId', v_tip."id",
      'updated', false,
      'webhookFinalized', true
    );
  end if;

  v_transition_allowed := case v_current_status
    when 'disputed' then v_requested_status = 'disputed'
    when 'refunded' then v_requested_status in ('refunded', 'disputed')
    when 'canceled' then v_requested_status = 'canceled'
    when 'paid' then v_requested_status in ('paid', 'refunded', 'disputed')
    else true
  end;

  v_old_compensation_required := coalesce(
    v_tip."metadata"->'compensation_required',
    'false'::jsonb
  ) = 'true'::jsonb;

  if v_transition_allowed
    and v_event_type in ('checkout.session.completed', 'payment_intent.succeeded')
  then
    -- Shared advisory locks serialize the full cross-table authority snapshot
    -- with Auth, deletion, profile-role, acceptance, and document writers.
    perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
      'stripe-tip-buyer-authority-global',
      0
    ));
    perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
      'stripe-tip-buyer-authority-user:' || v_tip."sender_id"::text,
      0
    ));

    v_buyer_authority_valid := v_tip."buyer_account_id" is not null
      and v_tip."buyer_account_id" is not distinct from v_tip."sender_id"
      and public."creator_tip_buyer_session_authority_internal"(
        v_tip."sender_id",
        v_tip."buyer_session_generation"
      );
    v_buyer_authority_valid := v_buyer_authority_valid is true;
    v_incoming_compensation_required := not v_buyer_authority_valid;
    v_buyer_authority_reason := case
      when v_old_compensation_required then 'tip_buyer_session_previously_invalid'
      when not v_buyer_authority_valid then 'buyer_session_authority_not_current'
      else 'exact_buyer_session_current'
    end;
  elsif v_event_type in ('checkout.session.completed', 'payment_intent.succeeded') then
    v_buyer_authority_valid := null;
    v_buyer_authority_reason := 'tip_terminal_state_preserved';
    v_incoming_compensation_required := false;
  else
    v_incoming_compensation_required := coalesce(
      p_transition->'metadata'->'compensation_required',
      'false'::jsonb
    ) = 'true'::jsonb;
  end if;
  v_effective_compensation_required := case
    when not v_transition_allowed then v_old_compensation_required
    else v_old_compensation_required or v_incoming_compensation_required
  end;

  v_transaction_metadata := coalesce(v_tip."metadata", '{}'::jsonb)
    || coalesce(p_transition->'metadata', '{}'::jsonb)
    || jsonb_build_object(
      'compensation_required', v_effective_compensation_required,
      'lifecycle_status_after', case
        when v_transition_allowed then v_requested_status
        else v_current_status
      end,
      'lifecycle_status_before', v_current_status,
      'lifecycle_transition_applied', v_transition_allowed,
      'provider_event_id', p_webhook_event_id,
      'provider_event_type', v_event_type,
      'updated_by', 'stripe-tip-webhook'
    );

  if v_event_type in ('checkout.session.completed', 'payment_intent.succeeded') then
    v_transaction_metadata := v_transaction_metadata || jsonb_build_object(
      'buyer_authority_reason', v_buyer_authority_reason,
      'buyer_authority_valid_at_completion', v_buyer_authority_valid,
      'compensation_required', v_effective_compensation_required
    );
  elsif v_event_type = 'charge.refunded' then
    v_transaction_metadata := v_transaction_metadata || jsonb_build_object(
      'refund_status', case
        when v_effective_full_refund then 'full'
        when v_effective_refunded > 0 then 'partial'
        else 'none'
      end,
      'refunded_amount_cents', v_effective_refunded,
      'stripe_refunded', v_effective_full_refund
    );
  end if;

  if v_event_type = 'charge.refunded' then
    v_creator_net := least(
      coalesce(v_tip."creator_net_cents", 0),
      greatest(0, v_tip."tip_amount_cents" - v_effective_refunded)
    );
  end if;

  if not v_transition_allowed and v_event_type = 'charge.refunded' then
    v_result_reason := 'tip_terminal_state_preserved';
    update public."creator_tip_transactions" tip_row
    set "creator_net_cents" = v_creator_net,
        "metadata" = v_transaction_metadata,
        "refunded_amount_cents" = v_effective_refunded,
        "refunded_at" = coalesce(tip_row."refunded_at", v_now),
        "updated_at" = v_now
    where tip_row."id" = v_tip."id"
    returning * into v_tip;
  elsif not v_transition_allowed then
    v_result_reason := 'tip_terminal_state_preserved';
    update public."creator_tip_transactions" tip_row
    set "metadata" = v_transaction_metadata,
        "updated_at" = v_now
    where tip_row."id" = v_tip."id"
    returning * into v_tip;
  elsif v_event_type in ('checkout.session.completed', 'payment_intent.succeeded') then
    v_creator_net := case
      when v_buyer_authority_valid and not v_effective_compensation_required
        then case
          when v_tip."refunded_amount_cents" > 0 then least(
            coalesce(v_tip."creator_net_cents", v_tip."tip_amount_cents"),
            greatest(
              0,
              v_tip."tip_amount_cents" - v_tip."refunded_amount_cents"
            )
          )
          else v_tip."tip_amount_cents"
        end
      else 0
    end;

    update public."creator_tip_transactions" tip_row
    set "creator_net_cents" = v_creator_net,
        "currency" = v_currency,
        "metadata" = v_transaction_metadata,
        "paid_at" = v_now,
        "payment_status" = 'succeeded',
        "payout_status" = 'not_payable',
        "provider_payment_intent_id" = coalesce(v_payment_intent_id, tip_row."provider_payment_intent_id"),
        "status" = 'paid',
        "updated_at" = v_now
    where tip_row."id" = v_tip."id"
    returning * into v_tip;

    if v_effective_compensation_required then
      v_result_reason := 'tip_payment_recorded_compensation_required';
    end if;
  elsif v_event_type = 'payment_intent.payment_failed' then
    update public."creator_tip_transactions" tip_row
    set "failed_at" = v_now,
        "metadata" = v_transaction_metadata,
        "payment_status" = 'failed',
        "status" = 'failed',
        "updated_at" = v_now
    where tip_row."id" = v_tip."id"
    returning * into v_tip;
  elsif v_event_type = 'checkout.session.expired' then
    update public."creator_tip_transactions" tip_row
    set "failed_at" = v_now,
        "metadata" = v_transaction_metadata,
        "payment_status" = 'canceled',
        "status" = 'canceled',
        "updated_at" = v_now
    where tip_row."id" = v_tip."id"
    returning * into v_tip;
  elsif v_event_type = 'charge.refunded' then
    v_result_reason := case
      when v_refund_delta = 0 then 'tip_refund_state_preserved'
      when v_effective_full_refund then 'tip_full_refund_recorded'
      else 'tip_partial_refund_recorded'
    end;
    update public."creator_tip_transactions" tip_row
    set "creator_net_cents" = v_creator_net,
        "metadata" = v_transaction_metadata,
        "payout_status" = case
          when v_effective_full_refund
            or tip_row."payout_status" in ('pending', 'held', 'available', 'paid')
            then 'reversed'
          else tip_row."payout_status"
        end,
        "payment_status" = case
          when v_effective_full_refund then 'refunded'
          else tip_row."payment_status"
        end,
        "refunded_amount_cents" = v_effective_refunded,
        "refunded_at" = coalesce(tip_row."refunded_at", v_now),
        "status" = case
          when v_effective_full_refund then 'refunded'
          else tip_row."status"
        end,
        "updated_at" = v_now
    where tip_row."id" = v_tip."id"
    returning * into v_tip;
  elsif v_event_type = 'charge.dispute.created' then
    update public."creator_tip_transactions" tip_row
    set "disputed_at" = v_now,
        "metadata" = v_transaction_metadata,
        "payout_status" = 'reversed',
        "payment_status" = 'charged_back',
        "status" = 'disputed',
        "updated_at" = v_now
    where tip_row."id" = v_tip."id"
    returning * into v_tip;
  end if;

  v_event_metadata := p_tip_event_metadata || jsonb_build_object(
    'amount_cents', coalesce(v_amount, v_tip."tip_amount_cents"),
    'compensation_required', v_effective_compensation_required,
    'event_type', v_event_type,
    'lifecycle_status_before', v_current_status,
    'lifecycle_transition_applied', v_transition_allowed,
    'no_access_granted', true,
    'pure_contribution_only', true,
    'status', v_tip."status"
  );

  if v_event_type in ('checkout.session.completed', 'payment_intent.succeeded') then
    v_event_metadata := v_event_metadata || jsonb_build_object(
      'buyer_authority_reason', v_buyer_authority_reason,
      'buyer_authority_valid_at_completion', v_buyer_authority_valid,
      'compensation_required', v_effective_compensation_required
    );
  elsif v_event_type = 'charge.refunded' then
    v_event_metadata := v_event_metadata || jsonb_build_object(
      'amount_refunded_cents', v_amount_refunded,
      'cumulative_refunded_amount_cents', v_effective_refunded,
      'refund_amount_applied', v_refund_delta > 0,
      'refund_delta_cents', v_refund_delta,
      'refund_status', case
        when v_effective_full_refund then 'full'
        else 'partial'
      end,
      'refunded', v_refunded
    );
  end if;

  insert into public."creator_tip_events" (
    "tip_transaction_id",
    "actor_id",
    "event_type",
    "provider",
    "provider_environment",
    "provider_event_id",
    "metadata"
  ) values (
    v_tip."id",
    null,
    v_tip_event_type,
    'stripe_connect',
    'test',
    p_webhook_event_id,
    v_event_metadata
  )
  on conflict ("provider", "provider_environment", "provider_event_id", "event_type")
    where "provider_event_id" is not null
    do nothing;

  update public."monetization_webhook_events" event_row
  set "status" = 'processed',
      "processed_at" = v_now,
      "processing_attempt_id" = null,
      "processing_started_at" = null
  where event_row."id" = v_webhook."id";

  return jsonb_build_object(
    'buyerAuthorityValid', case
      when v_event_type in ('checkout.session.completed', 'payment_intent.succeeded')
        then v_transaction_metadata->'buyer_authority_valid_at_completion'
      else null
    end,
    'compensationRequired', v_effective_compensation_required,
    'reason', v_result_reason,
    'status', v_tip."status",
    'tipId', v_tip."id",
    'updated', true,
    'webhookFinalized', true
  );
end;
$$;

revoke all on function public."reserve_stripe_tip_webhook_event"(text,text,text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public."finalize_stripe_tip_webhook_event"(text,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public."process_stripe_tip_webhook_lifecycle"(text,uuid,uuid,jsonb,jsonb,jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public."reserve_stripe_tip_webhook_event"(text,text,text,uuid)
  to service_role;
grant execute on function public."finalize_stripe_tip_webhook_event"(text,uuid,text)
  to service_role;
grant execute on function public."process_stripe_tip_webhook_lifecycle"(text,uuid,uuid,jsonb,jsonb,jsonb)
  to service_role;

comment on function public."reserve_stripe_tip_webhook_event"(text,text,text,uuid) is
  'Claims one exact Stripe tip webhook delivery with an attempt-token lease; only failed or stale claims are retryable.';
comment on function public."finalize_stripe_tip_webhook_event"(text,uuid,text) is
  'Finalizes only the current Stripe tip webhook processing attempt, preventing stale workers from changing claim state.';
comment on function public."process_stripe_tip_webhook_lifecycle"(text,uuid,uuid,jsonb,jsonb,jsonb) is
  'Atomically locks a Stripe tip claim and tip row, enforces monotonic lifecycle state, appends the audit event, and finalizes the claim.';

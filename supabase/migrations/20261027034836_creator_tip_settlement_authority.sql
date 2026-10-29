begin;
-- Tighten the existing atomic tip projector. Historical migrations remain
-- immutable; callback settlement remains independent of admitting new sales.
-- The existing claim lease, locks, buyer compensation, refund/dispute precedence
-- and audit/finalization transaction stay in force.
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
  v_amount_received integer;
  v_provider_environment_exact boolean;
  v_actor_economics_exact boolean;
  v_checkout_shape_exact boolean;
  v_intent_shape_exact boolean;
  v_refund_shape_exact boolean;
  v_dispute_shape_exact boolean;
  v_identity_pending boolean := false;
  v_pending_checkout boolean := false;
  v_settled_success boolean := false;
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
    if jsonb_typeof(p_provider_facts->'amount_received_cents') = 'number'
      and p_provider_facts->>'amount_received_cents' ~ '^(0|[1-9][0-9]*)$'
    then
      v_amount_received := (p_provider_facts->>'amount_received_cents')::integer;
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    v_amount_received := null;
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
    when 'checkout.session.async_payment_succeeded' then 'checkout_completed'
    when 'checkout.session.async_payment_failed' then 'payment_failed'
    when 'checkout.session.expired' then 'checkout_canceled'
    when 'payment_intent.succeeded' then 'payment_succeeded'
    when 'payment_intent.payment_failed' then 'payment_failed'
    when 'charge.refunded' then 'refunded'
    when 'charge.dispute.created' then 'disputed'
    else null
  end;
  v_requested_status := case v_event_type
    when 'checkout.session.completed' then 'paid'
    when 'checkout.session.async_payment_succeeded' then 'paid'
    when 'checkout.session.async_payment_failed' then 'failed'
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
  v_pending_checkout := v_event_type = 'checkout.session.completed'
    and p_provider_facts->>'payment_status' = 'unpaid';
  v_settled_success := v_event_type in (
    'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'payment_intent.succeeded'
  ) and not v_pending_checkout;
  if v_pending_checkout then
    v_requested_status := v_current_status;
    v_tip_event_type := 'webhook_ignored';
  end if;
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

  -- New-purchase switches do not determine settlement of an already-bound
  -- provider payment. The immutable tip, signed raw provider facts and current
  -- buyer authority below independently determine recognition/compensation.
  v_provider_environment_exact := v_tip."provider" = 'stripe_connect'
    and v_tip."provider_environment" = 'test'
    and p_provider_facts->'event_livemode' = 'false'::jsonb
    and p_provider_facts->'object_livemode' = 'false'::jsonb
    and (not p_provider_facts ? 'event_account' or p_provider_facts->'event_account' = 'null'::jsonb);
  v_actor_economics_exact := v_amount > 0
    and v_amount = v_tip."tip_amount_cents"
    and v_amount = v_tip."total_paid_cents"
    and v_currency = lower(v_tip."currency")
    and v_metadata_tip_id = v_tip."id"::text
    and v_metadata_sender_id = v_tip."sender_id"::text
    and v_metadata_creator_id = v_tip."creator_id"::text;
  v_checkout_shape_exact := p_provider_facts->>'object_type' = 'checkout.session'
    and p_provider_facts->>'checkout_mode' = 'payment'
    and p_provider_facts->>'client_reference_id' = v_tip."id"::text
    and v_object_id ~ '^cs_test_[A-Za-z0-9_]+$'
    and v_actor_economics_exact
    and (case v_event_type
      when 'checkout.session.completed' then
        p_provider_facts->>'object_status' = 'complete'
        and p_provider_facts->>'payment_status' in ('paid', 'unpaid')
      when 'checkout.session.async_payment_succeeded' then
        p_provider_facts->>'object_status' = 'complete'
        and p_provider_facts->>'payment_status' = 'paid'
      when 'checkout.session.async_payment_failed' then
        p_provider_facts->>'object_status' = 'complete'
        and p_provider_facts->>'payment_status' = 'unpaid'
      when 'checkout.session.expired' then p_provider_facts->>'object_status' = 'expired'
        and p_provider_facts->>'payment_status' = 'unpaid'
      else false
    end)
    and (v_event_type = 'checkout.session.expired'
      or v_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$');
  v_intent_shape_exact := p_provider_facts->>'object_type' = 'payment_intent'
    and v_object_id ~ '^pi_[A-Za-z0-9_]+$'
    and v_payment_intent_id = v_object_id
    and v_actor_economics_exact
    and (case v_event_type
      when 'payment_intent.succeeded' then
        p_provider_facts->>'object_status' = 'succeeded'
        and v_amount_received = v_tip."total_paid_cents"
      when 'payment_intent.payment_failed' then
        p_provider_facts->>'object_status' = 'requires_payment_method'
        and v_amount_received = 0
      else false
    end);
  v_refund_shape_exact := p_provider_facts->>'object_type' = 'charge'
      and v_object_id ~ '^ch_[A-Za-z0-9_]+$'
      and v_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'
      and v_amount = v_tip."total_paid_cents"
      and v_currency = lower(v_tip."currency")
      and v_amount_refunded > 0
      and v_amount_refunded <= v_amount
      and v_refunded is not null
      and v_refunded = (v_amount_refunded = v_amount);
  v_dispute_shape_exact := p_provider_facts->>'object_type' = 'dispute'
      and v_object_id ~ '^dp_[A-Za-z0-9_]+$'
      and v_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'
      and v_amount > 0 and v_amount <= v_tip."total_paid_cents"
      and v_currency = lower(v_tip."currency");
  v_identity_exact := v_provider_environment_exact and (case
    when v_event_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed', 'checkout.session.expired') then
      v_checkout_shape_exact
      and v_object_id = nullif(v_tip."provider_checkout_session_id", '')
      and (v_payment_intent_id is null or v_tip."provider_payment_intent_id" is null
        or v_payment_intent_id = v_tip."provider_payment_intent_id")
    when v_event_type in ('payment_intent.succeeded', 'payment_intent.payment_failed') then
      v_intent_shape_exact
      and v_object_id = nullif(v_tip."provider_payment_intent_id", '')
    when v_event_type = 'charge.refunded' then
      v_refund_shape_exact and v_payment_intent_id = nullif(v_tip."provider_payment_intent_id", '')
    when v_event_type = 'charge.dispute.created' then
      v_dispute_shape_exact and v_payment_intent_id = nullif(v_tip."provider_payment_intent_id", '')
    else false
  end);

  -- A verified callback may win the race with the checkout response. Do not
  -- accept a guessed provider identity or discard that legitimate callback:
  -- release its lease as retryable until the exact receipt has been recorded.
  v_identity_pending := v_provider_environment_exact and (case
    when v_event_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed', 'checkout.session.expired') then
      v_checkout_shape_exact and nullif(v_tip."provider_checkout_session_id", '') is null
      and (v_payment_intent_id is null or v_tip."provider_payment_intent_id" is null
        or v_payment_intent_id = v_tip."provider_payment_intent_id")
    when v_event_type in ('payment_intent.succeeded', 'payment_intent.payment_failed') then
      v_intent_shape_exact and nullif(v_tip."provider_payment_intent_id", '') is null
    when v_event_type = 'charge.refunded' then
      v_refund_shape_exact and nullif(v_tip."provider_payment_intent_id", '') is null
    when v_event_type = 'charge.dispute.created' then
      v_dispute_shape_exact and nullif(v_tip."provider_payment_intent_id", '') is null
    else false
  end);

  if v_identity_exact is not true then
    v_result_reason := case when v_identity_pending is true
      then 'tip_provider_identity_pending' else 'tip_provider_lifecycle_identity_mismatch' end;
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
        'ignored_reason', v_result_reason,
        'no_access_granted', true,
        'pure_contribution_only', true
      )
    )
    on conflict ("provider", "provider_environment", "provider_event_id", "event_type")
      where "provider_event_id" is not null
      do nothing;

    update public."monetization_webhook_events" event_row
    set "status" = case when v_identity_pending is true then 'failed' else 'ignored' end,
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
      'reason', v_result_reason,
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
    and v_settled_success
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
  elsif v_settled_success then
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

  if v_settled_success then
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

  if v_pending_checkout then
    -- Checkout completed is not payment success. Its exact stored session can
    -- bind a first PaymentIntent for a later separately verified success event.
    -- No credit, paid timestamp, status or payout field changes here.
    v_result_reason := case when v_current_status in ('paid', 'refunded', 'disputed', 'canceled')
      then 'tip_terminal_state_preserved' else 'tip_payment_pending' end;
    update public."creator_tip_transactions" tip_row
    set "provider_payment_intent_id" = coalesce(tip_row."provider_payment_intent_id", v_payment_intent_id),
        "metadata" = v_transaction_metadata || jsonb_build_object('payment_status', 'unpaid'),
        "updated_at" = v_now
    where tip_row."id" = v_tip."id"
    returning * into v_tip;
  elsif not v_transition_allowed and v_event_type = 'charge.refunded' then
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
  elsif v_settled_success then
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
        "paid_at" = coalesce(tip_row."paid_at", v_now),
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
  elsif v_event_type in ('payment_intent.payment_failed', 'checkout.session.async_payment_failed') then
    update public."creator_tip_transactions" tip_row
    set "failed_at" = v_now,
        "provider_payment_intent_id" = coalesce(tip_row."provider_payment_intent_id", v_payment_intent_id),
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

  if v_settled_success then
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
      when v_settled_success
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

revoke all on function public."process_stripe_tip_webhook_lifecycle"(text,uuid,uuid,jsonb,jsonb,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public."process_stripe_tip_webhook_lifecycle"(text,uuid,uuid,jsonb,jsonb,jsonb)
  to service_role;
comment on function public."process_stripe_tip_webhook_lifecycle"(text,uuid,uuid,jsonb,jsonb,jsonb) is
  'Atomically settles exact test-mode paid Checkout or received PaymentIntent facts, preserves compensation and monotonic removals, and retries callbacks that precede receipt binding.';
commit;

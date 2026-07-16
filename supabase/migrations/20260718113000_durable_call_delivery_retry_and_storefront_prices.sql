-- Additive closeout for durable Chi'lly Chat terminal-delivery retries and
-- storefront-localized App Store consumable amounts.

set check_function_bodies = false;

alter table public."chat_call_transition_deliveries"
  drop constraint if exists "chat_call_transition_deliveries_result_safe_check";
alter table public."chat_call_transition_deliveries"
  add constraint "chat_call_transition_deliveries_result_safe_check" check (
    "delivery_result"::text !~* '(secret|password|service_role|private_key|webhook_secret|api_key|authorization|raw_payload)'
    and "delivery_result"::text !~* '"(token|credential|privateKey|authorization)"[[:space:]]*:'
  );

create table if not exists public."chat_call_transition_retry_config" (
  "singleton" boolean primary key default true check ("singleton" is true),
  "enabled" boolean not null default false,
  "token_sha256" text not null,
  "worker_url" text,
  "configured_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "chat_call_transition_retry_token_hash_check"
    check ("token_sha256" ~ '^[0-9a-f]{64}$'),
  constraint "chat_call_transition_retry_worker_url_check"
    check ("worker_url" is null or "worker_url" ~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/chilly-chat-call-transition-retry$')
);

create table if not exists public."chat_call_transition_delivery_failures" (
  "delivery_id" uuid primary key references public."chat_call_transition_deliveries"("id") on delete cascade,
  "call_invite_id" uuid not null references public."chat_call_invites"("id") on delete cascade,
  "dispatch_action" text not null check ("dispatch_action" in ('cancel', 'declined', 'end', 'timeout')),
  "attempt_count" integer not null check ("attempt_count" between 1 and 10),
  "last_reason" text not null,
  "severity" text not null default 'warning' check ("severity" in ('warning', 'critical')),
  "first_reported_at" timestamptz not null default timezone('utc'::text, now()),
  "last_reported_at" timestamptz not null default timezone('utc'::text, now()),
  "resolved_at" timestamptz,
  constraint "chat_call_transition_delivery_failure_safe_check"
    check ("last_reason" !~* '(secret|password|service_role|private_key|webhook_secret|api_key|authorization|raw_payload)')
);

alter table public."chat_call_transition_retry_config" enable row level security;
alter table public."chat_call_transition_delivery_failures" enable row level security;
revoke all on table public."chat_call_transition_retry_config" from public, anon, authenticated;
revoke all on table public."chat_call_transition_delivery_failures" from public, anon, authenticated;
grant all on table public."chat_call_transition_retry_config" to postgres, service_role;
grant all on table public."chat_call_transition_delivery_failures" to postgres, service_role;

create index if not exists "chat_call_transition_deliveries_retry_backoff_idx"
  on public."chat_call_transition_deliveries" ("last_attempt_at", "attempt_count", "created_at")
  where "delivery_status" in ('pending', 'dispatching', 'failed');

create or replace function public."authorize_chilly_chat_call_transition_retry"(
  p_token text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select config."enabled"
      and encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') = config."token_sha256"
    from public."chat_call_transition_retry_config" config
    where config."singleton" is true
  ), false);
$$;

create or replace function public."claim_chilly_chat_call_transition_delivery_batch"(
  p_limit integer default 10
)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc'::text, now());
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 10);
  v_delivery public."chat_call_transition_deliveries"%rowtype;
begin
  for v_delivery in
    with candidates as (
      select delivery."id"
      from public."chat_call_transition_deliveries" delivery
      where delivery."dispatch_action" is not null
        and delivery."attempt_count" < 10
        and (
          delivery."delivery_status" = 'pending'
          or (
            delivery."delivery_status" = 'failed'
            and coalesce(delivery."last_attempt_at", delivery."created_at")
              <= v_now - make_interval(secs => least(300, 5 * (2 ^ least(delivery."attempt_count", 6)))::integer)
          )
          or (
            delivery."delivery_status" = 'dispatching'
            and coalesce(delivery."last_attempt_at", delivery."updated_at") <= v_now - interval '2 minutes'
          )
        )
      order by delivery."created_at" asc
      for update skip locked
      limit v_limit
    )
    update public."chat_call_transition_deliveries" delivery
    set
      "delivery_status" = 'dispatching',
      "attempt_count" = delivery."attempt_count" + 1,
      "last_attempt_at" = v_now
    from candidates
    where delivery."id" = candidates."id"
    returning delivery.*
  loop
    return next jsonb_build_object(
      'deliveryId', v_delivery."id",
      'inviteId', v_delivery."call_invite_id",
      'actorUserId', v_delivery."actor_user_id",
      'action', v_delivery."dispatch_action",
      'attemptCount', v_delivery."attempt_count"
    );
  end loop;
  return;
end;
$$;

create or replace function public."complete_chilly_chat_call_transition_delivery"(
  p_delivery_id uuid,
  p_status text,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_result jsonb := coalesce(p_result, '{}'::jsonb);
  v_delivery public."chat_call_transition_deliveries"%rowtype;
  v_reason text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if p_delivery_id is null then raise exception 'delivery_id_required'; end if;
  if v_status not in ('sent', 'created', 'skipped', 'failed', 'blocked', 'disabled') then
    raise exception 'delivery_status_invalid';
  end if;
  if v_result::text ~* '(secret|password|service_role|private_key|webhook_secret|api_key|authorization|raw_payload)'
    or v_result::text ~* '"(token|credential|privateKey|authorization)"[[:space:]]*:'
  then
    raise exception 'delivery_result_unsafe';
  end if;

  update public."chat_call_transition_deliveries" delivery
  set
    "delivery_status" = v_status,
    "delivery_result" = v_result,
    "completed_at" = case when v_status = 'failed' then null else v_now end
  where delivery."id" = p_delivery_id
    and delivery."delivery_status" = 'dispatching'
  returning delivery.* into v_delivery;

  if v_delivery."id" is null then return null; end if;
  if v_status = 'failed' then
    v_reason := left(coalesce(nullif(v_result#>>'{result,reason}', ''), 'terminal_delivery_failed'), 180);
    insert into public."chat_call_transition_delivery_failures" (
      "delivery_id", "call_invite_id", "dispatch_action", "attempt_count",
      "last_reason", "severity", "last_reported_at", "resolved_at"
    ) values (
      v_delivery."id", v_delivery."call_invite_id", v_delivery."dispatch_action",
      v_delivery."attempt_count", v_reason,
      case when v_delivery."attempt_count" >= 10 then 'critical' else 'warning' end,
      v_now, null
    )
    on conflict ("delivery_id") do update set
      "attempt_count" = excluded."attempt_count",
      "last_reason" = excluded."last_reason",
      "severity" = excluded."severity",
      "last_reported_at" = excluded."last_reported_at",
      "resolved_at" = null;
  else
    update public."chat_call_transition_delivery_failures"
    set "resolved_at" = v_now, "last_reported_at" = v_now
    where "delivery_id" = v_delivery."id" and "resolved_at" is null;
  end if;

  return jsonb_build_object(
    'deliveryId', v_delivery."id",
    'status', v_delivery."delivery_status",
    'attemptCount', v_delivery."attempt_count",
    'capped', v_delivery."delivery_status" = 'failed' and v_delivery."attempt_count" >= 10
  );
end;
$$;

create or replace function public."configure_chilly_chat_call_transition_retry"(
  p_project_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text := rtrim(trim(coalesce(p_project_url, '')), '/');
  v_worker_url text;
  v_token text;
  v_job_id bigint;
begin
  if v_project_url <> 'https://bmkkhihfbmsnnmcqkoly.supabase.co' then
    raise exception 'retry_worker_project_url_rejected';
  end if;
  v_worker_url := v_project_url || '/functions/v1/chilly-chat-call-transition-retry';

  select secret."decrypted_secret" into v_token
  from vault."decrypted_secrets" secret
  where secret."name" = 'chilly_chat_call_transition_retry_token'
  order by secret."created_at" desc
  limit 1;
  if nullif(v_token, '') is null then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault."create_secret"(
      v_token,
      'chilly_chat_call_transition_retry_token',
      'Server-owned token for the bounded terminal call-delivery retry worker.'
    );
  end if;

  insert into public."chat_call_transition_retry_config" (
    "singleton", "enabled", "token_sha256", "worker_url", "configured_at", "updated_at"
  ) values (
    true, true, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_worker_url,
    timezone('utc'::text, now()), timezone('utc'::text, now())
  )
  on conflict ("singleton") do update set
    "enabled" = true,
    "token_sha256" = excluded."token_sha256",
    "worker_url" = excluded."worker_url",
    "configured_at" = excluded."configured_at",
    "updated_at" = excluded."updated_at";

  select job."jobid" into v_job_id
  from cron."job" job
  where job."jobname" = 'chilly-chat-call-transition-retry'
  limit 1;
  if v_job_id is not null then perform cron."unschedule"(v_job_id); end if;

  v_job_id := cron."schedule"(
    'chilly-chat-call-transition-retry',
    '* * * * *',
    format(
      $command$
        select net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-chillywood-retry-token', (
              select secret.decrypted_secret
              from vault.decrypted_secrets secret
              where secret.name = 'chilly_chat_call_transition_retry_token'
              order by secret.created_at desc
              limit 1
            )
          ),
          body := '{"batchSize":10}'::jsonb,
          timeout_milliseconds := 15000
        );
      $command$,
      v_worker_url
    )
  );

  return jsonb_build_object('enabled', true, 'jobId', v_job_id, 'schedule', '* * * * *');
end;
$$;

create or replace function public."disable_chilly_chat_call_transition_retry"()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id bigint;
begin
  update public."chat_call_transition_retry_config"
  set "enabled" = false, "updated_at" = timezone('utc'::text, now())
  where "singleton" is true;
  select job."jobid" into v_job_id
  from cron."job" job
  where job."jobname" = 'chilly-chat-call-transition-retry'
  limit 1;
  if v_job_id is not null then perform cron."unschedule"(v_job_id); end if;
  return true;
end;
$$;

revoke all on function public."authorize_chilly_chat_call_transition_retry"(text) from public, anon, authenticated;
revoke all on function public."claim_chilly_chat_call_transition_delivery_batch"(integer) from public, anon, authenticated;
revoke all on function public."complete_chilly_chat_call_transition_delivery"(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public."configure_chilly_chat_call_transition_retry"(text) from public, anon, authenticated;
revoke all on function public."disable_chilly_chat_call_transition_retry"() from public, anon, authenticated;
grant execute on function public."authorize_chilly_chat_call_transition_retry"(text) to service_role;
grant execute on function public."claim_chilly_chat_call_transition_delivery_batch"(integer) to service_role;
grant execute on function public."complete_chilly_chat_call_transition_delivery"(uuid, text, jsonb) to service_role;
grant execute on function public."configure_chilly_chat_call_transition_retry"(text) to service_role;
grant execute on function public."disable_chilly_chat_call_transition_retry"() to service_role;

create table if not exists public."revenuecat_consumable_transaction_intents" (
  "provider" text not null default 'revenuecat_app_store' check ("provider" = 'revenuecat_app_store'),
  "original_transaction_id" text not null,
  "user_id" uuid not null references auth.users("id") on delete restrict,
  "product_id" uuid not null references public."monetization_products"("id") on delete restrict,
  "purchase_intent_id" uuid not null references public."money_purchase_intents"("id") on delete restrict,
  "provider_event_id" uuid not null references public."provider_events"("id") on delete restrict,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  primary key ("provider", "original_transaction_id", "user_id", "product_id")
);
alter table public."revenuecat_consumable_transaction_intents" enable row level security;
revoke all on table public."revenuecat_consumable_transaction_intents" from public, anon, authenticated;
grant all on table public."revenuecat_consumable_transaction_intents" to postgres, service_role;

insert into public."revenuecat_consumable_transaction_intents" (
  "provider", "original_transaction_id", "user_id", "product_id",
  "purchase_intent_id", "provider_event_id"
)
select
  'revenuecat_app_store',
  event."metadata"->>'original_transaction_id',
  event."user_id"::uuid,
  event."product_id",
  (event."metadata"->>'purchase_intent_id')::uuid,
  event."id"
from public."provider_events" event
join public."money_purchase_intents" intent
  on intent."id" = (event."metadata"->>'purchase_intent_id')::uuid
 and intent."user_id" = event."user_id"
 and intent."product_id" = event."product_id"
where event."provider" = 'revenuecat_app_store'
  and event."event_type" in ('INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE')
  and event."status" = 'processed'
  and nullif(event."metadata"->>'original_transaction_id', '') is not null
  and nullif(event."metadata"->>'purchase_intent_id', '') is not null
on conflict ("provider", "original_transaction_id", "user_id", "product_id") do nothing;

create or replace function public."process_revenuecat_consumable_event_atomic"(
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_environment text,
  p_occurred_at timestamptz,
  p_expires_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_raw_payload_hash text,
  p_original_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text := upper(trim(coalesce(p_event_type, '')));
  v_currency text := lower(trim(coalesce(p_currency, '')));
  v_original_transaction_id text := nullif(trim(coalesce(p_original_transaction_id, '')), '');
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_expected_intent public."revenuecat_consumable_transaction_intents"%rowtype;
  v_existing_event public."provider_events"%rowtype;
  v_result jsonb;
  v_provider_event_id uuid;
  v_purchase_intent_id uuid;
  v_terminal boolean := v_event_type in ('REFUND', 'REVOCATION');
  v_precreated_terminal_event boolean := false;
begin
  if coalesce(p_amount_minor, -1) < 0 then raise exception 'amount_minor_invalid'; end if;
  if v_currency !~ '^[a-z]{3}$' then raise exception 'currency_invalid'; end if;

  select mapping.* into v_mapping
  from public."monetization_product_store_mappings" mapping
  where mapping."platform" = 'ios'
    and mapping."store" = 'app_store'
    and mapping."provider" = 'revenuecat_app_store'
    and mapping."provider_product_id" = trim(p_provider_product_id)
    and mapping."concept" in ('creator_tip', 'seat_pass')
    and mapping."store_product_type" = 'consumable'
    and mapping."environment" = 'sandbox'
    and mapping."status" = 'sandbox'
  limit 1;
  if v_mapping."id" is null then raise exception 'ios_consumable_mapping_invalid'; end if;
  select product.* into v_product
  from public."monetization_products" product
  where product."id" = v_mapping."product_id"
  limit 1;

  if v_terminal then
    if v_original_transaction_id is null then raise exception 'ios_consumable_original_transaction_required'; end if;
    select link.* into v_expected_intent
    from public."revenuecat_consumable_transaction_intents" link
    where link."provider" = 'revenuecat_app_store'
      and link."original_transaction_id" = v_original_transaction_id
      and link."user_id" = p_user_id
      and link."product_id" = v_product."id"
    for update;
    if v_expected_intent."purchase_intent_id" is null then
      raise exception 'ios_consumable_original_purchase_intent_not_found';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('revenuecat-event:' || v_event_type || ':' || trim(p_provider_event_id), 0));
    select event.* into v_existing_event
    from public."provider_events" event
    where event."provider" in ('revenuecat_app_store', 'revenuecat')
      and event."idempotency_key" = v_event_type || ':' || trim(p_provider_event_id)
    order by event."created_at" asc
    limit 1
    for update;
    if v_existing_event."id" is null then
      insert into public."provider_events" (
        "provider_event_id", "provider", "product_id", "product_key", "user_id",
        "app_user_id", "environment", "event_type", "status", "occurred_at",
        "idempotency_key", "raw_payload_hash", "metadata"
      ) values (
        trim(p_provider_event_id), 'revenuecat_app_store', v_product."id", v_product."product_key", p_user_id,
        p_user_id::text, 'sandbox', v_event_type, 'received', coalesce(p_occurred_at, timezone('utc'::text, now())),
        v_event_type || ':' || trim(p_provider_event_id), p_raw_payload_hash,
        jsonb_build_object(
          'provider_payload_stored', false,
          'provider_product_id', trim(p_provider_product_id),
          'original_transaction_id', v_original_transaction_id,
          'store_mapping_id', v_mapping."id",
          'purchase_intent_id', v_expected_intent."purchase_intent_id",
          'provider_amount_minor', p_amount_minor,
          'provider_currency', v_currency,
          'reference_price_minor', v_mapping."reference_price_minor",
          'reference_currency', v_mapping."reference_currency",
          'money_action', false,
          'payout_ready', false
        )
      ) returning * into v_existing_event;
      v_precreated_terminal_event := true;
    end if;
  end if;

  v_result := public."process_revenuecat_consumable_event_atomic_internal"(
    p_provider_event_id, p_event_type, p_user_id, p_provider_product_id,
    p_environment, p_occurred_at, p_expires_at,
    v_mapping."reference_price_minor", v_mapping."reference_currency",
    p_raw_payload_hash, p_original_transaction_id, null
  );

  v_provider_event_id := nullif(v_result->>'providerEventId', '')::uuid;
  v_purchase_intent_id := nullif(v_result->>'purchaseIntentId', '')::uuid;
  if v_terminal and v_purchase_intent_id is distinct from v_expected_intent."purchase_intent_id" then
    raise exception 'ios_consumable_original_purchase_intent_mismatch';
  end if;

  if v_provider_event_id is not null then
    update public."provider_events"
    set "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
      'provider_amount_minor', p_amount_minor,
      'provider_currency', v_currency,
      'reference_price_minor', v_mapping."reference_price_minor",
      'reference_currency', v_mapping."reference_currency",
      'localized_storefront_price', p_amount_minor <> v_mapping."reference_price_minor"
        or v_currency <> v_mapping."reference_currency"
    )
    where "id" = v_provider_event_id;

    update public."money_access_ledger_events"
    set
      "amount_minor" = p_amount_minor,
      "currency" = v_currency,
      "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
        'provider_amount_minor', p_amount_minor,
        'provider_currency', v_currency,
        'reference_price_minor', v_mapping."reference_price_minor",
        'reference_currency', v_mapping."reference_currency"
      )
    where "provider_event_id" = v_provider_event_id
      and "event_type" = v_event_type;
  end if;

  if not v_terminal and v_original_transaction_id is not null
    and v_provider_event_id is not null and v_purchase_intent_id is not null
    and v_result->>'status' = 'processed'
  then
    insert into public."revenuecat_consumable_transaction_intents" (
      "provider", "original_transaction_id", "user_id", "product_id",
      "purchase_intent_id", "provider_event_id"
    ) values (
      'revenuecat_app_store', v_original_transaction_id, p_user_id, v_product."id",
      v_purchase_intent_id, v_provider_event_id
    )
    on conflict ("provider", "original_transaction_id", "user_id", "product_id") do update set
      "purchase_intent_id" = excluded."purchase_intent_id",
      "provider_event_id" = excluded."provider_event_id";
  end if;

  if v_precreated_terminal_event then
    v_result := jsonb_set(v_result, '{duplicateProviderEvent}', 'false'::jsonb, true);
  end if;
  return v_result || jsonb_build_object(
    'providerAmountMinor', p_amount_minor,
    'providerCurrency', v_currency,
    'referencePriceMinor', v_mapping."reference_price_minor",
    'referenceCurrency', v_mapping."reference_currency"
  );
end;
$$;

revoke all on function public."process_revenuecat_consumable_event_atomic"(
  text, text, uuid, text, text, timestamptz, timestamptz, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public."process_revenuecat_consumable_event_atomic"(
  text, text, uuid, text, text, timestamptz, timestamptz, integer, text, text, text
) to service_role;

comment on function public."claim_chilly_chat_call_transition_delivery_batch"(integer) is
  'Claims a bounded batch of pending, backoff-eligible failed, or stale terminal call deliveries without exposing device tokens.';
comment on function public."configure_chilly_chat_call_transition_retry"(text) is
  'Service-only hosted-project activation for the one-minute terminal delivery retry worker. The generated bearer is retained only in Vault and as a SHA-256 digest.';
comment on table public."chat_call_transition_delivery_failures" is
  'Sanitized server-owned warning/critical reports for retrying or capped terminal call delivery failures.';
comment on table public."revenuecat_consumable_transaction_intents" is
  'Exact normalized RevenueCat original-transaction to purchase-intent link; contains no provider payload or credential.';
comment on function public."process_revenuecat_consumable_event_atomic"(
  text, text, uuid, text, text, timestamptz, timestamptz, integer, text, text, text
) is 'Atomic App Store consumable transaction wrapper. Catalog identity and exact purchase intent are authoritative while actual localized provider amount/currency are recorded separately from reference metadata.';

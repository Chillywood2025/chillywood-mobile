-- Inactive, source-derived Premium graph adapter. Apply only inside the reviewed
-- isolated runtime installer after schema/roles exist; this is not a migration.
-- Provenance: 20260909015439_pre_activation_premium_fresh_generation_lifecycle
--   (generation, quarantine, finite graph), 20260908231500_pre_activation_premium_
--   repurchase_quarantine_closure (fresh authority), 20260730170000_revenuecat_
--   transfer_authoritative_ordering (event ordering), and 20261106001341_
--   automatic_premium_commerce_admission (sandbox accepts either Premium mode).
-- Parent authority wrapper owns Auth/account checks, READ COMMITTED fencing of
-- all ten shared fact tables, fresh p_at, and rechecking the returned time bound
-- immediately before effects. These helpers never lock or mutate shared state.
-- No existing function/RLS helper is called. row_security=off fails on filtering;
-- it does not grant BYPASSRLS. Runtime roles must not execute these helpers.
-- Table-reading PL/pgSQL bodies defer query planning until privileged invocation;
-- SQL-language validation under the fresh installer role rejects FORCE RLS.

set local role sbx_v1_authority_owner;

create function sandbox_commerce_v1.premium_event_rank(p_type text, p_transfer boolean)
returns smallint language sql immutable parallel safe security invoker
set search_path = '' set row_security = off as $$
  select (case when p_transfer then 4 else
    case pg_catalog.upper(pg_catalog.btrim(coalesce(p_type, '')))
      when 'CANCELLATION' then 1
      when 'INITIAL_PURCHASE' then 2 when 'NON_RENEWING_PURCHASE' then 2
      when 'PRODUCT_CHANGE' then 3 when 'RENEWAL' then 3
      when 'UNCANCELLATION' then 3 when 'BILLING_ISSUE' then 3
      when 'TRANSFER' then 4 when 'EXPIRATION' then 5 when 'REFUND' then 6
      when 'REVOCATION' then 7 when 'SUBSCRIPTION_PAUSED' then 7
      else 0 end end)::smallint;
$$;

create function sandbox_commerce_v1.premium_event_is_newer(
  p_existing_at timestamptz, p_existing_type text, p_existing_id text,
  p_candidate_at timestamptz, p_candidate_type text, p_candidate_id text
)
returns boolean language sql immutable parallel safe security invoker
set search_path = '' set row_security = off as $$
  select case
    when p_existing_at is null or nullif(pg_catalog.btrim(coalesce(p_existing_id, '')), '') is null
      or p_candidate_at is null or nullif(pg_catalog.btrim(coalesce(p_candidate_id, '')), '') is null
    then true
    else (p_existing_at, sandbox_commerce_v1.premium_event_rank(p_existing_type, false),
      pg_catalog.btrim(p_existing_id) collate "C") >
      (p_candidate_at, sandbox_commerce_v1.premium_event_rank(p_candidate_type, false),
      pg_catalog.btrim(p_candidate_id) collate "C")
  end;
$$;

create function sandbox_commerce_v1.premium_fresh_authority_allowed(
  p_provider text, p_user uuid, p_environment text, p_original text,
  p_event_type text, p_candidate_at timestamptz
)
returns boolean language plpgsql stable security invoker
set search_path = '' set row_security = off as $$
begin
  return (select p_provider in ('revenuecat_app_store', 'revenuecat_google_play')
    and p_user is not null and p_environment = 'sandbox'
    and nullif(pg_catalog.btrim(coalesce(p_original, '')), '') is not null
    and pg_catalog.length(p_original) <= 512 and p_original !~ '[[:cntrl:]]'
    and pg_catalog.upper(pg_catalog.btrim(coalesce(p_event_type, ''))) in ('INITIAL_PURCHASE', 'RECONCILIATION')
    and p_candidate_at is not null
    and not exists (
      select 1 from public.revenuecat_terminal_authority_quarantines q
      where not exists (select 1 from public.revenuecat_terminal_authority_quarantine_resolutions r
        where r.quarantine_id = q.id)
        and (q.provider_scope = 'revenuecat_global' or q.provider_scope = p_provider)
        and (q.user_id is null or q.user_id = p_user)
        and (q.environment_scope is null or q.environment_scope = p_environment)
        and not (q.provider_scope = p_provider and q.user_id = p_user
          and q.environment_scope = p_environment and q.event_type = 'TRANSFER'
          and q.reason = 'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported'
          and ((pg_catalog.upper(pg_catalog.btrim(p_event_type)) = 'INITIAL_PURCHASE' and p_candidate_at > q.created_at)
            or (pg_catalog.upper(pg_catalog.btrim(p_event_type)) = 'RECONCILIATION' and p_candidate_at >= q.created_at)))
    )
    and not exists (select 1 from public.revenuecat_premium_transaction_authority a
      where a.provider = p_provider and a.original_transaction_id = p_original
        and (a.user_id <> p_user or a.environment <> p_environment))
    and not exists (select 1 from public.revenuecat_consumable_transaction_intents c
      where c.provider = p_provider and c.original_transaction_id = p_original)
    and not exists (select 1 from public.revenuecat_unbound_initial_authority i
      where i.provider = p_provider and i.original_transaction_id = p_original)
    and not exists (select 1 from public.revenuecat_unbound_terminal_authority t
      where t.provider = p_provider and t.original_transaction_id = p_original));
end;
$$;

create function sandbox_commerce_v1.premium_post_quarantine_generation(
  p_provider text, p_user uuid, p_environment text, p_original text
)
returns boolean language plpgsql stable security invoker
set search_path = '' set row_security = off as $$
begin
  return (select pg_catalog.lower(pg_catalog.btrim(coalesce(p_provider, ''))) in ('revenuecat_app_store', 'revenuecat_google_play')
    and p_user is not null and pg_catalog.lower(pg_catalog.btrim(coalesce(p_environment, ''))) = 'sandbox'
    and nullif(pg_catalog.btrim(coalesce(p_original, '')), '') is not null
    and exists (
      select 1 from public.revenuecat_premium_transaction_authority a
      join public.provider_events anchor on anchor.provider = a.provider
        and anchor.provider_event_id = a.first_event_id and anchor.raw_payload_hash = a.first_event_hash
        and anchor.user_id = a.user_id and anchor.environment = a.environment and anchor.status = 'processed'
        and anchor.metadata->>'original_transaction_id' = a.original_transaction_id
        and anchor.metadata->>'premium_transaction_binding_id' = a.id::text
        and anchor.metadata->>'premium_fresh_authority_after_transfer_quarantine' = 'true'
        and anchor.metadata->>'unresolved_non_premium_quarantine_preserved' = 'true'
        and ((anchor.event_type = 'INITIAL_PURCHASE' and anchor.metadata->>'premium_fresh_authority_event_type' = 'INITIAL_PURCHASE')
          or (anchor.event_type = 'RECONCILIATION' and anchor.metadata->>'premium_fresh_authority_event_type' = 'RECONCILIATION'
            and anchor.metadata->>'reconciliation_source' = 'revenuecat_v2_current_customer'
            and anchor.metadata->>'provider_snapshot_only' = 'true' and anchor.metadata->>'provider_transaction_created' = 'false'))
      join public.monetization_products product on product.id = anchor.product_id and product.product_type = 'premium_subscription'
      where a.provider = pg_catalog.lower(pg_catalog.btrim(p_provider)) and a.original_transaction_id = p_original
        and a.user_id = p_user and a.environment = 'sandbox'
        and sandbox_commerce_v1.premium_fresh_authority_allowed(a.provider, a.user_id, a.environment,
          a.original_transaction_id, anchor.metadata->>'premium_fresh_authority_event_type',
          case when anchor.event_type = 'RECONCILIATION' then anchor.created_at else anchor.occurred_at end)
        and exists (select 1 from public.revenuecat_terminal_authority_quarantines q
          where q.provider_scope = a.provider and q.user_id = a.user_id and q.environment_scope = a.environment
            and q.event_type = 'TRANSFER' and q.reason = 'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported'
            and not exists (select 1 from public.revenuecat_terminal_authority_quarantine_resolutions r where r.quarantine_id = q.id))
    ));
end;
$$;

create function sandbox_commerce_v1.premium_authority_quarantined(p_provider text, p_user uuid, p_environment text)
returns boolean language plpgsql stable security invoker
set search_path = '' set row_security = off as $$
begin
  return (select exists (select 1 from public.revenuecat_terminal_authority_quarantines q
    where not exists (select 1 from public.revenuecat_terminal_authority_quarantine_resolutions r where r.quarantine_id = q.id)
      and (q.provider_scope = 'revenuecat_global' or p_provider is null or q.provider_scope = p_provider)
      and (q.user_id is null or p_user is null or q.user_id = p_user)
      and (q.environment_scope is null or p_environment is null or q.environment_scope = p_environment)
      and not (p_provider is not null and p_user is not null and p_environment is not null
        and q.provider_scope = p_provider and q.user_id = p_user and q.environment_scope = p_environment
        and q.event_type = 'TRANSFER' and q.reason = 'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported'
        and exists (select 1 from public.revenuecat_premium_transaction_authority a
          where a.provider = p_provider and a.user_id = p_user and a.environment = p_environment
            and ((a.authority_state = 'pending' and
              ((a.latest_event_type = 'INITIAL_PURCHASE' and a.first_event_id = a.latest_event_id
                and a.first_event_hash = a.latest_event_hash and a.latest_occurred_at > q.created_at and a.created_at >= q.created_at)
              or sandbox_commerce_v1.premium_post_quarantine_generation(a.provider, a.user_id, a.environment, a.original_transaction_id)))
              or (a.authority_state in ('active', 'retained') and a.product_change_projection_event_id is not null
                and sandbox_commerce_v1.premium_post_quarantine_generation(a.provider, a.user_id, a.environment, a.original_transaction_id)))))
  ));
end;
$$;

-- NULL denies. Multiple matching candidates preserve EXISTS semantics: retain
-- the latest end among exact valid graphs, each bounded by both grant and
-- entitlement expiry. Account authority is separately required by the wrapper.
-- Historical source permits infinite period endpoints; do not silently change
-- that rule here. The parent additionally caps every authority lease at 5 seconds.
create function sandbox_commerce_v1.premium_valid_until(p_user uuid, p_at timestamptz)
returns timestamptz language plpgsql stable security invoker
set search_path = '' set row_security = off as $$
begin
  return (select pg_catalog.max(least(e.expires_at, g.expires_at))
    from public.user_entitlements e
    join public.access_grants g on g.user_id::text = e.user_id and g.grant_type = 'premium'
      and g.provider_event_id is not null and g.starts_at = e.starts_at and g.expires_at = e.expires_at
    join public.provider_events p on p.id = g.provider_event_id and p.user_id::text = e.user_id
      and p.product_id = g.product_id and p.provider = g.provider and p.environment = g.environment and p.status = 'processed'
      and p.provider_event_id = e.metadata->>'revenuecat_event_id' and p.raw_payload_hash = e.metadata->>'revenuecat_event_hash'
      and p.metadata->>'entitlement_key' = 'premium'
    join public.revenuecat_premium_transaction_authority a on a.provider = p.provider
      and a.original_transaction_id = p.metadata->>'original_transaction_id' and a.user_id = p.user_id and a.environment = p.environment
      and a.current_product_id = p.product_id and a.current_provider_product_id = p.metadata->>'provider_product_id'
      and a.current_provider_base_plan_id is not distinct from p.metadata->>'provider_base_plan_id'
      and a.latest_event_id = p.provider_event_id and a.latest_event_hash = p.raw_payload_hash and a.authority_state in ('active', 'retained')
    where p_user is not null and p_at is not null and pg_catalog.isfinite(p_at)
      and e.user_id = p_user::text and e.entitlement_key = 'premium' and e.source = 'revenuecat'
      and e.status in ('active', 'trialing', 'grace_period') and e.revoked_at is null
      and e.starts_at is not null and e.starts_at <= p_at and e.expires_at is not null and e.expires_at > p_at
      and e.metadata->>'environment' in ('sandbox', 'production')
      and coalesce(e.metadata->>'revenuecat_event_hash', '') ~ '^[0-9a-f]{64}$'
      and ((e.metadata->>'environment' = 'sandbox' and g.status = 'sandbox_only')
        or (e.metadata->>'environment' = 'production' and g.status = 'active'))
      and g.environment = e.metadata->>'environment' and g.revoked_at is null and g.refunded_at is null
      and g.starts_at <= p_at and g.expires_at > p_at
      and (not sandbox_commerce_v1.premium_authority_quarantined(p.provider, p.user_id, p.environment)
        or sandbox_commerce_v1.premium_post_quarantine_generation(p.provider, p.user_id, p.environment, p.metadata->>'original_transaction_id')
        or (p.event_type = 'RECONCILIATION' and p.metadata->>'reconciliation_source' = 'revenuecat_v2_current_customer'
          and p.metadata->>'provider_snapshot_only' = 'true' and p.metadata->>'provider_transaction_created' = 'false'
          and sandbox_commerce_v1.premium_fresh_authority_allowed(p.provider, p.user_id, p.environment,
            p.metadata->>'original_transaction_id', 'RECONCILIATION', p.created_at)))
      and not exists (select 1 from public.provider_events later
        join public.monetization_products product on product.id = later.product_id and product.product_type = 'premium_subscription'
        where later.user_id::text = e.user_id and later.id <> p.id
          and (later.status in ('processed', 'refunded', 'reversed')
            or (later.status = 'ignored' and later.metadata->>'premium_authority_watermark' = 'true'))
          and ((p.environment <> 'production' and later.environment = 'production')
            or (later.environment = p.environment
              and later.metadata->>'original_transaction_id' is not distinct from p.metadata->>'original_transaction_id'
              and sandbox_commerce_v1.premium_event_is_newer(later.occurred_at, later.event_type, later.provider_event_id,
                p.occurred_at, p.event_type, p.provider_event_id)))));
end;
$$;

create function sandbox_commerce_v1.premium_current(p_user uuid, p_at timestamptz)
returns boolean language sql stable security invoker
set search_path = '' set row_security = off as $$
  select sandbox_commerce_v1.premium_valid_until(p_user, p_at) is not null;
$$;

reset role;
alter function sandbox_commerce_v1.premium_event_rank(text,boolean) owner to postgres;
alter function sandbox_commerce_v1.premium_event_is_newer(timestamptz,text,text,timestamptz,text,text) owner to postgres;
alter function sandbox_commerce_v1.premium_fresh_authority_allowed(text,uuid,text,text,text,timestamptz) owner to postgres;
alter function sandbox_commerce_v1.premium_post_quarantine_generation(text,uuid,text,text) owner to postgres;
alter function sandbox_commerce_v1.premium_authority_quarantined(text,uuid,text) owner to postgres;
alter function sandbox_commerce_v1.premium_valid_until(uuid,timestamptz) owner to postgres;
alter function sandbox_commerce_v1.premium_current(uuid,timestamptz) owner to postgres;

revoke all on function sandbox_commerce_v1.premium_event_rank(text,boolean),
  sandbox_commerce_v1.premium_event_is_newer(timestamptz,text,text,timestamptz,text,text),
  sandbox_commerce_v1.premium_fresh_authority_allowed(text,uuid,text,text,text,timestamptz),
  sandbox_commerce_v1.premium_post_quarantine_generation(text,uuid,text,text),
  sandbox_commerce_v1.premium_authority_quarantined(text,uuid,text),
  sandbox_commerce_v1.premium_valid_until(uuid,timestamptz),
  sandbox_commerce_v1.premium_current(uuid,timestamptz)
  from public, anon, authenticated, service_role, sbx_v1_core_owner;

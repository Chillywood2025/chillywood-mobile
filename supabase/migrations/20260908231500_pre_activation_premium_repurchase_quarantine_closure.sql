-- A malformed RevenueCat TRANSFER without supported store identity remains
-- fail-closed for the ambiguous authority generation. It must not, however,
-- permanently prevent the same exact subject from establishing a genuinely
-- newer Premium subscription with a distinct, provider-signed original
-- transaction. Keep that exception Premium-specific: unrelated RevenueCat
-- grants remain quarantined until their own exact authority is reconciled.

create or replace function public."revenuecat_premium_fresh_authority_allowed_internal"(
  p_provider text,
  p_user_id uuid,
  p_environment text,
  p_original_transaction_id text,
  p_candidate_event_type text,
  p_candidate_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_provider in ('revenuecat_app_store','revenuecat_google_play')
    and p_user_id is not null
    and p_environment='sandbox'
    and nullif(trim(coalesce(p_original_transaction_id,'')),'') is not null
    and length(p_original_transaction_id) <= 512
    and p_original_transaction_id !~ '[[:cntrl:]]'
    and upper(trim(coalesce(p_candidate_event_type,''))) in ('INITIAL_PURCHASE','RECONCILIATION')
    and p_candidate_at is not null
    and not exists (
      select 1
      from public."revenuecat_terminal_authority_quarantines" quarantine
      where not exists (
        select 1
        from public."revenuecat_terminal_authority_quarantine_resolutions" resolution
        where resolution."quarantine_id"=quarantine."id"
      )
        and (quarantine."provider_scope"='revenuecat_global'
          or quarantine."provider_scope"=p_provider)
        and (quarantine."user_id" is null or quarantine."user_id"=p_user_id)
        and (quarantine."environment_scope" is null
          or quarantine."environment_scope"=p_environment)
        and not (
          quarantine."provider_scope"=p_provider
          and quarantine."user_id"=p_user_id
          and quarantine."environment_scope"=p_environment
          and quarantine."event_type"='TRANSFER'
          and quarantine."reason"='terminal_identity_invalid:transfer_store_identity_missing_or_unsupported'
          and (
            (upper(trim(p_candidate_event_type))='INITIAL_PURCHASE'
              and p_candidate_at>quarantine."created_at")
            or (upper(trim(p_candidate_event_type))='RECONCILIATION'
              and p_candidate_at>=quarantine."created_at")
          )
        )
    )
    and not exists (
      select 1
      from public."revenuecat_premium_transaction_authority" transaction_authority
      where transaction_authority."provider"=p_provider
        and transaction_authority."original_transaction_id"=p_original_transaction_id
        and (
          transaction_authority."user_id"<>p_user_id
          or transaction_authority."environment"<>p_environment
        )
    )
    and not exists (
      select 1
      from public."revenuecat_consumable_transaction_intents" creator_binding
      where creator_binding."provider"=p_provider
        and creator_binding."original_transaction_id"=p_original_transaction_id
    )
    and not exists (
      select 1
      from public."revenuecat_unbound_initial_authority" creator_reservation
      where creator_reservation."provider"=p_provider
        and creator_reservation."original_transaction_id"=p_original_transaction_id
    )
    and not exists (
      select 1
      from public."revenuecat_unbound_terminal_authority" terminal_reservation
      where terminal_reservation."provider"=p_provider
        and terminal_reservation."original_transaction_id"=p_original_transaction_id
    );
$$;

revoke all on function public."revenuecat_premium_fresh_authority_allowed_internal"(
  text,uuid,text,text,text,timestamptz
) from public,anon,authenticated,service_role;
comment on function public."revenuecat_premium_fresh_authority_allowed_internal"(
  text,uuid,text,text,text,timestamptz
) is 'Internal Premium-only generation check. A newer exact initial purchase/current-customer reconciliation may supersede only an exact subject/provider/environment unsupported-store TRANSFER quarantine. Global, cross-subject, cross-environment, other-reason and cross-domain ambiguity stays fail-closed.';

-- During a fresh provider wrapper call, the pending transaction binding exists
-- only inside that transaction. This narrow exemption lets the existing atomic
-- projector run. Once committed, the general RevenueCat quarantine remains in
-- force; only the Premium resolver below can recognize the newly verified
-- Premium generation.
create or replace function public."revenuecat_authority_quarantined_internal"(
  p_provider text,
  p_user_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."revenuecat_terminal_authority_quarantines" quarantine
    where not exists (
      select 1
      from public."revenuecat_terminal_authority_quarantine_resolutions" resolution
      where resolution."quarantine_id"=quarantine."id"
    )
      and (quarantine."provider_scope"='revenuecat_global'
        or p_provider is null or quarantine."provider_scope"=p_provider)
      and (quarantine."user_id" is null
        or p_user_id is null or quarantine."user_id"=p_user_id)
      and (quarantine."environment_scope" is null
        or p_environment is null or quarantine."environment_scope"=p_environment)
      and not (
        p_provider is not null
        and p_user_id is not null
        and p_environment is not null
        and quarantine."provider_scope"=p_provider
        and quarantine."user_id"=p_user_id
        and quarantine."environment_scope"=p_environment
        and quarantine."event_type"='TRANSFER'
        and quarantine."reason"='terminal_identity_invalid:transfer_store_identity_missing_or_unsupported'
        and exists (
          select 1
          from public."revenuecat_premium_transaction_authority" transaction_authority
          where transaction_authority."provider"=p_provider
            and transaction_authority."user_id"=p_user_id
            and transaction_authority."environment"=p_environment
            and transaction_authority."authority_state"='pending'
            and transaction_authority."latest_event_type"='INITIAL_PURCHASE'
            and transaction_authority."first_event_id"=transaction_authority."latest_event_id"
            and transaction_authority."first_event_hash"=transaction_authority."latest_event_hash"
            and transaction_authority."latest_occurred_at">quarantine."created_at"
            and transaction_authority."created_at">=quarantine."created_at"
        )
      )
  );
$$;
revoke all on function public."revenuecat_authority_quarantined_internal"(text,uuid,text)
  from public,anon,authenticated,service_role;

-- Preserve the exact pre-successor wrapper as an internal implementation. The
-- new public service wrapper creates a pending binding only for a fully scoped,
-- genuinely newer initial purchase, delegates all catalog/ordering/money
-- validation, and promotes the binding only after the existing projector has
-- produced an exact processed provider event.
alter function public."process_revenuecat_premium_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid,text
) rename to "process_revenuecat_premium_event_atomic_pre_repurchase";

revoke all on function public."process_revenuecat_premium_event_atomic_pre_repurchase"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid,text
) from public,anon,authenticated,service_role;

create or replace function public."process_revenuecat_premium_event_atomic"(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_provider_base_plan_id text,
  p_environment text,
  p_entitlement_status text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_occurred_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_raw_payload_hash text,
  p_period_type text,
  p_store text,
  p_platform text,
  p_store_mapping_id uuid,
  p_product_id uuid,
  p_original_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz:=clock_timestamp();
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_event_id text:=trim(coalesce(p_provider_event_id,''));
  v_event_type text:=upper(trim(coalesce(p_event_type,'')));
  v_environment text:=lower(trim(coalesce(p_environment,'')));
  v_original_transaction_id text:=trim(coalesce(p_original_transaction_id,''));
  v_provider_product_id text:=trim(coalesce(p_provider_product_id,''));
  v_provider_base_plan_id text:=nullif(trim(coalesce(p_provider_base_plan_id,'')),'');
  v_candidate_at timestamptz:=least(coalesce(p_occurred_at,v_now),v_now);
  v_binding_id uuid;
  v_inserted_pending boolean:=false;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-event-id:'||v_event_id,0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-original:'||v_provider||':'||v_original_transaction_id,0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-original:'||v_provider||':'||v_original_transaction_id,0
  ));

  select transaction_authority."id" into v_binding_id
  from public."revenuecat_premium_transaction_authority" transaction_authority
  where transaction_authority."provider"=v_provider
    and transaction_authority."original_transaction_id"=v_original_transaction_id
  for update;

  if v_event_type='INITIAL_PURCHASE'
    and v_binding_id is null
    and not exists (
      select 1 from public."provider_events" event
      where event."provider" in ('revenuecat','revenuecat_app_store','revenuecat_google_play')
        and event."provider_event_id"=v_event_id
    )
    and (
      (
        v_provider='revenuecat_app_store'
        and exists (
          select 1
          from public."monetization_product_store_mappings" mapping
          join public."monetization_products" product
            on product."id"=mapping."product_id"
           and product."product_type"='premium_subscription'
          where mapping."id"=p_store_mapping_id
            and mapping."product_id"=p_product_id
            and mapping."provider"=v_provider
            and mapping."provider_product_id"=v_provider_product_id
            and mapping."provider_base_plan_id" is not distinct from v_provider_base_plan_id
            and mapping."environment"=v_environment
            and mapping."platform"='ios'
            and mapping."store"='app_store'
            and lower(trim(coalesce(p_store,'')))='app_store'
            and lower(trim(coalesce(p_platform,'')))='ios'
        )
      )
      or (
        v_provider='revenuecat_google_play'
        and p_store_mapping_id is null
        and lower(trim(coalesce(p_store,'')))='google_play'
        and lower(trim(coalesce(p_platform,'')))='android'
        and exists (
          select 1
          from public."monetization_products" product
          where product."id"=p_product_id
            and product."product_type"='premium_subscription'
            and product."provider"='revenuecat_google_play'
            and product."provider_product_id"=v_provider_product_id
            and product."provider_base_plan_id" is not distinct from v_provider_base_plan_id
            and product."environment"=v_environment
            and product."status"=case when v_environment='sandbox' then 'sandbox' else 'active' end
            and product."is_android_digital" is true
        )
      )
    )
    and public."revenuecat_authority_quarantined_internal"(
      v_provider,p_user_id,v_environment
    )
    and public."revenuecat_premium_fresh_authority_allowed_internal"(
      v_provider,p_user_id,v_environment,v_original_transaction_id,
      v_event_type,v_candidate_at
    )
  then
    insert into public."revenuecat_premium_transaction_authority"(
      "provider","original_transaction_id","user_id","environment",
      "current_product_id","current_provider_product_id","current_provider_base_plan_id",
      "first_event_id","first_event_hash","latest_event_id","latest_event_hash",
      "latest_event_type","latest_occurred_at","latest_event_rank","authority_state"
    ) values (
      v_provider,v_original_transaction_id,p_user_id,v_environment,
      p_product_id,v_provider_product_id,v_provider_base_plan_id,
      v_event_id,p_raw_payload_hash,v_event_id,p_raw_payload_hash,
      'INITIAL_PURCHASE',v_candidate_at,
      public."revenuecat_premium_authority_rank_internal"('INITIAL_PURCHASE',false),'pending'
    ) returning "id" into v_binding_id;
    v_inserted_pending:=true;
  end if;

  v_result:=public."process_revenuecat_premium_event_atomic_pre_repurchase"(
    p_provider,p_provider_event_id,p_event_type,p_user_id,
    p_provider_product_id,p_provider_base_plan_id,p_environment,p_entitlement_status,
    p_starts_at,p_expires_at,p_occurred_at,p_amount_minor,p_currency,p_raw_payload_hash,
    p_period_type,p_store,p_platform,p_store_mapping_id,p_product_id,p_original_transaction_id
  );

  if v_inserted_pending and coalesce(v_result->>'status','')='processed' then
    update public."provider_events" event
    set "metadata"=coalesce(event."metadata",'{}'::jsonb)||jsonb_build_object(
      'premium_fresh_authority_after_transfer_quarantine',true,
      'premium_fresh_authority_event_type','INITIAL_PURCHASE',
      'unresolved_non_premium_quarantine_preserved',true
    )
    where event."id"=nullif(v_result->>'providerEventId','')::uuid
      and event."provider"=v_provider
      and event."provider_event_id"=v_event_id
      and event."user_id"=p_user_id
      and event."environment"=v_environment
      and event."status"='processed'
      and event."raw_payload_hash"=p_raw_payload_hash;
    if not found then raise exception 'premium_fresh_purchase_event_postcondition_failed'; end if;

    update public."revenuecat_premium_transaction_authority" transaction_authority
    set "current_product_id"=p_product_id,
        "current_provider_product_id"=v_provider_product_id,
        "current_provider_base_plan_id"=v_provider_base_plan_id,
        "latest_event_id"=v_event_id,
        "latest_event_hash"=p_raw_payload_hash,
        "latest_event_type"='INITIAL_PURCHASE',
        "latest_occurred_at"=v_candidate_at,
        "latest_event_rank"=public."revenuecat_premium_authority_rank_internal"('INITIAL_PURCHASE',false),
        "authority_state"='active',
        "updated_at"=v_now
    where transaction_authority."id"=v_binding_id
      and transaction_authority."user_id"=p_user_id
      and transaction_authority."environment"=v_environment
      and transaction_authority."authority_state"='pending';
    if not found then raise exception 'premium_fresh_purchase_binding_postcondition_failed'; end if;

    update public."revenuecat_premium_transaction_authority" transaction_authority
    set "authority_state"='expired',"updated_at"=v_now
    where transaction_authority."provider"=v_provider
      and transaction_authority."user_id"=p_user_id
      and transaction_authority."environment"=v_environment
      and transaction_authority."id"<>v_binding_id
      and transaction_authority."authority_state" in ('active','retained');

    v_result:=v_result||jsonb_build_object(
      'entitlementActive',public."premium_subject_has_finite_authority_internal"(p_user_id::text),
      'freshAuthorityAfterTransferQuarantine',true
    );
  elsif v_inserted_pending then
    update public."revenuecat_premium_transaction_authority" transaction_authority
    set "authority_state"='blocked',"updated_at"=v_now
    where transaction_authority."id"=v_binding_id
      and transaction_authority."authority_state"='pending';
  end if;
  return v_result;
end;
$$;

revoke all on function public."process_revenuecat_premium_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid,text
) from public,anon,authenticated,service_role;
grant execute on function public."process_revenuecat_premium_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid,text
) to service_role;
comment on function public."process_revenuecat_premium_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid,text
) is 'Sole service-callable Premium projector. In addition to the exact historical authority graph, a genuinely newer exact initial purchase may establish a new Premium generation after an exact scoped unsupported-store TRANSFER quarantine; other RevenueCat domains remain quarantined.';

-- Reconciliation needs the same finite-generation rule, but only after an
-- exact current-customer snapshot has passed the existing strict validator.
alter function public."reconcile_revenuecat_premium_snapshot_atomic"(
  text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text
) rename to "reconcile_revenuecat_premium_snapshot_pre_repurchase";

revoke all on function public."reconcile_revenuecat_premium_snapshot_pre_repurchase"(
  text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text
) from public,anon,authenticated,service_role;

create or replace function public."reconcile_revenuecat_premium_snapshot_atomic"(
  p_snapshot_id text,
  p_user_id uuid,
  p_revenuecat_subscription_id text,
  p_original_transaction_id text,
  p_provider_product_id text,
  p_entitlement_status text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_observed_at timestamptz,
  p_raw_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz:=clock_timestamp();
  v_snapshot_id text:=trim(coalesce(p_snapshot_id,''));
  v_original_transaction_id text:=trim(coalesce(p_original_transaction_id,''));
  v_provider_product_id text:=trim(coalesce(p_provider_product_id,''));
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_binding_id uuid;
  v_inserted_pending boolean:=false;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-reconciliation:'||v_snapshot_id,0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-original:revenuecat_app_store:'||v_original_transaction_id,0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-original:revenuecat_app_store:'||v_original_transaction_id,0
  ));

  select transaction_authority."id" into v_binding_id
  from public."revenuecat_premium_transaction_authority" transaction_authority
  where transaction_authority."provider"='revenuecat_app_store'
    and transaction_authority."original_transaction_id"=v_original_transaction_id
  for update;

  select mapping.* into v_mapping
  from public."monetization_product_store_mappings" mapping
  join public."monetization_products" product
    on product."id"=mapping."product_id"
   and product."product_type"='premium_subscription'
  where mapping."concept"='premium'
    and mapping."platform"='ios'
    and mapping."store"='app_store'
    and mapping."provider"='revenuecat_app_store'
    and mapping."provider_product_id"=v_provider_product_id
    and mapping."provider_base_plan_id" is null
    and mapping."environment"='sandbox'
    and mapping."status"='sandbox'
    and mapping."store_product_type"='auto_renewable_subscription'
    and mapping."unlocks_digital_access" is true
    and mapping."grants_livekit_authority" is false
    and mapping."creates_payable_balance" is false
  order by mapping."created_at",mapping."id"
  limit 1;

  if v_binding_id is null
    and v_mapping."id" is not null
    and not exists (
      select 1 from public."provider_events" event
      where event."provider"='revenuecat_app_store'
        and event."idempotency_key"='RECONCILIATION:'||v_snapshot_id
    )
    and public."revenuecat_authority_quarantined_internal"(
      'revenuecat_app_store',p_user_id,'sandbox'
    )
    and public."revenuecat_premium_fresh_authority_allowed_internal"(
      'revenuecat_app_store',p_user_id,'sandbox',v_original_transaction_id,
      'RECONCILIATION',p_observed_at
    )
  then
    insert into public."revenuecat_premium_transaction_authority"(
      "provider","original_transaction_id","user_id","environment",
      "current_product_id","current_provider_product_id","current_provider_base_plan_id",
      "first_event_id","first_event_hash","latest_event_id","latest_event_hash",
      "latest_event_type","latest_occurred_at","latest_event_rank","authority_state"
    ) values (
      'revenuecat_app_store',v_original_transaction_id,p_user_id,'sandbox',
      v_mapping."product_id",v_provider_product_id,null,
      v_snapshot_id,p_raw_payload_hash,v_snapshot_id,p_raw_payload_hash,
      'INITIAL_PURCHASE',least(coalesce(p_observed_at,v_now),v_now),
      public."revenuecat_premium_authority_rank_internal"('INITIAL_PURCHASE',false),'pending'
    ) returning "id" into v_binding_id;
    v_inserted_pending:=true;
  end if;

  v_result:=public."reconcile_revenuecat_premium_snapshot_pre_repurchase"(
    p_snapshot_id,p_user_id,p_revenuecat_subscription_id,p_original_transaction_id,
    p_provider_product_id,p_entitlement_status,p_starts_at,p_expires_at,
    p_observed_at,p_raw_payload_hash
  );

  if v_inserted_pending and coalesce(v_result->>'status','')='processed' then
    update public."provider_events" event
    set "metadata"=coalesce(event."metadata",'{}'::jsonb)||jsonb_build_object(
      'premium_fresh_authority_after_transfer_quarantine',true,
      'premium_fresh_authority_event_type','RECONCILIATION',
      'unresolved_non_premium_quarantine_preserved',true
    )
    where event."id"=nullif(v_result->>'providerEventId','')::uuid
      and event."provider"='revenuecat_app_store'
      and event."provider_event_id"=v_snapshot_id
      and event."user_id"=p_user_id
      and event."environment"='sandbox'
      and event."status"='processed'
      and event."raw_payload_hash"=p_raw_payload_hash;
    if not found then raise exception 'premium_reconciliation_fresh_event_postcondition_failed'; end if;
    v_result:=v_result||jsonb_build_object(
      'entitlementActive',public."premium_subject_has_finite_authority_internal"(p_user_id::text),
      'freshAuthorityAfterTransferQuarantine',true
    );
  elsif v_inserted_pending then
    update public."revenuecat_premium_transaction_authority" transaction_authority
    set "authority_state"='blocked',"updated_at"=v_now
    where transaction_authority."id"=v_binding_id
      and transaction_authority."authority_state"='pending';
  end if;
  return v_result;
end;
$$;

revoke all on function public."reconcile_revenuecat_premium_snapshot_atomic"(
  text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text
) from public,anon,authenticated,service_role;
grant execute on function public."reconcile_revenuecat_premium_snapshot_atomic"(
  text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text
) to service_role;
comment on function public."reconcile_revenuecat_premium_snapshot_atomic"(
  text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text
) is 'Service-only exact RevenueCat current-customer reconciliation. A current App Store sandbox subscription may establish a newer Premium generation after only an exact scoped unsupported-store TRANSFER quarantine; no provider transaction, money action, payout or cross-user authority is created.';

-- Premium resolution is bound to the exact processed event and transaction.
-- The broad quarantine is intentionally preserved for all non-Premium grants.
create or replace function public."premium_subject_has_finite_authority_internal"(p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(trim(coalesce(p_user_id,'')),'') is not null
    and not public."is_account_access_restricted"(p_user_id)
    and exists (
      select 1
      from public."user_entitlements" entitlement
      join public."access_grants" grant_row
        on grant_row."user_id"::text=entitlement."user_id"
       and grant_row."grant_type"='premium'
       and grant_row."provider_event_id" is not null
       and grant_row."starts_at"=entitlement."starts_at"
       and grant_row."expires_at"=entitlement."expires_at"
      join public."provider_events" provider_event
        on provider_event."id"=grant_row."provider_event_id"
       and provider_event."user_id"::text=entitlement."user_id"
       and provider_event."product_id"=grant_row."product_id"
       and provider_event."provider"=grant_row."provider"
       and provider_event."environment"=grant_row."environment"
       and provider_event."status"='processed'
       and provider_event."provider_event_id"=entitlement."metadata"->>'revenuecat_event_id'
       and provider_event."raw_payload_hash"=entitlement."metadata"->>'revenuecat_event_hash'
       and provider_event."metadata"->>'entitlement_key'='premium'
      join public."revenuecat_premium_transaction_authority" transaction_authority
        on transaction_authority."provider"=provider_event."provider"
       and transaction_authority."original_transaction_id"=provider_event."metadata"->>'original_transaction_id'
       and transaction_authority."user_id"=provider_event."user_id"
       and transaction_authority."environment"=provider_event."environment"
       and transaction_authority."current_product_id"=provider_event."product_id"
       and transaction_authority."current_provider_product_id"=provider_event."metadata"->>'provider_product_id'
       and transaction_authority."current_provider_base_plan_id" is not distinct from provider_event."metadata"->>'provider_base_plan_id'
       and transaction_authority."latest_event_id"=provider_event."provider_event_id"
       and transaction_authority."latest_event_hash"=provider_event."raw_payload_hash"
       and transaction_authority."authority_state" in ('active','retained')
      where entitlement."user_id"=p_user_id
        and entitlement."entitlement_key"='premium'
        and entitlement."source"='revenuecat'
        and entitlement."status" in ('active','trialing','grace_period')
        and entitlement."revoked_at" is null
        and entitlement."starts_at" is not null
        and entitlement."starts_at"<=timezone('utc'::text,now())
        and entitlement."expires_at" is not null
        and entitlement."expires_at">timezone('utc'::text,now())
        and entitlement."metadata"->>'environment' in ('sandbox','production')
        and coalesce(entitlement."metadata"->>'revenuecat_event_hash','') ~ '^[0-9a-f]{64}$'
        and ((entitlement."metadata"->>'environment'='sandbox' and grant_row."status"='sandbox_only')
          or (entitlement."metadata"->>'environment'='production' and grant_row."status"='active'))
        and grant_row."environment"=entitlement."metadata"->>'environment'
        and grant_row."revoked_at" is null and grant_row."refunded_at" is null
        and grant_row."starts_at"<=timezone('utc'::text,now())
        and grant_row."expires_at">timezone('utc'::text,now())
        and (
          not public."revenuecat_authority_quarantined_internal"(
            provider_event."provider",provider_event."user_id",provider_event."environment"
          )
          or (
            (
              provider_event."metadata"->>'premium_fresh_authority_after_transfer_quarantine'='true'
              and provider_event."metadata"->>'unresolved_non_premium_quarantine_preserved'='true'
            )
            or (
              provider_event."event_type"='RECONCILIATION'
              and provider_event."metadata"->>'reconciliation_source'='revenuecat_v2_current_customer'
              and provider_event."metadata"->>'provider_snapshot_only'='true'
              and provider_event."metadata"->>'provider_transaction_created'='false'
            )
          )
          and public."revenuecat_premium_fresh_authority_allowed_internal"(
              provider_event."provider",provider_event."user_id",provider_event."environment",
              provider_event."metadata"->>'original_transaction_id',
              case when provider_event."event_type"='RECONCILIATION'
                then 'RECONCILIATION'
                else provider_event."metadata"->>'premium_fresh_authority_event_type' end,
              case when provider_event."event_type"='RECONCILIATION'
                then provider_event."created_at" else provider_event."occurred_at" end
            )
        )
        and not exists (
          select 1
          from public."provider_events" later_authority
          join public."monetization_products" later_product
            on later_product."id"=later_authority."product_id"
           and later_product."product_type"='premium_subscription'
          where later_authority."user_id"::text=entitlement."user_id"
            and later_authority."id"<>provider_event."id"
            and (
              later_authority."status" in ('processed','refunded','reversed')
              or (later_authority."status"='ignored'
                and later_authority."metadata"->>'premium_authority_watermark'='true')
            )
            and (
              (provider_event."environment"<>'production' and later_authority."environment"='production')
              or (
                later_authority."environment"=provider_event."environment"
                and later_authority."metadata"->>'original_transaction_id'
                  is not distinct from provider_event."metadata"->>'original_transaction_id'
                and public."revenuecat_premium_authority_is_newer_internal"(
                  later_authority."occurred_at",later_authority."event_type",later_authority."provider_event_id",false,
                  provider_event."occurred_at",provider_event."event_type",provider_event."provider_event_id",false
                )
              )
            )
        )
    );
$$;
revoke all on function public."premium_subject_has_finite_authority_internal"(text)
  from public,anon,authenticated,service_role;

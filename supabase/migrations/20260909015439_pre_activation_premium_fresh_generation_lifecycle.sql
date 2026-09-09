-- A Premium generation admitted after an exact sandbox TRANSFER quarantine
-- must remain usable for its ordinary provider-signed lifecycle. The prior
-- successor admitted only the initial/current-customer snapshot while the
-- transaction binding was pending, so the first legitimate RENEWAL observed
-- the still-preserved non-Premium quarantine and blocked the exact binding.
--
-- Keep the exception exact and Premium-only. The unresolved quarantine still
-- governs every other RevenueCat domain, provider, subject and environment.
-- Only a binding whose immutable first event carries the prior successor's
-- marker can use this lifecycle path.
-- PRODUCT_CHANGE has an additional inherited precondition: the binding must
-- remain active/retained while the historical projector validates the new
-- catalog identity. Keep a transaction-local marker on the protected binding
-- instead of weakening that precondition or the subject-scoped quarantine.
alter table public."revenuecat_premium_transaction_authority"
  add column if not exists "product_change_projection_event_id" text;
alter table public."revenuecat_premium_transaction_authority"
  add constraint "revenuecat_premium_product_change_projection_event_shape"
  check ( "product_change_projection_event_id" is null or ( length("product_change_projection_event_id") between 1 and 512 and "product_change_projection_event_id" !~ '[[:cntrl:]]'
    ) );
comment on column public."revenuecat_premium_transaction_authority"."product_change_projection_event_id"
  is 'Transaction-local service-projector marker. Final wrappers must clear it before commit; it grants no durable authority.';
create or replace function public."revenuecat_premium_post_quarantine_generation_internal"( p_provider text, p_user_id uuid, p_environment text, p_original_transaction_id text )
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select lower(trim(coalesce(p_provider,''))) in ( 'revenuecat_app_store','revenuecat_google_play'
    ) and p_user_id is not null and lower(trim(coalesce(p_environment,'')))='sandbox' and nullif(trim(coalesce(p_original_transaction_id,'')),'') is not null and exists ( select 1
      from public."revenuecat_premium_transaction_authority" transaction_authority join public."provider_events" anchor
        on anchor."provider"=transaction_authority."provider" and anchor."provider_event_id"=transaction_authority."first_event_id"
       and anchor."raw_payload_hash"=transaction_authority."first_event_hash" and anchor."user_id"=transaction_authority."user_id"
       and anchor."environment"=transaction_authority."environment" and anchor."status"='processed' and anchor."metadata"->>'original_transaction_id'
         =transaction_authority."original_transaction_id" and anchor."metadata"->>'premium_transaction_binding_id'
         =transaction_authority."id"::text and anchor."metadata"->>'premium_fresh_authority_after_transfer_quarantine'='true'
       and anchor."metadata"->>'unresolved_non_premium_quarantine_preserved'='true' and (
         (anchor."event_type"='INITIAL_PURCHASE' and anchor."metadata"->>'premium_fresh_authority_event_type'='INITIAL_PURCHASE') or (anchor."event_type"='RECONCILIATION'
           and anchor."metadata"->>'premium_fresh_authority_event_type'='RECONCILIATION' and anchor."metadata"->>'reconciliation_source'='revenuecat_v2_current_customer'
           and anchor."metadata"->>'provider_snapshot_only'='true' and anchor."metadata"->>'provider_transaction_created'='false') ) join public."monetization_products" product
        on product."id"=anchor."product_id" and product."product_type"='premium_subscription'
      where transaction_authority."provider"=lower(trim(p_provider)) and transaction_authority."original_transaction_id"=p_original_transaction_id
        and transaction_authority."user_id"=p_user_id and transaction_authority."environment"='sandbox' and public."revenuecat_premium_fresh_authority_allowed_internal"(
          transaction_authority."provider",transaction_authority."user_id", transaction_authority."environment",transaction_authority."original_transaction_id",
          anchor."metadata"->>'premium_fresh_authority_event_type', case when anchor."event_type"='RECONCILIATION' then anchor."created_at" else anchor."occurred_at" end
        ) and exists ( select 1 from public."revenuecat_terminal_authority_quarantines" quarantine
          where quarantine."provider_scope"=transaction_authority."provider" and quarantine."user_id"=transaction_authority."user_id"
            and quarantine."environment_scope"=transaction_authority."environment" and quarantine."event_type"='TRANSFER' and quarantine."reason"=
              'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported' and not exists ( select 1
              from public."revenuecat_terminal_authority_quarantine_resolutions" resolution where resolution."quarantine_id"=quarantine."id" ) ) );
$$;
revoke all on function public."revenuecat_premium_post_quarantine_generation_internal"( text,uuid,text,text ) from public,anon,authenticated,service_role;
comment on function public."revenuecat_premium_post_quarantine_generation_internal"( text,uuid,text,text
) is 'Internal exact-generation proof for a sandbox Premium transaction admitted after the narrowly supported unresolved TRANSFER quarantine. It grants no authority and does not weaken the quarantine for other RevenueCat domains.';
-- A deployed binding can already be blocked by the lifecycle blind spot this
-- migration repairs. Recovery is allowed only when the immutable anchor above
-- is valid and every later delivery for the exact transaction is an ignored
-- RENEWAL carrying one of the two reasons produced by that blind spot. Any
-- processed terminal, different reason, different event type, cross-user
-- binding or production authority keeps the transaction fail-closed.
create or replace function public."revenuecat_premium_quarantine_bug_recoverable_internal"( p_provider text, p_user_id uuid, p_environment text, p_original_transaction_id text )
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select public."revenuecat_premium_post_quarantine_generation_internal"( p_provider,p_user_id,p_environment,p_original_transaction_id
    ) and not public."is_account_access_restricted"(p_user_id::text) and exists ( select 1 from public."revenuecat_premium_transaction_authority" transaction_authority
      join public."provider_events" latest on latest."provider"=transaction_authority."provider" and latest."provider_event_id"=transaction_authority."latest_event_id"
       and latest."raw_payload_hash"=transaction_authority."latest_event_hash" and latest."user_id"=transaction_authority."user_id"
       and latest."environment"=transaction_authority."environment" and latest."metadata"->>'original_transaction_id'
         =transaction_authority."original_transaction_id" and latest."metadata"->>'premium_transaction_binding_id'
         =transaction_authority."id"::text
      where transaction_authority."provider"=lower(trim(p_provider)) and transaction_authority."original_transaction_id"=p_original_transaction_id
        and transaction_authority."user_id"=p_user_id and transaction_authority."environment"='sandbox' and transaction_authority."authority_state"='blocked'
        and latest."status"='ignored' and latest."event_type"='RENEWAL' and latest."metadata"->>'final_reason' in ( 'revenuecat_terminal_authority_quarantined',
          'premium_original_transaction_terminal_or_blocked'
        ) and coalesce(latest."metadata"->>'authority_granted','false')='false' and coalesce(latest."metadata"->>'money_action','false')='false' and exists ( select 1
          from public."provider_events" ignored_renewal
          where ignored_renewal."provider"=transaction_authority."provider" and ignored_renewal."user_id"=transaction_authority."user_id"
            and ignored_renewal."environment"=transaction_authority."environment" and ignored_renewal."metadata"->>'original_transaction_id'
              =transaction_authority."original_transaction_id" and ignored_renewal."metadata"->>'premium_transaction_binding_id'
              =transaction_authority."id"::text and ignored_renewal."provider_event_id"<>transaction_authority."first_event_id" and ignored_renewal."status"='ignored'
            and ignored_renewal."event_type"='RENEWAL' and ignored_renewal."metadata"->>'final_reason' in ( 'revenuecat_terminal_authority_quarantined',
              'premium_original_transaction_terminal_or_blocked' ) ) and not exists ( select 1 from public."provider_events" intervening
          where intervening."provider"=transaction_authority."provider" and intervening."user_id"=transaction_authority."user_id"
            and intervening."environment"=transaction_authority."environment" and intervening."metadata"->>'original_transaction_id'
              =transaction_authority."original_transaction_id" and intervening."provider_event_id"<>transaction_authority."first_event_id" and not (
              intervening."status"='ignored' and intervening."event_type"='RENEWAL' and intervening."metadata"->>'premium_transaction_binding_id'
                =transaction_authority."id"::text and intervening."metadata"->>'final_reason' in ( 'revenuecat_terminal_authority_quarantined',
                'premium_original_transaction_terminal_or_blocked'
              ) and coalesce(intervening."metadata"->>'authority_granted','false')='false' and coalesce(intervening."metadata"->>'money_action','false')='false' ) ) and exists (
          select 1 from public."user_entitlements" entitlement join public."provider_events" entitlement_event on entitlement_event."provider_event_id"
              =entitlement."metadata"->>'revenuecat_event_id' and entitlement_event."raw_payload_hash"
              =entitlement."metadata"->>'revenuecat_event_hash' and entitlement_event."provider"=transaction_authority."provider"
           and entitlement_event."user_id"=transaction_authority."user_id" and entitlement_event."environment"=transaction_authority."environment"
           and entitlement_event."metadata"->>'original_transaction_id'
              =transaction_authority."original_transaction_id"
          where entitlement."user_id"=p_user_id::text and entitlement."entitlement_key"='premium' and entitlement."source"='revenuecat'
            and entitlement."metadata"->>'environment'='sandbox' ) and not exists ( select 1 from public."user_entitlements" production_entitlement
          where production_entitlement."user_id"=p_user_id::text and production_entitlement."entitlement_key"='premium' and production_entitlement."source"='revenuecat'
            and production_entitlement."metadata"->>'environment'='production' ) );
$$;
revoke all on function public."revenuecat_premium_quarantine_bug_recoverable_internal"( text,uuid,text,text ) from public,anon,authenticated,service_role;
comment on function public."revenuecat_premium_quarantine_bug_recoverable_internal"( text,uuid,text,text
) is 'Internal fail-closed classifier for the exact sandbox renewal sequence blocked solely by the prior post-quarantine Premium lifecycle blind spot.';
-- The internal projector still calls this historical subject-scoped predicate.
-- Extend only its transaction-local pending exemption: the service wrapper
-- below may stage an already-proven exact generation as pending while its
-- lifecycle event is projected. Keeping the real latest watermark intact lets
-- the historical ordering and terminal dispatch logic remain authoritative.
create or replace function public."revenuecat_authority_quarantined_internal"( p_provider text, p_user_id uuid, p_environment text )
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists ( select 1 from public."revenuecat_terminal_authority_quarantines" quarantine where not exists ( select 1
      from public."revenuecat_terminal_authority_quarantine_resolutions" resolution where resolution."quarantine_id"=quarantine."id"
    ) and (quarantine."provider_scope"='revenuecat_global' or p_provider is null or quarantine."provider_scope"=p_provider) and (quarantine."user_id" is null
        or p_user_id is null or quarantine."user_id"=p_user_id) and (quarantine."environment_scope" is null
        or p_environment is null or quarantine."environment_scope"=p_environment) and not (
        p_provider is not null and p_user_id is not null and p_environment is not null and quarantine."provider_scope"=p_provider and quarantine."user_id"=p_user_id
        and quarantine."environment_scope"=p_environment and quarantine."event_type"='TRANSFER' and quarantine."reason"=
          'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported' and exists ( select 1
          from public."revenuecat_premium_transaction_authority" transaction_authority
          where transaction_authority."provider"=p_provider and transaction_authority."user_id"=p_user_id and transaction_authority."environment"=p_environment and (
              (transaction_authority."authority_state"='pending' and ( ( transaction_authority."latest_event_type"='INITIAL_PURCHASE' and transaction_authority."first_event_id"
                    =transaction_authority."latest_event_id" and transaction_authority."first_event_hash"
                    =transaction_authority."latest_event_hash" and transaction_authority."latest_occurred_at">quarantine."created_at"
                  and transaction_authority."created_at">=quarantine."created_at" ) or public."revenuecat_premium_post_quarantine_generation_internal"(
                  transaction_authority."provider",transaction_authority."user_id", transaction_authority."environment", transaction_authority."original_transaction_id" ) )) or (
                transaction_authority."authority_state" in ('active','retained') and transaction_authority."product_change_projection_event_id" is not null
                and public."revenuecat_premium_post_quarantine_generation_internal"( transaction_authority."provider",transaction_authority."user_id",
                  transaction_authority."environment", transaction_authority."original_transaction_id" ) ) ) ) ) );
$$;
revoke all on function public."revenuecat_authority_quarantined_internal"(text,uuid,text) from public,anon,authenticated,service_role;
-- Preserve the prior public service entry point as an internal implementation.
-- The new wrapper temporarily presents only the already-proven immutable first
-- event as pending while the historical projector performs all catalog,
-- ordering, entitlement and money checks. This is transaction-local: a thrown
-- error rolls the staging update back, while an ignored event leaves the exact
-- binding blocked.
alter function public."process_revenuecat_premium_event_atomic"( text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid,text ) rename to "process_revenuecat_premium_event_atomic_pre_gen_lifecycle";
revoke all on function public."process_revenuecat_premium_event_atomic_pre_gen_lifecycle"( text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid,text ) from public,anon,authenticated,service_role;
create or replace function public."process_revenuecat_premium_event_atomic"( p_provider text, p_provider_event_id text, p_event_type text, p_user_id uuid,
  p_provider_product_id text, p_provider_base_plan_id text, p_environment text, p_entitlement_status text, p_starts_at timestamptz, p_expires_at timestamptz,
  p_occurred_at timestamptz, p_amount_minor integer, p_currency text, p_raw_payload_hash text, p_period_type text, p_store text, p_platform text, p_store_mapping_id uuid,
  p_product_id uuid, p_original_transaction_id text )
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_now timestamptz:=clock_timestamp();
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_event_id text:=trim(coalesce(p_provider_event_id,''));
  v_event_type text:=upper(trim(coalesce(p_event_type,'')));
  v_environment text:=lower(trim(coalesce(p_environment,'')));
  v_original_transaction_id text:=trim(coalesce(p_original_transaction_id,''));
  v_candidate_at timestamptz:=least(coalesce(p_occurred_at,v_now),v_now);
  v_binding public."revenuecat_premium_transaction_authority"%rowtype;
  v_existing_event public."provider_events"%rowtype;
  v_stage_generation boolean:=false;
  v_stage_product_change boolean:=false;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended( 'revenuecat-premium-event-id:'||v_event_id,0 ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended( 'revenuecat-original:'||v_provider||':'||v_original_transaction_id,0 ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended( 'revenuecat-premium-original:'||v_provider||':'||v_original_transaction_id,0 ));
  if v_provider in ('revenuecat_app_store','revenuecat_google_play') and p_user_id is not null and v_environment in ('sandbox','production') then
    perform public."lock_revenuecat_premium_quarantine_scopes_internal"( v_provider,p_user_id,v_environment );
  end if;
  select transaction_authority.* into v_binding from public."revenuecat_premium_transaction_authority" transaction_authority
  where transaction_authority."provider"=v_provider and transaction_authority."original_transaction_id"=v_original_transaction_id
  for update;
  select event.* into v_existing_event from public."provider_events" event where event."provider" in ( 'revenuecat','revenuecat_app_store','revenuecat_google_play'
    ) and event."provider_event_id"=v_event_id order by event."created_at",event."id" limit 1 for update;
  if v_binding."id" is not null and v_existing_event."id" is not null and v_event_type in ('RENEWAL','UNCANCELLATION','PRODUCT_CHANGE') and v_existing_event."provider"=v_provider
    and v_existing_event."event_type"=v_event_type and v_existing_event."user_id"=p_user_id and v_existing_event."product_id"=p_product_id
    and v_existing_event."environment"=v_environment and v_existing_event."raw_payload_hash"=p_raw_payload_hash and v_existing_event."status"='processed'
    and v_existing_event."metadata"->>'provider_product_id'
      is not distinct from nullif(trim(coalesce(p_provider_product_id,'')),'') and v_existing_event."metadata"->>'provider_base_plan_id'
      is not distinct from nullif(trim(coalesce(p_provider_base_plan_id,'')),'') and v_existing_event."metadata"->>'original_transaction_id'=v_original_transaction_id
    and v_existing_event."metadata"->>'premium_transaction_binding_id'=v_binding."id"::text and public."revenuecat_premium_post_quarantine_generation_internal"(
      v_provider,p_user_id,v_environment,v_original_transaction_id ) then
    return jsonb_build_object( 'status','processed','reason','premium_provider_event_already_processed', 'eventType',v_event_type,'eventId',v_event_id,'userId',p_user_id,
      'productKey',v_existing_event."product_key",'providerEventId',v_existing_event."id", 'accessGrantId',(select grant_row."id" from public."access_grants" grant_row
        where grant_row."provider_event_id"=v_existing_event."id" limit 1), 'ledgerEventId',(select ledger."id" from public."money_access_ledger_events" ledger
        where ledger."provider_event_id"=v_existing_event."id" limit 1), 'environment',v_environment,
      'entitlementActive',public."premium_subject_has_finite_authority_internal"(p_user_id::text), 'duplicateEvent',true,
      'duplicateAccessGrant',exists(select 1 from public."access_grants" grant_row where grant_row."provider_event_id"=v_existing_event."id"),
      'duplicateLedgerEvent',exists(select 1 from public."money_access_ledger_events" ledger where ledger."provider_event_id"=v_existing_event."id"),
      'liveMoneyAction',false,'postQuarantineGenerationLifecycle',true );
  end if;
  if v_binding."id" is not null and v_event_type in ('RENEWAL','UNCANCELLATION','PRODUCT_CHANGE') and p_occurred_at is not null and v_existing_event."id" is null
    and v_binding."user_id"=p_user_id and v_binding."environment"=v_environment and v_binding."product_change_projection_event_id" is null and v_environment='sandbox' and (
      v_candidate_at, public."revenuecat_premium_authority_rank_internal"(v_event_type,false), v_event_id collate "C" )>(
      v_binding."latest_occurred_at",v_binding."latest_event_rank", v_binding."latest_event_id" collate "C" ) and public."revenuecat_premium_post_quarantine_generation_internal"(
      v_provider,p_user_id,v_environment,v_original_transaction_id ) and (
      v_binding."authority_state" in ('active','retained') or public."revenuecat_premium_quarantine_bug_recoverable_internal"(
        v_provider,p_user_id,v_environment,v_original_transaction_id ) ) then
    if v_event_type='PRODUCT_CHANGE' then
      update public."revenuecat_premium_transaction_authority" transaction_authority set "product_change_projection_event_id"=v_event_id, "updated_at"=v_now
      where transaction_authority."id"=v_binding."id" and transaction_authority."authority_state" in ('active','retained')
        and transaction_authority."product_change_projection_event_id" is null;
      if not found then
        raise exception 'premium_product_change_projection_scope_not_staged';
      end if;
      v_stage_product_change:=true; else
      update public."revenuecat_premium_transaction_authority" transaction_authority set "authority_state"='pending', "updated_at"=v_now
      where transaction_authority."id"=v_binding."id";
    end if;
    v_stage_generation:=true;
  end if;
  v_result:=public."process_revenuecat_premium_event_atomic_pre_gen_lifecycle"( p_provider,p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,
    p_provider_base_plan_id,p_environment,p_entitlement_status,p_starts_at,p_expires_at, p_occurred_at,p_amount_minor,p_currency,p_raw_payload_hash,p_period_type,p_store,
    p_platform,p_store_mapping_id,p_product_id,p_original_transaction_id );
  if v_stage_generation then
    if v_stage_product_change then
      update public."revenuecat_premium_transaction_authority" transaction_authority set "product_change_projection_event_id"=null, "updated_at"=v_now
      where transaction_authority."id"=v_binding."id" and transaction_authority."product_change_projection_event_id"=v_event_id;
      if not found then
        raise exception 'premium_product_change_projection_scope_not_cleared';
      end if;
      if coalesce(v_result->>'status','')='processed' then
        update public."revenuecat_premium_transaction_authority" transaction_authority set "current_product_id"=event."product_id",
            "current_provider_product_id"=event."metadata"->>'provider_product_id', "current_provider_base_plan_id"=event."metadata"->>'provider_base_plan_id',
            "latest_event_id"=event."provider_event_id", "latest_event_hash"=event."raw_payload_hash", "latest_event_type"=event."event_type",
            "latest_occurred_at"=event."occurred_at", "latest_event_rank"=public."revenuecat_premium_authority_rank_internal"( event."event_type",false
            ),"authority_state"='active',"updated_at"=v_now from public."provider_events" event
        where transaction_authority."id"=v_binding."id" and transaction_authority."authority_state" in ('active','retained')
          and transaction_authority."product_change_projection_event_id" is null and event."provider"=v_provider and event."provider_event_id"=v_event_id
          and event."user_id"=p_user_id and event."environment"=v_environment and event."product_id"=p_product_id
          and event."raw_payload_hash"=p_raw_payload_hash and event."status"='processed' and event."metadata"->>'provider_product_id'=nullif(trim(coalesce(p_provider_product_id,'')),'') and event."metadata"->>'provider_base_plan_id' is not distinct from nullif(trim(coalesce(p_provider_base_plan_id,'')),'') and event."metadata"->>'original_transaction_id'=v_original_transaction_id and event."metadata"->>'premium_transaction_binding_id'=v_binding."id"::text;
        if not found then
          raise exception 'premium_product_change_binding_postcondition_failed';
        end if;
      end if;
    end if;
    if coalesce(v_result->>'status','')='processed' then
      perform 1 from public."revenuecat_premium_transaction_authority" transaction_authority join public."provider_events" event
        on event."provider"=transaction_authority."provider" and event."provider_event_id"=transaction_authority."latest_event_id"
       and event."raw_payload_hash"=transaction_authority."latest_event_hash" and event."user_id"=transaction_authority."user_id"
       and event."environment"=transaction_authority."environment" and event."product_id"=transaction_authority."current_product_id" and event."metadata"->>'provider_product_id'
         =transaction_authority."current_provider_product_id" and event."metadata"->>'provider_base_plan_id'
         is not distinct from transaction_authority."current_provider_base_plan_id" and event."status"='processed'
      where transaction_authority."id"=v_binding."id" and transaction_authority."authority_state" in ('active','retained') and event."provider_event_id"=v_event_id
        and event."raw_payload_hash"=p_raw_payload_hash;
      if not found then
        raise exception 'premium_post_quarantine_lifecycle_binding_postcondition_failed';
      end if;
    elsif not v_stage_product_change and exists ( select 1 from public."revenuecat_premium_transaction_authority" transaction_authority
      where transaction_authority."id"=v_binding."id" and transaction_authority."authority_state"='pending' ) then
      update public."revenuecat_premium_transaction_authority" transaction_authority set "authority_state"='blocked',"updated_at"=v_now
      where transaction_authority."id"=v_binding."id" and transaction_authority."authority_state"='pending';
    end if;
    if exists ( select 1 from public."revenuecat_premium_transaction_authority" transaction_authority
      where transaction_authority."id"=v_binding."id" and transaction_authority."authority_state"='pending' ) then
      raise exception 'premium_post_quarantine_lifecycle_binding_not_finalized';
    end if;
    if coalesce(v_result->>'status','')='processed' then
      update public."provider_events" event set "metadata"=coalesce(event."metadata",'{}'::jsonb)||jsonb_build_object( 'premium_post_quarantine_generation_lifecycle',true,
        'premium_post_quarantine_anchor_event_id',v_binding."first_event_id", 'unresolved_non_premium_quarantine_preserved',true )
      where event."provider"=v_provider and event."provider_event_id"=v_event_id and event."user_id"=p_user_id and event."environment"=v_environment
        and event."raw_payload_hash"=p_raw_payload_hash and event."status"='processed';
      if not found then
        raise exception 'premium_post_quarantine_lifecycle_event_postcondition_failed';
      end if;
      v_result:=v_result||jsonb_build_object( 'entitlementActive', public."premium_subject_has_finite_authority_internal"(p_user_id::text), 'postQuarantineGenerationLifecycle',true
      );
    end if;
  end if;
  return v_result;
end;
$$;
revoke all on function public."process_revenuecat_premium_event_atomic"( text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid,text ) from public,anon,authenticated,service_role;
grant execute on function public."process_revenuecat_premium_event_atomic"( text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid,text ) to service_role;
comment on function public."process_revenuecat_premium_event_atomic"( text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid,text
) is 'Sole service-callable Premium projector. Exact provider-signed sandbox renewals, uncancellations and product changes may continue only the immutable Premium generation previously admitted after the narrow unsupported-store TRANSFER quarantine; all other quarantine and terminal semantics remain fail-closed.';
-- Current-customer restore is the second legitimate producer for the same
-- lifecycle. Stage only the exact already-admitted App Store generation and
-- delegate all snapshot validation to the existing service-only reconciler.
alter function public."reconcile_revenuecat_premium_snapshot_atomic"( text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text
) rename to "reconcile_revenuecat_premium_snapshot_pre_generation_lifecycle";
revoke all on function public."reconcile_revenuecat_premium_snapshot_pre_generation_lifecycle"( text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text
) from public,anon,authenticated,service_role;
create or replace function public."reconcile_revenuecat_premium_snapshot_atomic"( p_snapshot_id text, p_user_id uuid, p_revenuecat_subscription_id text,
  p_original_transaction_id text, p_provider_product_id text, p_entitlement_status text, p_starts_at timestamptz, p_expires_at timestamptz, p_observed_at timestamptz,
  p_raw_payload_hash text )
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_now timestamptz:=clock_timestamp();
  v_snapshot_id text:=trim(coalesce(p_snapshot_id,''));
  v_original_transaction_id text:=trim(coalesce(p_original_transaction_id,''));
  v_binding public."revenuecat_premium_transaction_authority"%rowtype;
  v_existing_event public."provider_events"%rowtype;
  v_stage_generation boolean:=false;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended( 'revenuecat-premium-reconciliation:'||v_snapshot_id,0 ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended( 'revenuecat-original:revenuecat_app_store:'||v_original_transaction_id,0 ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended( 'revenuecat-premium-original:revenuecat_app_store:'||v_original_transaction_id,0 ));
  if p_user_id is not null then
    perform public."lock_revenuecat_premium_quarantine_scopes_internal"( 'revenuecat_app_store',p_user_id,'sandbox' );
  end if;
  select transaction_authority.* into v_binding from public."revenuecat_premium_transaction_authority" transaction_authority
  where transaction_authority."provider"='revenuecat_app_store' and transaction_authority."original_transaction_id"=v_original_transaction_id
  for update;
  select event.* into v_existing_event from public."provider_events" event
  where event."provider"='revenuecat_app_store' and event."idempotency_key"='RECONCILIATION:'||v_snapshot_id limit 1 for update;
  if v_existing_event."id" is not null then
    if v_binding."id" is null or v_existing_event."provider_event_id"<>v_snapshot_id or v_existing_event."event_type"<>'RECONCILIATION'
      or v_existing_event."user_id" is distinct from p_user_id
      or v_existing_event."environment"<>'sandbox' or v_existing_event."raw_payload_hash" is distinct from p_raw_payload_hash or v_existing_event."status"<>'processed'
      or v_existing_event."metadata"->>'original_transaction_id'
        is distinct from v_original_transaction_id or v_existing_event."metadata"->>'revenuecat_subscription_id'
        is distinct from trim(coalesce(p_revenuecat_subscription_id,'')) or v_existing_event."metadata"->>'premium_transaction_binding_id'
        is distinct from v_binding."id"::text or v_existing_event."metadata"->>'provider_product_id'
        is distinct from trim(coalesce(p_provider_product_id,'')) then
      raise exception 'premium_reconciliation_duplicate_identity_mismatch';
    end if;
    return jsonb_build_object( 'status','duplicate_ignored','reason','premium_reconciliation_already_processed',
      'eventType','RECONCILIATION','eventId',v_snapshot_id,'userId',p_user_id, 'environment','sandbox',
      'entitlementActive',public."premium_subject_has_finite_authority_internal"(p_user_id::text), 'duplicateEvent',true,'liveMoneyAction',false,'providerTransactionCreated',false,
      'postQuarantineGenerationLifecycle',true );
  end if;
  -- An older unseen current-customer snapshot is a verified no-op, not a new
  -- authority projection. Validate its full sandbox identity before comparing
  -- the same ordering tuple used by the transaction authority watermark.
  if v_binding."id" is not null and v_binding."user_id"=p_user_id and v_binding."environment"='sandbox' and v_binding."authority_state" in ('active','retained')
    and v_snapshot_id<>'' and length(v_snapshot_id)<=512 and v_snapshot_id=coalesce(p_snapshot_id,'') and v_snapshot_id!~'[[:cntrl:]]'
    and nullif(trim(coalesce(p_revenuecat_subscription_id,'')),'') is not null and length(p_revenuecat_subscription_id)<=512 and p_revenuecat_subscription_id!~'[[:cntrl:]]'
    and v_original_transaction_id=coalesce(p_original_transaction_id,'') and length(v_original_transaction_id)<=512 and v_original_transaction_id!~'[[:cntrl:]]'
    and nullif(trim(coalesce(p_provider_product_id,'')),'') is not null and trim(p_provider_product_id)=p_provider_product_id and length(p_provider_product_id)<=512 and p_provider_product_id!~'[[:cntrl:]]'
    and lower(trim(coalesce(p_entitlement_status,''))) in ('active','trialing','grace_period') and coalesce(p_raw_payload_hash,'')~'^[0-9a-f]{64}$'
    and p_starts_at is not null and p_starts_at<=v_now+interval '5 minutes' and p_expires_at is not null and p_expires_at>v_now and p_expires_at>p_starts_at
    and p_observed_at is not null and p_observed_at<=v_now+interval '5 minutes' and p_observed_at>=p_starts_at and public."revenuecat_premium_post_quarantine_generation_internal"(
      'revenuecat_app_store',p_user_id,'sandbox',v_original_transaction_id ) and exists ( select 1 from public."monetization_product_store_mappings" mapping
      join public."monetization_products" product on product."id"=mapping."product_id" and product."product_type"='premium_subscription'
      where mapping."concept"='premium' and mapping."platform"='ios'
        and mapping."store"='app_store' and mapping."provider"='revenuecat_app_store' and mapping."provider_product_id"=p_provider_product_id
        and mapping."provider_base_plan_id" is null and mapping."environment"='sandbox'
        and mapping."status"='sandbox' and mapping."store_product_type"='auto_renewable_subscription'
        and mapping."unlocks_digital_access" and not mapping."grants_livekit_authority" and not mapping."creates_payable_balance" ) and (p_starts_at,3,v_snapshot_id collate "C")<=(
      v_binding."latest_occurred_at",v_binding."latest_event_rank", v_binding."latest_event_id" collate "C" ) then
    return jsonb_build_object( 'status','duplicate_ignored','reason','premium_reconciliation_snapshot_stale',
      'eventType','RECONCILIATION','eventId',v_snapshot_id,'userId',p_user_id, 'environment','sandbox',
      'entitlementActive',public."premium_subject_has_finite_authority_internal"(p_user_id::text), 'duplicateEvent',true,'liveMoneyAction',false,'providerTransactionCreated',false,
      'postQuarantineGenerationLifecycle',true );
  end if;
  if v_binding."id" is not null and p_observed_at is not null and v_existing_event."id" is null and v_binding."user_id"=p_user_id and v_binding."environment"='sandbox'
    and public."revenuecat_authority_quarantined_internal"( 'revenuecat_app_store',p_user_id,'sandbox' ) and public."revenuecat_premium_post_quarantine_generation_internal"(
      'revenuecat_app_store',p_user_id,'sandbox',v_original_transaction_id ) and (
      v_binding."authority_state" in ('active','retained') or public."revenuecat_premium_quarantine_bug_recoverable_internal"(
        'revenuecat_app_store',p_user_id,'sandbox',v_original_transaction_id ) ) then
    update public."revenuecat_premium_transaction_authority" transaction_authority set "authority_state"='pending', "updated_at"=v_now
    where transaction_authority."id"=v_binding."id";
    v_stage_generation:=true;
  end if;
  v_result:=public."reconcile_revenuecat_premium_snapshot_pre_generation_lifecycle"( p_snapshot_id,p_user_id,p_revenuecat_subscription_id,p_original_transaction_id,
    p_provider_product_id,p_entitlement_status,p_starts_at,p_expires_at, p_observed_at,p_raw_payload_hash );
  if v_stage_generation then
    if coalesce(v_result->>'status','')<>'processed' then
      raise exception 'premium_post_quarantine_reconciliation_not_processed';
    end if;
    update public."provider_events" event set "metadata"=coalesce(event."metadata",'{}'::jsonb)||jsonb_build_object( 'premium_post_quarantine_generation_lifecycle',true,
      'premium_post_quarantine_anchor_event_id',v_binding."first_event_id", 'unresolved_non_premium_quarantine_preserved',true )
    where event."provider"='revenuecat_app_store' and event."provider_event_id"=v_snapshot_id and event."user_id"=p_user_id and event."environment"='sandbox'
      and event."raw_payload_hash"=p_raw_payload_hash and event."status"='processed';
    if not found then
      raise exception 'premium_post_quarantine_reconciliation_event_postcondition_failed';
    end if;
    v_result:=v_result||jsonb_build_object( 'entitlementActive', public."premium_subject_has_finite_authority_internal"(p_user_id::text), 'postQuarantineGenerationLifecycle',true
    );
  end if;
  return v_result;
end;
$$;
revoke all on function public."reconcile_revenuecat_premium_snapshot_atomic"( text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text
) from public,anon,authenticated,service_role;
grant execute on function public."reconcile_revenuecat_premium_snapshot_atomic"( text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text ) to service_role;
comment on function public."reconcile_revenuecat_premium_snapshot_atomic"( text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text
) is 'Service-only exact App Store sandbox current-customer reconciliation. Restore may continue only the immutable Premium generation admitted after the narrow unsupported-store TRANSFER quarantine and creates no provider transaction, money action or payout.';
-- Exact quarantine delivery is immutable evidence and must be side-effect
-- idempotent. Reapplying its old projection can revoke authority deliberately
-- admitted after that evidence. Every delivery takes the same covering scope
-- lock as Premium projection; only a newly inserted quarantine is projected.
create or replace function public."quarantine_revenuecat_terminal_authority"( p_provider text,p_provider_event_id text,p_event_type text,p_user_id uuid,
  p_environment text,p_raw_payload_hash text,p_reason text )
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_provider_scope text;
  v_event_id text:=nullif(trim(coalesce(p_provider_event_id,'')),'');
  v_event_type text:=upper(trim(coalesce(p_event_type,'')));
  v_environment text:=lower(trim(coalesce(p_environment,'')));
  v_reason text:=lower(trim(coalesce(p_reason,'')));
  v_scope_lock_key text;
  v_existing public."revenuecat_terminal_authority_quarantines"%rowtype;
begin
  v_provider_scope:=case when v_provider in ('revenuecat_app_store','revenuecat_google_play') then v_provider else 'revenuecat_global' end;
  if v_event_type not in ('CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION','SUBSCRIPTION_PAUSED','TRANSFER','UNKNOWN')
    or coalesce(p_raw_payload_hash,'')!~'^[0-9a-f]{64}$' or v_reason='' or length(v_reason)>160 or v_reason!~'^[a-z0-9_:-]+$'
    or (v_event_id is not null and (length(v_event_id)>512 or v_event_id~'[[:cntrl:]]')) then raise exception 'revenuecat_terminal_quarantine_identity_invalid'; end if;
  if v_environment not in ('sandbox','production') then v_environment:=null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('revenuecat-terminal-quarantine:'||p_raw_payload_hash,0));
  v_scope_lock_key:=case when v_provider_scope='revenuecat_global' then 'revenuecat-terminal-scope:global'
    when p_user_id is null and v_environment is null then 'revenuecat-terminal-scope:provider:'||v_provider_scope
    when p_user_id is null then 'revenuecat-terminal-scope:provider-environment:'||v_provider_scope||':'||v_environment
    when v_environment is null then 'revenuecat-terminal-scope:provider-user:'||v_provider_scope||':'||p_user_id::text
    else 'revenuecat-terminal-scope:exact:'||v_provider_scope||':'||p_user_id::text||':'||v_environment
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_scope_lock_key,0));
  select quarantine.* into v_existing from public."revenuecat_terminal_authority_quarantines" quarantine where quarantine."raw_payload_hash"=p_raw_payload_hash;
  if v_existing."id" is not null then
    if v_existing."provider_scope" is distinct from v_provider_scope or v_existing."environment_scope" is distinct from v_environment
      or v_existing."user_id" is distinct from p_user_id or v_existing."reported_provider_event_id" is distinct from v_event_id
      or v_existing."event_type" is distinct from v_event_type or v_existing."reason" is distinct from v_reason
    then raise exception 'revenuecat_terminal_quarantine_identity_mismatch'; end if;
    return jsonb_build_object('status','quarantined','quarantineId',v_existing."id",'duplicateEvent',true,'authorityGranted',false,'scope',v_provider_scope);
  end if;
  insert into public."revenuecat_terminal_authority_quarantines"(
    "provider_scope","environment_scope","user_id","reported_provider_event_id","event_type","raw_payload_hash","reason"
  ) values (v_provider_scope,v_environment,p_user_id,v_event_id,v_event_type,p_raw_payload_hash,v_reason) returning * into v_existing;
  perform public."apply_revenuecat_terminal_quarantine_projection_internal"(v_existing."id");
  return jsonb_build_object('status','quarantined','quarantineId',v_existing."id",'duplicateEvent',false,'authorityGranted',false,'scope',v_provider_scope);
end;
$$;
revoke all on function public."quarantine_revenuecat_terminal_authority"(text,text,text,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public."quarantine_revenuecat_terminal_authority"(text,text,text,uuid,text,text,text) to service_role;
comment on function public."quarantine_revenuecat_terminal_authority"(text,text,text,uuid,text,text,text) is 'Service-only append-only RevenueCat terminal quarantine admission. Each covering scope is serialized; an exact replay acknowledges immutable evidence without reapplying its historical projection.';
-- The authoritative resolver follows the exact transaction's immutable first
-- event instead of requiring the current lifecycle event itself to carry the
-- initial-admission marker. The transaction join still requires the current
-- processed provider event, current product, current hash and active/retained
-- state, so stale or terminal generations cannot resolve as Premium.
create or replace function public."premium_subject_has_finite_authority_internal"(p_user_id text)
returns boolean
language sql
volatile
security definer set search_path = ''
as $$
  select nullif(trim(coalesce(p_user_id,'')),'') is not null and not public."is_account_access_restricted"(p_user_id) and exists ( select 1
      from public."user_entitlements" entitlement join public."access_grants" grant_row
        on grant_row."user_id"::text=entitlement."user_id" and grant_row."grant_type"='premium' and grant_row."provider_event_id" is not null
       and grant_row."starts_at"=entitlement."starts_at" and grant_row."expires_at"=entitlement."expires_at" join public."provider_events" provider_event
        on provider_event."id"=grant_row."provider_event_id" and provider_event."user_id"::text=entitlement."user_id" and provider_event."product_id"=grant_row."product_id"
       and provider_event."provider"=grant_row."provider" and provider_event."environment"=grant_row."environment" and provider_event."status"='processed'
       and provider_event."provider_event_id"=entitlement."metadata"->>'revenuecat_event_id' and provider_event."raw_payload_hash"=entitlement."metadata"->>'revenuecat_event_hash'
       and provider_event."metadata"->>'entitlement_key'='premium' join public."revenuecat_premium_transaction_authority" transaction_authority
        on transaction_authority."provider"=provider_event."provider" and transaction_authority."original_transaction_id"=provider_event."metadata"->>'original_transaction_id'
       and transaction_authority."user_id"=provider_event."user_id" and transaction_authority."environment"=provider_event."environment"
       and transaction_authority."current_product_id"=provider_event."product_id"
       and transaction_authority."current_provider_product_id"=provider_event."metadata"->>'provider_product_id'
       and transaction_authority."current_provider_base_plan_id" is not distinct from provider_event."metadata"->>'provider_base_plan_id'
       and transaction_authority."latest_event_id"=provider_event."provider_event_id" and transaction_authority."latest_event_hash"=provider_event."raw_payload_hash"
       and transaction_authority."authority_state" in ('active','retained')
      where entitlement."user_id"=p_user_id and entitlement."entitlement_key"='premium' and entitlement."source"='revenuecat'
        and entitlement."status" in ('active','trialing','grace_period') and entitlement."revoked_at" is null and entitlement."starts_at" is not null
        and entitlement."starts_at"<=timezone('utc'::text,now()) and entitlement."expires_at" is not null and entitlement."expires_at">timezone('utc'::text,now())
        and entitlement."metadata"->>'environment' in ('sandbox','production') and coalesce(entitlement."metadata"->>'revenuecat_event_hash','') ~ '^[0-9a-f]{64}$'
        and ((entitlement."metadata"->>'environment'='sandbox' and grant_row."status"='sandbox_only')
          or (entitlement."metadata"->>'environment'='production' and grant_row."status"='active')) and grant_row."environment"=entitlement."metadata"->>'environment'
        and grant_row."revoked_at" is null and grant_row."refunded_at" is null and grant_row."starts_at"<=timezone('utc'::text,now())
        and grant_row."expires_at">timezone('utc'::text,now()) and ( not public."revenuecat_authority_quarantined_internal"(
            provider_event."provider",provider_event."user_id",provider_event."environment" ) or public."revenuecat_premium_post_quarantine_generation_internal"(
            provider_event."provider",provider_event."user_id",provider_event."environment", provider_event."metadata"->>'original_transaction_id' ) or (
            provider_event."event_type"='RECONCILIATION' and provider_event."metadata"->>'reconciliation_source'
              ='revenuecat_v2_current_customer' and provider_event."metadata"->>'provider_snapshot_only'='true'
            and provider_event."metadata"->>'provider_transaction_created'='false' and public."revenuecat_premium_fresh_authority_allowed_internal"(
              provider_event."provider",provider_event."user_id", provider_event."environment", provider_event."metadata"->>'original_transaction_id',
              'RECONCILIATION',provider_event."created_at" ) ) ) and not exists ( select 1 from public."provider_events" later_authority
          join public."monetization_products" later_product on later_product."id"=later_authority."product_id" and later_product."product_type"='premium_subscription'
          where later_authority."user_id"::text=entitlement."user_id" and later_authority."id"<>provider_event."id" and (
              later_authority."status" in ('processed','refunded','reversed') or (later_authority."status"='ignored'
                and later_authority."metadata"->>'premium_authority_watermark'='true') ) and (
              (provider_event."environment"<>'production' and later_authority."environment"='production') or (
                later_authority."environment"=provider_event."environment" and later_authority."metadata"->>'original_transaction_id'
                  is not distinct from provider_event."metadata"->>'original_transaction_id' and public."revenuecat_premium_authority_is_newer_internal"(
                  later_authority."occurred_at",later_authority."event_type",later_authority."provider_event_id",false,
                  provider_event."occurred_at",provider_event."event_type",provider_event."provider_event_id",false ) ) ) ) );
$$;
revoke all on function public."premium_subject_has_finite_authority_internal"(text) from public,anon,authenticated,service_role;

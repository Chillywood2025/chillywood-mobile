-- Close the final source-intent issuance/reconciliation race. A purchase RPC
-- may never hand the same live intent to two Store checkout calls, and an
-- authoritative provider event must hold the exact buyer/source lock before it
-- can consume that intent or project a grant/ledger event.

create or replace function public."creator_money_source_has_history_internal"(
  p_user_id uuid,
  p_source_type text,
  p_source_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_grant_type text;
begin
  if p_user_id is null
    or p_user_id is distinct from auth.uid()
    or p_source_id is null
  then
    raise exception 'buyer_source_authority_invalid';
  end if;
  v_grant_type:=case p_source_type
    when 'watch_party_live' then 'watch_party_live_ticket'
    when 'paid_content' then 'paid_content_access'
    when 'event' then 'event_pass'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
    else null end;
  if v_grant_type is null then return false; end if;
  begin
    perform public."creator_money_historical_purchase_identity_internal"(
      p_user_id,v_grant_type,p_source_id
    );
    return true;
  exception when raise_exception then
    if sqlerrm='historical_purchase_identity_missing' then return false; end if;
    raise;
  end;
end;
$$;
revoke all on function public."creator_money_source_has_history_internal"(
  uuid,text,uuid
) from public,anon,authenticated,service_role;

create or replace function public."creator_money_reject_live_source_intent_internal"(
  p_user_id uuid,
  p_source_type text,
  p_source_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer:=0;
begin
  if p_user_id is null
    or p_user_id is distinct from auth.uid()
    or p_source_type not in (
      'creator_tip','watch_party_live','paid_content','event','vip_pass',
      'channel_subscription'
    )
    or p_source_id is null
  then
    raise exception 'buyer_source_authority_invalid';
  end if;
  select count(*)::integer into v_count
  from public."money_purchase_intents" intent
  where intent."user_id"=p_user_id
    and intent."source_type"=p_source_type
    and intent."source_id"=p_source_id
    and intent."status"='pending'
    and intent."expires_at">timezone('utc'::text,now());
  if v_count>1 then raise exception 'source_purchase_intent_ambiguous'; end if;
  if v_count=1 then raise exception 'source_purchase_intent_already_pending'; end if;
end;
$$;
revoke all on function public."creator_money_reject_live_source_intent_internal"(
  uuid,text,uuid
) from public,anon,authenticated,service_role;

-- Every authenticated generic purchase path now enters the exact source lane
-- before any predecessor can inspect history or create/reuse a pending intent.
alter function public."create_money_purchase_intent"(text,text,uuid,jsonb)
  rename to "create_money_purchase_intent_pre_source_lock";
alter function public."create_money_purchase_intent_pre_source_lock"(
  text,text,uuid,jsonb
) set search_path = '';
revoke all on function public."create_money_purchase_intent_pre_source_lock"(
  text,text,uuid,jsonb
) from public,anon,authenticated,service_role;

create or replace function public."create_money_purchase_intent"(
  p_product_key text,
  p_source_type text,
  p_source_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_product_type text;
  v_source_type text;
begin
  select product."product_type" into v_product_type
  from public."monetization_products" product
  where product."product_key"=p_product_key
  limit 1;
  v_source_type:=case v_product_type
    when 'creator_tip' then 'creator_tip'
    when 'watch_party_live_ticket' then 'watch_party_live'
    when 'paid_content_access' then 'paid_content'
    when 'event_pass' then 'event'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
    else null end;
  if v_user is not null and p_source_id is not null
    and v_source_type is not null
    and p_source_type is not distinct from v_source_type
  then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'creator-money-source-intent:'||v_user::text||':'||v_source_type||':'||
        p_source_id::text,0
    ));
    perform public."creator_money_reject_live_source_intent_internal"(
      v_user,v_source_type,p_source_id
    );
    if v_source_type<>'creator_tip'
      and public."creator_money_source_has_history_internal"(
        v_user,v_source_type,p_source_id
      )
    then
      raise exception 'source_access_already_established';
    end if;
  end if;
  return public."create_money_purchase_intent_pre_source_lock"(
    p_product_key,p_source_type,p_source_id,p_metadata
  );
end;
$$;
revoke all on function public."create_money_purchase_intent"(
  text,text,uuid,jsonb
) from public,anon;
grant execute on function public."create_money_purchase_intent"(
  text,text,uuid,jsonb
) to authenticated,service_role;

alter function public."create_ios_creator_money_purchase_intent"(
  text,uuid,integer,jsonb
) rename to "create_ios_creator_money_intent_pre_source_lock";
alter function public."create_ios_creator_money_intent_pre_source_lock"(
  text,uuid,integer,jsonb
) set search_path = '';
revoke all on function public."create_ios_creator_money_intent_pre_source_lock"(
  text,uuid,integer,jsonb
) from public,anon,authenticated,service_role;

create or replace function public."create_ios_creator_money_purchase_intent"(
  p_concept text,
  p_source_id uuid,
  p_amount_minor integer,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_concept text:=lower(pg_catalog.btrim(coalesce(p_concept,'')));
  v_source_type text:=case lower(pg_catalog.btrim(coalesce(p_concept,'')))
    when 'paid_video' then 'paid_content'
    when 'event_pass' then 'event'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
    else null end;
begin
  if v_user is not null and p_source_id is not null and v_source_type is not null
  then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'creator-money-source-intent:'||v_user::text||':'||v_source_type||':'||
        p_source_id::text,0
    ));
    perform public."creator_money_reject_live_source_intent_internal"(
      v_user,v_source_type,p_source_id
    );
    -- Invoke the predecessor under the lock when an exact historical grant
    -- exists so its established no-charge response remains API compatible.
    if public."creator_money_source_has_history_internal"(
      v_user,v_source_type,p_source_id
    ) then
      return public."create_ios_creator_money_intent_pre_source_lock"(
        v_concept,p_source_id,p_amount_minor,p_metadata
      );
    end if;
  end if;
  return public."create_ios_creator_money_intent_pre_source_lock"(
    p_concept,p_source_id,p_amount_minor,p_metadata
  );
end;
$$;
revoke all on function public."create_ios_creator_money_purchase_intent"(
  text,uuid,integer,jsonb
) from public,anon;
grant execute on function public."create_ios_creator_money_purchase_intent"(
  text,uuid,integer,jsonb
) to authenticated,service_role;

alter function public."create_ios_app_store_purchase_intent"(
  text,text,uuid,jsonb
) rename to "create_ios_app_store_intent_pre_source_lock";
alter function public."create_ios_app_store_intent_pre_source_lock"(
  text,text,uuid,jsonb
) set search_path = '';
revoke all on function public."create_ios_app_store_intent_pre_source_lock"(
  text,text,uuid,jsonb
) from public,anon,authenticated,service_role;

create or replace function public."create_ios_app_store_purchase_intent"(
  p_provider_product_id text,
  p_source_type text,
  p_source_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_concept text;
  v_mapping_count integer:=0;
  v_source_type text;
begin
  select count(*)::integer,min(mapping."concept")
  into v_mapping_count,v_concept
  from public."monetization_product_store_mappings" mapping
  where mapping."platform"='ios' and mapping."store"='app_store'
    and mapping."provider"='revenuecat_app_store'
    and mapping."provider_product_id"=
      pg_catalog.btrim(coalesce(p_provider_product_id,''));
  if v_mapping_count>1 then raise exception 'ios_app_store_mapping_ambiguous'; end if;
  v_source_type:=case v_concept
    when 'creator_tip' then 'creator_tip'
    when 'seat_pass' then 'watch_party_live'
    else null end;
  if v_user is not null and p_source_id is not null
    and v_source_type is not null
    and p_source_type is not distinct from v_source_type
  then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'creator-money-source-intent:'||v_user::text||':'||v_source_type||':'||
        p_source_id::text,0
    ));
    perform public."creator_money_reject_live_source_intent_internal"(
      v_user,v_source_type,p_source_id
    );
  end if;
  return public."create_ios_app_store_intent_pre_source_lock"(
    p_provider_product_id,p_source_type,p_source_id,p_metadata
  );
end;
$$;
revoke all on function public."create_ios_app_store_purchase_intent"(
  text,text,uuid,jsonb
) from public,anon;
grant execute on function public."create_ios_app_store_purchase_intent"(
  text,text,uuid,jsonb
) to authenticated,service_role;

-- Specialized entry points acquire the same exact source identity before their
-- existing current-access/history checks. Thus completion between a stale
-- client precheck and this transaction cannot produce another checkout intent.
alter function public."create_paid_watch_party_ticket_purchase_intent"(uuid)
  rename to "create_seat_pass_intent_pre_source_lock";
alter function public."create_paid_creator_event_pass_purchase_intent"(uuid)
  rename to "create_event_pass_intent_pre_source_lock";
alter function public."create_creator_vip_pass_purchase_intent"(uuid)
  rename to "create_vip_pass_intent_pre_source_lock";
alter function public."create_creator_channel_subscription_purchase_intent"(uuid)
  rename to "create_channel_subscription_intent_pre_source_lock";

create or replace function public."create_paid_watch_party_ticket_purchase_intent"(
  p_offer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is not null and p_offer_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'creator-money-source-intent:'||v_user::text||':watch_party_live:'||
        p_offer_id::text,0
    ));
    perform public."creator_money_reject_live_source_intent_internal"(
      v_user,'watch_party_live',p_offer_id
    );
  end if;
  return public."create_seat_pass_intent_pre_source_lock"(p_offer_id);
end;
$$;

create or replace function public."create_paid_creator_event_pass_purchase_intent"(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_source_id uuid;
begin
  select offer."creator_event_id" into v_source_id
  from public."paid_creator_events" offer where offer."id"=p_event_id;
  if v_user is not null and v_source_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'creator-money-source-intent:'||v_user::text||':event:'||
        v_source_id::text,0
    ));
    perform public."creator_money_reject_live_source_intent_internal"(
      v_user,'event',v_source_id
    );
  end if;
  return public."create_event_pass_intent_pre_source_lock"(p_event_id);
end;
$$;

create or replace function public."create_creator_vip_pass_purchase_intent"(
  p_offer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is not null and p_offer_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'creator-money-source-intent:'||v_user::text||':vip_pass:'||
        p_offer_id::text,0
    ));
    perform public."creator_money_reject_live_source_intent_internal"(
      v_user,'vip_pass',p_offer_id
    );
  end if;
  return public."create_vip_pass_intent_pre_source_lock"(p_offer_id);
end;
$$;

create or replace function public."create_creator_channel_subscription_purchase_intent"(
  p_offer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is not null and p_offer_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'creator-money-source-intent:'||v_user::text||
        ':channel_subscription:'||p_offer_id::text,0
    ));
    perform public."creator_money_reject_live_source_intent_internal"(
      v_user,'channel_subscription',p_offer_id
    );
  end if;
  return public."create_channel_subscription_intent_pre_source_lock"(p_offer_id);
end;
$$;

alter function public."create_seat_pass_intent_pre_source_lock"(uuid)
  set search_path = '';
alter function public."create_event_pass_intent_pre_source_lock"(uuid)
  set search_path = '';
alter function public."create_vip_pass_intent_pre_source_lock"(uuid)
  set search_path = '';
alter function public."create_channel_subscription_intent_pre_source_lock"(uuid)
  set search_path = '';
revoke all on function public."create_seat_pass_intent_pre_source_lock"(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public."create_event_pass_intent_pre_source_lock"(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public."create_vip_pass_intent_pre_source_lock"(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public."create_channel_subscription_intent_pre_source_lock"(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public."create_paid_watch_party_ticket_purchase_intent"(uuid)
  from public,anon;
revoke all on function public."create_paid_creator_event_pass_purchase_intent"(uuid)
  from public,anon;
revoke all on function public."create_creator_vip_pass_purchase_intent"(uuid)
  from public,anon;
revoke all on function public."create_creator_channel_subscription_purchase_intent"(uuid)
  from public,anon;
grant execute on function public."create_paid_watch_party_ticket_purchase_intent"(uuid)
  to authenticated,service_role;
grant execute on function public."create_paid_creator_event_pass_purchase_intent"(uuid)
  to authenticated,service_role;
grant execute on function public."create_creator_vip_pass_purchase_intent"(uuid)
  to authenticated,service_role;
grant execute on function public."create_creator_channel_subscription_purchase_intent"(uuid)
  to authenticated,service_role;

-- Resolve a source without taking provider-event/original-transaction locks.
-- The caller acquires the source lock, repeats this read, and only then enters
-- the predecessor. That establishes one global lock order: source first,
-- provider/original second, while malformed/unbound active events are forced to
-- the predecessor's durable ignored/reconciliation path.
create or replace function public."creator_money_provider_source_identity_internal"(
  p_provider_event_id text,
  p_user_id uuid,
  p_provider_product_id text,
  p_environment text,
  p_original_transaction_id text,
  p_provider text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_intent public."money_purchase_intents"%rowtype;
  v_count integer:=0;
  v_intent_id uuid;
  v_provider text:=lower(pg_catalog.btrim(coalesce(p_provider,'')));
  v_environment text:=lower(pg_catalog.btrim(coalesce(p_environment,'')));
  v_original text:=nullif(pg_catalog.btrim(
    coalesce(p_original_transaction_id,'')
  ),'');
begin
  if p_user_id is null
    or v_provider not in ('revenuecat_app_store','revenuecat_google_play')
    or v_environment not in ('sandbox','production')
  then return null; end if;

  select count(*)::integer,min(intent."id"::text)::uuid
  into v_count,v_intent_id
  from public."provider_events" event
  join public."money_purchase_intents" intent
    on intent."id"::text=event."metadata"->>'purchase_intent_id'
  where event."provider"=v_provider
    and event."provider_event_id"=p_provider_event_id
    and event."user_id"=p_user_id
    and intent."user_id"=p_user_id
    and intent."provider"=v_provider
    and intent."environment"=v_environment;
  if v_count>1 then return null; end if;

  if v_count=0 and v_original is not null then
    select count(*)::integer,min(intent."id"::text)::uuid
    into v_count,v_intent_id
    from public."revenuecat_consumable_transaction_intents" link
    join public."money_purchase_intents" intent
      on intent."id"=link."purchase_intent_id"
    where link."provider"=v_provider
      and link."original_transaction_id"=v_original
      and link."user_id"=p_user_id
      and link."binding_state"='exact'
      and intent."user_id"=p_user_id
      and intent."provider"=v_provider
      and intent."environment"=v_environment;
    if v_count>1 then return null; end if;
  end if;

  if v_count=0 then
    select count(*)::integer,min(intent."id"::text)::uuid
    into v_count,v_intent_id
    from public."money_purchase_intents" intent
    where intent."user_id"=p_user_id
      and intent."provider"=v_provider
      and intent."provider_product_id"=p_provider_product_id
      and intent."environment"=v_environment
      and intent."source_type" in (
        'creator_tip','watch_party_live','paid_content','event','vip_pass',
        'channel_subscription'
      )
      and intent."source_id" is not null
      and intent."status"='pending'
      and intent."expires_at">timezone('utc'::text,now());
    if v_count<>1 then return null; end if;
  end if;

  select intent.* into v_intent
  from public."money_purchase_intents" intent
  where intent."id"=v_intent_id;
  if v_intent."id" is null
    or v_intent."user_id" is distinct from p_user_id
    or v_intent."source_type" not in (
      'creator_tip','watch_party_live','paid_content','event','vip_pass',
      'channel_subscription'
    )
    or v_intent."source_id" is null
  then return null; end if;
  return jsonb_build_object(
    'userId',v_intent."user_id",
    'sourceType',v_intent."source_type",
    'sourceId',v_intent."source_id",
    'purchaseIntentId',v_intent."id"
  );
end;
$$;
revoke all on function public."creator_money_provider_source_identity_internal"(
  text,uuid,text,text,text,text
) from public,anon,authenticated,service_role;

alter function public."process_revenuecat_consumable_event_provider_internal"(
  text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,
  text,text,text,text,text
) rename to "process_creator_money_provider_event_pre_source_lock";
alter function public."process_creator_money_provider_event_pre_source_lock"(
  text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,
  text,text,text,text,text
) set search_path = '';
revoke all on function public."process_creator_money_provider_event_pre_source_lock"(
  text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,
  text,text,text,text,text
) from public,anon,authenticated,service_role;

create or replace function public."process_revenuecat_consumable_event_provider_internal"(
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
  p_original_transaction_id text,
  p_provider text,
  p_platform text,
  p_store text,
  p_store_switch_key text,
  p_input_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text:=upper(pg_catalog.btrim(coalesce(p_event_type,'')));
  v_is_active boolean:=v_event_type in (
    'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','UNCANCELLATION',
    'PRODUCT_CHANGE'
  );
  v_before jsonb;
  v_after jsonb;
  v_reason text:=nullif(pg_catalog.btrim(coalesce(p_input_reason,'')),'');
begin
  v_before:=public."creator_money_provider_source_identity_internal"(
    p_provider_event_id,p_user_id,p_provider_product_id,p_environment,
    p_original_transaction_id,p_provider
  );
  -- The terminal dispatcher already owns event/original locks before invoking
  -- this function. Terminal events never bind or consume a pending intent, so
  -- they deliberately retain that established lock order and skip the source
  -- lock. Active events enter source-first before the predecessor takes either
  -- provider lock, eliminating an active/terminal cycle.
  if v_is_active and v_before is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'creator-money-source-intent:'||(v_before->>'userId')||':'||
        (v_before->>'sourceType')||':'||(v_before->>'sourceId'),0
    ));
    v_after:=public."creator_money_provider_source_identity_internal"(
      p_provider_event_id,p_user_id,p_provider_product_id,p_environment,
      p_original_transaction_id,p_provider
    );
    if v_after is null
      or v_after->>'userId' is distinct from v_before->>'userId'
      or v_after->>'sourceType' is distinct from v_before->>'sourceType'
      or v_after->>'sourceId' is distinct from v_before->>'sourceId'
      or v_after->>'purchaseIntentId' is distinct from
        v_before->>'purchaseIntentId'
    then
      v_reason:=coalesce(v_reason,'provider_source_identity_changed');
    end if;
  elsif v_is_active then
    -- Supplying an input reason guarantees the predecessor cannot bind or
    -- consume an intent that appeared after this unresolved pre-read. It still
    -- records the charged event and its refund/reconciliation obligation.
    v_reason:=coalesce(v_reason,'provider_source_lock_unresolved');
  end if;
  return public."process_creator_money_provider_event_pre_source_lock"(
    p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,
    p_environment,p_occurred_at,p_expires_at,p_amount_minor,p_currency,
    p_raw_payload_hash,p_original_transaction_id,p_provider,p_platform,p_store,
    p_store_switch_key,v_reason
  );
end;
$$;
revoke all on function public."process_revenuecat_consumable_event_provider_internal"(
  text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,
  text,text,text,text,text
) from public,anon,authenticated,service_role;

comment on function public."process_revenuecat_consumable_event_provider_internal"(
  text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,
  text,text,text,text,text
) is 'Internal source-first RevenueCat creator-money reconciliation. Exact buyer/source advisory authority is held through intent consumption, grant projection, and ledger projection; unresolved active events are durably ignored for provider recovery.';

-- Source-only closure: never activate production creator money or payouts.
update public."platform_money_kill_switches"
set "state"='off',
    "reason"='Creator-money source race closure installed; production activation remains intentionally off.',
    "updated_at"=timezone('utc'::text,now())
where "key" in ('live_money_enabled','payouts_enabled')
  and "state"<>'off';

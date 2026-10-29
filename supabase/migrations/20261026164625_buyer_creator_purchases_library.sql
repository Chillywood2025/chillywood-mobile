-- Owner-only purchase history. This read model never grants access, resolves
-- protected media, publishes a room, changes financial policy or retries a charge.
create index if not exists "money_purchase_intents_buyer_history_idx"
  on public."money_purchase_intents"("user_id","created_at" desc,"id" desc);
create index if not exists "revenuecat_reconciliation_buyer_history_idx"
  on public."revenuecat_provider_reconciliation_obligations"("user_id","created_at" desc,"id" desc);

create or replace function public."read_my_creator_purchases"(
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_source_type text default null,
  p_source_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_now timestamptz:=timezone('utc'::text,now());
  v_limit integer:=coalesce(p_limit,50);
  v_rows jsonb:='[]'::jsonb;
  v_item jsonb;
  v_more boolean:=false;
  v_last_id uuid;
  v_last_at timestamptz;
  v_count integer:=0;
  r record;
  v_intent public."money_purchase_intents"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_receipt public."provider_events"%rowtype;
  v_grant public."access_grants"%rowtype;
  v_obligation public."revenuecat_provider_reconciliation_obligations"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_tip public."creator_tip_transactions"%rowtype;
  v_quote public."creator_money_purchase_quotes"%rowtype;
  v_reservation public."event_ticket_reservations"%rowtype;
  v_source_type text;
  v_source_id uuid;
  v_creator uuid;
  v_product_id uuid;
  v_product_type text;
  v_product_key text;
  v_provider text;
  v_environment text;
  v_amount integer;
  v_currency text;
  v_original text;
  v_status text;
  v_title text;
  v_terms jsonb;
  v_destination jsonb;
  v_party text;
  v_starts timestamptz;
  v_expires timestamptz;
  v_event_status text;
begin
  if v_user is null or not coalesce(public."wave1_current_caller_authority_internal"(),false)
    or coalesce(public."is_account_access_restricted"(v_user::text),true)
  then raise exception 'buyer_purchase_history_authority_required'; end if;
  if v_limit<1 or v_limit>100
    or (p_before_created_at is null)<>(p_before_id is null)
    or (p_before_created_at is not null and not isfinite(p_before_created_at))
    or (p_source_type is null)<>(p_source_id is null)
    or (p_source_type is not null and p_source_type not in ('creator_tip','paid_content','watch_party_live','event',
      'channel_subscription','vip_pass','live_watch_party_access','live_watch_party_seat'))
  then raise exception 'buyer_purchase_history_cursor_invalid'; end if;

  for r in
    with candidates as (
      select 'intent'::text kind,i."id",i."created_at",i."source_type",i."source_id"
      from public."money_purchase_intents" i
      where i."user_id"=v_user
        and (i."source_type",i."product_type") in (
          ('creator_tip','creator_tip'),('paid_content','paid_content_access'),
          ('watch_party_live','watch_party_live_ticket'),('event','event_pass'),
          ('channel_subscription','channel_subscription'),('vip_pass','vip_pass'),
          ('live_watch_party_access','live_watch_party_access_pass'),('live_watch_party_seat','live_watch_party_seat_pass'))
      union all
      select 'stripe_tip',t."id",t."created_at",'creator_tip',t."creator_id" from public."creator_tip_transactions" t
      where t."sender_id"=v_user and t."provider"='stripe_connect'
      union all
      select 'obligation',unbound."id",unbound."created_at",null::text,null::uuid from (
      select distinct on(o."provider",coalesce(o."original_transaction_id",o."id"::text),o."environment") o."id",o."created_at"
      from public."revenuecat_provider_reconciliation_obligations" o
      join public."provider_events" e on e."id"=o."provider_event_id" and e."user_id"=v_user
        and e."provider"=o."provider" and e."environment"=o."environment"
      join public."monetization_products" p on p."id"=e."product_id"
      where o."user_id"=v_user and p."product_type" in ('creator_tip','paid_content_access','watch_party_live_ticket',
        'event_pass','channel_subscription','vip_pass','live_watch_party_access_pass','live_watch_party_seat_pass')
        and e."metadata"->>'provider_product_id'=o."provider_product_id"
        and not exists(select 1 from public."money_purchase_intents" i where i."id"=o."purchase_intent_id" and i."user_id"=v_user)
      order by o."provider",coalesce(o."original_transaction_id",o."id"::text),o."environment",o."created_at",o."id"
      ) unbound
      union all
      -- Old verified receipts without an intent remain visible, but never become
      -- an inferred restore/transfer entitlement. Deduplicate their original.
      select 'legacy_receipt',old."id",old."created_at",old."source_type",old."source_id" from (
        select distinct on (e."provider",coalesce(nullif(e."metadata"->>'original_transaction_id',''),e."id"::text),l."source_type",l."source_id")
          l."id",l."created_at",l."source_type",l."source_id"
        from public."money_access_ledger_events" l
        join public."provider_events" e on e."id"=l."provider_event_id" and e."user_id"=v_user
          and e."product_id"=l."product_id" and e."environment"=l."environment"
        join public."monetization_products" p on p."id"=l."product_id"
        where l."user_id"=v_user and l."event_type" in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE')
          and e."status" in ('processed','refunded','reversed')
          and (l."source_type",p."product_type") in (
            ('creator_tip','creator_tip'),('paid_content','paid_content_access'),('watch_party_live','watch_party_live_ticket'),
            ('event','event_pass'),('channel_subscription','channel_subscription'),('vip_pass','vip_pass'),
            ('live_watch_party_access','live_watch_party_access_pass'),('live_watch_party_seat','live_watch_party_seat_pass'))
          and not exists(select 1 from public."money_purchase_intents" i where i."user_id"=v_user
            and (i."id"::text=e."metadata"->>'purchase_intent_id' or i."id"::text=l."metadata"->>'purchase_intent_id'))
          and not exists(select 1 from public."revenuecat_consumable_transaction_intents" link
            where link."user_id"=v_user and link."provider"=e."provider"
              and link."original_transaction_id"=e."metadata"->>'original_transaction_id')
        order by e."provider",coalesce(nullif(e."metadata"->>'original_transaction_id',''),e."id"::text),l."source_type",l."source_id",l."created_at",l."id"
      ) old
    )
    select * from candidates
    where (p_before_created_at is null or ("created_at","id")<(p_before_created_at,p_before_id))
      and (p_source_type is null or ("source_type"=p_source_type and "source_id"=p_source_id))
    order by "created_at" desc,"id" desc limit v_limit+1
  loop
    if v_count=v_limit then v_more:=true; exit; end if;
    v_count:=v_count+1; v_last_id:=r."id"; v_last_at:=r."created_at";
    v_intent:=null; v_ledger:=null; v_receipt:=null; v_grant:=null; v_obligation:=null;
    v_quote:=null; v_reservation:=null; v_original:=null; v_title:=null;
    v_terms:='{}'::jsonb; v_destination:=null; v_party:=null; v_starts:=null; v_expires:=null; v_event_status:=null;

    if r.kind='stripe_tip' then
      select * into v_tip from public."creator_tip_transactions" where "id"=r."id" and "sender_id"=v_user;
      v_status:=case when v_tip."status"='disputed' or v_tip."disputed_at" is not null then 'disputed'
        when v_tip."status"='refunded' or v_tip."refunded_at" is not null then 'refunded'
        when v_tip."status"='paid' and v_tip."paid_at" is not null then 'completed'
        when v_tip."status"='failed' then 'failed' when v_tip."status"='canceled' then 'canceled' else 'pending' end;
      v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
        'id',v_tip."id",'purchaseIntentId',null,'sourceType','creator_tip','sourceId',v_tip."creator_id",
        'creatorId',v_tip."creator_id",'productType','creator_tip','productKey',null,'title',null,
        'status',v_status,'amountMinor',v_tip."total_paid_cents",'currency',v_tip."currency",
        'createdAt',v_tip."created_at",'purchasedAt',v_tip."paid_at",'startsAt',null,'expiresAt',null,
        'provider',v_tip."provider",'environment',case v_tip."provider_environment" when 'test' then 'sandbox' when 'live' then 'production' else 'unknown' end,
        'destination',jsonb_build_object('kind','creator_channel','id',v_tip."creator_id"),
        'receipt',case when v_tip."paid_at" is not null then jsonb_build_object('providerEventId',null,
          'providerTransactionId',v_tip."provider_payment_intent_id",'originalTransactionId',null,'verifiedAt',v_tip."paid_at",
          'reportedAmountMinor',v_tip."total_paid_cents",'reportedCurrency',v_tip."currency") else null end,
        'terms','{}'::jsonb,'termsAvailable',false,'grantsAccess',false));
      continue;
    end if;

    if r.kind='intent' then
      select * into v_intent from public."money_purchase_intents" where "id"=r."id" and "user_id"=v_user;
      v_source_type:=v_intent."source_type"; v_source_id:=v_intent."source_id"; v_creator:=v_intent."creator_id";
      v_product_id:=v_intent."product_id"; v_product_type:=v_intent."product_type"; v_product_key:=v_intent."product_key";
      v_provider:=v_intent."provider"; v_environment:=v_intent."environment";
      v_amount:=v_intent."amount_minor"; v_currency:=v_intent."currency";
      select * into v_quote from public."creator_money_purchase_quotes" q
      where q."purchase_intent_id"=v_intent."id" and q."user_id"=v_user
        and q."creator_id" is not distinct from v_creator and q."source_type"=v_source_type and q."source_id" is not distinct from v_source_id
        and q."amount_minor"=v_amount and q."currency"=v_currency and q."provider"=v_provider
        and q."provider_product_id"=v_intent."provider_product_id" and q."environment"=v_environment;
      v_title:=v_quote."title";
      if v_quote."purchase_intent_id" is not null then v_terms:=v_quote."terms"; end if;
      select e.* into v_receipt from public."provider_events" e
      where e."user_id"=v_user and e."product_id"=v_product_id and e."provider"=v_provider and e."environment"=v_environment
        and e."metadata"->>'purchase_intent_id'=v_intent."id"::text
        and e."metadata"->>'provider_product_id'=v_intent."provider_product_id"
        and e."event_type" in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL')
        and e."status" in ('processed','refunded','reversed','ignored')
      order by case when e."status"='ignored' then 1 else 0 end,e."occurred_at",e."id" limit 1;
      select o.* into v_obligation from public."revenuecat_provider_reconciliation_obligations" o
      join public."provider_events" e on e."id"=o."provider_event_id" and e."user_id"=v_user and e."product_id"=v_product_id
      where o."purchase_intent_id"=v_intent."id" and o."user_id"=v_user and o."provider"=v_provider
        and o."environment"=v_environment and o."provider_product_id"=v_intent."provider_product_id"
      order by (o."state"='pending_reconciliation') desc,o."created_at" desc,o."id" desc limit 1;
    elsif r.kind='legacy_receipt' then
      select * into v_ledger from public."money_access_ledger_events" where "id"=r."id" and "user_id"=v_user;
      select * into v_receipt from public."provider_events" where "id"=v_ledger."provider_event_id" and "user_id"=v_user;
      select * into v_product from public."monetization_products" where "id"=v_ledger."product_id";
      v_source_type:=v_ledger."source_type"; v_source_id:=v_ledger."source_id"; v_creator:=v_ledger."creator_id";
      v_product_id:=v_ledger."product_id"; v_product_type:=v_product."product_type"; v_product_key:=v_product."product_key";
      v_provider:=v_receipt."provider"; v_environment:=v_ledger."environment";
      v_amount:=v_ledger."amount_minor"; v_currency:=v_ledger."currency";
    else
      select * into v_obligation from public."revenuecat_provider_reconciliation_obligations" where "id"=r."id" and "user_id"=v_user;
      select o.* into v_obligation from public."revenuecat_provider_reconciliation_obligations" o
      where o."user_id"=v_user and o."provider"=v_obligation."provider" and o."environment"=v_obligation."environment"
        and (o."id"=r."id" or (v_obligation."original_transaction_id" is not null and o."original_transaction_id"=v_obligation."original_transaction_id"))
      order by (o."state"='pending_reconciliation') desc,o."created_at" desc,o."id" desc limit 1;
      select * into v_receipt from public."provider_events" where "id"=v_obligation."provider_event_id" and "user_id"=v_user;
      select * into v_product from public."monetization_products" where "id"=v_receipt."product_id";
      v_source_type:=case v_product."product_type" when 'paid_content_access' then 'paid_content' when 'watch_party_live_ticket' then 'watch_party_live'
        when 'event_pass' then 'event' when 'live_watch_party_access_pass' then 'live_watch_party_access'
        when 'live_watch_party_seat_pass' then 'live_watch_party_seat' else v_product."product_type" end;
      v_source_id:=null; v_creator:=v_obligation."creator_id";
      v_product_id:=v_product."id"; v_product_type:=v_product."product_type"; v_product_key:=v_product."product_key";
      v_provider:=v_obligation."provider"; v_environment:=v_obligation."environment";
      v_amount:=v_obligation."reported_amount_minor"; v_currency:=v_obligation."reported_currency";
    end if;
    v_original:=nullif(v_receipt."metadata"->>'original_transaction_id','');
    -- Incomplete historical economics are explicitly unavailable as a pair.
    if v_amount is null or v_currency is null then v_amount:=null; v_currency:=null; end if;

    -- Exact owned grant lineage only. A same-product grant for another source,
    -- original transaction or account is never evidence for this purchase.
    if v_receipt."id" is not null and v_source_id is not null then
      select g.* into v_grant from public."access_grants" g
      join public."provider_events" e on e."id"=g."provider_event_id" and e."user_id"=v_user
        and e."product_id"=v_product_id and e."provider"=v_provider and e."environment"=v_environment
      where g."user_id"=v_user and g."source_type"='provider_event' and g."source_id"=v_source_id
        and g."product_id"=v_product_id and g."provider"=v_provider and g."environment"=v_environment
        and g."grant_type"=case when v_product_type='creator_tip' then 'creator_tip_record' else v_product_type end
        and (g."provider_event_id"=v_receipt."id" or (v_original is not null and g."metadata"->>'original_transaction_id'=v_original
          and e."metadata"->>'original_transaction_id'=v_original))
        and (v_intent."id" is null or (g."metadata"->>'purchase_intent_id'=v_intent."id"::text
          and e."metadata"->>'purchase_intent_id'=v_intent."id"::text))
      order by g."updated_at" desc,g."id" desc limit 1;
      select l.* into v_ledger from public."money_access_ledger_events" l
      join public."provider_events" e on e."id"=l."provider_event_id" and e."user_id"=v_user
        and e."provider"=v_provider and e."environment"=v_environment and e."product_id"=v_product_id
      where l."user_id"=v_user and l."source_type"=v_source_type and l."source_id"=v_source_id
        and l."product_id"=v_product_id and l."environment"=v_environment
        and (l."provider_event_id"=v_receipt."id" or (v_original is not null and e."metadata"->>'original_transaction_id'=v_original))
        and (v_intent."id" is null or e."metadata"->>'purchase_intent_id'=v_intent."id"::text)
      order by e."occurred_at" desc,l."created_at" desc,l."id" desc limit 1;
    end if;

    if v_source_type='event' and v_intent."id" is not null then
      select * into v_reservation from public."event_ticket_reservations" x
      where x."purchase_intent_id"=v_intent."id" and x."buyer_id"=v_user and x."creator_event_id"=v_source_id;
      if v_reservation."id" is not null then
        select t."terms" into v_terms from public."creator_event_offer_revisions" t
        where t."id"=v_reservation."revision_id" and t."creator_event_id"=v_source_id and t."creator_id"=v_creator;
        v_title:=v_terms->>'title';
      end if;
    end if;
    if v_source_type in ('watch_party_live','live_watch_party_access','live_watch_party_seat')
      and v_quote."purchase_intent_id" is not null
      and v_terms->'destination'->>'type'=(case when v_source_type='watch_party_live' then 'party_room' else 'live_stage' end)
    then v_party:=nullif(trim(v_terms->'destination'->>'id'),''); end if;
    -- Whitelist display terms; no raw provider/intent metadata or media URLs.
    v_terms:=jsonb_strip_nulls(jsonb_build_object('title',v_title,'amountMinor',v_amount,'currency',v_currency,
      'startsAt',v_terms->'startsAt','endsAt',v_terms->'endsAt','timeZone',v_terms->'timeZone',
      'salesOpenAt',v_terms->'salesOpenAt','salesCloseAt',v_terms->'salesCloseAt','attendance',v_terms->'attendance',
      'replayPolicy',v_terms->'replayPolicy','replayAvailableAt',v_terms->'replayAvailableAt',
      'replayExpiresAt',v_terms->'replayExpiresAt','includeText',coalesce(v_terms->'includeText',v_terms->'description',v_terms->'includes')));
    v_starts:=v_grant."starts_at"; v_expires:=v_grant."expires_at";
    if v_source_type='event' then
      select e."starts_at",e."status" into v_starts,v_event_status from public."creator_events" e where e."id"=v_source_id and e."host_user_id"=v_creator;
    end if;
    v_status:=case
      when v_ledger."status"='chargeback' or v_ledger."payable_state"='chargeback' then 'disputed'
      when v_receipt."status"='refunded' or v_grant."status"='refunded' or v_grant."refunded_at" is not null or v_ledger."status"='refunded'
        or v_obligation."state"='resolved_refund' then 'refunded'
      when v_receipt."status"='reversed' or v_grant."status" in ('revoked','blocked') or v_grant."revoked_at" is not null
        or v_ledger."status"='reversed' or v_intent."status"='revoked' then 'revoked'
      when v_obligation."state"='pending_reconciliation' then 'reconciliation_required'
      when v_reservation."state"='reconciliation_required' then 'paid_unfulfilled'
      when v_obligation."state"='resolved_no_charge' then 'canceled'
      when v_grant."status"='expired' or v_expires<=v_now then 'expired'
      when v_grant."status" in ('active','sandbox_only') and v_receipt."status"='processed'
        and not public."revenuecat_authority_quarantined_internal"(v_provider,v_user,v_environment)
        then case when v_source_type='creator_tip' then 'completed' when v_event_status='canceled' then 'canceled'
          when v_event_status='expired' then 'expired'
          when v_source_type='event' and v_event_status in ('ended','replay_available') then
            case when coalesce(v_terms->>'replayPolicy','none') not in ('indefinite','until_expiration') then 'completed'
              when v_terms->>'replayPolicy'='until_expiration' and nullif(v_terms->>'replayExpiresAt','')::timestamptz<=v_now then 'expired'
              when v_event_status='replay_available'
                and (nullif(v_terms->>'replayAvailableAt','') is null or (v_terms->>'replayAvailableAt')::timestamptz<=v_now)
                and (v_terms->>'replayPolicy'='indefinite' or nullif(v_terms->>'replayExpiresAt','')::timestamptz>v_now) then 'active'
              else 'completed' end
          when v_starts>v_now then 'upcoming' else 'active' end
      when v_source_type='creator_tip' and v_receipt."status"='processed' and v_ledger."status" in ('verified','sandbox_only') then 'completed'
      when v_receipt."status"='processed' then 'paid_unfulfilled'
      when v_receipt."status"='ignored' then 'reconciliation_required'
      when v_intent."status"='failed' then 'failed' when v_intent."status"='cancelled' then 'canceled'
      -- A native checkout dispatch is not a provider outcome. Quote/reservation
      -- expiry must not suggest that an unresolved charge is safe to repeat.
      -- JSON field reads keep this earlier migration valid before the later
      -- attempt-marker migrations add their columns.
      when v_intent."status" in ('pending','expired')
        and (nullif(to_jsonb(v_intent)->>'checkout_attempt_id','') is not null
          or nullif(to_jsonb(v_reservation)->>'checkout_attempt_id','') is not null) then 'pending'
      when v_intent."status"='expired' or v_intent."expires_at"<=v_now then 'expired'
      else 'pending' end;
    if v_source_id is not null and v_creator is not null and v_product_key is not null then
      v_destination:=case v_source_type
        when 'paid_content' then jsonb_build_object('kind','creator_video','id',v_source_id)
        when 'event' then jsonb_build_object('kind','creator_event','id',v_source_id)
        when 'creator_tip' then jsonb_build_object('kind','creator_channel','id',v_creator)
        when 'channel_subscription' then jsonb_build_object('kind','channel_subscription','id',v_creator)
        when 'vip_pass' then jsonb_build_object('kind','vip_pass','id',v_creator) else null end;
      if v_source_type='watch_party_live' then
        if v_party is null then select o."party_id" into v_party from public."paid_watch_party_offers" o where o."id"=v_source_id and o."creator_id"=v_creator; end if;
        if v_party is not null then v_destination:=jsonb_build_object('kind','watch_party','id',v_party); end if;
      elsif v_source_type in ('live_watch_party_access','live_watch_party_seat') then
        if v_party is null then select o."party_id" into v_party from public."paid_live_watch_party_offers" o where o."id"=v_source_id and o."creator_id"=v_creator; end if;
        if v_party is not null then v_destination:=jsonb_build_object('kind','live_stage','id',v_party); end if;
      end if;
    end if;
    v_item:=jsonb_build_object('id',r."id",'purchaseIntentId',v_intent."id",'sourceType',v_source_type,'sourceId',v_source_id,
      'creatorId',v_creator,'productType',v_product_type,'productKey',v_product_key,'title',v_title,'status',v_status,
      'amountMinor',v_amount,'currency',v_currency,'createdAt',r."created_at",
      'purchasedAt',case when v_receipt."id" is not null then v_receipt."occurred_at" else null end,
      'startsAt',v_starts,'expiresAt',v_expires,'provider',v_provider,
      'environment',case when v_environment in ('sandbox','production') then v_environment else 'unknown' end,'destination',v_destination,
      'receipt',case when v_receipt."id" is not null then jsonb_build_object('providerEventId',v_receipt."id",
        'originalTransactionId',v_original,'verifiedAt',v_receipt."occurred_at",
        'reportedAmountMinor',case when v_obligation."reported_currency" is not null then v_obligation."reported_amount_minor" else null end,
        'reportedCurrency',case when v_obligation."reported_amount_minor" is not null then v_obligation."reported_currency" else null end) else null end,
      'terms',v_terms,'termsAvailable',v_quote."purchase_intent_id" is not null or v_reservation."id" is not null,'grantsAccess',false);
    v_rows:=v_rows||jsonb_build_array(v_item);
  end loop;
  return jsonb_build_object('userId',v_user,'fetchedAt',v_now,'items',v_rows,
    'nextCursor',case when v_more then jsonb_build_object('createdAt',v_last_at,'id',v_last_id) else null end);
end;
$$;
revoke all on function public."read_my_creator_purchases"(integer,timestamptz,uuid,text,uuid) from public,anon,service_role;
grant execute on function public."read_my_creator_purchases"(integer,timestamptz,uuid,text,uuid) to authenticated;

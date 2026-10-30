-- Source-only, deny-by-default external payment admission. No approvals,
-- provider bounds, eligibility grants, money switches or provider objects seeded.
create table private.creator_external_payment_capabilities (
  id uuid primary key default gen_random_uuid(),
  feature text not null check(feature in ('creator_tip','event_auction')),
  creator_id uuid not null,
  provider text not null default 'stripe_connect' check(provider='stripe_connect'),
  provider_account_id text not null check(provider_account_id ~ '^acct_[A-Za-z0-9]+$'),
  platform text not null check(platform in ('web','android','ios')),
  storefront text not null check(length(btrim(storefront)) between 2 and 100),
  storefront_country text not null check(storefront_country ~ '^[A-Z]{2}$'),
  route_kind text not null check(route_kind in ('external_browser_checkout','android_external_content_link')),
  currency text not null check(currency='usd'),
  environment text not null check(environment in ('test','live')),
  payment_method text not null check(payment_method='card'),
  min_amount_minor integer not null check(min_amount_minor>0),
  max_amount_minor integer not null check(max_amount_minor>=min_amount_minor),
  provider_bounds_evidence text not null check(length(btrim(provider_bounds_evidence)) between 1 and 300),
  route_approval_evidence text not null check(length(btrim(route_approval_evidence)) between 1 and 300),
  verified_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>verified_at and expires_at<=verified_at+interval '24 hours'),
  enabled boolean not null default false,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create table private.creator_external_payment_eligibility (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null references private.creator_external_payment_capabilities(id),
  buyer_id uuid not null,
  session_id uuid not null,
  eligibility_evidence text not null check(length(btrim(eligibility_evidence)) between 1 and 300),
  verified_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>verified_at and expires_at<=verified_at+interval '15 minutes'),
  revoked_at timestamptz
);
create index creator_external_payment_eligibility_lookup on private.creator_external_payment_eligibility
  (capability_id,buyer_id,session_id,verified_at desc);
alter table private.creator_external_payment_capabilities enable row level security;
alter table private.creator_external_payment_capabilities force row level security;
alter table private.creator_external_payment_eligibility enable row level security;
alter table private.creator_external_payment_eligibility force row level security;
revoke all on private.creator_external_payment_capabilities,private.creator_external_payment_eligibility from public,anon,authenticated,service_role;
-- Trusted configuration is a separately authorized service operation, never a
-- client header, user_metadata claim or creator setting. No client write RPC.
grant select,insert,update on private.creator_external_payment_capabilities,private.creator_external_payment_eligibility to service_role;

create function private.guard_creator_external_payment_evidence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at')
    or old.revoked_at is not null or new.revoked_at is null
  then raise exception 'external_payment_evidence_immutable'; end if;
  return new;
end;
$$;
revoke all on function private.guard_creator_external_payment_evidence() from public,anon,authenticated,service_role;
create trigger guard_creator_external_payment_capability before update on private.creator_external_payment_capabilities
for each row execute function private.guard_creator_external_payment_evidence();
create trigger guard_creator_external_payment_eligibility before update on private.creator_external_payment_eligibility
for each row execute function private.guard_creator_external_payment_evidence();

create function private.resolve_creator_external_payment_capability(
  p_buyer_id uuid,p_session_id uuid,p_feature text,p_creator_id uuid,p_amount_minor integer,
  p_currency text,p_environment text,p_capability_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.creator_external_payment_capabilities; e private.creator_external_payment_eligibility;
begin
  if p_amount_minor is null or p_amount_minor<=0 or p_creator_id is null or p_buyer_id=p_creator_id
    or not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id)
    or not public.wave1_creator_money_subject_authorized_internal(p_creator_id)
  then raise exception 'external_payment_capability_unavailable'; end if;
  select capability.* into c
  from private.creator_external_payment_capabilities capability
  join private.creator_external_payment_eligibility eligibility on eligibility.capability_id=capability.id
  join public.creator_payout_accounts recipient on recipient.creator_user_id=capability.creator_id::text
    and recipient.provider=capability.provider and recipient.provider_environment=capability.environment
    and recipient.provider_account_id=capability.provider_account_id
  join public.creator_payout_eligibility_records recipient_eligibility on recipient_eligibility.creator_user_id=capability.creator_id::text
    and recipient_eligibility.payout_account_id=recipient.id
  where capability.feature=p_feature and capability.creator_id=p_creator_id
    and capability.currency=p_currency and capability.environment=p_environment
    and capability.route_kind='external_browser_checkout'
    -- Android requires a native external-content-link adapter plus reporting.
    -- No such integration is established here; a browser capability cannot
    -- substitute for it, even if a service row claims Android eligibility.
    and capability.platform in ('web','ios')
    and capability.storefront_country='US'
    and (p_capability_id is null or capability.id=p_capability_id)
    and capability.enabled and capability.revoked_at is null
    and capability.verified_at<=clock_timestamp() and capability.expires_at>clock_timestamp()
    and p_amount_minor between capability.min_amount_minor and capability.max_amount_minor
    and eligibility.buyer_id=p_buyer_id and eligibility.session_id=p_session_id
    and eligibility.revoked_at is null and eligibility.verified_at<=clock_timestamp()
    and eligibility.expires_at>clock_timestamp()
    and recipient.provider_configuration_status='match'
    and recipient.provider_configuration_observed_at<=clock_timestamp()
    and recipient.provider_configuration_account_id=recipient.provider_account_id
    and recipient.charges_enabled and recipient.payouts_enabled and recipient.onboarding_status='ready_for_payouts'
    and recipient_eligibility.provider_ready and recipient_eligibility.kyc_ready and recipient_eligibility.payout_account_ready
    and not recipient_eligibility.fraud_hold_active
    and recipient_eligibility.admin_review_status not in ('pending_review','rejected','on_hold')
    and recipient_eligibility.eligibility_status<>'on_hold'
  order by capability.created_at desc,capability.id,eligibility.verified_at desc,eligibility.id limit 1 for share of capability,eligibility,recipient,recipient_eligibility;
  if c.id is null then raise exception 'external_payment_capability_unavailable'; end if;
  select * into e from private.creator_external_payment_eligibility
    where capability_id=c.id and buyer_id=p_buyer_id and session_id=p_session_id
      and revoked_at is null and verified_at<=clock_timestamp() and expires_at>clock_timestamp()
    order by verified_at desc,id limit 1 for share;
  if e.id is null then raise exception 'external_payment_capability_unavailable'; end if;
  return jsonb_build_object('capabilityId',c.id,'eligibilityId',e.id,'feature',c.feature,'creatorId',c.creator_id,
    'provider',c.provider,'providerAccountId',c.provider_account_id,'platform',c.platform,'storefront',c.storefront,
    'storefrontCountry',c.storefront_country,'routeKind',c.route_kind,
    'currency',c.currency,'environment',c.environment,'paymentMethod',c.payment_method,
    'minAmountMinor',c.min_amount_minor,'maxAmountMinor',c.max_amount_minor,
    'expiresAt',c.expires_at,'eligibilityExpiresAt',e.expires_at);
end;
$$;
revoke all on function private.resolve_creator_external_payment_capability(uuid,uuid,text,uuid,integer,text,text,uuid) from public,anon,authenticated,service_role;

create function public.get_creator_tip_amount_quote(p_creator_id uuid,p_amount_cents integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare capability jsonb; buyer uuid:=auth.uid(); session_id uuid; settings public.creator_tip_settings; candidate record;
begin
  if buyer is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
  then return jsonb_build_object('available',false,'reason','buyer_authority_required'); end if;
  session_id:=(auth.jwt()->>'session_id')::uuid;
  select * into settings from public.creator_tip_settings where creator_id=p_creator_id;
  if settings.tips_enabled is distinct from true or settings.status is distinct from 'active'
    or settings.provider_charges_enabled is distinct from true or settings.provider_payouts_enabled is distinct from true
    or not exists(select 1 from public.platform_money_kill_switches where key='tips_enabled' and state in ('on','sandbox_only'))
    or not exists(select 1 from public.platform_money_kill_switches where key='provider_webhooks_enabled' and state in ('on','sandbox_only'))
    or exists(select 1 from public.platform_money_kill_switches where key='live_money_enabled' and state='on')
    or not public.wave1_creator_money_subject_authorized_internal(p_creator_id)
    or exists(select 1 from public.channel_audience_blocks where
      (channel_user_id=p_creator_id::text and blocked_user_id=buyer::text)
      or (channel_user_id=buyer::text and blocked_user_id=p_creator_id::text))
  then return jsonb_build_object('available',false,'reason','creator_unavailable'); end if;
  begin
    capability:=private.resolve_creator_external_payment_capability(buyer,session_id,'creator_tip',p_creator_id,p_amount_cents,'usd','test');
  exception when raise_exception then
    -- Reveal limits only after independently admitting this exact buyer/session
    -- to an otherwise usable route. A naked catalog row is not authority.
    for candidate in select id,min_amount_minor from private.creator_external_payment_capabilities
      where feature='creator_tip' and creator_id=p_creator_id and currency='usd' and environment='test'
        and enabled and revoked_at is null and verified_at<=clock_timestamp()
        and expires_at>clock_timestamp()+interval '31 minutes'
      order by created_at desc,id limit 20
    loop
      begin
        capability:=private.resolve_creator_external_payment_capability(buyer,session_id,'creator_tip',p_creator_id,
          candidate.min_amount_minor,'usd','test',candidate.id);
        if p_amount_cents>0 and (p_amount_cents<(capability->>'minAmountMinor')::integer
          or p_amount_cents>(capability->>'maxAmountMinor')::integer) then
          return (capability-'providerAccountId'-'eligibilityId') || jsonb_build_object('available',false,
            'reason',case when p_amount_cents<(capability->>'minAmountMinor')::integer
              then 'amount_below_provider_minimum' else 'amount_above_provider_maximum' end,
            'buyerId',buyer,'sessionId',session_id,'amountCents',p_amount_cents,'noAccessGranted',true,'liveMoneyAction',false);
        end if;
      exception when raise_exception then null;
      end;
    end loop;
    return jsonb_build_object('available',false,'reason','approved_route_unavailable');
  end;
  if (capability->>'expiresAt')::timestamptz<=clock_timestamp()+interval '31 minutes'
  then return jsonb_build_object('available',false,'reason','approved_route_expiring'); end if;
  return (capability-'providerAccountId'-'eligibilityId') || jsonb_build_object('available',true,'buyerId',buyer,
    'sessionId',session_id,'amountCents',p_amount_cents,'noAccessGranted',true,'liveMoneyAction',false);
end;
$$;
revoke all on function public.get_creator_tip_amount_quote(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_creator_tip_amount_quote(uuid,integer) to authenticated;

alter table private.creator_tip_checkout_attempts add column external_capability jsonb;
create or replace function public.reserve_creator_tip_checkout_attempt(p_buyer_id uuid,p_session_id uuid,p_request_id uuid,p_quote jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_tip_checkout_attempts;t public.creator_tip_transactions;
  creator uuid:=(p_quote->>'creatorId')::uuid;amount integer:=(p_quote->>'amountCents')::integer;
  capability jsonb;
  candidate uuid:=(p_quote->>'tipId')::uuid;body jsonb:=p_quote->'body';
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  if not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id)
  then raise exception 'tip_buyer_authority_required'; end if;
  if p_request_id is null or creator is null or creator=p_buyer_id or amount is null or amount<=0
    or candidate is null or p_quote->>'currency' is distinct from 'usd'
    or coalesce(p_quote->>'providerAccountId','')!~'^acct_[A-Za-z0-9]+$'
    or body is null or jsonb_typeof(body)<>'object'
  then raise exception 'tip_checkout_quote_invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stripe-tip-checkout:'||p_buyer_id::text||':'||creator::text,0));
  select * into a from private.creator_tip_checkout_attempts where buyer_id=p_buyer_id and request_id=p_request_id for update;
  if a.tip_id is not null then
    select * into t from public.creator_tip_transactions where id=a.tip_id for update;
    if a.session_id is distinct from p_session_id or t.sender_id is distinct from p_buyer_id
      or t.creator_id is distinct from creator or t.tip_amount_cents is distinct from amount or t.currency is distinct from p_quote->>'currency'
      or t.message_private is distinct from nullif(p_quote->>'privateNote','')
    then raise exception 'tip_checkout_request_conflict'; end if;
  else
    if p_quote->>'capabilityId' is null then raise exception 'external_payment_capability_unavailable'; end if;
    if not exists(select 1 from public.creator_tip_settings where creator_id=creator and tips_enabled and status='active'
      and provider_charges_enabled and provider_payouts_enabled and currency='usd' and provider_environment='test')
      or not exists(select 1 from public.platform_money_kill_switches where key='tips_enabled' and state in ('on','sandbox_only'))
      or not exists(select 1 from public.platform_money_kill_switches where key='provider_webhooks_enabled' and state in ('on','sandbox_only'))
      or exists(select 1 from public.platform_money_kill_switches where key='live_money_enabled' and state='on')
      or exists(select 1 from public.channel_audience_blocks where
        (channel_user_id=creator::text and blocked_user_id=p_buyer_id::text)
        or (channel_user_id=p_buyer_id::text and blocked_user_id=creator::text))
    then raise exception 'tip_checkout_unavailable'; end if;
    capability:=private.resolve_creator_external_payment_capability(p_buyer_id,p_session_id,'creator_tip',creator,amount,'usd','test',(p_quote->>'capabilityId')::uuid);
    if capability->>'providerAccountId' is distinct from p_quote->>'providerAccountId'
      or body->>'payment_method_types[0]' is distinct from capability->>'paymentMethod'
    then raise exception 'tip_checkout_capability_mismatch'; end if;
    -- A short dispatch-eligibility TTL is not a payment deadline. The route's
    -- actual approval expiry IS a deadline and must bound the provider link.
    if body->>'expires_at' is null then raise exception 'tip_checkout_quote_invalid'; end if;
    body:=jsonb_set(body,'{expires_at}',to_jsonb(least((body->>'expires_at')::bigint,
      floor(extract(epoch from (capability->>'expiresAt')::timestamptz))::bigint)));
    if exists(select 1 from public.creator_tip_transactions where sender_id=p_buyer_id and creator_id=creator
      and provider='stripe_connect' and provider_environment='test' and (status in('pending','checkout_started')
        or (status='failed' and (provider_checkout_session_id is not null or provider_payment_intent_id is not null))))
    then raise exception 'tip_checkout_previous_unresolved'; end if;
    if body->>'client_reference_id' is distinct from candidate::text
      or body->>'metadata[chillywood_tip_id]' is distinct from candidate::text
      or body->>'metadata[fan_user_id]' is distinct from p_buyer_id::text
      or body->>'metadata[creator_user_id]' is distinct from creator::text
      or body->>'line_items[0][price_data][currency]' is distinct from 'usd'
      or (body->>'line_items[0][price_data][unit_amount]')::integer is distinct from amount
      or body->>'payment_intent_data[transfer_data][destination]' is distinct from p_quote->>'providerAccountId'
      or body->>'mode' is distinct from 'payment'
      or body->>'expires_at' is null
      or (body->>'expires_at')::bigint<extract(epoch from clock_timestamp())+1800
      or (body->>'expires_at')::bigint>extract(epoch from clock_timestamp())+86400
    then raise exception 'tip_checkout_quote_invalid'; end if;
    insert into public.creator_tip_transactions(id,buyer_account_id,buyer_session_generation,creator_id,creator_net_cents,currency,
      idempotency_key,message_private,metadata,payment_status,platform_fee_cents,provider,provider_account_id,provider_environment,
      provider_fee_cents,payout_status,sender_id,service_fee_cents,status,tip_amount_cents,total_paid_cents)
    values(candidate,p_buyer_id,p_session_id,creator,amount,'usd','tip-attempt-'||candidate::text,nullif(p_quote->>'privateNote',''),
      '{"access_granted":false,"buyer_authority_bound":true,"checkout_created_by":"create-creator-tip-checkout","live_money_action":false,"no_badge":true,"no_digital_content":true,"no_perk":true,"no_room_access":true,"no_vip":true,"pure_contribution_only":true,"test_mode":true}',
      'pending',0,'stripe_connect',p_quote->>'providerAccountId','test',0,'not_payable',p_buyer_id,0,'pending',amount,amount) returning * into t;
    insert into private.creator_tip_checkout_attempts(buyer_id,request_id,session_id,tip_id,request_body,external_capability)
    values(p_buyer_id,p_request_id,p_session_id,t.id,body,capability) returning * into a;
  end if;
  return jsonb_build_object('tipId',t.id,'requestId',a.request_id,'buyerId',a.buyer_id,'creatorId',t.creator_id,
    'amountCents',t.tip_amount_cents,'currency',t.currency,'status',t.status,'body',a.request_body,
    'providerSessionId',t.provider_checkout_session_id,'idempotencyKey','chillywood-tip-checkout-'||t.idempotency_key,
    'externalCapability',a.external_capability,'retryAllowed',a.retry_until>clock_timestamp() and (a.request_body->>'expires_at')::bigint>extract(epoch from clock_timestamp()),
    'retryUntil',least(a.retry_until,to_timestamp((a.request_body->>'expires_at')::bigint)));
end;
$$;

create function public.read_creator_tip_checkout_dispatch_authority(p_buyer_id uuid,p_session_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_tip_checkout_attempts; t public.creator_tip_transactions; capability jsonb;
begin
  if auth.role()<>'service_role' or not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id)
  then return jsonb_build_object('allowed',false); end if;
  select * into a from private.creator_tip_checkout_attempts where buyer_id=p_buyer_id and request_id=p_request_id;
  if a.tip_id is null or a.session_id is distinct from p_session_id then return jsonb_build_object('allowed',false); end if;
  select * into t from public.creator_tip_transactions where id=a.tip_id;
  -- Legacy quotes retain their original immutable reconciliation route. They
  -- cannot be created after this migration without a verified capability.
  if a.external_capability is null then return jsonb_build_object('allowed',true,'legacyQuote',true); end if;
  if not exists(select 1 from public.creator_tip_settings where creator_id=t.creator_id and tips_enabled and status='active'
      and provider_charges_enabled and provider_payouts_enabled and currency='usd' and provider_environment='test')
    or not exists(select 1 from public.platform_money_kill_switches where key='tips_enabled' and state in ('on','sandbox_only'))
    or not exists(select 1 from public.platform_money_kill_switches where key='provider_webhooks_enabled' and state in ('on','sandbox_only'))
    or exists(select 1 from public.platform_money_kill_switches where key='live_money_enabled' and state='on')
    or exists(select 1 from public.channel_audience_blocks where
      (channel_user_id=t.creator_id::text and blocked_user_id=p_buyer_id::text)
      or (channel_user_id=p_buyer_id::text and blocked_user_id=t.creator_id::text))
  then return jsonb_build_object('allowed',false); end if;
  begin
    capability:=private.resolve_creator_external_payment_capability(p_buyer_id,p_session_id,'creator_tip',t.creator_id,
      t.tip_amount_cents,t.currency,t.provider_environment,(a.external_capability->>'capabilityId')::uuid);
  exception when raise_exception then return jsonb_build_object('allowed',false); end;
  return jsonb_build_object('allowed',(capability-'eligibilityId'-'eligibilityExpiresAt')=(a.external_capability-'eligibilityId'-'eligibilityExpiresAt'),
    'capabilityId',capability->>'capabilityId');
end;
$$;
revoke all on function public.read_creator_tip_checkout_dispatch_authority(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_tip_checkout_dispatch_authority(uuid,uuid,uuid) to service_role;

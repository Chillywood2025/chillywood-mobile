-- Read-only exact-tip comparison. No fee rates, approvals or dispatch are seeded.
create index creator_external_tip_cost_candidates on private.creator_external_payment_capabilities
  (creator_id,platform,environment,currency,expires_at,id) where feature='creator_tip' and enabled and revoked_at is null;
create index creator_tip_cost_unresolved_native on public.money_purchase_intents(user_id,creator_id)
  where product_type='creator_tip' and checkout_attempt_id is not null and status not in ('consumed','cancelled','revoked');
create index creator_tip_cost_unresolved_external on public.creator_tip_transactions(sender_id,creator_id)
  where status not in ('paid','canceled','refunded');
create table private.creator_tip_route_fee_evidence (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null, session_id uuid not null, creator_id uuid not null,
  amount_minor integer not null check(amount_minor>0), currency text not null check(currency='usd'),
  platform text not null check(platform in ('ios','android','web')),
  environment text not null check(environment='test'),
  provider text not null check(provider in ('app_store','google_play','stripe_connect')),
  purchase_binding_id uuid not null,
  provider_account_id text not null check(length(btrim(provider_account_id)) between 1 and 200),
  qualification_evidence text not null check(length(btrim(qualification_evidence)) between 1 and 300),
  fee_evidence text not null check(length(btrim(fee_evidence)) between 1 and 300),
  processor_minor integer not null check(processor_minor>=0),
  store_minor integer not null check(store_minor>=0),
  platform_minor integer not null check(platform_minor=0), -- no app tip fee
  other_minor integer not null check(other_minor>=0),
  buyer_total_minor integer not null check(buyer_total_minor>=amount_minor),
  tax_minor integer not null check(tax_minor>=0),
  tax_treatment text not null check(tax_treatment in ('inclusive','exclusive','not_taxed')),
  fee_base_minor integer not null check(fee_base_minor>0 and fee_base_minor<=buyer_total_minor),
  all_unavoidable_fees_included boolean not null check(all_unavoidable_fees_included),
  verified_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>verified_at and expires_at<=verified_at+interval '10 minutes'),
  revoked_at timestamptz,
  check(buyer_id<>creator_id),
  check((tax_treatment='inclusive' and buyer_total_minor=amount_minor and tax_minor<=amount_minor)
    or (tax_treatment='exclusive' and buyer_total_minor::bigint=amount_minor::bigint+tax_minor)
    or (tax_treatment='not_taxed' and tax_minor=0 and buyer_total_minor=amount_minor)),
  check(provider='stripe_connect' or (provider='app_store' and platform='ios') or (provider='google_play' and platform='android'))
);
create index creator_tip_route_fee_lookup on private.creator_tip_route_fee_evidence
  (buyer_id,session_id,creator_id,amount_minor,platform,provider,purchase_binding_id,verified_at desc);
alter table private.creator_tip_route_fee_evidence enable row level security;
alter table private.creator_tip_route_fee_evidence force row level security;
revoke all on private.creator_tip_route_fee_evidence from public,anon,authenticated,service_role;
-- Reuse the existing immutable evidence guard: only one-way revocation is allowed.
create trigger guard_creator_tip_route_fee_evidence before update on private.creator_tip_route_fee_evidence
  for each row execute function private.guard_creator_external_payment_evidence();

-- Trusted feed boundary, NOT provider attestation. The operational adapter must
-- establish account-specific fees, taxes/reporting/processing, and qualification
-- from actual provider evidence before calling this. Public rate cards do not qualify.
create function public.record_creator_tip_route_fee_evidence(p_evidence jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare e private.creator_tip_route_fee_evidence; result uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  e:=jsonb_populate_record(null::private.creator_tip_route_fee_evidence,p_evidence);
  if e.verified_at>clock_timestamp() or e.expires_at<=clock_timestamp() or e.revoked_at is not null
    or not public.creator_tip_buyer_session_authority_internal(e.buyer_id,e.session_id)
  then raise exception 'tip_fee_evidence_invalid'; end if;
  insert into private.creator_tip_route_fee_evidence(buyer_id,session_id,creator_id,amount_minor,currency,platform,environment,
    provider,purchase_binding_id,provider_account_id,qualification_evidence,fee_evidence,processor_minor,store_minor,
    platform_minor,other_minor,buyer_total_minor,tax_minor,tax_treatment,fee_base_minor,all_unavoidable_fees_included,verified_at,expires_at)
  values(e.buyer_id,e.session_id,e.creator_id,e.amount_minor,e.currency,e.platform,e.environment,e.provider,
    e.purchase_binding_id,e.provider_account_id,e.qualification_evidence,e.fee_evidence,e.processor_minor,e.store_minor,
    e.platform_minor,e.other_minor,e.buyer_total_minor,e.tax_minor,e.tax_treatment,e.fee_base_minor,
    e.all_unavoidable_fees_included,e.verified_at,e.expires_at) returning id into result;
  return result;
end;
$$;
revoke all on function public.record_creator_tip_route_fee_evidence(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_creator_tip_route_fee_evidence(jsonb) to service_role;
create function public.revoke_creator_tip_route_fee_evidence(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  update private.creator_tip_route_fee_evidence set revoked_at=clock_timestamp() where id=p_id and revoked_at is null;
end;
$$;
revoke all on function public.revoke_creator_tip_route_fee_evidence(uuid) from public,anon,authenticated,service_role;
grant execute on function public.revoke_creator_tip_route_fee_evidence(uuid) to service_role;

create function private.read_creator_tip_route_costs_for_subject(buyer uuid,v_session_id uuid,p_creator_id uuid,p_amount_minor integer,p_platform text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare subject jsonb; routes jsonb:='[]'; route jsonb; price jsonb;
  cap jsonb; candidate record; e private.creator_tip_route_fee_evidence; fees jsonb;
  deadline timestamptz:=clock_timestamp()+interval '30 seconds'; unresolved boolean; settings public.creator_tip_settings;
begin
  if buyer is null or public.creator_tip_buyer_session_authority_internal(buyer,v_session_id) is distinct from true
    or p_creator_id is null or buyer=p_creator_id or p_amount_minor is null or p_amount_minor<=0
    or p_platform is null or p_platform not in ('ios','android','web')
  then return jsonb_build_object('available',false,'reason','subject_unavailable'); end if;
  if not public.wave1_creator_money_subject_authorized_internal(p_creator_id)
    or exists(select 1 from public.channel_audience_blocks where
      (channel_user_id=p_creator_id::text and blocked_user_id=buyer::text)
      or (channel_user_id=buyer::text and blocked_user_id=p_creator_id::text))
  then return jsonb_build_object('available',false,'reason','creator_unavailable'); end if;
  select * into settings from public.creator_tip_settings where creator_id=p_creator_id;
  if settings.tips_enabled is distinct from true or settings.status is distinct from 'active'
    or settings.provider_charges_enabled is distinct from true or settings.provider_payouts_enabled is distinct from true
    or not exists(select 1 from public.platform_money_kill_switches where key='tips_enabled' and state in ('on','sandbox_only'))
    or exists(select 1 from public.platform_money_kill_switches where key='live_money_enabled' and state='on')
  then return jsonb_build_object('available',false,'reason','tips_unavailable'); end if;
  subject:=jsonb_build_object('buyerId',buyer,'sessionId',v_session_id,'creatorId',p_creator_id,'amountMinor',p_amount_minor,
    'currency','usd','platform',p_platform,'environment','test','benefit','creator_tip_no_access');
  -- Conservative read-side unresolved marker. It is not a shared dispatch lock;
  -- expired/failed native intents can still receive receipts and remain uncertain.
  unresolved:=exists(select 1 from public.money_purchase_intents where user_id=buyer and creator_id=p_creator_id
    and product_type='creator_tip' and checkout_attempt_id is not null and status not in ('consumed','cancelled','revoked'))
    or exists(select 1 from public.creator_tip_transactions where sender_id=buyer and creator_id=p_creator_id
      and status not in ('paid','canceled','refunded'));
  if p_platform in ('ios','android')
    and coalesce((select state from public.platform_money_kill_switches where key='live_money_enabled'),'off')='off'
    and (select count(*) from public.platform_money_kill_switches where key in ('creator_monetization_enabled','provider_webhooks_enabled',
      case p_platform when 'ios' then 'revenuecat_app_store_enabled' else 'revenuecat_google_play_enabled' end)
      and state in ('on','sandbox_only'))=3
    and not public.revenuecat_authority_quarantined_internal(case p_platform when 'ios' then 'revenuecat_app_store'
      else 'revenuecat_google_play' end,buyer,'sandbox') then
    for price in select value from public.creator_money_supported_prices_internal('creator_tip',p_platform,'sandbox') value
      where (value->>'amountMinor')::integer=p_amount_minor and value->>'currency'='usd'
        and lower(settings.currency)='usd' and p_amount_minor between settings.min_amount_cents and settings.max_amount_cents
    loop
      routes:=routes||jsonb_build_array(jsonb_build_object('routeId',(price->>'provider')||':'||(price->>'priceId'),
        'provider',case p_platform when 'ios' then 'app_store' else 'google_play' end,
        'purchaseBindingId',price->>'priceId','qualification','eligible','qualificationEvidenceId',price->>'priceId',
        'eligibilityExpiresAt',deadline));
    end loop;
  end if;
  -- Enumerate every currently admitted exact-amount alternative, not only the
  -- first capability. Native support or platform headers never establish eligibility.
  if settings.provider_charges_enabled and settings.provider_payouts_enabled
    and exists(select 1 from public.platform_money_kill_switches where key='provider_webhooks_enabled' and state in ('on','sandbox_only')) then
    for candidate in select id from private.creator_external_payment_capabilities
      where creator_id=p_creator_id and feature='creator_tip' and platform=p_platform and environment='test'
        and currency='usd' and enabled and revoked_at is null and expires_at>clock_timestamp()
    loop
      begin
        cap:=private.resolve_creator_external_payment_capability(buyer,v_session_id,'creator_tip',p_creator_id,p_amount_minor,'usd','test',candidate.id);
        if (cap->>'expiresAt')::timestamptz<=clock_timestamp()+interval '31 minutes' then continue; end if;
        routes:=routes||jsonb_build_array(jsonb_build_object('routeId','stripe_connect:'||candidate.id::text,
          'provider','stripe_connect','purchaseBindingId',candidate.id,'qualification','eligible',
          'qualificationEvidenceId',cap->>'eligibilityId','eligibilityExpiresAt',cap->>'eligibilityExpiresAt',
          '_account',cap->>'providerAccountId'));
      exception when raise_exception then null;
      end;
    end loop;
  end if;
  cap:='[]';
  for route in select value from jsonb_array_elements(routes) loop
    select * into e from private.creator_tip_route_fee_evidence f where
      f.buyer_id=buyer and f.session_id=v_session_id and f.creator_id=p_creator_id and f.amount_minor=p_amount_minor
      and f.currency='usd' and f.platform=p_platform and f.environment='test' and f.provider=route->>'provider'
      and f.purchase_binding_id=(route->>'purchaseBindingId')::uuid
      and (f.provider<>'stripe_connect' or f.provider_account_id=route->>'_account')
      and f.verified_at<=clock_timestamp()
      order by f.verified_at desc,f.id desc limit 1;
    fees:=null;
    if e.id is not null and e.revoked_at is null and e.expires_at>clock_timestamp() then
      deadline:=least(deadline,e.expires_at);
      fees:=subject||jsonb_build_object('evidenceId',e.id,'authority','account_qualified','allUnavoidableFeesIncluded',true,
        'expiresAt',e.expires_at,'routeId',route->>'routeId','purchaseBindingId',e.purchase_binding_id,
        'processorMinor',e.processor_minor,'storeMinor',e.store_minor,'platformMinor',e.platform_minor,'otherMinor',e.other_minor,
        'buyerTotalMinor',e.buyer_total_minor,'taxMinor',e.tax_minor,'taxTreatment',e.tax_treatment,'feeBaseMinor',e.fee_base_minor,
        'totalMinor',e.processor_minor::bigint+e.store_minor+e.platform_minor+e.other_minor+e.tax_minor);
    end if;
    deadline:=least(deadline,(route->>'eligibilityExpiresAt')::timestamptz);
    cap:=cap||jsonb_build_array((route-'_account')||jsonb_build_object('fees',fees));
  end loop;
  return subject||jsonb_build_object('version',1,'available',true,'completeCandidateSet',true,'unresolvedPayment',unresolved,
    'expiresAt',deadline,'routes',cap,'noAccessGranted',true,'liveMoneyAction',false);
end;
$$;
revoke all on function private.read_creator_tip_route_costs_for_subject(uuid,uuid,uuid,integer,text) from public,anon,authenticated,service_role;

-- Public callers cannot select another buyer/session or exclude an attempt.
-- Internal dispatch uses the revoked helper with its already-validated subject,
-- without rewriting request JWT claims to impersonate an authenticated buyer.
create function public.get_creator_tip_route_costs(p_creator_id uuid,p_amount_minor integer,p_platform text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
  then return jsonb_build_object('available',false,'reason','subject_unavailable'); end if;
  return private.read_creator_tip_route_costs_for_subject(auth.uid(),(auth.jwt()->>'session_id')::uuid,
    p_creator_id,p_amount_minor,p_platform);
end;
$$;
revoke all on function public.get_creator_tip_route_costs(uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.get_creator_tip_route_costs(uuid,integer,text) to authenticated;

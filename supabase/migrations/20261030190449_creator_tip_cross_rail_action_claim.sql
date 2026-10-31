-- Shared action identity only; this does NOT enable cheapest-route dispatch.
-- The client must persist and reuse one action UUID across rail selection. The
-- existing per-rail authorizers still validate catalog/capability/session first.
create table private.creator_tip_action_claims (
  buyer_id uuid not null,
  action_id uuid not null,
  session_id uuid not null,
  creator_id uuid not null,
  amount_minor integer not null check (amount_minor>0),
  currency text not null check (currency='usd'),
  provider text not null check (provider in ('stripe_connect','revenuecat_app_store','revenuecat_google_play')),
  provider_reference_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (buyer_id,action_id),
  check (buyer_id<>creator_id)
);
alter table private.creator_tip_action_claims enable row level security;
alter table private.creator_tip_action_claims force row level security;
revoke all on private.creator_tip_action_claims from public,anon,authenticated,service_role;

create function private.claim_creator_tip_action(p_buyer uuid,p_action uuid,p_session uuid,p_creator uuid,
  p_amount integer,p_currency text,p_provider text,p_reference uuid)
returns void language plpgsql security definer set search_path='' as $$
declare previous private.creator_tip_action_claims;
begin
  if p_action is null or not public.creator_tip_buyer_session_authority_internal(p_buyer,p_session)
  then raise exception 'tip_action_session_authority_required'; end if;
  -- Serialize distinct manual/selected action IDs for this buyer and creator,
  -- so an uncertain checkout cannot be evaded by choosing another rail/UUID.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tip-buyer-creator-dispatch:'||p_buyer::text||':'||p_creator::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tip-action:'||p_buyer::text||':'||p_action::text,0));
  if exists(select 1 from private.creator_tip_abandoned_actions where buyer_id=p_buyer and action_id=p_action) then raise exception 'tip_action_abandoned'; end if;
  perform private.validate_selected_creator_tip_dispatch(p_buyer,p_action,p_session,p_creator,p_amount,p_currency,p_provider,p_reference);
  -- PK conflict serialization covers competing rails; no provider/source rows
  -- are acquired after this claim, avoiding a reciprocal cross-rail lock order.
  insert into private.creator_tip_action_claims(buyer_id,action_id,session_id,creator_id,amount_minor,currency,provider,provider_reference_id)
  values(p_buyer,p_action,p_session,p_creator,p_amount,p_currency,p_provider,p_reference)
  on conflict (buyer_id,action_id) do nothing;
  select * into previous from private.creator_tip_action_claims where buyer_id=p_buyer and action_id=p_action;
  if row(previous.session_id,previous.creator_id,previous.amount_minor,previous.currency,previous.provider,previous.provider_reference_id)
    is distinct from row(p_session,p_creator,p_amount,p_currency,p_provider,p_reference)
  then raise exception 'tip_action_route_conflict'; end if;
end;
$$;
revoke all on function private.claim_creator_tip_action(uuid,uuid,uuid,uuid,integer,text,text,uuid) from public,anon,authenticated,service_role;

create function private.bind_native_creator_tip_action()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.source_type='creator_tip' and old.checkout_attempt_id is null and new.checkout_attempt_id is not null then
    perform private.claim_creator_tip_action(new.user_id,new.checkout_attempt_id,new.session_generation::uuid,
      new.creator_id,new.amount_minor,new.currency,new.provider,new.id);
  end if;
  return new;
end;
$$;
revoke all on function private.bind_native_creator_tip_action() from public,anon,authenticated,service_role;
create trigger bind_native_creator_tip_action after update of checkout_attempt_id on public.money_purchase_intents
for each row execute function private.bind_native_creator_tip_action();

create function private.bind_external_creator_tip_action()
returns trigger language plpgsql security definer set search_path='' as $$
declare tip public.creator_tip_transactions;
begin
  select * into strict tip from public.creator_tip_transactions where id=new.tip_id;
  perform private.claim_creator_tip_action(new.buyer_id,new.request_id,new.session_id,tip.creator_id,
    tip.tip_amount_cents,tip.currency,'stripe_connect',tip.id);
  return new;
end;
$$;
revoke all on function private.bind_external_creator_tip_action() from public,anon,authenticated,service_role;
create trigger bind_external_creator_tip_action after insert on private.creator_tip_checkout_attempts
for each row execute function private.bind_external_creator_tip_action();

create function private.guard_creator_tip_action_claim()
returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'tip_action_claim_immutable'; end;
$$;
revoke all on function private.guard_creator_tip_action_claim() from public,anon,authenticated,service_role;
create trigger guard_creator_tip_action_claim before update or delete on private.creator_tip_action_claims
for each row execute function private.guard_creator_tip_action_claim();
comment on table private.creator_tip_action_claims is
  'Immutable dispatch identity, not settlement or cheapest-route authority. A new legitimate tip uses a new action UUID. Unknown outcomes cannot switch the same action to another provider/reference. No expiration releases claims.';

create table private.creator_tip_route_selections (
 buyer_id uuid not null,action_id uuid not null,session_id uuid not null,creator_id uuid not null,
 amount_minor integer not null check(amount_minor>0),platform text not null check(platform in('ios','android','web')),
 route_id text not null,provider text not null,purchase_binding_id uuid not null,
 selected_at timestamptz not null default clock_timestamp(),primary key(buyer_id,action_id)
);
alter table private.creator_tip_route_selections enable row level security;
alter table private.creator_tip_route_selections force row level security;
revoke all on private.creator_tip_route_selections from public,anon,authenticated,service_role;
create trigger guard_creator_tip_route_selection before update or delete on private.creator_tip_route_selections
for each row execute function private.guard_creator_tip_action_claim();

create function private.lowest_qualified_creator_tip_route(snapshot jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare selected jsonb;
begin
 if snapshot->>'available' is distinct from 'true' or snapshot->>'completeCandidateSet' is distinct from 'true'
  or (snapshot->>'expiresAt')::timestamptz<=clock_timestamp()
  or jsonb_array_length(snapshot->'routes')=0
  or exists(select 1 from jsonb_array_elements(snapshot->'routes') r where r->'fees' is null or r->'fees'='null'::jsonb
    or r->'fees'->>'authority' is distinct from 'account_qualified'
    or r->'fees'->>'allUnavoidableFeesIncluded' is distinct from 'true'
    or (r->'fees'->>'buyerTotalMinor')::integer is distinct from (snapshot->>'amountMinor')::integer)
  or (select count(distinct r->'fees'->>'buyerTotalMinor') from jsonb_array_elements(snapshot->'routes') r)>1
  or (select count(*) from jsonb_array_elements(snapshot->'routes') r where r->>'provider' in('app_store','google_play'))>1
 then raise exception 'tip_complete_qualified_fees_required'; end if;
 select r into selected from jsonb_array_elements(snapshot->'routes') r
 order by (r->'fees'->>'totalMinor')::bigint,r->>'routeId' limit 1;
 return selected;
end;
$$;
revoke all on function private.lowest_qualified_creator_tip_route(jsonb) from public,anon,authenticated,service_role;

create function public.select_creator_tip_payment_route(p_action_id uuid,p_creator_id uuid,p_amount_minor integer,p_platform text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer uuid:=auth.uid(); session_id uuid; existing private.creator_tip_route_selections; snapshot jsonb; chosen jsonb;
begin
 if not public.whole_app_exact_current_session_authority_internal() or p_action_id is null
 then raise exception 'tip_action_session_authority_required'; end if;
 session_id:=(auth.jwt()->>'session_id')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tip-action:'||buyer::text||':'||p_action_id::text,0));
 if exists(select 1 from private.creator_tip_abandoned_actions a where a.buyer_id=buyer and a.action_id=p_action_id) then raise exception 'tip_action_abandoned'; end if;
 select * into existing from private.creator_tip_route_selections s where s.buyer_id=buyer and s.action_id=p_action_id;
 if existing.action_id is not null then
  if row(existing.session_id,existing.creator_id,existing.amount_minor,existing.platform)
   is distinct from row(session_id,p_creator_id,p_amount_minor,p_platform) then raise exception 'tip_action_route_conflict'; end if;
  -- Selection retries return only the original route; never authorize dispatch.
  return jsonb_build_object('actionId',p_action_id,'buyerId',buyer,'sessionId',session_id,'creatorId',p_creator_id,
   'amountMinor',p_amount_minor,'currency','usd','routeId',existing.route_id,'provider',existing.provider,
   'purchaseBindingId',existing.purchase_binding_id,'dispatchAuthorized',false);
 end if;
 if exists(select 1 from private.creator_tip_action_claims c where c.buyer_id=buyer and c.action_id=p_action_id)
 then raise exception 'tip_action_already_dispatched'; end if;
 snapshot:=public.get_creator_tip_route_costs(p_creator_id,p_amount_minor,p_platform);
 if snapshot->>'unresolvedPayment' is distinct from 'false' then raise exception 'tip_prior_payment_unresolved'; end if;
 chosen:=private.lowest_qualified_creator_tip_route(snapshot);
 insert into private.creator_tip_route_selections(buyer_id,action_id,session_id,creator_id,amount_minor,platform,route_id,provider,purchase_binding_id)
 values(buyer,p_action_id,session_id,p_creator_id,p_amount_minor,p_platform,chosen->>'routeId',chosen->>'provider',(chosen->>'purchaseBindingId')::uuid);
 return jsonb_build_object('actionId',p_action_id,'buyerId',buyer,'sessionId',session_id,'creatorId',p_creator_id,
  'amountMinor',p_amount_minor,'currency','usd','routeId',chosen->>'routeId','provider',chosen->>'provider',
  'purchaseBindingId',chosen->>'purchaseBindingId','dispatchAuthorized',false);
end;
$$;
revoke all on function public.select_creator_tip_payment_route(uuid,uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.select_creator_tip_payment_route(uuid,uuid,integer,text) to authenticated;

-- Full exact-subject candidate/fee reread happens inside the transaction which
-- reserves dispatch. The only excluded pending row is this exact provider row.
create function private.validate_selected_creator_tip_dispatch(p_buyer uuid,p_action uuid,p_session uuid,p_creator uuid,
 p_amount integer,p_currency text,p_provider text,p_reference uuid)
returns void language plpgsql security definer set search_path='' as $$
declare selection private.creator_tip_route_selections; snapshot jsonb; chosen jsonb; binding uuid;
begin
 select * into selection from private.creator_tip_route_selections where buyer_id=p_buyer and action_id=p_action;
 if exists(select 1 from public.money_purchase_intents where user_id=p_buyer and creator_id=p_creator and product_type='creator_tip'
  and checkout_attempt_id is not null and status not in('consumed','cancelled','revoked') and not(provider=p_provider and id=p_reference))
  or exists(select 1 from public.creator_tip_transactions where sender_id=p_buyer and creator_id=p_creator
   and status not in('paid','canceled','refunded') and not(p_provider='stripe_connect' and id=p_reference))
 then raise exception 'tip_prior_payment_unresolved'; end if;
 if selection.action_id is null then return; end if; -- manual flow still shares unknown-outcome guards
 if row(selection.session_id,selection.creator_id,selection.amount_minor) is distinct from row(p_session,p_creator,p_amount)
  or p_currency<>'usd' then raise exception 'tip_action_route_conflict'; end if;
 snapshot:=private.read_creator_tip_route_costs_for_subject(p_buyer,p_session,p_creator,p_amount,selection.platform);
 chosen:=private.lowest_qualified_creator_tip_route(snapshot);
 if chosen->>'routeId' is distinct from selection.route_id then raise exception 'tip_selected_cost_route_changed'; end if;
 if p_provider='stripe_connect' then
  select (external_capability->>'capabilityId')::uuid into binding from private.creator_tip_checkout_attempts
   where buyer_id=p_buyer and request_id=p_action and tip_id=p_reference;
 else
  select (price->>'priceId')::uuid into binding from public.money_purchase_intents i
   cross join public.creator_money_supported_prices_internal('creator_tip',selection.platform,'sandbox') price
   where i.id=p_reference and i.provider=p_provider and price->>'provider'=i.provider
    and price->>'providerProductId'=i.provider_product_id and price->>'productKey'=i.product_key
    and (price->>'amountMinor')::integer=p_amount and price->>'currency'=p_currency;
 end if;
 if binding is distinct from selection.purchase_binding_id
  or selection.provider is distinct from (case p_provider when 'revenuecat_app_store' then 'app_store'
    when 'revenuecat_google_play' then 'google_play' else p_provider end)
 then raise exception 'tip_action_route_conflict'; end if;
end;
$$;
revoke all on function private.validate_selected_creator_tip_dispatch(uuid,uuid,uuid,uuid,integer,text,text,uuid) from public,anon,authenticated,service_role;

create table private.creator_tip_abandoned_actions (
 buyer_id uuid not null,action_id uuid not null,abandoned_at timestamptz not null default clock_timestamp(),
 primary key(buyer_id,action_id)
);
alter table private.creator_tip_abandoned_actions enable row level security;
alter table private.creator_tip_abandoned_actions force row level security;
revoke all on private.creator_tip_abandoned_actions from public,anon,authenticated,service_role;
create trigger guard_creator_tip_abandoned_action before update or delete on private.creator_tip_abandoned_actions
for each row execute function private.guard_creator_tip_action_claim();

create function public.resolve_creator_tip_payment_action(p_action_id uuid,p_abandon_if_undispatched boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer uuid:=auth.uid(); claim private.creator_tip_action_claims; terminal boolean:=false; payment_status text;
begin
 if not public.whole_app_exact_current_session_authority_internal() or p_action_id is null
 then raise exception 'tip_action_session_authority_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tip-action:'||buyer::text||':'||p_action_id::text,0));
 select * into claim from private.creator_tip_action_claims where buyer_id=buyer and action_id=p_action_id;
 if claim.action_id is null then
  -- Historical Stripe attempts predate shared claims; absence of a new claim is
  -- NOT proof that an old provider request never started.
  select a.buyer_id,a.request_id,a.session_id,t.creator_id,t.tip_amount_cents,t.currency,
   'stripe_connect',t.id,a.created_at into claim
  from private.creator_tip_checkout_attempts a join public.creator_tip_transactions t on t.id=a.tip_id
  where a.buyer_id=buyer and a.request_id=p_action_id;
 end if;
 if claim.action_id is not null then
  if claim.provider='stripe_connect' then
   select status in('paid','canceled','refunded'),status into terminal,payment_status from public.creator_tip_transactions
    where id=claim.provider_reference_id and sender_id=buyer;
  else
   -- Expiry, cancellation UI and unverified failure are not proof of no payment.
   -- Revoked is written by the verified provider refund/revocation projection,
   -- not by client cancellation. It is terminal for this original payment.
   select status in('consumed','revoked'),status into terminal,payment_status
    from public.money_purchase_intents where id=claim.provider_reference_id and user_id=buyer;
  end if;
  return jsonb_build_object('actionId',p_action_id,'buyerId',buyer,'terminal',coalesce(terminal,false),'dispatched',true,
   'abandoned',false,'provider',claim.provider,'providerReferenceId',claim.provider_reference_id,'paymentStatus',payment_status);
 end if;
 if p_abandon_if_undispatched then
  insert into private.creator_tip_abandoned_actions(buyer_id,action_id) values(buyer,p_action_id) on conflict do nothing;
 end if;
 return jsonb_build_object('actionId',p_action_id,'buyerId',buyer,'terminal',false,'dispatched',false,
  'abandoned',exists(select 1 from private.creator_tip_abandoned_actions where buyer_id=buyer and action_id=p_action_id));
end;
$$;
revoke all on function public.resolve_creator_tip_payment_action(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.resolve_creator_tip_payment_action(uuid,boolean) to authenticated;

alter function public.read_creator_tip_checkout_dispatch_authority(uuid,uuid,uuid)
 rename to read_creator_tip_checkout_dispatch_authority_pre_shared_action;
revoke all on function public.read_creator_tip_checkout_dispatch_authority_pre_shared_action(uuid,uuid,uuid)
 from public,anon,authenticated,service_role;
create function public.read_creator_tip_checkout_dispatch_authority(p_buyer_id uuid,p_session_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; claim private.creator_tip_action_claims;
begin
 result:=public.read_creator_tip_checkout_dispatch_authority_pre_shared_action(p_buyer_id,p_session_id,p_request_id);
 if result->>'allowed' is distinct from 'true' then return result; end if;
 select * into claim from private.creator_tip_action_claims where buyer_id=p_buyer_id and action_id=p_request_id;
 if claim.action_id is not null then
  begin
   perform private.validate_selected_creator_tip_dispatch(claim.buyer_id,claim.action_id,p_session_id,claim.creator_id,
     claim.amount_minor,claim.currency,claim.provider,claim.provider_reference_id);
  exception when raise_exception then return jsonb_build_object('allowed',false,'reason','selected_tip_route_requires_reconciliation'); end;
 end if;
 return result;
end;
$$;
revoke all on function public.read_creator_tip_checkout_dispatch_authority(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_tip_checkout_dispatch_authority(uuid,uuid,uuid) to service_role;

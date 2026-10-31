-- Source-only qualification infrastructure. No legal conclusions, registrations,
-- active policy seeds, provider settings, paid subscriptions or live switches.
create table private.commerce_tax_qualifications (
 id uuid primary key default gen_random_uuid(),
 feature text not null check(feature in ('physical_merch','event_auction','room_auction')),
 product_id text not null, account_id text not null check(account_id ~ '^acct_[A-Za-z0-9]+$'),
 environment text not null check(environment in ('sandbox','test')),
 permitted_scope text not null check(permitted_scope in ('US_all_destinations','worldwide')),
 platform_scope text not null check(platform_scope='all_supported_platforms'),
 professional_basis_reference text, coverage_evidence_reference text,
 full_permitted_scope_reviewed boolean not null default false,
 collection_mode text check(collection_mode in ('automatic','verified_no_collection','store_handled')),
 liability_type text check(liability_type in ('self','account')),
 liability_account_id text, tax_code text check(tax_code ~ '^txcd_[0-9]+$'),
 tax_behavior text check(tax_behavior in ('inclusive','exclusive')),
 registration_evidence_reference text, no_collection_basis_reference text,
 provider_settings_evidence_reference text, provider_product_evidence_reference text,
 provider_verified_at timestamptz, provider_expires_at timestamptz,
 verified_at timestamptz not null default clock_timestamp(), expires_at timestamptz,
 enabled boolean not null default false, revoked_at timestamptz,
 check(expires_at is null or expires_at>verified_at),
 check(provider_expires_at is null or provider_expires_at>provider_verified_at),
 check((liability_type='account' and liability_account_id ~ '^acct_[A-Za-z0-9]+$')
   or (liability_type is distinct from 'account' and liability_account_id is null))
);
create table private.commerce_tax_checkout_bindings (
 feature text not null, identity_id uuid not null,
 policy_id uuid not null references private.commerce_tax_qualifications(id),
 product_id text not null, account_id text not null, environment text not null,
 permitted_scope text not null, created_at timestamptz not null default clock_timestamp(),
 primary key(feature,identity_id)
);
alter table private.commerce_tax_qualifications enable row level security;
alter table private.commerce_tax_qualifications force row level security;
alter table private.commerce_tax_checkout_bindings enable row level security;
alter table private.commerce_tax_checkout_bindings force row level security;
revoke all on private.commerce_tax_qualifications,private.commerce_tax_checkout_bindings from public,anon,authenticated,service_role;
create trigger commerce_tax_qualification_immutable before update on private.commerce_tax_qualifications
 for each row execute function private.guard_creator_external_payment_evidence();
create trigger commerce_tax_qualification_no_delete before delete on private.commerce_tax_qualifications
 for each row execute function private.guard_event_ticket_terms_immutable();
create trigger commerce_tax_binding_immutable before update or delete on private.commerce_tax_checkout_bindings
 for each row execute function private.guard_event_ticket_terms_immutable();

create function public.bind_commerce_tax_checkout_policy(p_feature text,p_identity_id uuid,p_product_id text,
 p_account_id text,p_environment text,p_permitted_scope text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q private.commerce_tax_qualifications; b private.commerce_tax_checkout_bindings;
 reason text; expected_scope text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 expected_scope:=case when p_feature='physical_merch' then 'US_all_destinations' else 'worldwide' end;
 if p_feature is null or p_feature not in ('physical_merch','event_auction','room_auction')
  or p_identity_id is null or p_product_id is null or p_account_id is null
  or p_permitted_scope is distinct from expected_scope
  or (p_feature='physical_merch' and p_environment is distinct from 'sandbox')
  or (p_feature<>'physical_merch' and p_environment is distinct from 'test')
 then return jsonb_build_object('ready',false,'reason','tax_checkout_identity_invalid'); end if;
 -- This is a trusted edge gate, not a client-selected location or seller election.
 if p_feature='physical_merch' then
  if not exists(select 1 from public.merch_orders o where o.id=p_identity_id and o.product_id::text=p_product_id
   and o.environment='sandbox' and o.provider='stripe_physical_goods') then
   return jsonb_build_object('ready',false,'reason','tax_checkout_identity_invalid'); end if;
 else
  if not exists(select 1 from private.auction_platform_settlement_contracts c where c.quote_id=p_identity_id
   and c.lane=case p_feature when 'event_auction' then 'event' else 'room' end
   and c.platform_product_id=p_product_id and c.platform_account_id=p_account_id and c.environment=p_environment) then
   return jsonb_build_object('ready',false,'reason','tax_checkout_identity_invalid'); end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('commerce-tax:'||p_feature||':'||p_identity_id,0));
 select * into b from private.commerce_tax_checkout_bindings where feature=p_feature and identity_id=p_identity_id;
 select * into q from private.commerce_tax_qualifications where feature=p_feature and product_id=p_product_id
  and account_id=p_account_id and environment=p_environment order by verified_at desc,id desc limit 1 for share;
 if q.id is null then reason:='tax_qualification_required';
 elsif b.policy_id is not null and (b.policy_id<>q.id or b.product_id<>p_product_id or b.account_id<>p_account_id
  or b.environment<>p_environment or b.permitted_scope<>p_permitted_scope) then reason:='tax_policy_changed';
 elsif not q.enabled or q.revoked_at is not null or q.verified_at>clock_timestamp()
  or q.expires_at is null or q.expires_at<=clock_timestamp() then reason:='tax_qualification_expired';
 elsif q.tax_behavior is null then reason:='tax_pricing_behavior_required';
 elsif q.tax_behavior='exclusive' then reason:='tax_pricing_behavior_unsupported';
 elsif not q.full_permitted_scope_reviewed or q.permitted_scope<>p_permitted_scope
  or nullif(btrim(q.professional_basis_reference),'') is null or nullif(btrim(q.coverage_evidence_reference),'') is null
 then reason:='tax_scope_coverage_required';
 elsif q.collection_mode is null or q.collection_mode='store_handled' or q.liability_type is null or q.tax_code is null
  or nullif(btrim(q.provider_settings_evidence_reference),'') is null
  or nullif(btrim(q.provider_product_evidence_reference),'') is null
  or q.provider_verified_at is null or q.provider_verified_at>clock_timestamp()
  or q.provider_expires_at is null or q.provider_expires_at<=clock_timestamp()
  or (q.collection_mode='automatic' and nullif(btrim(q.registration_evidence_reference),'') is null)
  or (q.collection_mode='verified_no_collection' and nullif(btrim(q.no_collection_basis_reference),'') is null)
 then reason:='provider_tax_settings_unverified'; end if;
 if reason is not null then return jsonb_build_object('ready',false,'reason',reason); end if;
 if b.policy_id is null then
  insert into private.commerce_tax_checkout_bindings(feature,identity_id,policy_id,product_id,account_id,environment,permitted_scope)
   values(p_feature,p_identity_id,q.id,p_product_id,p_account_id,p_environment,p_permitted_scope);
 end if;
 return jsonb_build_object('ready',true,'policyId',q.id,'taxBehavior',q.tax_behavior,'taxCode',q.tax_code,
  'liabilityType',q.liability_type,'liabilityAccountId',q.liability_account_id,'collectionMode',q.collection_mode);
end;
$$;
revoke all on function public.bind_commerce_tax_checkout_policy(text,uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.bind_commerce_tax_checkout_policy(text,uuid,text,text,text,text) to service_role;

-- Qualification and the original checkout-start claim commit atomically. A
-- missing policy must not strand an award as started without a provider session.
alter function public.prepare_creator_event_auction_platform_checkout(uuid,uuid,uuid,uuid)
 rename to prepare_creator_event_auction_platform_before_tax;
alter function public.prepare_creator_room_auction_platform_checkout(uuid,uuid,uuid,uuid)
 rename to prepare_creator_room_auction_platform_before_tax;
revoke all on function public.prepare_creator_event_auction_platform_before_tax(uuid,uuid,uuid,uuid),
 public.prepare_creator_room_auction_platform_before_tax(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
do $$ declare lane text; begin
 foreach lane in array array['event','room'] loop
  execute format($fn$
   create function public.prepare_creator_%1$s_auction_platform_checkout(p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid)
   returns jsonb language plpgsql security definer set search_path='' as $body$
   declare result jsonb; policy jsonb;
   begin
    if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
    result:=public.prepare_creator_%1$s_auction_platform_before_tax(p_quote_id,p_buyer_id,p_session_id,p_attempt_id);
    -- Existing provider receipts are recovery-only; no new tax snapshot may
    -- retroactively relabel their financial or tax treatment.
    if result->'startAuthorized'='true'::jsonb then
     policy:=public.bind_commerce_tax_checkout_policy('%1$s_auction',p_quote_id,result->>'providerProductId',
       result->>'providerAccountId','test','worldwide');
     if policy->'ready' is distinct from 'true'::jsonb then raise exception '%%',policy->>'reason'; end if;
    end if;
    return result;
   end; $body$;
  $fn$,lane);
  execute format('revoke all on function public.prepare_creator_%s_auction_platform_checkout(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role',lane);
  execute format('grant execute on function public.prepare_creator_%s_auction_platform_checkout(uuid,uuid,uuid,uuid) to service_role',lane);
 end loop;
end; $$;

create function public.get_owner_commerce_tax_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
  or public.has_platform_role(array['owner']) is distinct from true then raise exception 'owner_current_session_required'; end if;
 -- A policy row alone never establishes launch eligibility or fee completeness.
 -- This phase deliberately has no provider mutation/fee-authority importer.
 select jsonb_agg(jsonb_build_object('feature',f,'status','blocked','reason',
  (select case when count(*)=0 then 'tax_qualification_required'
   when bool_or(not q.enabled or q.revoked_at is not null or q.verified_at>now() or q.expires_at is null or q.expires_at<=now())
    then 'tax_qualification_expired'
   when bool_or(q.tax_behavior is null) then 'tax_pricing_behavior_required'
   when bool_or(q.tax_behavior='exclusive') then 'tax_pricing_behavior_unsupported'
   when bool_or(not q.full_permitted_scope_reviewed or nullif(btrim(q.professional_basis_reference),'') is null
    or nullif(btrim(q.coverage_evidence_reference),'') is null
    or q.permitted_scope<>case when f='physical_merch' then 'US_all_destinations' else 'worldwide' end)
    then 'tax_scope_coverage_required'
   else 'provider_tax_settings_unverified' end
   from (select distinct on (product_id,account_id,environment) * from private.commerce_tax_qualifications
    where feature=f order by product_id,account_id,environment,verified_at desc,id desc) q),
  'taxServiceFeeStatus','unverified') order by f) into items
 from unnest(array['physical_merch','event_auction','room_auction']) f;
 return jsonb_build_object('schemaVersion',1,'status','blocked','financialAuthority',false,
  'liveActivationAllowed',false,'items',items);
end;
$$;
revoke all on function public.get_owner_commerce_tax_readiness() from public,anon,authenticated,service_role;
grant execute on function public.get_owner_commerce_tax_readiness() to authenticated;

-- No final cost authority is created by a charge balance fee or a calculated
-- 0.5% estimate. A later independently reviewed provider evidence importer must
-- qualify complete, attributed, deduplicated service fees before this can open.
create function private.commerce_tax_fee_settlement_ready(p_feature text,p_identity_id uuid) returns boolean
language sql immutable set search_path='' as $$ select false; $$;
revoke all on function private.commerce_tax_fee_settlement_ready(text,uuid) from public,anon,authenticated,service_role;

-- Prospective allocations keep their observed arithmetic, but acquire an
-- explicit durable hold. Historical append-only allocations are not rewritten.
create function private.hold_unverified_commerce_tax_fee() returns trigger
language plpgsql set search_path='' as $$
begin
 if not ('tax_service_fee_unverified'=any(new.hold_reasons)) then
  new.hold_reasons:=array_append(new.hold_reasons,'tax_service_fee_unverified'); end if;
 return new;
end;
$$;
revoke all on function private.hold_unverified_commerce_tax_fee() from public,anon,authenticated,service_role;
create trigger merch_tax_service_fee_hold before insert on private.merch_held_net_allocations
 for each row execute function private.hold_unverified_commerce_tax_fee();
create trigger auction_tax_service_fee_hold before insert on private.auction_held_net_allocations
 for each row execute function private.hold_unverified_commerce_tax_fee();

alter function public.merch_order_projection_internal(public.merch_orders) rename to merch_order_projection_before_tax_readiness;
revoke all on function public.merch_order_projection_before_tax_readiness(public.merch_orders) from public,anon,authenticated,service_role;
create function public.merch_order_projection_internal(o public.merch_orders) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb; holds jsonb;
begin
 result:=public.merch_order_projection_before_tax_readiness(o);
 holds:=coalesce(result->'netSettlementHoldReasons','[]'::jsonb);
 if not holds ? 'tax_service_fee_unverified' then holds:=holds||'"tax_service_fee_unverified"'::jsonb; end if;
 return result||jsonb_build_object('netSettlementHoldReasons',holds,'taxServiceFeeMinor',null,
  'taxServiceFeeStatus','unverified','finalNetBaseMinor',null,'finalCreatorShareMinor',null,
  'financialAuthority',false);
end;
$$;
revoke all on function public.merch_order_projection_internal(public.merch_orders) from public,anon,authenticated,service_role;

alter function public.record_merch_provider_cost_observation(uuid,jsonb) rename to record_merch_provider_cost_before_tax_readiness;
alter function public.record_auction_platform_cost_observation(uuid,jsonb) rename to record_auction_platform_cost_before_tax_readiness;
revoke all on function public.record_merch_provider_cost_before_tax_readiness(uuid,jsonb),
 public.record_auction_platform_cost_before_tax_readiness(uuid,jsonb) from public,anon,authenticated,service_role;
create function private.commerce_tax_fee_held_result(p_result jsonb,p_facts jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare holds jsonb;
begin
 -- A guessed zero or 0.5% charge is not a provider-observed fee. This phase has
 -- no issuer of actual service-fee evidence; do not accept caller certification.
 if (p_facts ? 'tax_service_fee_minor' and p_facts->'tax_service_fee_minor' is distinct from 'null'::jsonb)
  or (p_facts ? 'tax_service_fee_status' and p_facts->>'tax_service_fee_status' is distinct from 'unverified')
 then raise exception 'tax_service_fee_evidence_unqualified'; end if;
 holds:=coalesce(p_result->'holdReasons','[]'::jsonb);
 if not holds ? 'tax_service_fee_unverified' then holds:=holds||'"tax_service_fee_unverified"'::jsonb; end if;
 return p_result||jsonb_build_object('holdReasons',holds,'taxServiceFeeMinor',null,'taxServiceFeeStatus','unverified',
  'finalNetBaseMinor',null,'finalCreatorShareMinor',null,'financialAuthority',false);
end;
$$;
revoke all on function private.commerce_tax_fee_held_result(jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.record_merch_provider_cost_observation(p_order_id uuid,p_facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform private.commerce_tax_fee_held_result('{}'::jsonb,p_facts);
 return private.commerce_tax_fee_held_result(public.record_merch_provider_cost_before_tax_readiness(p_order_id,p_facts),p_facts);
end;
$$;
create function public.record_auction_platform_cost_observation(p_contract_id uuid,p_facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform private.commerce_tax_fee_held_result('{}'::jsonb,p_facts);
 return private.commerce_tax_fee_held_result(public.record_auction_platform_cost_before_tax_readiness(p_contract_id,p_facts),p_facts);
end;
$$;
revoke all on function public.record_merch_provider_cost_observation(uuid,jsonb),public.record_auction_platform_cost_observation(uuid,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.record_merch_provider_cost_observation(uuid,jsonb),public.record_auction_platform_cost_observation(uuid,jsonb) to service_role;

alter function private.creator_auction_held_projection(private.auction_platform_settlement_contracts)
 rename to creator_auction_held_projection_before_tax_readiness;
revoke all on function private.creator_auction_held_projection_before_tax_readiness(private.auction_platform_settlement_contracts)
 from public,anon,authenticated,service_role;
create function private.creator_auction_held_projection(c private.auction_platform_settlement_contracts) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.commerce_tax_fee_held_result(private.creator_auction_held_projection_before_tax_readiness(c),'{}'::jsonb);
$$;
revoke all on function private.creator_auction_held_projection(private.auction_platform_settlement_contracts) from public,anon,authenticated,service_role;

-- Standalone web test checkout. Source only; no configuration or enablement.
begin;
create table private.stripe_paid_video_orders (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null, session_id uuid not null,
 video_id uuid not null, creator_id uuid not null, price_id uuid not null, price_revision bigint not null,
 amount_minor integer not null check(amount_minor>0), currency text not null check(currency='usd'),
 environment text not null default 'sandbox' check(environment='sandbox'),
 stripe_account_id text not null check(stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
 stripe_product_id text not null check(stripe_product_id ~ '^prod_[A-Za-z0-9]+$'),
 request_id uuid not null, status text not null default 'prepared'
 check(status in ('prepared','dispatched','checkout_ready','paid','refunded','held','failed')),
 checkout_session_id text unique, payment_intent_id text unique, charge_id text unique,
 access_grant_id uuid, tax_policy_id uuid,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 unique(buyer_id,request_id)
);
-- Financial snapshots deliberately have no cascading source-video/price FKs.
create table private.stripe_paid_video_observations (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references private.stripe_paid_video_orders(id),
 event_id text not null unique, kind text not null check(kind in ('paid','refund')),
 checkout_session_id text not null, payment_intent_id text not null, charge_id text not null,
 amount_minor integer not null check(amount_minor>0), refund_amount_minor integer not null default 0
 check(refund_amount_minor>=0 and refund_amount_minor<=amount_minor), currency text not null check(currency='usd'),
 stripe_account_id text not null, facts jsonb not null default '{}', received_at timestamptz not null default clock_timestamp()
);
alter table private.stripe_paid_video_orders enable row level security;
alter table private.stripe_paid_video_orders force row level security;
alter table private.stripe_paid_video_observations enable row level security;
alter table private.stripe_paid_video_observations force row level security;
revoke all on private.stripe_paid_video_orders,private.stripe_paid_video_observations from public,anon,authenticated,service_role;
create trigger stripe_video_observation_immutable before update or delete on private.stripe_paid_video_observations
 for each row execute function private.guard_event_ticket_terms_immutable();

create function private.stripe_video_source_current(p_video_id uuid,p_creator_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.videos v where v.id=p_video_id and v.owner_id=p_creator_id
 and v.visibility='public' and coalesce(v.moderation_status,'clean') in ('clean','reported')
 and v.quarantined_at is null and v.scan_status='clean')
 and public.wave1_creator_money_subject_authorized_internal(p_creator_id)
$$;
revoke all on function private.stripe_video_source_current(uuid,uuid) from public,anon,authenticated,service_role;

create function private.stripe_video_access_current(p_buyer_id uuid,p_video_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.stripe_paid_video_orders o join public.access_grants g on g.id=o.access_grant_id
 where o.buyer_id=p_buyer_id and o.video_id=p_video_id and o.status='paid'
 and g.user_id=o.buyer_id and g.source_id=o.video_id and g.provider='stripe_connect'
 and g.grant_type='paid_content_access' and g.environment='sandbox' and g.status='sandbox_only'
 and g.revoked_at is null and g.refunded_at is null and g.starts_at<=now()
 and (g.expires_at is null or g.expires_at>now())
 and private.stripe_video_source_current(o.video_id,o.creator_id))
$$;
revoke all on function private.stripe_video_access_current(uuid,uuid) from public,anon,authenticated,service_role;

create function public.resolve_stripe_sandbox_video_access(p_video_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p private.stripe_paid_video_prices; allowed boolean:=false;
begin
 select * into p from private.stripe_paid_video_prices where video_id=p_video_id;
 if p.id is null then return jsonb_build_object('available',false,'canAccess',false,'checkoutAllowed',false,'videoId',p_video_id,'reason','stripe_price_not_configured'); end if;
 if auth.uid() is null or not public.wave1_current_caller_authority_internal()
 or not private.stripe_video_source_current(p.video_id,p.creator_id) then
 return jsonb_build_object('available',true,'canAccess',false,'checkoutAllowed',false,'reason','content_unavailable'); end if;
 allowed:=auth.uid()=p.creator_id or private.stripe_video_access_current(auth.uid(),p_video_id);
 return jsonb_build_object('available',true,'canAccess',allowed,'checkoutAllowed',not allowed and p.status='sandbox' and private.stripe_video_delivery_ready(p.video_id),
 'reason',case when allowed then 'sandbox_grant' when p.status='paused' then 'offer_paused' else 'purchase_required' end,
 'videoId',p.video_id,'creatorId',p.creator_id,'priceId',p.id,'priceRevision',p.revision,
 'amountMinor',p.amount_minor,'currency',p.currency,'environment','sandbox','provider','stripe');
end $$;
revoke all on function public.resolve_stripe_sandbox_video_access(uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_stripe_sandbox_video_access(uuid) to authenticated;

-- Presence of a Stripe offer never turns a paid video into an old free route.
alter function public.resolve_creator_content_access(text,uuid) rename to resolve_creator_content_access_before_stripe_video;
revoke all on function public.resolve_creator_content_access_before_stripe_video(text,uuid) from public,anon,authenticated,service_role;
create function public.resolve_creator_content_access(p_content_type text,p_content_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare legacy jsonb;
begin
 if p_content_type='creator_video' and exists(select 1 from private.stripe_paid_video_prices where video_id=p_content_id) then
 legacy:=public.resolve_creator_content_access_before_stripe_video(p_content_type,p_content_id);
 if legacy->>'allowed'='true' and legacy->>'reason' in ('active_grant','sandbox_grant','active_creator_subscription','owner_or_admin_preview') then return legacy; end if;
 return jsonb_build_object('allowed',false,'reason','stripe_sandbox_protected_delivery_required','requiresPurchase',true,
 'stripeSandboxDeliveryOnly',true);
 end if;
 return public.resolve_creator_content_access_before_stripe_video(p_content_type,p_content_id);
end $$;
revoke all on function public.resolve_creator_content_access(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_creator_content_access(text,uuid) to anon,authenticated;

create function public.prepare_stripe_sandbox_video_order(p_buyer_id uuid,p_session_id uuid,p_video_id uuid,p_request_id uuid,
 p_account_id text,p_product_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.stripe_paid_video_prices; o private.stripe_paid_video_orders;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id) then raise exception 'buyer_authority_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('stripe-video:'||p_buyer_id::text||':'||p_video_id::text,0));
 select * into p from private.stripe_paid_video_prices where video_id=p_video_id for share;
 if p.id is null or p.status<>'sandbox' or p.creator_id=p_buyer_id
 or not private.stripe_video_source_current(p.video_id,p.creator_id) then raise exception 'video_offer_unavailable'; end if;
 update private.stripe_paid_video_orders set status='failed' where buyer_id=p_buyer_id and video_id=p_video_id
 and status='prepared' and expires_at<=clock_timestamp();
 select * into o from private.stripe_paid_video_orders where buyer_id=p_buyer_id and request_id=p_request_id for update;
 if o.id is not null then
 if o.video_id<>p_video_id or o.session_id<>p_session_id then raise exception 'request_identity_mismatch'; end if;
 return to_jsonb(o); end if;

 if exists(select 1 from private.stripe_paid_video_orders where buyer_id=p_buyer_id and video_id=p_video_id
 and status in ('prepared','dispatched','checkout_ready','paid')) then raise exception 'existing_order_requires_reconciliation'; end if;
 insert into private.stripe_paid_video_orders(buyer_id,session_id,video_id,creator_id,price_id,price_revision,amount_minor,currency,
 stripe_account_id,stripe_product_id,request_id,expires_at)
 values(p_buyer_id,p_session_id,p.video_id,p.creator_id,p.id,p.revision,p.amount_minor,p.currency,p_account_id,p_product_id,
 p_request_id,clock_timestamp()+interval '60 minutes') returning * into o;
 return to_jsonb(o);
end $$;
revoke all on function public.prepare_stripe_sandbox_video_order(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_stripe_sandbox_video_order(uuid,uuid,uuid,uuid,text,text) to service_role;

create function public.read_stripe_sandbox_video_order(p_order_id uuid,p_buyer_id uuid,p_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders;
begin
 if auth.role() is distinct from 'service_role' or not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id)
 then raise exception 'buyer_authority_required'; end if;
 update private.stripe_paid_video_orders set status='failed' where id=p_order_id and buyer_id=p_buyer_id
 and status='prepared' and expires_at<=clock_timestamp();
 select * into o from private.stripe_paid_video_orders where id=p_order_id and buyer_id=p_buyer_id;
 if o.id is null then raise exception 'order_unavailable'; end if;
 return to_jsonb(o)||jsonb_build_object('canAccess',private.stripe_video_access_current(p_buyer_id,o.video_id));
end $$;
revoke all on function public.read_stripe_sandbox_video_order(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_stripe_sandbox_video_order(uuid,uuid,uuid) to service_role;
-- Paid-video tax is its own domain, never the auction fallback.
alter table private.commerce_tax_qualifications drop constraint commerce_tax_qualifications_feature_check;
alter table private.commerce_tax_qualifications add constraint commerce_tax_qualifications_feature_check
 check(feature in ('physical_merch','event_auction','room_auction','paid_video'));
create function public.bind_stripe_video_tax_checkout_policy(p_feature text,p_identity_id uuid,p_product_id text,
 p_account_id text,p_environment text,p_permitted_scope text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q private.commerce_tax_qualifications; b private.commerce_tax_checkout_bindings;
 reason text; expected_scope text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 expected_scope:=case when p_feature='physical_merch' then 'US_all_destinations' else 'worldwide' end;
 if p_feature is null or p_feature <> 'paid_video'
  or p_identity_id is null or p_product_id is null or p_account_id is null
  or p_permitted_scope is distinct from expected_scope
  or (p_feature='physical_merch' and p_environment is distinct from 'sandbox')
  or (p_feature<>'physical_merch' and p_environment is distinct from 'test')
 then return jsonb_build_object('ready',false,'reason','tax_checkout_identity_invalid'); end if;
 if not exists(select 1 from private.stripe_paid_video_orders o where o.id=p_identity_id
 and o.stripe_product_id=p_product_id and o.stripe_account_id=p_account_id and o.environment='sandbox') then
 return jsonb_build_object('ready',false,'reason','tax_checkout_identity_invalid'); end if;
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
revoke all on function public.bind_stripe_video_tax_checkout_policy(text,uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.bind_stripe_video_tax_checkout_policy(text,uuid,text,text,text,text) to service_role;


create function public.dispatch_stripe_sandbox_video_order(p_order_id uuid,p_buyer_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders; tax jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into o from private.stripe_paid_video_orders where id=p_order_id for update;
 if o.id is null or o.buyer_id<>p_buyer_id or o.session_id<>p_session_id or o.status<>'prepared'
 or o.expires_at<=clock_timestamp() or not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id)
 or not private.stripe_video_source_current(o.video_id,o.creator_id) or not private.stripe_video_delivery_ready(o.video_id)
 or not exists(select 1 from private.stripe_paid_video_prices p where p.id=o.price_id and p.revision=o.price_revision
 and p.status='sandbox' and p.amount_minor=o.amount_minor and p.currency=o.currency)
 then raise exception 'checkout_dispatch_unavailable'; end if;
 tax:=public.bind_stripe_video_tax_checkout_policy('paid_video',o.id,o.stripe_product_id,o.stripe_account_id,'test','worldwide');
 if tax->>'ready' is distinct from 'true' then raise exception 'tax_qualification_required'; end if;
 update private.stripe_paid_video_orders set status='dispatched',tax_policy_id=(tax->>'policyId')::uuid where id=o.id;
 return to_jsonb(o)||jsonb_build_object('tax',tax);
end $$;
revoke all on function public.dispatch_stripe_sandbox_video_order(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.dispatch_stripe_sandbox_video_order(uuid,uuid,uuid) to service_role;

-- A lost create response stays dispatched/unknown: never create another charge.
create function public.attach_stripe_sandbox_video_session(p_order_id uuid,p_checkout_session_id text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_checkout_session_id is null or p_checkout_session_id !~ '^cs_test_[A-Za-z0-9]+$' then raise exception 'test_session_required'; end if;
 update private.stripe_paid_video_orders set checkout_session_id=p_checkout_session_id,status='checkout_ready'
 where id=p_order_id and status='dispatched' and checkout_session_id is null;
 if not found and not exists(select 1 from private.stripe_paid_video_orders where id=p_order_id and checkout_session_id=p_checkout_session_id)
 then raise exception 'session_binding_conflict'; end if;
end $$;
revoke all on function public.attach_stripe_sandbox_video_session(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.attach_stripe_sandbox_video_session(uuid,text) to service_role;

create function public.observe_stripe_sandbox_video_payment(p_order_id uuid,p_event_id text,p_facts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders; observation_id uuid; money_id uuid; provider_id uuid; grant_id uuid;
 refund_amount integer; v_kind text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into o from private.stripe_paid_video_orders where id=p_order_id for update;
 if o.id is null or o.checkout_session_id is null then raise exception 'order_not_bound'; end if;
 if p_facts->>'livemode' is distinct from 'false' or p_facts->>'accountId' is distinct from o.stripe_account_id
 or p_facts->>'checkoutSessionId' is distinct from o.checkout_session_id
 or p_facts->>'orderId' is distinct from o.id::text or p_facts->>'buyerId' is distinct from o.buyer_id::text
 or p_facts->>'videoId' is distinct from o.video_id::text or p_facts->>'productId' is distinct from o.stripe_product_id
 or p_facts->>'currency' is distinct from o.currency or (p_facts->>'amountMinor')::integer is distinct from o.amount_minor
 or p_facts->>'paymentStatus' is distinct from 'paid' or p_facts->>'paymentIntentStatus' is distinct from 'succeeded'
 or p_facts->>'platformHeld' is distinct from 'true' or p_facts->>'chargePaid' is distinct from 'true'
 or coalesce(p_facts->>'paymentIntentId','') !~ '^pi_[A-Za-z0-9]+$'
 or coalesce(p_facts->>'chargeId','') !~ '^ch_[A-Za-z0-9]+$'
 or (o.payment_intent_id is not null and o.payment_intent_id<>p_facts->>'paymentIntentId')
 or (o.charge_id is not null and o.charge_id<>p_facts->>'chargeId')
 then raise exception 'payment_identity_mismatch'; end if;
 refund_amount:=(p_facts->>'refundAmountMinor')::integer;
 if refund_amount is null or refund_amount<0 or refund_amount>o.amount_minor then raise exception 'refund_amount_invalid'; end if;
 v_kind:=case when refund_amount>0 then 'refund' else 'paid' end;
 if o.status in ('refunded','held') and v_kind='paid' then return jsonb_build_object('status',o.status); end if;
 if exists(select 1 from private.stripe_paid_video_observations obs where obs.order_id=o.id and
 ((obs.kind='paid' and refund_amount=0) or obs.refund_amount_minor>=refund_amount and refund_amount>0))
 then return jsonb_build_object('status',o.status); end if;
 update private.stripe_paid_video_orders set payment_intent_id=p_facts->>'paymentIntentId',charge_id=p_facts->>'chargeId' where id=o.id;
 -- If our first verified read is already refunded, recognize the paid gross
 -- and its cumulative reversal in this SAME transaction; never expose access.
 if v_kind='refund' and not exists(select 1 from private.stripe_paid_video_observations obs where obs.order_id=o.id and obs.kind='paid') then
 insert into private.stripe_paid_video_observations(order_id,event_id,kind,checkout_session_id,payment_intent_id,charge_id,
 amount_minor,refund_amount_minor,currency,stripe_account_id,facts)
 values(o.id,p_event_id||':paid-gross','paid',o.checkout_session_id,p_facts->>'paymentIntentId',p_facts->>'chargeId',o.amount_minor,
 0,o.currency,o.stripe_account_id,p_facts) returning id into observation_id;
 perform private.record_stripe_paid_video_held_earning(o.id,observation_id);
 end if;
 insert into private.stripe_paid_video_observations(order_id,event_id,kind,checkout_session_id,payment_intent_id,charge_id,
 amount_minor,refund_amount_minor,currency,stripe_account_id,facts)
 values(o.id,p_event_id,v_kind,o.checkout_session_id,p_facts->>'paymentIntentId',p_facts->>'chargeId',o.amount_minor,
 refund_amount,o.currency,o.stripe_account_id,p_facts) returning id into observation_id;
 update private.stripe_paid_video_orders set payment_intent_id=p_facts->>'paymentIntentId',charge_id=p_facts->>'chargeId' where id=o.id;
 money_id:=private.record_stripe_paid_video_held_earning(o.id,observation_id);
 select provider_event_id into provider_id from public.money_access_ledger_events where id=money_id;
 if v_kind='paid' and o.access_grant_id is null then
 insert into public.access_grants(user_id,grant_type,source_type,source_id,provider,provider_event_id,environment,status,metadata)
 values(o.buyer_id,'paid_content_access','provider_event',o.video_id,'stripe_connect',provider_id,'sandbox','sandbox_only',
 jsonb_build_object('stripe_video_order_id',o.id)) returning id into grant_id;
 else grant_id:=o.access_grant_id; end if;
 if v_kind='refund' then update public.access_grants set status='refunded',refunded_at=clock_timestamp()
 where id=grant_id; end if;
 update private.stripe_paid_video_orders set status=case v_kind when 'paid' then 'paid' else 'refunded' end,
 payment_intent_id=p_facts->>'paymentIntentId',charge_id=p_facts->>'chargeId',access_grant_id=grant_id where id=o.id;
 return jsonb_build_object('status',case v_kind when 'paid' then 'paid' else 'refunded' end);
end $$;
revoke all on function public.observe_stripe_sandbox_video_payment(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.observe_stripe_sandbox_video_payment(uuid,text,jsonb) to service_role;
create function public.read_stripe_sandbox_video_webhook_order(p_object_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into o from private.stripe_paid_video_orders where checkout_session_id=p_object_id
 or payment_intent_id=p_object_id or charge_id=p_object_id;
 return case when o.id is null then null else to_jsonb(o) end;
end $$;
revoke all on function public.read_stripe_sandbox_video_webhook_order(text) from public,anon,authenticated,service_role;
grant execute on function public.read_stripe_sandbox_video_webhook_order(text) to service_role;
create function public.hold_stripe_sandbox_video_order(p_order_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 update private.stripe_paid_video_orders set status='held' where id=p_order_id and status<>'refunded';
 -- Deliberately no invented refund/fee amount and no restored access on replay.
 update public.access_grants set status='revoked',revoked_at=clock_timestamp(),revoke_reason='stripe_video_provider_hold'
 where id=(select access_grant_id from private.stripe_paid_video_orders where id=p_order_id) and revoked_at is null;
end $$;
revoke all on function public.hold_stripe_sandbox_video_order(uuid) from public,anon,authenticated,service_role;
grant execute on function public.hold_stripe_sandbox_video_order(uuid) to service_role;
create function public.expire_stripe_sandbox_video_order(p_order_id uuid,p_checkout_session_id text,p_intent_status text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_intent_status not in ('absent','canceled') or p_intent_status is null then raise exception 'expired_payment_not_terminal'; end if;
 update private.stripe_paid_video_orders set status='failed' where id=p_order_id and checkout_session_id=p_checkout_session_id
 and status='checkout_ready' and access_grant_id is null
 and not exists(select 1 from private.stripe_paid_video_observations obs where obs.order_id=p_order_id);
end $$;
revoke all on function public.expire_stripe_sandbox_video_order(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.expire_stripe_sandbox_video_order(uuid,text,text) to service_role;
commit;

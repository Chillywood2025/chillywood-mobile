-- Dormant access-only reconciliation. Provider refunds/earnings are not reversed.
alter table private.revenuecat_nonpurchase_reconciliation
 add column occurred_at timestamptz,
 add column provider_product_id text,
 add column provider_base_plan_id text,
 add column lease uuid,
 add column lease_until timestamptz,
 add column claimed_binding jsonb,
 add column attempts integer not null default 0,
 add column next_attempt_at timestamptz not null default clock_timestamp();
create index revenuecat_nonpurchase_due on private.revenuecat_nonpurchase_reconciliation(state,next_attempt_at,received_at);
create table private.revenuecat_snapshot_worker_modes(
 environment text primary key check(environment in('sandbox','production')),
 enabled boolean not null default false,
 project_id text,
 qualification_hash text check(qualification_hash~'^[0-9a-f]{64}$'),
 qualified_at timestamptz
);
insert into private.revenuecat_snapshot_worker_modes(environment) values('sandbox'),('production');
create table private.revenuecat_nonpurchase_snapshot_receipts(
 event_id text primary key references private.revenuecat_nonpurchase_reconciliation(event_id),
 snapshot_hash text not null check(snapshot_hash~'^[0-9a-f]{64}$'),
 project_id text not null, observed_at timestamptz not null,
 subscription_id text not null,current_transaction_id text not null,
 previous_binding jsonb not null,previous_entitlement jsonb not null,previous_grant jsonb not null,
 projected_event_id uuid not null references public.provider_events(id),
 created_at timestamptz not null default clock_timestamp()
);
alter table private.revenuecat_snapshot_worker_modes enable row level security;
alter table private.revenuecat_snapshot_worker_modes force row level security;
alter table private.revenuecat_nonpurchase_snapshot_receipts enable row level security;
alter table private.revenuecat_nonpurchase_snapshot_receipts force row level security;
revoke all on private.revenuecat_snapshot_worker_modes,private.revenuecat_nonpurchase_snapshot_receipts from public,anon,authenticated,service_role;

create function private.revenuecat_snapshot_mode_allowed(p_environment text,p_project text) returns boolean
language sql volatile set search_path='' as $$
 select exists(select 1 from private.revenuecat_snapshot_worker_modes where environment=p_environment
  and enabled and project_id=p_project and nullif(p_project,'') is not null
  and (p_environment='sandbox' or (qualification_hash is not null and qualified_at is not null
   and qualified_at<=clock_timestamp() and qualified_at>clock_timestamp()-interval '30 days')))
$$;
create function public.claim_revenuecat_nonpurchase_snapshot(p_environment text,p_project_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.revenuecat_nonpurchase_reconciliation;b public.revenuecat_premium_transaction_authority;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 if not private.revenuecat_snapshot_mode_allowed(p_environment,p_project_id) then return null;end if;
 select * into j from private.revenuecat_nonpurchase_reconciliation where state='pending' and environment=p_environment
  and next_attempt_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp())
  order by next_attempt_at,received_at,event_id limit 1 for update skip locked;
 if j.event_id is null then return null;end if;
 select * into b from public.revenuecat_premium_transaction_authority where provider=j.provider and original_transaction_id=j.original_transaction_id;
 if j.occurred_at is null or j.provider_product_id is null or b.id is null
  or b.user_id is distinct from j.user_id or b.environment is distinct from j.environment
  or b.current_provider_product_id is distinct from j.provider_product_id
  or b.current_provider_base_plan_id is distinct from j.provider_base_plan_id
  or j.provider not in('revenuecat_app_store','revenuecat_google_play')
  or (j.event_type='REFUND_REVERSED' and j.provider<>'revenuecat_app_store') then
  update private.revenuecat_nonpurchase_reconciliation set next_attempt_at=clock_timestamp()+interval '1 hour',reason='exact_pending_subscription_facts_required' where event_id=j.event_id;
  return null;
 end if;
 update private.revenuecat_nonpurchase_reconciliation set lease=extensions.gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',
  claimed_binding=to_jsonb(b),attempts=least(attempts+1,1000000),next_attempt_at=clock_timestamp()+interval '5 minutes'
  where event_id=j.event_id returning * into j;
 return to_jsonb(j)||jsonb_build_object('project_id',p_project_id);
end $$;
create function public.defer_revenuecat_nonpurchase_snapshot(p_event_id text,p_lease uuid,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 update private.revenuecat_nonpurchase_reconciliation set lease=null,lease_until=null,
  next_attempt_at=clock_timestamp()+interval '5 minutes',reason=case when p_reason in('snapshot_changed','snapshot_ineligible','provider_unavailable','history_incomplete') then p_reason else 'provider_snapshot_not_confirmed' end
  where event_id=p_event_id and lease=p_lease and state='pending';
 return found;
end $$;

create function public.complete_revenuecat_nonpurchase_snapshot(p_event_id text,p_lease uuid,p_snapshot jsonb,p_snapshot_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.revenuecat_nonpurchase_reconciliation;b public.revenuecat_premium_transaction_authority;
 e public.user_entitlements;g public.access_grants;a public.provider_events;p public.monetization_products;
 observed timestamptz;starts timestamptz;expires timestamptz;projected uuid;snapshot_id text;rail text;webhook text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 -- Read identity first, then follow existing App Store / original / quarantine
 -- lock order before locking the pending row. Completion rechecks everything.
 select * into j from private.revenuecat_nonpurchase_reconciliation where event_id=p_event_id;
 if j.event_id is null then raise exception 'snapshot_job_missing';end if;
 if j.provider='revenuecat_app_store' and j.environment='sandbox' then
  perform public.lock_revenuecat_premium_owner_users_internal(j.user_id,j.user_id);
  perform public.lock_revenuecat_premium_quarantine_scopes_internal(j.provider,j.user_id,j.environment);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('revenuecat-premium-event-id:'||p_event_id,0));
 perform pg_advisory_xact_lock(hashtextextended('revenuecat-original:'||j.provider||':'||j.original_transaction_id,0));
 perform pg_advisory_xact_lock(hashtextextended('revenuecat-premium-original:'||j.provider||':'||j.original_transaction_id,0));
 perform public.lock_revenuecat_premium_quarantine_scopes_internal(j.provider,j.user_id,j.environment);
 perform 1 from private.revenuecat_snapshot_worker_modes where environment=j.environment for share;
 select * into j from private.revenuecat_nonpurchase_reconciliation where event_id=p_event_id for update;
 if j.state='applied' and exists(select 1 from private.revenuecat_nonpurchase_snapshot_receipts where event_id=p_event_id and snapshot_hash=p_snapshot_hash) then
  return jsonb_build_object('status','applied','duplicate',true,'financialAuthority',false);end if;
 if j.state<>'pending' or j.lease is null or p_lease is null or j.lease_until is null
  or j.lease is distinct from p_lease or j.lease_until<=clock_timestamp()
  or not private.revenuecat_snapshot_mode_allowed(j.environment,p_snapshot->>'projectId') then raise exception 'snapshot_lease_or_mode_invalid';end if;
 select * into b from public.revenuecat_premium_transaction_authority where provider=j.provider and original_transaction_id=j.original_transaction_id for update;
 if to_jsonb(b) is distinct from j.claimed_binding or b.user_id is distinct from j.user_id
  or b.environment is distinct from j.environment or j.occurred_at is null
  or j.occurred_at<=b.latest_occurred_at or j.occurred_at>clock_timestamp()+interval '5 minutes'
  or public.is_account_access_restricted(j.user_id::text)
  or not exists(select 1 from auth.users where id=j.user_id and deleted_at is null)
  or public.revenuecat_authority_quarantined_internal(j.provider,j.user_id,j.environment)
  or exists(select 1 from public.revenuecat_consumable_transaction_intents where provider=j.provider and original_transaction_id=j.original_transaction_id)
  or exists(select 1 from public.revenuecat_unbound_initial_authority where provider=j.provider and original_transaction_id=j.original_transaction_id)
  or exists(select 1 from public.revenuecat_unbound_terminal_authority where provider=j.provider and original_transaction_id=j.original_transaction_id)
  or exists(select 1 from public.provider_events where provider=j.provider and user_id=j.user_id and environment=j.environment
   and metadata->>'original_transaction_id'=j.original_transaction_id and occurred_at>=j.occurred_at
   and event_type in('REFUND','REVOCATION','EXPIRATION','SUBSCRIPTION_PAUSED'))
 then raise exception 'snapshot_binding_changed';end if;
 observed:=(p_snapshot->>'observedAt')::timestamptz;starts:=(p_snapshot->>'startsAt')::timestamptz;expires:=(p_snapshot->>'expiresAt')::timestamptz;
 if p_snapshot->>'contract' is distinct from 'rc-exact-current-subscription-v1'
  or p_snapshot->>'customerId' is distinct from j.user_id::text or p_snapshot->>'originalCustomerId' is distinct from j.user_id::text
  or p_snapshot->>'environment' is distinct from j.environment
  or p_snapshot->>'store' is distinct from (case when j.provider='revenuecat_app_store' then 'app_store' else 'play_store' end)
  or p_snapshot->>'originalTransactionId' is distinct from j.original_transaction_id
  or p_snapshot->>'productIdentifier' is distinct from b.current_provider_product_id
  or p_snapshot->>'basePlanId' is distinct from b.current_provider_base_plan_id
  or p_snapshot->>'status' is distinct from 'active' or p_snapshot->>'givesAccess' is distinct from 'true'
  or p_snapshot->>'ownership' is distinct from 'purchased' or p_snapshot->>'pendingPayment' is distinct from 'false'
  or coalesce(p_snapshot->>'subscriptionId','')!~'^[A-Za-z0-9_.:-]+$' or length(p_snapshot->>'subscriptionId')>512
  or coalesce(p_snapshot->>'currentTransactionId','')!~'^[A-Za-z0-9_.:-]+$' or length(p_snapshot->>'currentTransactionId')>512
  or coalesce(p_snapshot_hash,'')!~'^[0-9a-f]{64}$'
  or observed is null or not isfinite(observed) or observed<clock_timestamp()-interval '2 minutes' or observed>clock_timestamp()
  or observed<j.occurred_at or observed<j.lease_until-interval '2 minutes'
  or starts is null or not isfinite(starts) or starts>clock_timestamp()
  or expires is null or not isfinite(expires) or expires<=clock_timestamp() or expires<=starts
 then raise exception 'snapshot_facts_invalid';end if;
 select state into rail from public.platform_money_kill_switches where key=j.provider||'_enabled' for share;
 select state into webhook from public.platform_money_kill_switches where key='provider_webhooks_enabled' for share;
 if coalesce(rail,'off') not in('sandbox_only','on') or coalesce(webhook,'off') not in('sandbox_only','on')
  or (j.environment='production' and (rail<>'on' or webhook<>'on')) then raise exception 'snapshot_rail_disabled';end if;
 if j.environment='sandbox' and exists(select 1 from public.platform_money_kill_switches
  where key in('live_money_enabled','payouts_enabled','cashout_enabled') and state<>'off') then raise exception 'snapshot_sandbox_money_must_stay_off';end if;
 lock table public.monetization_products in share mode;
 lock table public.monetization_product_store_mappings in share mode;
 select * into p from public.monetization_products where id=b.current_product_id;
 if p.product_type is distinct from 'premium_subscription'
  or (j.provider='revenuecat_google_play' and p.status is distinct from (case when j.environment='sandbox' then 'sandbox' else 'active' end))
  or (j.provider='revenuecat_app_store' and (p.product_key is distinct from 'premium_subscription_store_catalog'
    or p.provider is distinct from 'internal_setup' or p.environment is distinct from 'setup' or p.status is distinct from 'setup'
    or p.metadata->>'conceptual_store_catalog' is distinct from 'true'))
 then raise exception 'snapshot_product_not_ready';end if;
 if j.provider='revenuecat_app_store' then
  if (select count(*) from public.monetization_product_store_mappings m where m.product_id=p.id and m.provider=j.provider
    and m.provider_product_id=b.current_provider_product_id and m.provider_base_plan_id is null
    and m.environment=j.environment and m.status=case when j.environment='sandbox' then 'sandbox' else 'active' end
    and m.concept='premium' and m.platform='ios' and m.store='app_store' and m.store_product_type='auto_renewable_subscription'
    and m.unlocks_digital_access and not m.grants_livekit_authority and not m.creates_payable_balance)<>1
   then raise exception 'snapshot_product_not_ready';end if;
 elsif p.provider is distinct from j.provider or p.environment is distinct from j.environment
  or p.provider_product_id is distinct from b.current_provider_product_id or p.provider_base_plan_id is distinct from b.current_provider_base_plan_id
  then raise exception 'snapshot_product_not_ready';end if;
 select * into a from public.provider_events where provider=j.provider and provider_event_id=b.latest_event_id
  and raw_payload_hash=b.latest_event_hash and user_id=j.user_id and product_id=b.current_product_id
  and environment=j.environment and metadata->>'original_transaction_id'=j.original_transaction_id
  and metadata->>'premium_transaction_binding_id'=b.id::text;
 select * into e from public.user_entitlements where user_id=j.user_id::text and entitlement_key='premium' for update;
 select * into g from public.access_grants where user_id=j.user_id and product_id=b.current_product_id and grant_type='premium' for update;
 if a.id is null or e.user_id is null or g.id is null
  or (select count(*) from public.access_grants where user_id=j.user_id and product_id=b.current_product_id and grant_type='premium')<>1
  or e.source is distinct from 'revenuecat' or e.metadata->>'revenuecat_event_id' is distinct from a.provider_event_id
  or e.metadata->>'revenuecat_event_hash' is distinct from a.raw_payload_hash or e.metadata->>'environment' is distinct from j.environment
  or g.provider is distinct from j.provider or g.environment is distinct from j.environment or g.provider_event_id is distinct from a.id
  or g.source_type is distinct from 'provider_event' or g.starts_at is distinct from e.starts_at or g.expires_at is distinct from e.expires_at
 then raise exception 'snapshot_access_graph_mismatch';end if;
 if j.event_type='REFUND_REVERSED' then
  if j.provider<>'revenuecat_app_store' or b.authority_state<>'financial_terminal' or b.latest_event_type<>'REFUND'
   or a.event_type<>'REFUND' or a.status<>'refunded' or e.status<>'revoked' or e.revoked_at is distinct from a.occurred_at
   or g.status<>'refunded' or g.refunded_at is distinct from a.occurred_at or g.revoked_at is distinct from a.occurred_at
   or g.revoke_reason is distinct from 'RevenueCat refund terminal dispatch.'
   or g.metadata->>'terminal_dispatch_domain' is distinct from 'premium'
   or g.metadata->>'latest_provider_event_id' is distinct from a.id::text
   or g.metadata->>'original_transaction_id' is distinct from j.original_transaction_id
  then raise exception 'snapshot_exact_refund_marker_required';end if;
 else
  if b.authority_state not in('active','retained') or a.status<>'processed'
   or e.status not in('active','trialing','grace_period') or e.revoked_at is not null
   or g.refunded_at is not null or g.revoked_at is not null
   or starts is distinct from e.starts_at or expires<=e.expires_at
  then raise exception 'snapshot_exact_extension_marker_required';end if;
 end if;
 snapshot_id:='rc-pending:'||p_lease::text;
 insert into public.provider_events(provider_event_id,provider,product_id,product_key,user_id,app_user_id,
  environment,event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata)
 values(snapshot_id,j.provider,p.id,p.product_key,j.user_id,j.user_id::text,j.environment,'RECONCILIATION','processed',observed,
  'RECONCILIATION:'||snapshot_id,p_snapshot_hash,jsonb_build_object('entitlement_key','premium',
   'provider_product_id',b.current_provider_product_id,'provider_base_plan_id',b.current_provider_base_plan_id,
   'original_transaction_id',j.original_transaction_id,'premium_transaction_binding_id',b.id,
   'previous_provider_event_id',a.id,'access_grant_id',g.id,'reconciliation_source','revenuecat_exact_pending_snapshot',
   'provider_snapshot_only',true,'provider_transaction_created',false,'money_ledger_created',false,
   'money_action',false,'payout_ready',false,'pending_event_id',j.event_id)) returning id into projected;
 -- Preserve the complete exact terminal/access graph before clearing only its
 -- access projection markers. Refund events and financial ledger remain intact.
 insert into private.revenuecat_nonpurchase_snapshot_receipts(event_id,snapshot_hash,project_id,observed_at,
  subscription_id,current_transaction_id,previous_binding,previous_entitlement,previous_grant,projected_event_id)
 values(j.event_id,p_snapshot_hash,p_snapshot->>'projectId',observed,p_snapshot->>'subscriptionId',p_snapshot->>'currentTransactionId',to_jsonb(b),to_jsonb(e),to_jsonb(g),projected);
 update public.user_entitlements set status='active',starts_at=starts,expires_at=expires,revoked_at=null,updated_at=clock_timestamp(),
  metadata=metadata||jsonb_build_object('revenuecat_event_id',snapshot_id,'revenuecat_event_hash',p_snapshot_hash,'revenuecat_event_type','RECONCILIATION')
  where user_id=j.user_id::text and entitlement_key='premium';
 update public.access_grants set provider_event_id=projected,source_id=projected,status=case when j.environment='sandbox' then 'sandbox_only' else 'active' end,
  starts_at=starts,expires_at=expires,refunded_at=null,revoked_at=null,revoke_reason=null,updated_at=clock_timestamp(),
  metadata=metadata||jsonb_build_object('latest_provider_event_id',projected,'lifecycle_event_type','RECONCILIATION',
   'access_snapshot_receipt',j.event_id,'financial_refund_reversed',false,'payout_access',false) where id=g.id;
 update public.revenuecat_premium_transaction_authority set latest_event_id=snapshot_id,latest_event_hash=p_snapshot_hash,
  latest_event_type='RECONCILIATION',latest_occurred_at=observed,latest_event_rank=3,authority_state='active',updated_at=clock_timestamp() where id=b.id;
 if expires<=clock_timestamp() or observed<clock_timestamp()-interval '2 minutes'
  or not public.premium_subject_has_finite_authority_internal(j.user_id::text) then raise exception 'snapshot_postcondition_failed';end if;
 update private.revenuecat_nonpurchase_reconciliation set state='applied',reason='exact_provider_access_snapshot',lease_until=null where event_id=j.event_id;
 return jsonb_build_object('status','applied','entitlementActive',true,'financialAuthority',false,'earningsCreated',false);
end $$;
revoke all on function private.revenuecat_snapshot_mode_allowed(text,text) from public,anon,authenticated,service_role;
revoke all on function public.claim_revenuecat_nonpurchase_snapshot(text,text),public.defer_revenuecat_nonpurchase_snapshot(text,uuid,text),public.complete_revenuecat_nonpurchase_snapshot(text,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_revenuecat_nonpurchase_snapshot(text,text),public.defer_revenuecat_nonpurchase_snapshot(text,uuid,text),public.complete_revenuecat_nonpurchase_snapshot(text,uuid,jsonb,text) to service_role;

-- Capture immutable typed event facts at ingress; historical rows remain pending.
create or replace function public.process_revenuecat_nonpurchase_lifecycle_atomic(
 p_provider text,p_provider_event_id text,p_event_type text,p_user_id uuid,
 p_provider_product_id text,p_provider_base_plan_id text,p_environment text,
 p_original_transaction_id text,p_starts_at timestamptz,p_expires_at timestamptz,
 p_occurred_at timestamptz,p_raw_payload_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.revenuecat_premium_transaction_authority; e public.user_entitlements;
 g public.access_grants; a public.provider_events; projected uuid; receipt jsonb;
 prior private.revenuecat_nonpurchase_reconciliation; rail text; webhook text;
begin
 if p_event_type not in ('SUBSCRIPTION_EXTENDED','REFUND_REVERSED') then
  raise exception 'nonpurchase_event_type_invalid'; end if;
 receipt:=public.reserve_revenuecat_webhook_ingress_event(p_provider_event_id,p_raw_payload_hash);
 select * into prior from private.revenuecat_nonpurchase_reconciliation where event_id=p_provider_event_id for update;
 if found then
  if prior.payload_hash is distinct from p_raw_payload_hash or prior.event_type is distinct from p_event_type
   or prior.provider is distinct from p_provider or prior.user_id is distinct from p_user_id
   or prior.original_transaction_id is distinct from p_original_transaction_id
   or prior.environment is distinct from p_environment
   or (prior.occurred_at is not null and (prior.occurred_at is distinct from p_occurred_at
    or prior.provider_product_id is distinct from p_provider_product_id
    or prior.provider_base_plan_id is distinct from p_provider_base_plan_id)) then raise exception 'nonpurchase_identity_mismatch'; end if;
  -- Historical receipts lacked these fields. Only a same-hash authenticated
  -- redelivery may fill them; absence alone is never synthesized authority.
  if prior.occurred_at is null and p_occurred_at is not null then
   update private.revenuecat_nonpurchase_reconciliation set occurred_at=p_occurred_at,
    provider_product_id=p_provider_product_id,provider_base_plan_id=p_provider_base_plan_id where event_id=p_provider_event_id;
  end if;
  return jsonb_build_object('status',prior.state,'reason',prior.reason,'duplicateEvent',true,
   'accessStateChanged',false,'authorityGranted',false,'financialAuthority',false);
 end if;
 insert into private.revenuecat_nonpurchase_reconciliation(event_id,payload_hash,event_type,provider,user_id,original_transaction_id,environment,occurred_at,provider_product_id,provider_base_plan_id)
 values(p_provider_event_id,p_raw_payload_hash,p_event_type,p_provider,p_user_id,p_original_transaction_id,p_environment,p_occurred_at,p_provider_product_id,p_provider_base_plan_id);
 -- Missing/ambiguous facts stay pending without revoking access or financial
 -- terminal markers. REFUND_REVERSED needs a fresh, exact provider snapshot.
 if p_event_type='REFUND_REVERSED' or p_provider not in ('revenuecat_app_store','revenuecat_google_play')
  or p_provider is null or p_user_id is null or p_environment not in ('sandbox','production') or p_environment is null
  or p_original_transaction_id is null or p_provider_product_id is null
  or p_starts_at is null or not isfinite(p_starts_at)
  or p_expires_at is null or not isfinite(p_expires_at) or p_expires_at<=clock_timestamp()
  or p_occurred_at is null or not isfinite(p_occurred_at) or p_occurred_at>clock_timestamp()+interval '5 minutes'
 then return jsonb_build_object('status','pending','reason','independent_provider_snapshot_required',
  'accessStateChanged',false,'authorityGranted',false,'financialAuthority',false); end if;
 if p_provider='revenuecat_app_store' and p_environment='sandbox' then
  perform public.lock_revenuecat_premium_owner_users_internal(p_user_id,p_user_id);
  perform public.lock_revenuecat_premium_quarantine_scopes_internal(p_provider,p_user_id,p_environment);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('revenuecat-premium-event-id:'||p_provider_event_id,0));
 perform pg_advisory_xact_lock(hashtextextended('revenuecat-original:'||p_provider||':'||p_original_transaction_id,0));
 perform pg_advisory_xact_lock(hashtextextended('revenuecat-premium-original:'||p_provider||':'||p_original_transaction_id,0));
 perform public.lock_revenuecat_premium_quarantine_scopes_internal(p_provider,p_user_id,p_environment);
 select * into b from public.revenuecat_premium_transaction_authority
 where provider=p_provider and original_transaction_id=p_original_transaction_id for update;
 select state into rail from public.platform_money_kill_switches where key=p_provider||'_enabled';
 select state into webhook from public.platform_money_kill_switches where key='provider_webhooks_enabled';
 if b.id is null or b.user_id<>p_user_id or b.environment<>p_environment
  or b.current_provider_product_id is distinct from p_provider_product_id
  or b.current_provider_base_plan_id is distinct from p_provider_base_plan_id
  or b.authority_state not in ('active','retained') or p_occurred_at<=b.latest_occurred_at
  or coalesce(rail,'off') not in ('on','sandbox_only') or coalesce(webhook,'off') not in ('on','sandbox_only')
  or (p_environment='production' and (rail<>'on' or webhook<>'on'))
  or public.is_account_access_restricted(p_user_id::text)
  or public.revenuecat_authority_quarantined_internal(p_provider,p_user_id,p_environment)
  or exists(select 1 from public.revenuecat_consumable_transaction_intents where provider=p_provider and original_transaction_id=p_original_transaction_id)
 then
  update private.revenuecat_nonpurchase_reconciliation set reason='exact_nonterminal_subscription_required' where event_id=p_provider_event_id;
  return jsonb_build_object('status','pending','reason','exact_nonterminal_subscription_required',
  'accessStateChanged',false,'authorityGranted',false,'financialAuthority',false); end if;
 select * into a from public.provider_events where provider=p_provider and provider_event_id=b.latest_event_id
  and raw_payload_hash=b.latest_event_hash and user_id=p_user_id and product_id=b.current_product_id
  and environment=p_environment and status='processed'
  and metadata->>'original_transaction_id'=p_original_transaction_id
  and metadata->>'premium_transaction_binding_id'=b.id::text;
 select * into e from public.user_entitlements where user_id=p_user_id::text and entitlement_key='premium' for update;
 select * into g from public.access_grants where user_id=p_user_id and product_id=b.current_product_id and grant_type='premium' for update;
 if a.id is null or e.user_id is null or g.id is null
  or (select count(*) from public.access_grants where user_id=p_user_id and product_id=b.current_product_id and grant_type='premium')<>1
  or e.source<>'revenuecat' or e.revoked_at is not null or e.status not in ('active','trialing','grace_period')
  or e.metadata->>'revenuecat_event_id' is distinct from a.provider_event_id
  or e.metadata->>'revenuecat_event_hash' is distinct from a.raw_payload_hash
  or e.metadata->>'environment' is distinct from p_environment
  or e.starts_at is distinct from p_starts_at or e.expires_at is null or not isfinite(e.expires_at)
  or p_expires_at<=e.expires_at or p_expires_at<=p_starts_at
  or g.provider is distinct from p_provider or g.environment is distinct from p_environment
  or g.provider_event_id is distinct from a.id or g.source_type<>'provider_event'
  or g.starts_at is distinct from e.starts_at or g.expires_at is distinct from e.expires_at
  or g.refunded_at is not null or g.revoked_at is not null
  or g.status is distinct from (case when p_environment='sandbox' then 'sandbox_only' else 'active' end)
 then
  update private.revenuecat_nonpurchase_reconciliation set reason='exact_finite_access_graph_required' where event_id=p_provider_event_id;
  return jsonb_build_object('status','pending','reason','exact_finite_access_graph_required',
  'accessStateChanged',false,'authorityGranted',false,'financialAuthority',false); end if;
 insert into public.provider_events(provider_event_id,provider,product_id,product_key,user_id,app_user_id,
  environment,event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata)
 values(p_provider_event_id,p_provider,a.product_id,a.product_key,p_user_id,p_user_id::text,p_environment,
  'SUBSCRIPTION_EXTENDED','processed',p_occurred_at,'SUBSCRIPTION_EXTENDED:'||p_provider_event_id,p_raw_payload_hash,
  jsonb_build_object('entitlement_key','premium','provider_product_id',p_provider_product_id,
   'provider_base_plan_id',p_provider_base_plan_id,'original_transaction_id',p_original_transaction_id,
   'premium_transaction_binding_id',b.id,'previous_provider_event_id',a.id,'access_grant_id',g.id,
   'provider_payload_stored',false,'money_action',false,'payout_ready',false,'money_ledger_created',false,
   'snapshot_starts_at',p_starts_at,'snapshot_expires_at',p_expires_at)) returning id into projected;
 update public.user_entitlements set expires_at=p_expires_at,updated_at=clock_timestamp(),
  metadata=metadata||jsonb_build_object('revenuecat_event_id',p_provider_event_id,
   'revenuecat_event_hash',p_raw_payload_hash,'revenuecat_event_type','SUBSCRIPTION_EXTENDED')
 where user_id=p_user_id::text and entitlement_key='premium';
 update public.access_grants set expires_at=p_expires_at,provider_event_id=projected,source_id=projected,
  updated_at=clock_timestamp(),metadata=metadata||jsonb_build_object('lifecycle_event_type','SUBSCRIPTION_EXTENDED',
   'latest_provider_event_id',projected,'authority_granted',false,'payout_access',false) where id=g.id;
 update public.revenuecat_premium_transaction_authority set latest_event_id=p_provider_event_id,
  latest_event_hash=p_raw_payload_hash,latest_event_type='SUBSCRIPTION_EXTENDED',latest_occurred_at=p_occurred_at,
  latest_event_rank=public.revenuecat_premium_authority_rank_internal('SUBSCRIPTION_EXTENDED',false),updated_at=clock_timestamp()
 where id=b.id;
 if not public.premium_subject_has_finite_authority_internal(p_user_id::text) then
  raise exception 'subscription_extension_postcondition_failed'; end if;
 update private.revenuecat_nonpurchase_reconciliation set state='applied',reason='exact_period_extended' where event_id=p_provider_event_id;
 return jsonb_build_object('status','applied','reason','exact_period_extended','accessStateChanged',true,
  'authorityGranted',false,'financialAuthority',false,'entitlementActive',true);
end $$;
revoke all on function public.process_revenuecat_nonpurchase_lifecycle_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.process_revenuecat_nonpurchase_lifecycle_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text) to service_role;

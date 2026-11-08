-- Additive inactive candidate; no replacement of frozen checkout definitions.
-- Closure proves only that this exact preparation has no allocated/claimed work.
set local role sbx_v1_core_owner;
do $fresh$
begin
 if (select state from sandbox_commerce_v1.lifecycle where singleton) is distinct from 'disabled'
  or exists(select 1 from sandbox_commerce_v1.test_store_v3_preparations)
  or exists(select 1 from sandbox_commerce_v1.test_store_v3_controls where ingress_enabled or provisioning_enabled or initiation_enabled)
 then raise exception 'test_store_v3_abandonment_fresh_inactive_install_required'; end if;
end; $fresh$;
create table sandbox_commerce_v1.test_store_v3_abandonment_requests (
 buyer_id uuid not null, request_id uuid not null, session_id uuid not null,
 configuration_digest text not null references sandbox_commerce_v1.test_store_v3_native_profiles(configuration_digest),
 payload jsonb not null, intent_id uuid not null references sandbox_commerce_v1.intents(id),
 created_at timestamptz not null default clock_timestamp(), primary key(buyer_id,request_id)
);
create table sandbox_commerce_v1.test_store_v3_abandonments (
 intent_id uuid primary key references sandbox_commerce_v1.intents(id), id uuid not null unique default gen_random_uuid(),
 buyer_id uuid not null, original_request_id uuid not null, original_session_id uuid not null,
 configuration_digest text not null references sandbox_commerce_v1.test_store_v3_native_profiles(configuration_digest),
 quote jsonb not null, closing_request_id uuid not null, closing_session_id uuid not null,
 closed_at timestamptz not null default clock_timestamp() check(isfinite(closed_at)),
 foreign key(buyer_id,original_request_id) references sandbox_commerce_v1.test_store_v3_preparations(buyer_id,request_id),
 foreign key(buyer_id,closing_request_id) references sandbox_commerce_v1.test_store_v3_abandonment_requests(buyer_id,request_id)
);
do $private$
declare t text;
begin
 foreach t in array array['abandonment_requests','abandonments'] loop
  execute format('alter table sandbox_commerce_v1.test_store_v3_%I enable row level security',t);
  execute format('alter table sandbox_commerce_v1.test_store_v3_%I force row level security',t);
  execute format('create policy core_owner on sandbox_commerce_v1.test_store_v3_%I for all to sbx_v1_core_owner using(true) with check(true)',t);
  execute format('revoke all on sandbox_commerce_v1.test_store_v3_%I from public,anon,authenticated,service_role,sbx_v1_operator',t);
  execute format('create trigger immutable before update or delete on sandbox_commerce_v1.test_store_v3_%I for each row execute function sandbox_commerce_v1.test_store_v3_immutable()',t);
  execute format('create trigger no_truncate before truncate on sandbox_commerce_v1.test_store_v3_%I for each statement execute function sandbox_commerce_v1.test_store_v3_immutable()',t);
 end loop;
end; $private$;

-- The source allocator already locks the same intent before inserting a plan.
-- These owned-table guards also prevent future paths from adopting a tombstone.
create function sandbox_commerce_v1.test_store_v3_guard_abandonment()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from sandbox_commerce_v1.intents where id=new.intent_id for update nowait;
 if not found or exists(select 1 from sandbox_commerce_v1.test_store_v3_abandonments where intent_id=new.intent_id)
 then raise exception 'test_store_v3_preparation_closed'; end if;
 return new;
end; $$;
create trigger retained_abandonment before insert on sandbox_commerce_v1.test_store_v3_plans
 for each row execute function sandbox_commerce_v1.test_store_v3_guard_abandonment();
create trigger retained_abandonment before insert on sandbox_commerce_v1.test_store_v3_allocations
 for each row execute function sandbox_commerce_v1.test_store_v3_guard_abandonment();

create function sandbox_commerce_v1.test_store_v3_abandon(p_buyer uuid,p_session uuid,p_command text,
 p_request uuid,p_configuration_digest text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare prep sandbox_commerce_v1.test_store_v3_preparations; prior sandbox_commerce_v1.test_store_v3_abandonment_requests;
 closed sandbox_commerce_v1.test_store_v3_abandonments; i sandbox_commerce_v1.intents;
 profile sandbox_commerce_v1.test_store_v3_native_profiles; cn sandbox_commerce_v1.test_store_v3_connections;
 buyer jsonb; original_request uuid; original_session uuid; expected_intent uuid; replayed boolean:=false;
begin
 perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
 if p_buyer is null or p_session is null or p_request is null or p_command is distinct from 'abandon'
  or p_configuration_digest is null or p_configuration_digest !~ '^[a-f0-9]{64}$'
  or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>8192
  or not(p_payload ?& array['originalRequestId','originalSessionId','intentId','expectedQuote'])
  or (p_payload-array['originalRequestId','originalSessionId','intentId','expectedQuote'])<>'{}'::jsonb
  or jsonb_typeof(p_payload->'originalRequestId') is distinct from 'string'
  or p_payload->>'originalRequestId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or jsonb_typeof(p_payload->'originalSessionId') is distinct from 'string'
  or p_payload->>'originalSessionId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or jsonb_typeof(p_payload->'intentId') is distinct from 'string' or jsonb_typeof(p_payload->'expectedQuote') is distinct from 'object'
 then raise exception 'test_store_v3_abandonment_invalid'; end if;
 buyer:=sandbox_commerce_v1.assert_authority(p_buyer,p_session,'delivery');
 original_request:=(p_payload->>'originalRequestId')::uuid; original_session:=(p_payload->>'originalSessionId')::uuid;
 expected_intent:=sandbox_commerce_v1.identifier(p_payload->>'intentId','intent');
 if not pg_try_advisory_xact_lock(hashtextextended('test-store-v3-abandon:'||p_buyer||':'||p_request,687))
 then raise exception 'test_store_v3_abandonment_busy' using errcode='55P03'; end if;
 select * into prior from sandbox_commerce_v1.test_store_v3_abandonment_requests where buyer_id=p_buyer and request_id=p_request;
 if found and row(prior.session_id,prior.configuration_digest,prior.payload)
  is distinct from row(p_session,p_configuration_digest,p_payload)
 then raise exception 'test_store_v3_abandonment_request_conflict'; end if;
 select * into strict prep from sandbox_commerce_v1.test_store_v3_preparations
  where buyer_id=p_buyer and request_id=original_request and buyer_session_id=original_session
   and configuration_digest=p_configuration_digest and intent_id=expected_intent;
 select * into strict profile from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest=p_configuration_digest;
 select * into strict cn from sandbox_commerce_v1.test_store_v3_connections where id=profile.connection_id and revision=profile.connection_revision;
 -- This row lock is the allocation/closure linearization point. Never wait.
 select * into strict i from sandbox_commerce_v1.intents where id=prep.intent_id for update nowait;
 if row(i.buyer_id,i.buyer_session_id,i.kind,i.provider,i.store,i.scope_key)
   is distinct from row(p_buyer,original_session,'paid_content'::text,'revenuecat'::text,'test_store'::text,cn.scope_key)
  or prep.payload->'expectedQuote' is distinct from p_payload->'expectedQuote'
  or sandbox_commerce_v1.test_store_v3_quote(i) is distinct from p_payload->'expectedQuote'
 then raise exception 'test_store_v3_abandonment_binding_conflict'; end if;
 if i.dispatch_id is not null or i.dispatched_at is not null or i.state not in ('prepared','expired')
  or exists(select 1 from sandbox_commerce_v1.dispatch_attempts where intent_id=i.id)
  or exists(select 1 from sandbox_commerce_v1.test_store_v3_plans where intent_id=i.id)
  or exists(select 1 from sandbox_commerce_v1.test_store_v3_allocations where intent_id=i.id)
  or exists(select 1 from sandbox_commerce_v1.receipts where intent_id=i.id)
 then raise exception 'test_store_v3_abandonment_allocated_or_ambiguous'; end if;
 select * into closed from sandbox_commerce_v1.test_store_v3_abandonments where intent_id=i.id;
 if found then
  if i.state<>'expired' or row(closed.buyer_id,closed.original_request_id,closed.original_session_id,closed.configuration_digest,closed.quote)
   is distinct from row(p_buyer,original_request,original_session,p_configuration_digest,p_payload->'expectedQuote')
  then raise exception 'test_store_v3_abandonment_binding_conflict'; end if;
  replayed:=true;
 elsif prior.request_id is not null then raise exception 'test_store_v3_abandonment_history_incomplete'; end if;
 if prior.request_id is null then
  insert into sandbox_commerce_v1.test_store_v3_abandonment_requests(buyer_id,request_id,session_id,configuration_digest,payload,intent_id)
   values(p_buyer,p_request,p_session,p_configuration_digest,p_payload,i.id);
 end if;
 if closed.id is null then
  insert into sandbox_commerce_v1.test_store_v3_abandonments(intent_id,buyer_id,original_request_id,original_session_id,configuration_digest,quote,closing_request_id,closing_session_id)
   values(i.id,p_buyer,original_request,original_session,p_configuration_digest,p_payload->'expectedQuote',p_request,p_session) returning * into closed;
  if closed.closed_at<i.created_at then raise exception 'test_store_v3_abandonment_clock_invalid'; end if;
  update sandbox_commerce_v1.intents set state='expired' where id=i.id returning * into i;
 end if;
 perform sandbox_commerce_v1.assert_fresh(buyer);
 return jsonb_build_object('protocol','isolated-paid-video-checkout-v3','command','abandon','requestId',p_request,
  'actor',jsonb_build_object('userId',p_buyer,'sessionId',p_session),'status','ok','data',jsonb_build_object(
   'intent',sandbox_commerce_v1.test_store_v3_intent_history(i),'replayed',replayed,
   'closure',jsonb_build_object('id',closed.id,'originalRequestId',closed.original_request_id,'originalSessionId',closed.original_session_id,
    'configurationDigest',closed.configuration_digest,'closedAt',closed.closed_at,'kind','unallocated_preparation','allocationAbsent',true,'dispatchAbsent',true)),
  'providerDispatchAllowed',false,'grantsAccess',false,'financialAuthority',false,'notPayable',true);
end; $$;
revoke all on function sandbox_commerce_v1.test_store_v3_guard_abandonment(),
 sandbox_commerce_v1.test_store_v3_abandon(uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated,service_role,sbx_v1_operator;
reset role;
grant usage,create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.isolated_paid_video_abandon_v3(p_buyer_id uuid,p_session_id uuid,p_command text,p_request_id uuid,p_configuration_digest text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.test_store_v3_abandon(p_buyer_id,p_session_id,p_command,p_request_id,p_configuration_digest,p_payload);
end; $$;
revoke all on function public.isolated_paid_video_abandon_v3(uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.isolated_paid_video_abandon_v3(uuid,uuid,text,uuid,text,jsonb) to service_role;
reset role;
revoke create on schema public from sbx_v1_core_owner;

-- Fresh inactive add-on. Native prepared-only retirement is a separate local
-- action; neither a native document nor lease expiry is proof of no server claim.
set local role sbx_v1_core_owner;
do $fresh$
begin
 if (select state from sandbox_commerce_v1.lifecycle where singleton) is distinct from 'disabled'
  or exists(select 1 from sandbox_commerce_v1.test_store_v3_allocations)
  or exists(select 1 from sandbox_commerce_v1.test_store_v3_controls where ingress_enabled or provisioning_enabled or initiation_enabled)
 then raise exception 'test_store_v3_prepared_close_fresh_install_required'; end if;
end; $fresh$;
create table sandbox_commerce_v1.test_store_v3_prepared_close_requests (
 buyer_id uuid not null, request_id uuid not null, session_id uuid not null,
 configuration_digest text not null references sandbox_commerce_v1.test_store_v3_native_profiles(configuration_digest),
 payload jsonb not null, allocation_id uuid not null references sandbox_commerce_v1.test_store_v3_allocations(id),
 created_at timestamptz not null default clock_timestamp(), primary key(buyer_id,request_id)
);
create table sandbox_commerce_v1.test_store_v3_prepared_closures (
 allocation_id uuid primary key references sandbox_commerce_v1.test_store_v3_allocations(id),
 id uuid not null unique default gen_random_uuid(), buyer_id uuid not null,
 customer_id uuid not null references sandbox_commerce_v1.test_store_v3_customers(id),
 intent_id uuid not null unique references sandbox_commerce_v1.intents(id), dispatch_id uuid not null unique,
 registration_id uuid not null references sandbox_commerce_v1.test_store_v3_registrations(id), original_session_id uuid not null,
 configuration_digest text not null references sandbox_commerce_v1.test_store_v3_native_profiles(configuration_digest),
 quote jsonb not null, previous_reservation_revision bigint not null check(previous_reservation_revision between 1 and 9007199254740990),
 released_reservation_revision bigint not null check(released_reservation_revision=previous_reservation_revision+1),
 closing_request_id uuid not null, closed_at timestamptz not null default clock_timestamp() check(isfinite(closed_at)),
 foreign key(buyer_id,closing_request_id) references sandbox_commerce_v1.test_store_v3_prepared_close_requests(buyer_id,request_id)
);
do $private$
declare t text;
begin
 foreach t in array array['prepared_close_requests','prepared_closures'] loop
  execute format('alter table sandbox_commerce_v1.test_store_v3_%I enable row level security',t);
  execute format('alter table sandbox_commerce_v1.test_store_v3_%I force row level security',t);
  execute format('create policy core_owner on sandbox_commerce_v1.test_store_v3_%I for all to sbx_v1_core_owner using(true) with check(true)',t);
  execute format('revoke all on sandbox_commerce_v1.test_store_v3_%I from public,anon,authenticated,service_role,sbx_v1_operator',t);
  execute format('create trigger immutable before update or delete on sandbox_commerce_v1.test_store_v3_%I for each row execute function sandbox_commerce_v1.test_store_v3_immutable()',t);
  execute format('create trigger no_truncate before truncate on sandbox_commerce_v1.test_store_v3_%I for each statement execute function sandbox_commerce_v1.test_store_v3_immutable()',t);
 end loop;
end; $private$;
create function sandbox_commerce_v1.test_store_v3_prepared_closure_json(c sandbox_commerce_v1.test_store_v3_prepared_closures)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('id',c.id,'kind','unclaimed_allocation','customerBindingId','scv3_customer_'||c.customer_id,
  'allocationId','scv3_allocation_'||c.allocation_id,'dispatchId',c.dispatch_id,'registrationId','scv3_registration_'||c.registration_id,
  'originalSessionId',c.original_session_id,'configurationDigest',c.configuration_digest,
  'previousReservationRevision',c.previous_reservation_revision,'releasedReservationRevision',c.released_reservation_revision,
  'closedAt',c.closed_at,'claimAbsent',true);
$$;
create function sandbox_commerce_v1.test_store_v3_close_prepared(p_buyer uuid,p_session uuid,p_command text,
 p_request uuid,p_configuration_digest text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c sandbox_commerce_v1.test_store_v3_customers; a sandbox_commerce_v1.test_store_v3_allocations;
 i sandbox_commerce_v1.intents; registration sandbox_commerce_v1.test_store_v3_registrations;
 reservation sandbox_commerce_v1.test_store_v3_reservations; prior sandbox_commerce_v1.test_store_v3_prepared_close_requests;
 closed sandbox_commerce_v1.test_store_v3_prepared_closures; buyer jsonb; body jsonb; status text:='ok'; replayed boolean:=false;
 original_request uuid; customer uuid; intent uuid; registration_uuid uuid; dispatch uuid; original_session uuid; expected_revision bigint;
begin
 perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
 if p_buyer is null or p_session is null or p_request is null or p_configuration_digest is null
  or p_configuration_digest !~ '^[a-f0-9]{64}$' or p_command is null or p_command not in ('close_prepared','recover_close_prepared')
  or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>8192
 then raise exception 'test_store_v3_prepared_close_invalid'; end if;
 buyer:=sandbox_commerce_v1.assert_authority(p_buyer,p_session,'delivery');
 if p_command='recover_close_prepared' then
  if not(p_payload ? 'originalRequestId') or (p_payload-'originalRequestId')<>'{}'::jsonb
   or jsonb_typeof(p_payload->'originalRequestId') is distinct from 'string'
   or p_payload->>'originalRequestId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  then raise exception 'test_store_v3_prepared_close_invalid'; end if;
  original_request:=(p_payload->>'originalRequestId')::uuid;
  select * into prior from sandbox_commerce_v1.test_store_v3_prepared_close_requests
   where buyer_id=p_buyer and request_id=original_request and configuration_digest=p_configuration_digest;
  if not found then
   status:='unknown'; body:=jsonb_build_object('originalRequestId',original_request,'intent',null,'closure',null);
  else
   select * into strict closed from sandbox_commerce_v1.test_store_v3_prepared_closures where allocation_id=prior.allocation_id;
   select * into strict i from sandbox_commerce_v1.intents where id=closed.intent_id;
   if i.state<>'expired' or i.dispatch_id is not null or i.dispatched_at is not null
    or exists(select 1 from sandbox_commerce_v1.dispatch_attempts where intent_id=i.id)
    or exists(select 1 from sandbox_commerce_v1.receipts where intent_id=i.id)
   then raise exception 'test_store_v3_prepared_close_claim_recorded'; end if;
   body:=jsonb_build_object('originalRequestId',original_request,'originalSessionId',prior.session_id,'originalPayload',prior.payload,
    'intent',sandbox_commerce_v1.test_store_v3_intent_history(i),'closure',sandbox_commerce_v1.test_store_v3_prepared_closure_json(closed));
  end if;
 else
  if not(p_payload ?& array['customerBindingId','intentId','dispatchId','registrationId','originalSessionId','expectedReservationRevision','expectedQuote'])
   or (p_payload-array['customerBindingId','intentId','dispatchId','registrationId','originalSessionId','expectedReservationRevision','expectedQuote'])<>'{}'::jsonb
   or jsonb_typeof(p_payload->'customerBindingId') is distinct from 'string' or jsonb_typeof(p_payload->'intentId') is distinct from 'string'
   or jsonb_typeof(p_payload->'registrationId') is distinct from 'string' or jsonb_typeof(p_payload->'dispatchId') is distinct from 'string'
   or p_payload->>'dispatchId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   or jsonb_typeof(p_payload->'originalSessionId') is distinct from 'string'
   or p_payload->>'originalSessionId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   or jsonb_typeof(p_payload->'expectedQuote') is distinct from 'object'
   or jsonb_typeof(p_payload->'expectedReservationRevision') is distinct from 'number'
   or p_payload->>'expectedReservationRevision' !~ '^[1-9][0-9]{0,15}$'
   or (p_payload->>'expectedReservationRevision')::numeric>9007199254740991
  then raise exception 'test_store_v3_prepared_close_invalid'; end if;
  customer:=sandbox_commerce_v1.test_store_v3_id(p_payload->>'customerBindingId','customer');
  intent:=sandbox_commerce_v1.identifier(p_payload->>'intentId','intent');
  registration_uuid:=sandbox_commerce_v1.test_store_v3_id(p_payload->>'registrationId','registration');
  dispatch:=(p_payload->>'dispatchId')::uuid; original_session:=(p_payload->>'originalSessionId')::uuid;
  expected_revision:=(p_payload->>'expectedReservationRevision')::bigint;
  if not pg_try_advisory_xact_lock(hashtextextended('test-store-v3-close-prepared:'||p_buyer||':'||p_request,687))
  then raise exception 'test_store_v3_prepared_close_busy' using errcode='55P03'; end if;
  select * into prior from sandbox_commerce_v1.test_store_v3_prepared_close_requests where buyer_id=p_buyer and request_id=p_request;
  if found and row(prior.session_id,prior.configuration_digest,prior.payload) is distinct from row(p_session,p_configuration_digest,p_payload)
  then raise exception 'test_store_v3_prepared_close_request_conflict'; end if;
  select * into strict c from sandbox_commerce_v1.test_store_v3_customers where id=customer and buyer_id=p_buyer and configuration_digest=p_configuration_digest;
  select * into strict a from sandbox_commerce_v1.test_store_v3_allocations where intent_id=intent and customer_id=c.id;
  -- Same nonblocking lock order as SDK claim. Retained proof is checked before
  -- any reservation mutation so replay cannot release a subsequent allocation.
  select * into strict reservation from sandbox_commerce_v1.test_store_v3_reservations where customer_id=c.id for update nowait;
  select * into strict i from sandbox_commerce_v1.intents where id=a.intent_id for update nowait;
  select * into strict registration from sandbox_commerce_v1.test_store_v3_registrations where id=registration_uuid and plan_id=a.plan_id for share nowait;
  if row(i.buyer_id,i.buyer_session_id,a.buyer_session_id,a.dispatch_id)
    is distinct from row(p_buyer,original_session,original_session,dispatch)
   or a.quote is distinct from p_payload->'expectedQuote' or sandbox_commerce_v1.test_store_v3_quote(i) is distinct from a.quote
  then raise exception 'test_store_v3_prepared_close_binding_conflict'; end if;
  if i.dispatch_id is not null or i.dispatched_at is not null or i.state not in ('prepared','expired')
   or exists(select 1 from sandbox_commerce_v1.dispatch_attempts where intent_id=i.id)
   or exists(select 1 from sandbox_commerce_v1.receipts where intent_id=i.id)
  then raise exception 'test_store_v3_prepared_close_claim_recorded'; end if;
  select * into closed from sandbox_commerce_v1.test_store_v3_prepared_closures where allocation_id=a.id;
  if found then
   if row(closed.buyer_id,closed.customer_id,closed.intent_id,closed.dispatch_id,closed.registration_id,closed.original_session_id,
      closed.configuration_digest,closed.quote,closed.previous_reservation_revision)
     is distinct from row(p_buyer,c.id,i.id,dispatch,registration_uuid,original_session,p_configuration_digest,a.quote,expected_revision)
    or i.state<>'expired' then raise exception 'test_store_v3_prepared_close_binding_conflict'; end if;
   replayed:=true;
  else
   if prior.request_id is not null then raise exception 'test_store_v3_prepared_close_history_incomplete'; end if;
   -- Any historical claim is disqualifying, including an expired or unknown
   -- invocation. The separate existing advance path retains that uncertainty.
   if reservation.active_allocation_id is distinct from a.id or reservation.revision<>expected_revision
    or expected_revision>=9007199254740991
    or exists(select 1 from sandbox_commerce_v1.test_store_v3_releases where allocation_id=a.id)
   then raise exception 'test_store_v3_prepared_close_reservation_conflict'; end if;
  end if;
  if prior.request_id is null then
   insert into sandbox_commerce_v1.test_store_v3_prepared_close_requests(buyer_id,request_id,session_id,configuration_digest,payload,allocation_id)
    values(p_buyer,p_request,p_session,p_configuration_digest,p_payload,a.id);
  end if;
  if not replayed then
   insert into sandbox_commerce_v1.test_store_v3_releases(allocation_id,buyer_id,request_id,session_id,reservation_revision,disposition,receipt_id)
    values(a.id,p_buyer,p_request,p_session,expected_revision,'retain_unknown',null);
   update sandbox_commerce_v1.test_store_v3_reservations set active_allocation_id=null,revision=revision+1 where customer_id=c.id;
   update sandbox_commerce_v1.intents set state='expired' where id=i.id returning * into i;
   insert into sandbox_commerce_v1.test_store_v3_prepared_closures(allocation_id,buyer_id,customer_id,intent_id,dispatch_id,registration_id,
     original_session_id,configuration_digest,quote,previous_reservation_revision,released_reservation_revision,closing_request_id)
    values(a.id,p_buyer,c.id,i.id,dispatch,registration_uuid,original_session,p_configuration_digest,a.quote,expected_revision,expected_revision+1,p_request)
    returning * into closed;
   if closed.closed_at<i.created_at then raise exception 'test_store_v3_prepared_close_clock_invalid'; end if;
  end if;
  body:=jsonb_build_object('intent',sandbox_commerce_v1.test_store_v3_intent_history(i),
   'closure',sandbox_commerce_v1.test_store_v3_prepared_closure_json(closed),'replayed',replayed);
 end if;
 perform sandbox_commerce_v1.assert_fresh(buyer);
 return jsonb_build_object('protocol','isolated-paid-video-checkout-v3','command',p_command,'requestId',p_request,
  'actor',jsonb_build_object('userId',p_buyer,'sessionId',p_session),'status',status,'data',body,
  'providerDispatchAllowed',false,'grantsAccess',false,'financialAuthority',false,'notPayable',true);
end; $$;
revoke all on function sandbox_commerce_v1.test_store_v3_prepared_closure_json(sandbox_commerce_v1.test_store_v3_prepared_closures),
 sandbox_commerce_v1.test_store_v3_close_prepared(uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated,service_role,sbx_v1_operator;
reset role;
grant usage,create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.isolated_paid_video_close_prepared_v3(p_buyer_id uuid,p_session_id uuid,p_command text,p_request_id uuid,p_configuration_digest text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.test_store_v3_close_prepared(p_buyer_id,p_session_id,p_command,p_request_id,p_configuration_digest,p_payload);
end; $$;
revoke all on function public.isolated_paid_video_close_prepared_v3(uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.isolated_paid_video_close_prepared_v3(uuid,uuid,text,uuid,text,jsonb) to service_role;
reset role;
revoke create on schema public from sbx_v1_core_owner;

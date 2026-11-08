-- Dedicated Test Store tip rehearsal source. Install after receipts.sql and
-- before permissions-finalize.sql in the same initially disabled transaction.
-- No provider/native profile, credential, catalog or activation is seeded.
-- Test Store never shares an economic application identity with Apple/Google.
set local role sbx_v1_core_owner;

create table sandbox_commerce_v1.test_store_connections (
  id uuid not null, revision integer not null check(revision>0),
  project_id text not null check(project_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  app_id text not null check(app_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  provider_configuration_digest text not null check(provider_configuration_digest ~ '^[a-f0-9]{64}$'),
  auth_key_version text not null, storage_key_id text not null,
  scope_key text not null,
  economic_application_id text not null,
  qualified boolean not null default false,
  ownership_evidence_sha256 text, delivery_evidence_sha256 text, lifecycle_evidence_sha256 text,
  refund_contract text not null default 'unavailable'
    check(refund_contract in ('unavailable','cancellation_customer_support_full_tip_v1')),
  primary key(id,revision),
  check(scope_key::jsonb=jsonb_build_array('revenuecat',project_id,app_id,'TEST_STORE','SANDBOX')),
  check(economic_application_id='rc_test_store:'||project_id||':'||app_id),
  check(not qualified or (ownership_evidence_sha256 ~ '^[a-f0-9]{64}$'
    and delivery_evidence_sha256 ~ '^[a-f0-9]{64}$' and lifecycle_evidence_sha256 ~ '^[a-f0-9]{64}$'
    and ownership_evidence_sha256 is not null and delivery_evidence_sha256 is not null and lifecycle_evidence_sha256 is not null))
);
create table sandbox_commerce_v1.test_store_native_profiles (
  configuration_digest text primary key check(configuration_digest ~ '^[a-f0-9]{64}$'),
  connection_id uuid not null, connection_revision integer not null,
  platform text not null check(platform in ('ios','android')),
  application_id text not null, public_sdk_key_sha256 text not null check(public_sdk_key_sha256 ~ '^[a-f0-9]{64}$'),
  storage_namespace text not null, qualified boolean not null default false,
  native_evidence_sha256 text,
  foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_connections(id,revision),
  check(not qualified or (native_evidence_sha256 is not null and native_evidence_sha256 ~ '^[a-f0-9]{64}$'))
);
create table sandbox_commerce_v1.test_store_controls (
  singleton boolean primary key default true check(singleton),
  connection_id uuid, connection_revision integer,
  ingress_enabled boolean not null default false,
  initiation_enabled boolean not null default false,
  foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_connections(id,revision),
  check((connection_id is null)=(connection_revision is null)),
  check(not(ingress_enabled or initiation_enabled) or connection_id is not null),
  check(not initiation_enabled or ingress_enabled)
);
insert into sandbox_commerce_v1.test_store_controls(singleton) values(true);

create table sandbox_commerce_v1.test_store_allocations (
  intent_id uuid primary key references sandbox_commerce_v1.intents(id),
  dispatch_id uuid not null unique,
  provider_app_user_id text not null unique check(provider_app_user_id ~ '^scv1_teststore_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
  buyer_id uuid not null, buyer_session_id uuid not null,
  configuration_digest text not null references sandbox_commerce_v1.test_store_native_profiles(configuration_digest),
  connection_id uuid not null, connection_revision integer not null,
  quote jsonb not null, created_at timestamptz not null default clock_timestamp(),
  foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_connections(id,revision)
);
create table sandbox_commerce_v1.test_store_requests (
  buyer_id uuid not null, request_id uuid not null, buyer_session_id uuid not null,
  command text not null, configuration_digest text not null, payload jsonb not null,
  primary key(buyer_id,request_id)
);
create table sandbox_commerce_v1.test_store_sdk_reports (
  buyer_id uuid not null, request_id uuid not null,
  intent_id uuid not null references sandbox_commerce_v1.test_store_allocations(intent_id),
  outcome text not null check(outcome in ('sdk_success','sdk_cancelled','sdk_failed','sdk_unknown')),
  transaction_hint text, reported_at timestamptz not null default clock_timestamp(),
  primary key(buyer_id,request_id)
);
create table sandbox_commerce_v1.test_store_ingress (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null, connection_revision integer not null,
  project_id text not null, provider_event_id text,
  raw_sha256 text not null check(raw_sha256 ~ '^[a-f0-9]{64}$'),
  envelope jsonb not null, observation jsonb not null,
  received_at timestamptz not null default clock_timestamp(),
  foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_connections(id,revision),
  unique(project_id,raw_sha256)
);
create table sandbox_commerce_v1.test_store_deliveries (
  id uuid primary key default gen_random_uuid(),
  ingress_id uuid not null references sandbox_commerce_v1.test_store_ingress(id),
  connection_id uuid not null, connection_revision integer not null, envelope jsonb not null,
  received_at timestamptz not null default clock_timestamp(),
  foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_connections(id,revision)
);
create table sandbox_commerce_v1.test_store_event_keys (
  project_id text not null, provider_event_id text not null,
  ingress_id uuid not null references sandbox_commerce_v1.test_store_ingress(id),
  primary key(project_id,provider_event_id)
);
create table sandbox_commerce_v1.test_store_effects (
  ingress_id uuid primary key references sandbox_commerce_v1.test_store_ingress(id),
  status text not null check(status in ('processed','held','ignored')),
  result jsonb not null
);
create table sandbox_commerce_v1.test_store_original_bindings (
  project_id text not null, app_id text not null,
  original_transaction_id text not null, transaction_id text not null,
  intent_id uuid not null unique references sandbox_commerce_v1.test_store_allocations(intent_id),
  dispatch_id uuid not null unique references sandbox_commerce_v1.test_store_allocations(dispatch_id),
  first_ingress_id uuid not null references sandbox_commerce_v1.test_store_ingress(id),
  primary key(project_id,app_id,original_transaction_id), unique(project_id,app_id,transaction_id)
);
create table sandbox_commerce_v1.test_store_holds (
  id uuid primary key default gen_random_uuid(),
  ingress_id uuid not null references sandbox_commerce_v1.test_store_ingress(id),
  project_id text not null, dispatch_id uuid references sandbox_commerce_v1.test_store_allocations(dispatch_id),
  scope_wide boolean not null, reason text not null,
  check(scope_wide=(dispatch_id is null)),
  unique(ingress_id,dispatch_id,reason)
);
-- Private stack frame authorization, never a caller-set GUC or durable generic
-- verified-facts setter. Insert/call/delete occur within one bounded RPC tx.
create table sandbox_commerce_v1.test_store_call_context (
  transaction_id bigint primary key,
  operation text not null check(operation in ('dispatch','receipt')),
  intent_id uuid not null references sandbox_commerce_v1.test_store_allocations(intent_id),
  ingress_id uuid references sandbox_commerce_v1.test_store_ingress(id), payload jsonb,
  check((operation='receipt')=(ingress_id is not null and payload is not null))
);

create function sandbox_commerce_v1.test_store_immutable()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'sandbox_test_store_evidence_immutable' using errcode='42501'; end; $$;
do $install$
declare t text;
begin
  foreach t in array array['test_store_connections','test_store_native_profiles','test_store_controls',
    'test_store_allocations','test_store_requests','test_store_sdk_reports','test_store_ingress','test_store_deliveries',
    'test_store_event_keys','test_store_effects','test_store_original_bindings','test_store_holds','test_store_call_context'] loop
    execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
    execute format('alter table sandbox_commerce_v1.%I force row level security',t);
    execute format('create policy core_owner on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using(true) with check(true)',t);
    execute format('revoke all on table sandbox_commerce_v1.%I from public,anon,authenticated,service_role',t);
    if t not in ('test_store_controls','test_store_call_context') then
      execute format('create trigger immutable before update or delete on sandbox_commerce_v1.%I for each row execute function sandbox_commerce_v1.test_store_immutable()',t);
      execute format('create trigger no_truncate before truncate on sandbox_commerce_v1.%I for each statement execute function sandbox_commerce_v1.test_store_immutable()',t);
    end if;
  end loop;
end; $install$;

create function sandbox_commerce_v1.test_store_quote(i sandbox_commerce_v1.intents)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('offerId','scv1_offer_'||i.offer_id,'offerRevision',i.offer_revision,
    'resourceId','scv1_resource_'||i.resource_id,'resourceRevision',i.resource_revision,'creatorId',i.creator_id,
    'kind',i.kind,'amountMinor',i.amount_minor,'currency',i.currency);
$$;
create function sandbox_commerce_v1.test_store_allocation_json(a sandbox_commerce_v1.test_store_allocations)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('intentId','scv1_intent_'||i.id,'dispatchId',a.dispatch_id,
    'providerAppUserId',a.provider_app_user_id,'configurationDigest',a.configuration_digest,
    'projectId',c.project_id,'appId',c.app_id,'provider','revenuecat','store','TEST_STORE',
    'sourceEnvironment','SANDBOX','providerScopeKey',c.scope_key,'economicApplicationId',c.economic_application_id,
    'productId',i.product_id,'quote',a.quote,'acceptPurchaseUntil',i.expires_at)
  from sandbox_commerce_v1.intents i,sandbox_commerce_v1.test_store_connections c
  where i.id=a.intent_id and c.id=a.connection_id and c.revision=a.connection_revision;
$$;
create function sandbox_commerce_v1.test_store_status(p_intent uuid)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare a sandbox_commerce_v1.test_store_allocations; i sandbox_commerce_v1.intents;
  c sandbox_commerce_v1.test_store_connections; receipt sandbox_commerce_v1.receipts;
  status text; reason text; receipt_json jsonb;
begin
  lock table sandbox_commerce_v1.test_store_holds in share mode nowait;
  select * into strict i from sandbox_commerce_v1.intents where id=p_intent;
  select * into a from sandbox_commerce_v1.test_store_allocations where intent_id=i.id;
  if a.intent_id is null then status:='unavailable'; reason:='test_store_allocation_missing';
  else
    select * into strict c from sandbox_commerce_v1.test_store_connections where id=a.connection_id and revision=a.connection_revision;
    select * into receipt from sandbox_commerce_v1.receipts where intent_id=i.id order by id limit 1 for share nowait;
    if receipt.id is not null then
      receipt_json:=jsonb_build_object('id','scv1_receipt_'||receipt.id,'state',receipt.state,
        'providerTransactionId',receipt.transaction_id,'originalTransactionId',receipt.original_transaction_id,'purchasedAt',receipt.purchased_at);
    end if;
    if exists(select 1 from sandbox_commerce_v1.test_store_holds h where h.project_id=c.project_id
      and (h.scope_wide or h.dispatch_id=a.dispatch_id)) or receipt.state='quarantined'
    then status:='held'; reason:='test_store_provider_evidence_held';
    elsif receipt.id is not null then status:=receipt.state; reason:='test_store_historical_receipt';
    elsif i.dispatch_id is not null then status:='pending'; reason:='test_store_provider_outcome_unknown';
    elsif i.state<>'prepared' or i.expires_at<=clock_timestamp() then status:='expired'; reason:='test_store_unclaimed_intent_closed';
    else status:='allocated'; reason:='test_store_sdk_not_authorized'; end if;
  end if;
  return jsonb_build_object('status',status,'reason',reason,'dispatchAllowed',false,'retryProviderMutation',false,
    'grantsAccess',false,'notPayable',true,'allocation',case when a.intent_id is not null then sandbox_commerce_v1.test_store_allocation_json(a) else null end,
    'authorityValidUntil',null,'receipt',receipt_json);
end; $$;

create function sandbox_commerce_v1.test_store_command(p_buyer uuid,p_session uuid,p_command text,
  p_request uuid,p_configuration_digest text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare i sandbox_commerce_v1.intents; a sandbox_commerce_v1.test_store_allocations;
  controls sandbox_commerce_v1.test_store_controls; c sandbox_commerce_v1.test_store_connections;
  profile sandbox_commerce_v1.test_store_native_profiles; previous sandbox_commerce_v1.test_store_requests;
  actor jsonb; result jsonb; claim jsonb; allowed_keys text[]; existing_request boolean;
begin
  perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
  if p_buyer is null or p_session is null or p_request is null or p_configuration_digest is null
    or p_configuration_digest !~ '^[a-f0-9]{64}$' or p_command is null or p_command not in ('allocate','claim','read','report')
    or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>4096
  then raise exception 'test_store_command_invalid'; end if;
  allowed_keys:=case p_command when 'allocate' then array['intentId','expectedQuote']
    when 'claim' then array['intentId','dispatchId','expectedQuote'] when 'read' then array['intentId']
    else array['intentId','dispatchId','outcome','transactionHint'] end;
  if not p_payload ?& allowed_keys or (p_payload-allowed_keys)<>'{}'::jsonb
    or jsonb_typeof(p_payload->'intentId') is distinct from 'string'
  then raise exception 'test_store_command_shape_invalid'; end if;
  actor:=sandbox_commerce_v1.assert_authority(p_buyer,p_session,'delivery');
  if not pg_try_advisory_xact_lock(hashtextextended('test-store-request:'||p_buyer||':'||p_request,683))
    or not pg_try_advisory_xact_lock(hashtextextended('sandbox-dispatch:'||(p_payload->>'intentId'),683))
  then raise exception 'test_store_command_busy' using errcode='55P03'; end if;
  select * into strict i from sandbox_commerce_v1.intents where id=sandbox_commerce_v1.identifier(p_payload->>'intentId','intent');
  if i.buyer_id<>p_buyer or i.kind<>'creator_tip' or i.provider<>'revenuecat' or i.store<>'test_store' or i.currency<>'usd'
  then raise exception 'test_store_intent_unavailable' using errcode='42501'; end if;
  if p_command<>'read' and i.buyer_session_id<>p_session then raise exception 'test_store_original_session_required' using errcode='42501'; end if;
  select * into previous from sandbox_commerce_v1.test_store_requests where buyer_id=p_buyer and request_id=p_request;
  existing_request:=found;
  if existing_request and row(previous.buyer_session_id,previous.command,previous.configuration_digest,previous.payload)
    is distinct from row(p_session,p_command,p_configuration_digest,p_payload)
  then raise exception 'test_store_request_conflict'; end if;
  select * into a from sandbox_commerce_v1.test_store_allocations where intent_id=i.id;
  if a.intent_id is not null and a.configuration_digest<>p_configuration_digest then raise exception 'test_store_profile_conflict'; end if;
  if p_command in ('allocate','claim') and p_payload->'expectedQuote' is distinct from sandbox_commerce_v1.test_store_quote(i)
  then raise exception 'test_store_quote_conflict'; end if;
  if p_command in ('claim','report') and (a.intent_id is null
    or jsonb_typeof(p_payload->'dispatchId') is distinct from 'string' or p_payload->>'dispatchId'<>a.dispatch_id::text)
  then raise exception 'test_store_dispatch_conflict'; end if;
  if p_command='allocate' and a.intent_id is null then
    perform sandbox_commerce_v1.assert_generation(true);
    select * into strict controls from sandbox_commerce_v1.test_store_controls where singleton for share nowait;
    select * into c from sandbox_commerce_v1.test_store_connections where id=controls.connection_id and revision=controls.connection_revision for share nowait;
    select * into profile from sandbox_commerce_v1.test_store_native_profiles where configuration_digest=p_configuration_digest for share nowait;
    if c.id is null or not controls.initiation_enabled or not controls.ingress_enabled or not c.qualified
      or profile.configuration_digest is null or not profile.qualified
      or row(profile.connection_id,profile.connection_revision) is distinct from row(c.id,c.revision)
      or i.scope_key<>c.scope_key
      or exists(select 1 from sandbox_commerce_v1.catalog catalog where catalog.provider<>'revenuecat' or catalog.store<>'test_store' or catalog.scope_key<>c.scope_key)
    then
      result:=sandbox_commerce_v1.test_store_status(i.id);
    else
      actor:=sandbox_commerce_v1.assert_authority(p_buyer,p_session,'buyer');
      perform sandbox_commerce_v1.assert_fresh(sandbox_commerce_v1.assert_authority(i.creator_id,null,'creator_subject'));
      select * into strict i from sandbox_commerce_v1.intents where id=i.id for share nowait;
      if i.state<>'prepared' or i.dispatch_id is not null or i.expires_at<=clock_timestamp()
      then raise exception 'test_store_intent_closed'; end if;
      insert into sandbox_commerce_v1.test_store_allocations(intent_id,dispatch_id,provider_app_user_id,buyer_id,buyer_session_id,
        configuration_digest,connection_id,connection_revision,quote)
        values(i.id,gen_random_uuid(),'scv1_teststore_'||gen_random_uuid(),p_buyer,p_session,p_configuration_digest,c.id,c.revision,
          sandbox_commerce_v1.test_store_quote(i)) returning * into a;
    end if;
  elsif p_command='claim' then
    result:=sandbox_commerce_v1.test_store_status(i.id);
    if result->>'status'='allocated' then
      perform sandbox_commerce_v1.assert_generation(true);
      select * into strict controls from sandbox_commerce_v1.test_store_controls where singleton for share nowait;
      select * into strict c from sandbox_commerce_v1.test_store_connections where id=a.connection_id and revision=a.connection_revision for share nowait;
      select * into strict profile from sandbox_commerce_v1.test_store_native_profiles where configuration_digest=a.configuration_digest for share nowait;
      if not controls.initiation_enabled or not controls.ingress_enabled or not c.qualified or not profile.qualified
        or row(controls.connection_id,controls.connection_revision) is distinct from row(c.id,c.revision)
      then result:=result||jsonb_build_object('status','unavailable','reason','test_store_initiation_disabled');
      else
        insert into sandbox_commerce_v1.test_store_call_context(transaction_id,operation,intent_id) values(txid_current(),'dispatch',i.id);
        claim:=sandbox_commerce_v1.begin_dispatch('scv1_intent_'||i.id,a.dispatch_id);
        delete from sandbox_commerce_v1.test_store_call_context where transaction_id=txid_current();
        result:=sandbox_commerce_v1.test_store_status(i.id);
        if claim->'dispatchAllowed'='true'::jsonb then
          result:=result||jsonb_build_object('status','dispatch_claimed','reason','test_store_one_use_sdk_admission',
            'dispatchAllowed',true,'authorityValidUntil',claim->'authorityValidUntil');
        end if;
      end if;
    end if;
  elsif p_command='report' then
    if jsonb_typeof(p_payload->'outcome') is distinct from 'string'
      or p_payload->>'outcome' not in ('sdk_success','sdk_cancelled','sdk_failed','sdk_unknown')
      or jsonb_typeof(p_payload->'transactionHint') not in ('null','string')
      or (p_payload->>'transactionHint' is not null and sandbox_commerce_v1.provider_text(p_payload->>'transactionHint') is not true)
      or i.dispatch_id is null then raise exception 'test_store_sdk_report_invalid'; end if;
    insert into sandbox_commerce_v1.test_store_sdk_reports(buyer_id,request_id,intent_id,outcome,transaction_hint)
      values(p_buyer,p_request,i.id,p_payload->>'outcome',p_payload->>'transactionHint') on conflict do nothing;
    -- No SDK success/cancellation/failure can synthesize or erase provider truth.
  end if;
  if not existing_request then
    insert into sandbox_commerce_v1.test_store_requests values(p_buyer,p_request,p_session,p_command,p_configuration_digest,p_payload);
  end if;
  result:=coalesce(result,sandbox_commerce_v1.test_store_status(i.id));
  perform sandbox_commerce_v1.assert_fresh(actor);
  if result->'dispatchAllowed'='true'::jsonb and clock_timestamp()>=(result->>'authorityValidUntil')::timestamptz
  then raise exception 'test_store_dispatch_lease_expired'; end if;
  return jsonb_build_object('protocol','isolated-test-store-v1','command',p_command,'requestId',p_request,
    'actor',jsonb_build_object('userId',p_buyer,'sessionId',p_session),'generation',1,'environment','sandbox','result',result);
end; $$;

create function sandbox_commerce_v1.test_store_hold_allocation(p_ingress uuid,p_allocation sandbox_commerce_v1.test_store_allocations,p_reason text)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare c sandbox_commerce_v1.test_store_connections; receipt sandbox_commerce_v1.receipts;
begin
  select * into strict c from sandbox_commerce_v1.test_store_connections
    where id=p_allocation.connection_id and revision=p_allocation.connection_revision;
  insert into sandbox_commerce_v1.test_store_holds(ingress_id,project_id,dispatch_id,scope_wide,reason)
    values(p_ingress,c.project_id,p_allocation.dispatch_id,false,p_reason) on conflict do nothing;
  for receipt in select * from sandbox_commerce_v1.receipts where intent_id=p_allocation.intent_id loop
    perform sandbox_commerce_v1.quarantine_original(receipt.provider,receipt.scope_key,receipt.store,
      receipt.original_transaction_id,p_allocation.buyer_id,receipt.product_id,clock_timestamp(),p_reason);
  end loop;
end; $$;
create function sandbox_commerce_v1.test_store_hold_evidence(p_ingress uuid,p_reason text)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare evidence sandbox_commerce_v1.test_store_ingress; a sandbox_commerce_v1.test_store_allocations;
  c sandbox_commerce_v1.test_store_connections;
  identity text; identities text[]; resolved integer:=0; unresolved boolean:=false;
begin
  select * into strict evidence from sandbox_commerce_v1.test_store_ingress where id=p_ingress;
  select * into strict c from sandbox_commerce_v1.test_store_connections
    where id=evidence.connection_id and revision=evidence.connection_revision;
  select array_agg(distinct value) into identities from (
    select evidence.observation->>'userId' as value union all select evidence.observation->>'originalUserId'
    union all select jsonb_array_elements_text(evidence.observation->'aliases')
    union all select jsonb_array_elements_text(evidence.observation->'transferredFrom')
    union all select jsonb_array_elements_text(evidence.observation->'transferredTo')
    union all select jsonb_array_elements_text(evidence.observation->'conflictingUserIds')
  ) identity_values where value is not null;
  foreach identity in array coalesce(identities,array[]::text[]) loop
    select allocation.* into a from sandbox_commerce_v1.test_store_allocations allocation
      join sandbox_commerce_v1.test_store_connections connection on connection.id=allocation.connection_id and connection.revision=allocation.connection_revision
      where allocation.provider_app_user_id=identity and connection.project_id=evidence.project_id;
    if found then
      perform sandbox_commerce_v1.test_store_hold_allocation(p_ingress,a,p_reason); resolved:=resolved+1;
    else unresolved:=true; end if;
  end loop;
  -- The reported identity can be wrong even for a known original. Preserve it
  -- and the immutable bound dispatch under the same authenticated parent.
  if evidence.observation->>'appId'=c.app_id and evidence.observation->>'store'='TEST_STORE'
    and evidence.observation->>'environment'='SANDBOX' then
    for a in select allocation.* from sandbox_commerce_v1.test_store_original_bindings binding
      join sandbox_commerce_v1.test_store_allocations allocation on allocation.intent_id=binding.intent_id
      where binding.project_id=c.project_id and binding.app_id=c.app_id
        and (binding.original_transaction_id=evidence.observation->>'originalTransactionId'
          or binding.transaction_id=evidence.observation->>'transactionId')
    loop
      -- Contradictory original/transaction identifiers can name different prior
      -- owners. Preserve every proven owner, never an arbitrary first match.
      perform sandbox_commerce_v1.test_store_hold_allocation(p_ingress,a,p_reason); resolved:=resolved+1;
    end loop;
  elsif (evidence.observation->>'eventType'='TRANSFER'
    and (evidence.observation->>'appId' is null or evidence.observation->>'appId'=c.app_id)
    and (evidence.observation->>'store' is null or evidence.observation->>'store'='TEST_STORE')
    and (evidence.observation->>'environment' is null or evidence.observation->>'environment'='SANDBOX')) is not true
  then unresolved:=true;
  end if;
  -- An authenticated but unscopable event pauses ONLY this dedicated project.
  -- There is no null Auth-user hold and no legacy Apple/Google projection.
  if resolved=0 or unresolved then
    insert into sandbox_commerce_v1.test_store_holds(ingress_id,project_id,dispatch_id,scope_wide,reason)
      values(p_ingress,evidence.project_id,null,true,p_reason);
  end if;
end; $$;

create function sandbox_commerce_v1.test_store_ingest(p_connection uuid,p_revision integer,p_envelope jsonb,p_observation jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare controls sandbox_commerce_v1.test_store_controls; c sandbox_commerce_v1.test_store_connections;
  evidence sandbox_commerce_v1.test_store_ingress; prior sandbox_commerce_v1.test_store_ingress;
  a sandbox_commerce_v1.test_store_allocations; i sandbox_commerce_v1.intents; dispatch sandbox_commerce_v1.dispatch_attempts;
  original sandbox_commerce_v1.original_states; common jsonb; source_keys text[]; event_id text; raw_hash text;
  original_binding sandbox_commerce_v1.test_store_original_bindings; historical_negative uuid;
  payload jsonb; applied jsonb; result jsonb; status text:='held'; reason text;
  actual_minor bigint; normalized_type text; duplicate boolean:=false; conflict boolean:=false;
begin
  perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
  select * into strict controls from sandbox_commerce_v1.test_store_controls where singleton for share nowait;
  select * into c from sandbox_commerce_v1.test_store_connections where id=p_connection and revision=p_revision for share nowait;
  if c.id is null or not controls.ingress_enabled or not c.qualified
    or row(controls.connection_id,controls.connection_revision) is distinct from row(c.id,c.revision)
  then raise exception 'test_store_ingress_disabled'; end if;
  -- Every result/read takes SHARE; every provider event takes ROW EXCLUSIVE.
  -- This fences an absent negative child and a later receipt update alike.
  lock table sandbox_commerce_v1.test_store_holds in row exclusive mode nowait;
  source_keys:=array['protocol','projectId','providerConfigurationDigest','mode','customerId','purchasedAt','expiresAt',
    'amountMinor','currency','quantity','cancelReason','classificationOnly','authorityGranted'];
  if jsonb_typeof(p_envelope) is distinct from 'object' or octet_length(p_envelope::text)>1048576
    or p_envelope->>'protocol' is distinct from 'rc-router-ingress-v1'
    or coalesce(p_envelope->>'rawSha256','') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_envelope->'rawByteLength') is distinct from 'number'
    or (p_envelope->>'rawByteLength')::integer not between 1 and 262144
    or p_envelope->'authentication' is distinct from jsonb_build_object('method','shared_secret','keyVersion',c.auth_key_version)
    or p_envelope->'encryption'->>'algorithm' is distinct from 'AES-256-GCM'
    or p_envelope->'encryption'->>'keyId' is distinct from c.storage_key_id
    or coalesce(p_envelope->'encryption'->>'nonce','') !~ '^[A-Za-z0-9+/]{16}$'
    or coalesce(p_envelope->'encryption'->>'ciphertext','') !~ '^[A-Za-z0-9+/]+={0,2}$'
    or jsonb_typeof(p_observation) is distinct from 'object' or octet_length(p_observation::text)>1048576
    or p_observation->>'protocol' is distinct from 'scv1-test-store-observation-v1'
    or p_observation->>'projectId' is distinct from c.project_id
    or p_observation->>'providerConfigurationDigest' is distinct from c.provider_configuration_digest
    or p_observation->'classificationOnly' is distinct from 'true'::jsonb
    or p_observation->'authorityGranted' is distinct from 'false'::jsonb
    or not p_observation ?& source_keys
  then raise exception 'test_store_envelope_invalid'; end if;
  common:=p_observation-source_keys;
  if (common-array['parseStatus','issues','eventAt']) is distinct from ((p_envelope->'observation')-array['parseStatus','issues','eventAt'])
    or not common ?& array['parseStatus','issues','eventId','eventType','appId','store','environment','eventAt',
      'userId','originalUserId','aliases','productId','transactionId','originalTransactionId','transferredFrom','transferredTo','conflictingUserIds']
    or (common-array['parseStatus','issues','eventId','eventType','appId','store','environment','eventAt',
      'userId','originalUserId','aliases','productId','transactionId','originalTransactionId','transferredFrom','transferredTo','conflictingUserIds'])<>'{}'::jsonb
    or common->>'parseStatus' not in ('valid','invalid')
    or exists(select 1 from unnest(array['issues','aliases','transferredFrom','transferredTo','conflictingUserIds']) field(name)
      where jsonb_typeof(common->field.name) is distinct from 'array')
    or p_observation->>'mode' not in ('tip_purchase','cancellation','hold')
  then raise exception 'test_store_observation_invalid'; end if;
  -- The dedicated parser may add invalidity reasons (or reject a timestamp's
  -- exact numeric lexeme) without changing the shared encrypted observation.
  -- It may never remove original ambiguity or turn invalid bytes positive.
  if exists(select 1 from jsonb_array_elements_text(p_envelope->'observation'->'issues') issue(value)
      where not (common->'issues') ? value)
    or (common->>'parseStatus'='valid' and (p_envelope->'observation'->>'parseStatus' is distinct from 'valid'
      or common->'issues'<>'[]'::jsonb or common->'eventAt' is distinct from p_envelope->'observation'->'eventAt'))
    or (common->>'parseStatus'='invalid' and p_observation->>'mode'<>'hold')
  then raise exception 'test_store_observation_derivation_invalid'; end if;
  raw_hash:=p_envelope->>'rawSha256'; event_id:=common->>'eventId';
  if event_id is not null and sandbox_commerce_v1.provider_text(event_id) is not true
  then raise exception 'test_store_event_identity_invalid'; end if;
  -- Serialize per project, bounded/nonwaiting, so conflict/hold/positive commits
  -- cannot overtake each other. This is not a lock on legacy provider data.
  if not pg_try_advisory_xact_lock(hashtextextended('test-store-project:'||c.project_id,683))
  then raise exception 'test_store_ingress_busy' using errcode='55P03'; end if;
  select * into evidence from sandbox_commerce_v1.test_store_ingress where project_id=c.project_id and raw_sha256=raw_hash;
  if found then
    duplicate:=true;
    if evidence.observation is distinct from p_observation then
      perform sandbox_commerce_v1.test_store_hold_evidence(evidence.id,'test_store_same_bytes_normalization_conflict'); conflict:=true;
    end if;
  else
    insert into sandbox_commerce_v1.test_store_ingress(connection_id,connection_revision,project_id,provider_event_id,raw_sha256,envelope,observation)
      values(c.id,c.revision,c.project_id,event_id,raw_hash,p_envelope,p_observation) returning * into evidence;
  end if;
  insert into sandbox_commerce_v1.test_store_deliveries(ingress_id,connection_id,connection_revision,envelope)
    values(evidence.id,c.id,c.revision,p_envelope);
  if duplicate then
    return jsonb_build_object('protocol','scv1-test-store-ingress-result-v1','receiptId',evidence.id,
      'status',case when conflict then 'conflict' else 'duplicate' end,'durable',true,'acknowledgementAllowed',true,
      'authorityGranted',false,'financialAuthority',false);
  end if;
  if event_id is not null then
    select source.* into prior from sandbox_commerce_v1.test_store_event_keys k
      join sandbox_commerce_v1.test_store_ingress source on source.id=k.ingress_id
      where k.project_id=c.project_id and k.provider_event_id=event_id;
    if found then
      perform sandbox_commerce_v1.test_store_hold_evidence(prior.id,'test_store_event_bytes_conflict');
      perform sandbox_commerce_v1.test_store_hold_evidence(evidence.id,'test_store_event_bytes_conflict');
      conflict:=true; reason:='test_store_event_bytes_conflict';
    else insert into sandbox_commerce_v1.test_store_event_keys values(c.project_id,event_id,evidence.id); end if;
  end if;
  if not conflict then
    if p_envelope->'observation'->>'parseStatus'='valid' and common->>'eventType'='TEST' then
      status:='ignored'; reason:='test_store_test_event';
    else
      select allocation.* into a from sandbox_commerce_v1.test_store_allocations allocation
        join sandbox_commerce_v1.test_store_connections connection on connection.id=allocation.connection_id and connection.revision=allocation.connection_revision
        where allocation.provider_app_user_id=p_observation->>'customerId' and connection.project_id=c.project_id
          and connection.app_id=c.app_id and connection.scope_key=c.scope_key;
      if a.intent_id is null then reason:='test_store_customer_binding_missing';
      elsif common->>'parseStatus' is distinct from 'valid' or common->>'appId' is distinct from c.app_id
        or common->>'store' is distinct from 'TEST_STORE' or common->>'environment' is distinct from 'SANDBOX'
        or common->>'userId' is distinct from a.provider_app_user_id
        or common->>'originalUserId' is distinct from a.provider_app_user_id
        or exists(select 1 from jsonb_array_elements_text(common->'aliases') alias(value) where value<>a.provider_app_user_id)
      then reason:='test_store_identity_or_scope_unqualified';
      elsif p_observation->>'mode' not in ('tip_purchase','cancellation') then reason:='test_store_lifecycle_requires_review';
      else
        select * into strict i from sandbox_commerce_v1.intents where id=a.intent_id;
        select * into dispatch from sandbox_commerce_v1.dispatch_attempts where intent_id=i.id;
        if dispatch.intent_id is null or dispatch.dispatch_id<>a.dispatch_id or i.dispatch_id is distinct from a.dispatch_id
          or i.buyer_id<>a.buyer_id or i.buyer_session_id<>a.buyer_session_id or a.quote is distinct from sandbox_commerce_v1.test_store_quote(i)
          or i.kind<>'creator_tip' or i.provider<>'revenuecat' or i.store<>'test_store' or i.scope_key<>c.scope_key
          or common->>'productId' is distinct from i.product_id
          or sandbox_commerce_v1.provider_text(common->>'originalTransactionId') is not true
          or sandbox_commerce_v1.provider_text(common->>'transactionId') is not true
          or p_observation->>'currency' is distinct from 'usd'
        then reason:='test_store_admitted_source_mismatch';
        elsif exists(select 1 from sandbox_commerce_v1.test_store_holds h where h.project_id=c.project_id and (h.scope_wide or h.dispatch_id=a.dispatch_id))
        then reason:='test_store_prior_negative_evidence';
        else
          if p_observation->>'mode'='tip_purchase' then
            if common->>'eventType' is distinct from 'NON_RENEWING_PURCHASE'
              or jsonb_typeof(p_observation->'amountMinor') is distinct from 'number'
              or p_observation->'amountMinor' is distinct from to_jsonb(i.amount_minor)
              or p_observation->'quantity' is distinct from '1'::jsonb or p_observation->'expiresAt' is distinct from 'null'::jsonb
            then reason:='test_store_purchase_economics_unqualified';
            else actual_minor:=i.amount_minor; normalized_type:='non_renewing_purchase'; end if;
          else
            -- The provider event name is preserved. A generic cancellation is
            -- never silently re-labelled a refund. This exact contract remains
            -- unavailable until real Test Store refund evidence qualifies it.
            if c.refund_contract<>'cancellation_customer_support_full_tip_v1'
              or common->>'eventType' is distinct from 'CANCELLATION' or p_observation->>'cancelReason' is distinct from 'CUSTOMER_SUPPORT'
              or jsonb_typeof(p_observation->'amountMinor') is distinct from 'number'
              or p_observation->'amountMinor' is distinct from to_jsonb(-i.amount_minor)
            then reason:='test_store_cancellation_requires_review';
            else actual_minor:=i.amount_minor; normalized_type:='refund'; end if;
          end if;
          if reason is null then
            -- Original ownership is checked before invoking the common tip
            -- ledger. An unexpected reuse also holds the immutable first owner.
            select * into original_binding from sandbox_commerce_v1.test_store_original_bindings binding
              where binding.project_id=c.project_id and binding.app_id=c.app_id
                and (binding.original_transaction_id=common->>'originalTransactionId'
                  or binding.transaction_id=common->>'transactionId' or binding.intent_id=i.id)
              order by binding.first_ingress_id limit 1;
            if original_binding.intent_id is not null and (original_binding.intent_id<>i.id
              or original_binding.dispatch_id<>a.dispatch_id
              or original_binding.original_transaction_id is distinct from common->>'originalTransactionId'
              or original_binding.transaction_id is distinct from common->>'transactionId') then
              perform sandbox_commerce_v1.test_store_hold_allocation(evidence.id,
                (select binding from sandbox_commerce_v1.test_store_allocations binding where intent_id=original_binding.intent_id),
                'test_store_original_reused');
              reason:='test_store_original_reused';
            elsif original_binding.intent_id is null then
              insert into sandbox_commerce_v1.test_store_original_bindings
                values(c.project_id,c.app_id,common->>'originalTransactionId',common->>'transactionId',i.id,a.dispatch_id,evidence.id);
              -- A valid later purchase cannot outrun an earlier malformed or
              -- unresolved negative merely because ownership was unknown then.
              for historical_negative in select previous.id from sandbox_commerce_v1.test_store_ingress previous
                join sandbox_commerce_v1.test_store_effects effect on effect.ingress_id=previous.id
                where previous.project_id=c.project_id and effect.status='held'
                  and previous.observation->>'appId'=c.app_id and previous.observation->>'store'='TEST_STORE'
                  and previous.observation->>'environment'='SANDBOX'
                  and previous.observation->>'originalTransactionId'=common->>'originalTransactionId'
              loop perform sandbox_commerce_v1.test_store_hold_allocation(historical_negative,a,'test_store_prior_original_negative'); end loop;
            end if;
            select * into original from sandbox_commerce_v1.original_states o
              where o.provider='revenuecat' and o.scope_key=c.scope_key and o.store='test_store'
                and o.original_transaction_id=common->>'originalTransactionId';
            if original.intent_id is not null and original.intent_id<>i.id then
              perform sandbox_commerce_v1.test_store_hold_allocation(evidence.id,
                (select binding from sandbox_commerce_v1.test_store_allocations binding where intent_id=original.intent_id),
                'test_store_original_reused');
              reason:='test_store_original_reused';
            elsif reason is null and exists(select 1 from sandbox_commerce_v1.test_store_holds h
              where h.project_id=c.project_id and (h.scope_wide or h.dispatch_id=a.dispatch_id)) then
              reason:='test_store_prior_original_negative';
            elsif reason is null then
              payload:=jsonb_build_object('provider','revenuecat','providerScopeKey',c.scope_key,'store','test_store',
                'sourceEnvironment','SANDBOX','environment','sandbox','providerEventId',event_id,'providerEventType',common->>'eventType',
                'eventType',normalized_type,'rawBodySha256',raw_hash,'buyerId',a.buyer_id,'intentId',i.id,'dispatchId',a.dispatch_id,
                'providerTransactionId',common->>'transactionId','originalTransactionId',common->>'originalTransactionId',
                'productId',i.product_id,'purchasedAt',case when normalized_type='non_renewing_purchase' then p_observation->'purchasedAt' else 'null'::jsonb end,
                'expiresAt',null,'amountMinor',actual_minor,'currency','usd','refundedAmountMinor',case when normalized_type='refund' then actual_minor else null end,
                'providerEventAt',common->>'eventAt','providerObjectType',null,'providerStatus',null,'providerAmountReceivedMinor',null,
                'providerLivemode',null,'providerConnectedAccountId',null);
              insert into sandbox_commerce_v1.test_store_call_context(transaction_id,operation,intent_id,ingress_id,payload)
                values(txid_current(),'receipt',i.id,evidence.id,payload);
              applied:=sandbox_commerce_v1.ingest_receipt(payload);
              delete from sandbox_commerce_v1.test_store_call_context where transaction_id=txid_current();
              if applied->>'status'='processed' then status:='processed'; reason:='test_store_tip_evidence_recorded';
              else reason:='test_store_tip_projection_held'; end if;
            end if;
          end if;
        end if;
      end if;
      if status<>'processed' then
        perform sandbox_commerce_v1.test_store_hold_evidence(evidence.id,coalesce(reason,'test_store_unclassified_evidence'));
        if a.intent_id is not null then perform sandbox_commerce_v1.test_store_hold_allocation(evidence.id,a,coalesce(reason,'test_store_unclassified_evidence')); end if;
      end if;
    end if;
  end if;
  result:=jsonb_build_object('protocol','scv1-test-store-ingress-result-v1','receiptId',evidence.id,
    'status',case when conflict then 'conflict' else 'recorded' end,'durable',true,'acknowledgementAllowed',true,
    'authorityGranted',false,'financialAuthority',false);
  insert into sandbox_commerce_v1.test_store_effects(ingress_id,status,result)
    values(evidence.id,status,result||jsonb_build_object('projectionReason',reason,'projection',applied));
  return result;
end; $$;

revoke all on function sandbox_commerce_v1.test_store_immutable(),sandbox_commerce_v1.test_store_quote(sandbox_commerce_v1.intents),
  sandbox_commerce_v1.test_store_allocation_json(sandbox_commerce_v1.test_store_allocations),sandbox_commerce_v1.test_store_status(uuid),
  sandbox_commerce_v1.test_store_command(uuid,uuid,text,uuid,text,jsonb),
  sandbox_commerce_v1.test_store_hold_allocation(uuid,sandbox_commerce_v1.test_store_allocations,text),
  sandbox_commerce_v1.test_store_hold_evidence(uuid,text),sandbox_commerce_v1.test_store_ingest(uuid,integer,jsonb,jsonb)
  from public,anon,authenticated,service_role;
reset role;
grant usage,create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.isolated_test_store_command_v1(p_buyer_id uuid,p_session_id uuid,p_command text,p_request_id uuid,p_configuration_digest text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  perform sandbox_commerce_v1.arm_transaction_timeout();
  return sandbox_commerce_v1.test_store_command(p_buyer_id,p_session_id,p_command,p_request_id,p_configuration_digest,p_payload);
end; $$;
create function public.isolated_test_store_ingest_v1(p_connection_id uuid,p_connection_revision integer,p_envelope jsonb,p_observation jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  perform sandbox_commerce_v1.arm_transaction_timeout();
  return sandbox_commerce_v1.test_store_ingest(p_connection_id,p_connection_revision,p_envelope,p_observation);
end; $$;
revoke all on function public.isolated_test_store_command_v1(uuid,uuid,text,uuid,text,jsonb),
  public.isolated_test_store_ingest_v1(uuid,integer,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.isolated_test_store_command_v1(uuid,uuid,text,uuid,text,jsonb),
  public.isolated_test_store_ingest_v1(uuid,integer,jsonb,jsonb) to service_role;
reset role;
revoke create on schema public from sbx_v1_core_owner;

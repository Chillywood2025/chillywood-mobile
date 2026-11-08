-- Fresh inactive capture composition. Derived test-store-paid-video-receipts.sql SHA256 7255b02224da3e0e54fa41802d519beaf9aae3b7c3b7013f7d9cd061161ecce6.
-- Substitute in a fresh profile only; no active replacement.
-- Separate paid-video raw truth; exact settlement may create a private resource
-- grant. No Premium, payout, payable or live-money effect.
set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.test_store_v3_hold(p_ingress uuid,p_scope text,p_customer uuid,p_allocation uuid,p_reason text)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare evidence sandbox_commerce_v1.test_store_v3_ingress; a sandbox_commerce_v1.test_store_v3_allocations;
 c sandbox_commerce_v1.test_store_v3_customers; receipt sandbox_commerce_v1.receipts;
begin
 select * into strict evidence from sandbox_commerce_v1.test_store_v3_ingress where id=p_ingress;
 if p_scope not in ('project','customer','original') then raise exception 'test_store_v3_hold_scope_invalid'; end if;
 insert into sandbox_commerce_v1.test_store_v3_holds(project_id,scope,customer_id,allocation_id,ingress_id,reason)
   values(evidence.project_id,p_scope,p_customer,p_allocation,evidence.id,p_reason);
 for a in select allocation.* from sandbox_commerce_v1.test_store_v3_allocations allocation
   join sandbox_commerce_v1.test_store_v3_customers customer on customer.id=allocation.customer_id
   where customer.project_id=evidence.project_id and (p_scope='project'
     or(p_scope='customer' and customer.id=p_customer) or(p_scope='original' and allocation.id=p_allocation))
 loop
   select * into strict c from sandbox_commerce_v1.test_store_v3_customers where id=a.customer_id;
   for receipt in select * from sandbox_commerce_v1.receipts where intent_id=a.intent_id loop
     perform sandbox_commerce_v1.quarantine_original(receipt.provider,receipt.scope_key,receipt.store,
       receipt.original_transaction_id,c.buyer_id,receipt.product_id,clock_timestamp(),p_reason);
   end loop;
 end loop;
end; $$;
create function sandbox_commerce_v1.test_store_v3_hold_evidence(p_ingress uuid,p_reason text,p_force_unresolved boolean default false)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare evidence sandbox_commerce_v1.test_store_v3_ingress; connection sandbox_commerce_v1.test_store_v3_connections;
 c sandbox_commerce_v1.test_store_v3_customers; a sandbox_commerce_v1.test_store_v3_allocations;
 identity text; identities text[]; resolved integer:=0; unresolved boolean:=false; narrow boolean:=false;
begin
 select * into strict evidence from sandbox_commerce_v1.test_store_v3_ingress where id=p_ingress;
 select * into strict connection from sandbox_commerce_v1.test_store_v3_connections
   where id=evidence.connection_id and revision=evidence.connection_revision;
 -- A discarded unrepresentable identity remains unresolved. Retain every
 -- representable owner below and also fence this project for future identity
 -- registration; successful sibling lookup cannot erase the ambiguity.
 unresolved:=p_force_unresolved or (evidence.observation->'issues') ? 'invalid_unicode_observation';
 -- Only valid, conflict-free exact terminal evidence can stay original-scoped.
 -- Invalid/TRANSFER evidence must also fence future allocations of its identities.
 if not p_force_unresolved and evidence.observation->>'parseStatus'='valid'
   and evidence.observation->>'eventType' in ('CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION')
   and evidence.observation->>'appId'=connection.app_id and evidence.observation->>'store'='TEST_STORE'
   and evidence.observation->>'environment'='SANDBOX' then
   select allocation.* into a from sandbox_commerce_v1.test_store_v3_original_bindings binding
     join sandbox_commerce_v1.test_store_v3_allocations allocation on allocation.id=binding.allocation_id
     where binding.project_id=connection.project_id and binding.app_id=connection.app_id
       and binding.original_transaction_id=evidence.observation->>'originalTransactionId'
       and (evidence.observation->>'transactionId' is null or binding.transaction_id=evidence.observation->>'transactionId');
   if a.id is not null then
     select * into strict c from sandbox_commerce_v1.test_store_v3_customers where id=a.customer_id;
     narrow:=evidence.observation->>'userId'=c.provider_app_user_id
       and evidence.observation->>'originalUserId'=c.provider_app_user_id
       and not exists(select 1 from jsonb_array_elements_text(evidence.observation->'aliases') alias(value) where value<>c.provider_app_user_id)
       and evidence.observation->'conflictingUserIds'='[]'::jsonb
       and (evidence.observation->>'presentedOfferingId' is null or exists(
         select 1 from sandbox_commerce_v1.test_store_v3_registrations registration
         where registration.plan_id=a.plan_id
           and registration.webhook_offering_key=evidence.observation->>'presentedOfferingId'));
     if narrow is true then perform sandbox_commerce_v1.test_store_v3_hold(evidence.id,'original',null,a.id,p_reason); return; end if;
   end if;
 end if;
 select array_agg(distinct value) into identities from (
   select evidence.observation->>'userId' as value union all select evidence.observation->>'originalUserId'
   union all select jsonb_array_elements_text(evidence.observation->'aliases')
   union all select jsonb_array_elements_text(evidence.observation->'transferredFrom')
   union all select jsonb_array_elements_text(evidence.observation->'transferredTo')
   union all select jsonb_array_elements_text(evidence.observation->'conflictingUserIds')
 ) values_of_identity where value is not null;
 foreach identity in array coalesce(identities,array[]::text[]) loop
   select * into c from sandbox_commerce_v1.test_store_v3_customers
     where project_id=connection.project_id and provider_app_user_id=identity;
   if found then perform sandbox_commerce_v1.test_store_v3_hold(evidence.id,'customer',c.id,null,p_reason); resolved:=resolved+1;
   else unresolved:=true; end if;
 end loop;
 if evidence.observation->>'appId'=connection.app_id and evidence.observation->>'store'='TEST_STORE'
   and evidence.observation->>'environment'='SANDBOX' then
   -- Every independently proven original, transaction AND Offering owner is
   -- retained; contradictory references never choose an arbitrary first owner.
   for c in select distinct customer.* from sandbox_commerce_v1.test_store_v3_customers customer
     join sandbox_commerce_v1.test_store_v3_allocations allocation on allocation.customer_id=customer.id
     left join sandbox_commerce_v1.test_store_v3_original_bindings binding on binding.allocation_id=allocation.id
     left join sandbox_commerce_v1.test_store_v3_registrations registration on registration.plan_id=allocation.plan_id
     where customer.project_id=connection.project_id and (
       (binding.project_id=connection.project_id and binding.app_id=connection.app_id and
         (binding.original_transaction_id=evidence.observation->>'originalTransactionId' or binding.transaction_id=evidence.observation->>'transactionId'))
       or registration.webhook_offering_key=evidence.observation->>'presentedOfferingId')
   loop perform sandbox_commerce_v1.test_store_v3_hold(evidence.id,'customer',c.id,null,p_reason); resolved:=resolved+1; end loop;
 elsif (evidence.observation->>'eventType'='TRANSFER'
   and(evidence.observation->>'appId' is null or evidence.observation->>'appId'=connection.app_id)
   and(evidence.observation->>'store' is null or evidence.observation->>'store'='TEST_STORE')
   and(evidence.observation->>'environment' is null or evidence.observation->>'environment'='SANDBOX')) is not true
 then unresolved:=true; end if;
 if resolved=0 or unresolved then perform sandbox_commerce_v1.test_store_v3_hold(evidence.id,'project',null,null,p_reason); end if;
end; $$;

create function sandbox_commerce_v1.test_store_v3_apply_paid_video(p_ingress uuid,p_allocation uuid,p_refund boolean)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare evidence sandbox_commerce_v1.test_store_v3_ingress; a sandbox_commerce_v1.test_store_v3_allocations;
 c sandbox_commerce_v1.test_store_v3_customers; connection sandbox_commerce_v1.test_store_v3_connections;
 i sandbox_commerce_v1.intents; attempt sandbox_commerce_v1.dispatch_attempts;
 original sandbox_commerce_v1.original_states; receipt sandbox_commerce_v1.receipts;
 provider_transaction text; original_id text; purchased timestamptz; event_at timestamptz; final_state text;
begin
 -- This private function is reachable only from raw v3 ingestion after exact
 -- registration/claim/quote validation. There is no service-normalized setter.
 select * into strict evidence from sandbox_commerce_v1.test_store_v3_ingress where id=p_ingress;
 select * into strict a from sandbox_commerce_v1.test_store_v3_allocations where id=p_allocation;
 select * into strict c from sandbox_commerce_v1.test_store_v3_customers where id=a.customer_id;
 select * into strict connection from sandbox_commerce_v1.test_store_v3_connections where id=evidence.connection_id and revision=evidence.connection_revision;
 if not p_refund then perform sandbox_commerce_v1.test_store_v3_assert_capture_admission(connection.project_id); end if;
 select * into strict i from sandbox_commerce_v1.intents where id=a.intent_id for update nowait;
 select * into strict attempt from sandbox_commerce_v1.dispatch_attempts where intent_id=i.id for update nowait;
 original_id:=evidence.observation->>'originalTransactionId'; provider_transaction:=evidence.observation->>'transactionId';
 event_at:=(evidence.observation->>'eventAt')::timestamptz;
 if not exists(select 1 from sandbox_commerce_v1.test_store_v3_original_bindings binding
     where binding.project_id=connection.project_id and binding.app_id=connection.app_id
       and binding.original_transaction_id=original_id and binding.transaction_id=provider_transaction and binding.allocation_id=a.id)
   or i.kind<>'paid_content' or i.provider<>'revenuecat' or i.store<>'test_store' or i.scope_key<>connection.scope_key
   or i.buyer_id<>c.buyer_id or i.buyer_session_id<>a.buyer_session_id or a.quote is distinct from sandbox_commerce_v1.test_store_v3_quote(i)
   or i.dispatch_id is distinct from a.dispatch_id or attempt.dispatch_id<>a.dispatch_id
   or i.dispatched_at is distinct from attempt.claimed_at or i.state not in ('provider_pending','verified')
 then raise exception 'test_store_v3_video_source_mismatch'; end if;
 select * into original from sandbox_commerce_v1.original_states
   where provider='revenuecat' and scope_key=connection.scope_key and store='test_store' and original_transaction_id=original_id for update nowait;
 if original.original_transaction_id is not null and (original.buyer_id<>c.buyer_id
   or original.intent_id is distinct from i.id or original.product_id is distinct from i.product_id
   or original.transaction_id is distinct from provider_transaction)
 then raise exception 'test_store_v3_original_ledger_conflict'; end if;
 if p_refund then
   final_state:=case when original.state in ('revoked','quarantined') then original.state else 'refunded' end;
   insert into sandbox_commerce_v1.original_states(provider,scope_key,store,original_transaction_id,buyer_id,product_id,
     intent_id,transaction_id,state,refunded_minor,amount_minor,currency,last_event_at)
     values('revenuecat',connection.scope_key,'test_store',original_id,c.buyer_id,i.product_id,i.id,provider_transaction,
       final_state,i.amount_minor,i.amount_minor,i.currency,event_at)
     on conflict on constraint original_states_pkey do update set state=excluded.state,
       refunded_minor=greatest(original_states.refunded_minor,excluded.refunded_minor),last_event_at=greatest(original_states.last_event_at,excluded.last_event_at)
     returning * into original;
   if original.receipt_id is not null then update sandbox_commerce_v1.receipts set state=final_state,last_event_at=greatest(last_event_at,event_at)
     where id=original.receipt_id returning * into receipt; end if;
 else
   purchased:=(evidence.observation->>'purchasedAt')::timestamptz;
   if purchased<attempt.claimed_at or purchased>attempt.accept_purchase_until or purchased>evidence.received_at+interval '5 minutes'
     or event_at<purchased or event_at>evidence.received_at+interval '5 minutes'
   then raise exception 'test_store_v3_purchase_window_mismatch'; end if;
   final_state:=case when original.state in ('refunded','revoked','quarantined') then original.state else 'verified' end;
   if original.receipt_id is null then
     insert into sandbox_commerce_v1.receipts(intent_id,provider,scope_key,store,product_id,transaction_id,original_transaction_id,state,purchased_at,expires_at,last_event_at)
       values(i.id,'revenuecat',connection.scope_key,'test_store',i.product_id,provider_transaction,original_id,final_state,purchased,null,
         greatest(event_at,original.last_event_at)) returning * into receipt;
     insert into sandbox_commerce_v1.original_states(provider,scope_key,store,original_transaction_id,buyer_id,product_id,
       intent_id,receipt_id,transaction_id,state,amount_minor,currency,last_event_at)
       values('revenuecat',connection.scope_key,'test_store',original_id,c.buyer_id,i.product_id,i.id,receipt.id,provider_transaction,final_state,i.amount_minor,i.currency,event_at)
       on conflict on constraint original_states_pkey do update set receipt_id=excluded.receipt_id,
         last_event_at=greatest(original_states.last_event_at,excluded.last_event_at);
     insert into sandbox_commerce_v1.transaction_owners(provider,scope_key,store,original_transaction_id,buyer_id,product_id)
       values('revenuecat',connection.scope_key,'test_store',original_id,c.buyer_id,i.product_id);
     update sandbox_commerce_v1.intents set state='verified' where id=i.id;
   else
     select * into strict receipt from sandbox_commerce_v1.receipts where id=original.receipt_id;
     if receipt.purchased_at is distinct from purchased then
       raise exception 'test_store_v3_transaction_time_conflict';
     end if;
   end if;
 end if;
 if receipt.id is not null then insert into sandbox_commerce_v1.receipt_events(provider,scope_key,event_id,payload,receipt_id)
   values('revenuecat',connection.scope_key,evidence.provider_event_id,
     jsonb_build_object('protocol','scv3-test-store-raw-effect-v1','ingressId',evidence.id,'rawSha256',evidence.raw_sha256,'observation',evidence.observation),receipt.id); end if;
 if not p_refund and final_state='verified' then
   perform sandbox_commerce_v1.settle_paid_video_receipt_v3(evidence.id,a.id,receipt.id);
 end if;
 return jsonb_build_object('status','processed','receiptId',receipt.id,'state',final_state,'grantsAccess',false,'notPayable',true,'financialAuthority',false);
end; $$;

create function sandbox_commerce_v1.test_store_v3_ingest(p_connection uuid,p_revision integer,p_envelope jsonb,p_observation jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare controls sandbox_commerce_v1.test_store_v3_controls; c sandbox_commerce_v1.test_store_v3_connections;
 evidence sandbox_commerce_v1.test_store_v3_ingress; prior sandbox_commerce_v1.test_store_v3_ingress;
 a sandbox_commerce_v1.test_store_v3_allocations; customer sandbox_commerce_v1.test_store_v3_customers;
 registration sandbox_commerce_v1.test_store_v3_registrations; i sandbox_commerce_v1.intents;
 attempt sandbox_commerce_v1.dispatch_attempts; binding sandbox_commerce_v1.test_store_v3_original_bindings;
 common jsonb; source_keys text[]; event_id text; raw_hash text; previous_negative uuid; qualification_status text;
 capture_status text; capture_decision text;
 applied jsonb; result jsonb; status text:='held'; reason text; refund boolean:=false;
 conflict boolean:=false; duplicate boolean:=false; purchased timestamptz; event_at timestamptz;
begin
 perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
 select * into strict controls from sandbox_commerce_v1.test_store_v3_controls where singleton for share nowait;
 select * into c from sandbox_commerce_v1.test_store_v3_connections where id=p_connection and revision=p_revision for share nowait;
 if c.id is null or not controls.ingress_enabled or not c.qualified
   or row(controls.connection_id,controls.connection_revision) is distinct from row(c.id,c.revision)
 then raise exception 'test_store_v3_ingress_disabled'; end if;
 -- Private namespace ownership cannot change between the exclusivity check
 -- and projection. This reads no deployed metadata or shared provider tables.
 lock table sandbox_commerce_v1.test_store_connections in share mode nowait;
 lock table sandbox_commerce_v1.test_store_v3_holds in row exclusive mode nowait;
  source_keys:=array['protocol','projectId','providerConfigurationDigest','mode','customerId','presentedOfferingId','purchasedAt','expiresAt',
    'amountMinor','currency','quantity','cancelReason','nonEconomicTest','classificationOnly','authorityGranted'];
  if jsonb_typeof(p_envelope) is distinct from 'object' or octet_length(p_envelope::text)>4194304
    or p_envelope->>'protocol' is distinct from 'rc-router-ingress-v1'
  or p_envelope->>'storageProtocol' is distinct from 'rc-router-lossless-envelope-v1'
    or jsonb_typeof(p_envelope->'originalObservationBase64') is distinct from 'string'
    or jsonb_typeof(p_envelope->'originalObservationSha256') is distinct from 'string'
    or(p_envelope-array['protocol','storageProtocol','originalObservationBase64','originalObservationSha256','rawSha256','rawByteLength','encryption','authentication','observation'])<>'{}'::jsonb
    or coalesce(p_envelope->>'rawSha256','') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_envelope->'rawByteLength') is distinct from 'number'
    or (p_envelope->>'rawByteLength')::integer not between 1 and 262144
    or p_envelope->'authentication' is distinct from jsonb_build_object('method','shared_secret','keyVersion',c.auth_key_version)
    or p_envelope->'encryption'->>'algorithm' is distinct from 'AES-256-GCM'
    or p_envelope->'encryption'->>'keyId' is distinct from c.storage_key_id
    or coalesce(p_envelope->'encryption'->>'nonce','') !~ '^[A-Za-z0-9+/]{16}$'
    or coalesce(p_envelope->'encryption'->>'ciphertext','') !~ '^[A-Za-z0-9+/]+={0,2}$'
    or octet_length(decode(p_envelope->'encryption'->>'ciphertext','base64'))<>(p_envelope->>'rawByteLength')::integer+16
    or jsonb_typeof(p_observation) is distinct from 'object' or octet_length(p_observation::text)>1048576
    or p_observation->>'protocol' is distinct from 'scv3-test-store-observation-v1'
    or p_observation->>'projectId' is distinct from c.project_id
    or p_observation->>'providerConfigurationDigest' is distinct from c.provider_configuration_digest
    or p_observation->'classificationOnly' is distinct from 'true'::jsonb
    or p_observation->'authorityGranted' is distinct from 'false'::jsonb
    or jsonb_typeof(p_observation->'nonEconomicTest') is distinct from 'boolean'
    or not p_observation ?& source_keys
  then raise exception 'test_store_v3_envelope_invalid'; end if;
  if p_envelope->'observation' is distinct from sandbox_commerce_v1.test_store_qualification_safe_common(
    p_envelope->>'originalObservationBase64',p_envelope->>'originalObservationSha256')
  then raise exception 'test_store_v3_original_observation_invalid'; end if;
  common:=p_observation-source_keys;
  if (common-array['parseStatus','issues','eventAt']) is distinct from ((p_envelope->'observation')-array['parseStatus','issues','eventAt'])
    or not common ?& array['parseStatus','issues','eventId','eventType','appId','store','environment','eventAt',
      'userId','originalUserId','aliases','productId','transactionId','originalTransactionId','transferredFrom','transferredTo','conflictingUserIds']
    or (common-array['parseStatus','issues','eventId','eventType','appId','store','environment','eventAt',
      'userId','originalUserId','aliases','productId','transactionId','originalTransactionId','transferredFrom','transferredTo','conflictingUserIds'])<>'{}'::jsonb
    or jsonb_typeof(common->'parseStatus') is distinct from 'string'
    or (common->>'parseStatus' in ('valid','invalid')) is not true
    or exists(select 1 from unnest(array['issues','aliases','transferredFrom','transferredTo','conflictingUserIds']) field(name)
      where jsonb_typeof(common->field.name) is distinct from 'array')
    or jsonb_typeof(p_observation->'mode') is distinct from 'string'
    or (p_observation->>'mode' in ('paid_video_purchase','cancellation','hold')) is not true
  then raise exception 'test_store_v3_observation_invalid'; end if;
  -- The dedicated parser may add invalidity reasons (or reject a timestamp's
  -- exact numeric lexeme) without changing the shared encrypted observation.
  -- It may never remove original ambiguity or turn invalid bytes positive.
  if exists(select 1 from jsonb_array_elements_text(p_envelope->'observation'->'issues') issue(value)
      where not (common->'issues') ? value)
    or (common->>'parseStatus'='valid' and (p_envelope->'observation'->>'parseStatus' is distinct from 'valid'
      or common->'issues'<>'[]'::jsonb or common->'eventAt' is distinct from p_envelope->'observation'->'eventAt'))
    or (common->>'parseStatus'='invalid' and p_observation->>'mode'<>'hold')
  then raise exception 'test_store_v3_observation_derivation_invalid'; end if;
 raw_hash:=p_envelope->>'rawSha256'; event_id:=common->>'eventId';
 if event_id is not null and sandbox_commerce_v1.provider_text(event_id) is not true then raise exception 'test_store_v3_event_invalid'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('test-store-v3-project:'||c.project_id,683))
 then raise exception 'test_store_v3_ingress_busy' using errcode='55P03'; end if;
 select * into evidence from sandbox_commerce_v1.test_store_v3_ingress where project_id=c.project_id and raw_sha256=raw_hash;
 if found then
   duplicate:=true;
   if evidence.observation is distinct from p_observation then
     perform sandbox_commerce_v1.test_store_v3_hold_evidence(evidence.id,'test_store_v3_same_bytes_conflict',true); conflict:=true;
   end if;
 else
   insert into sandbox_commerce_v1.test_store_v3_ingress(connection_id,connection_revision,project_id,provider_event_id,raw_sha256,envelope,observation)
     values(c.id,c.revision,c.project_id,event_id,raw_hash,p_envelope,p_observation) returning * into evidence;
 end if;
 insert into sandbox_commerce_v1.test_store_v3_deliveries(ingress_id,envelope) values(evidence.id,p_envelope);
 -- Evidence is durable within this transaction before any capture admission
 -- decision. Missing/contended admission cannot discard authenticated negatives.
 begin
  qualification_status:=sandbox_commerce_v1.test_store_qualification_gate(c.project_id,raw_hash,event_id,
   common->>'originalTransactionId',common->>'transactionId',common->>'userId');
 exception when others then qualification_status:='capture_unavailable'; end;
 capture_status:=sandbox_commerce_v1.test_store_v3_capture_history(c.project_id,raw_hash,common);
 capture_decision:=sandbox_commerce_v1.test_store_v3_capture_decision(c.project_id);
 if duplicate and (conflict
   or not exists(select 1 from sandbox_commerce_v1.test_store_v3_capture_deferred d where d.ingress_id=evidence.id)
   or exists(select 1 from sandbox_commerce_v1.test_store_v3_effects effect where effect.ingress_id=evidence.id))
 then return jsonb_build_object('protocol','scv3-test-store-ingress-result-v1','receiptId',evidence.id,
   'status',case when conflict then 'conflict' else 'duplicate' end,'durable',true,'acknowledgementAllowed',true,'authorityGranted',false,'financialAuthority',false); end if;
 if event_id is not null then
   select parent.* into prior from sandbox_commerce_v1.test_store_v3_event_keys key
     join sandbox_commerce_v1.test_store_v3_ingress parent on parent.id=key.ingress_id
     where key.project_id=c.project_id and key.provider_event_id=event_id;
   if found then
    if prior.id<>evidence.id then
     perform sandbox_commerce_v1.test_store_v3_hold_evidence(prior.id,'test_store_v3_event_bytes_conflict',true);
     perform sandbox_commerce_v1.test_store_v3_hold_evidence(evidence.id,'test_store_v3_event_bytes_conflict',true);
     conflict:=true; reason:='test_store_v3_event_bytes_conflict';
    end if;
   else insert into sandbox_commerce_v1.test_store_v3_event_keys values(c.project_id,event_id,evidence.id); end if;
 end if;
 if not conflict then
   if qualification_status='qualification_replay' and p_observation->>'mode'='paid_video_purchase' then
     status:='ignored'; reason:='test_store_v3_qualification_history_only';
   elsif qualification_status in ('capture_active','qualification_unresolved','qualification_event_conflict','qualification_economic_history')
     and p_observation->>'mode'='paid_video_purchase' then
     -- New terminal/TRANSFER evidence can still veto current v3 owners. It is
     -- never silently dropped merely because one lineage was qualification-only.
     reason:='test_store_v3_'||qualification_status;
     perform sandbox_commerce_v1.test_store_v3_hold_evidence(evidence.id,reason,true);
   elsif p_envelope->'observation'->>'parseStatus'='valid' and common->>'eventType'='TEST'
     and p_observation->'nonEconomicTest'='true'::jsonb
     and common->>'appId'=c.app_id and common->>'store'='TEST_STORE' and common->>'environment'='SANDBOX'
     and p_observation->>'customerId' is not null and p_observation->>'customerId'=common->>'userId'
     and common->>'originalUserId'=common->>'userId'
     and not exists(select 1 from jsonb_array_elements_text(common->'aliases') alias(value) where value is distinct from common->>'userId')
     and common->>'productId' is null and common->>'transactionId' is null and common->>'originalTransactionId' is null
     and common->'transferredFrom'='[]'::jsonb and common->'transferredTo'='[]'::jsonb and common->'conflictingUserIds'='[]'::jsonb
     and p_observation->>'presentedOfferingId' is null and p_observation->>'purchasedAt' is null
     and p_observation->>'expiresAt' is null and p_observation->>'amountMinor' is null and p_observation->>'currency' is null
     and p_observation->>'quantity' is null and p_observation->>'cancelReason' is null
   then status:='ignored'; reason:='test_store_v3_test_event';
   else
     -- A provider field is not an intent ID. It must equal the immutable,
     -- independently qualified representation registered for this Offering.
     if p_observation->>'presentedOfferingId' is not null then
       select r.* into registration from sandbox_commerce_v1.test_store_v3_registrations r
         join sandbox_commerce_v1.test_store_v3_plans plan on plan.id=r.plan_id
         join sandbox_commerce_v1.test_store_v3_customers owner on owner.id=plan.customer_id
         where r.webhook_offering_key=p_observation->>'presentedOfferingId' and owner.project_id=c.project_id;
       if registration.id is not null then select * into a from sandbox_commerce_v1.test_store_v3_allocations where plan_id=registration.plan_id; end if;
     elsif p_observation->>'mode'='cancellation' then
       -- Missing terminal context may use already immutable original ownership;
       -- no user/SKU/time/current-candidate fallback is permitted.
       select allocation.* into a from sandbox_commerce_v1.test_store_v3_original_bindings owner
         join sandbox_commerce_v1.test_store_v3_allocations allocation on allocation.id=owner.allocation_id
         where owner.project_id=c.project_id and owner.app_id=c.app_id and owner.original_transaction_id=common->>'originalTransactionId';
       if a.id is not null then select * into registration from sandbox_commerce_v1.test_store_v3_registrations where plan_id=a.plan_id; end if;
     end if;
     if a.id is null or registration.id is null then reason:='test_store_v3_registered_correlation_missing';
     else
       select * into strict customer from sandbox_commerce_v1.test_store_v3_customers where id=a.customer_id;
       select * into strict i from sandbox_commerce_v1.intents where id=a.intent_id;
       select * into attempt from sandbox_commerce_v1.dispatch_attempts where intent_id=i.id;
       if common->>'parseStatus' is distinct from 'valid' or common->>'appId' is distinct from c.app_id
         or common->>'store' is distinct from 'TEST_STORE' or common->>'environment' is distinct from 'SANDBOX'
         or common->>'userId' is distinct from customer.provider_app_user_id
         or common->>'originalUserId' is distinct from customer.provider_app_user_id
         or p_observation->>'customerId' is distinct from customer.provider_app_user_id
         or exists(select 1 from jsonb_array_elements_text(common->'aliases') alias(value) where value<>customer.provider_app_user_id)
       then reason:='test_store_v3_identity_or_scope_unqualified';
       elsif p_observation->>'mode' not in ('paid_video_purchase','cancellation') then reason:='test_store_v3_lifecycle_requires_review';
       elsif attempt.intent_id is null or attempt.dispatch_id<>a.dispatch_id or i.dispatch_id is distinct from a.dispatch_id
         or i.dispatched_at is distinct from attempt.claimed_at or i.state not in ('provider_pending','verified')
         or i.buyer_id<>customer.buyer_id or i.buyer_session_id<>a.buyer_session_id or a.quote is distinct from sandbox_commerce_v1.test_store_v3_quote(i)
         or i.kind<>'paid_content' or i.provider<>'revenuecat' or i.store<>'test_store' or i.scope_key<>c.scope_key
         or registration.product_id<>i.product_id
         or (common->>'productId' is not null and common->>'productId'<>i.product_id)
         or sandbox_commerce_v1.provider_text(common->>'originalTransactionId') is not true
         or sandbox_commerce_v1.provider_text(common->>'transactionId') is not true
         or p_observation->>'currency' is distinct from 'usd'
       then reason:='test_store_v3_admitted_source_mismatch';
       elsif exists(select 1 from sandbox_commerce_v1.test_store_connections where project_id=c.project_id)
       then reason:='test_store_v3_project_has_v1_owner';
       else
         event_at:=(common->>'eventAt')::timestamptz;
         if event_at is null or event_at>evidence.received_at+interval '5 minutes' then reason:='test_store_v3_event_time_unqualified';
         elsif p_observation->>'mode'='paid_video_purchase' then
           if common->>'eventType' is distinct from 'NON_RENEWING_PURCHASE' or common->>'productId' is distinct from i.product_id
             or p_observation->>'presentedOfferingId' is distinct from registration.webhook_offering_key
             or jsonb_typeof(p_observation->'amountMinor') is distinct from 'number'
             or p_observation->'amountMinor' is distinct from to_jsonb(i.amount_minor)
             or p_observation->'quantity' is distinct from '1'::jsonb or p_observation->'expiresAt' is distinct from 'null'::jsonb
           then reason:='test_store_v3_purchase_economics_unqualified';
           else
             purchased:=(p_observation->>'purchasedAt')::timestamptz;
             if purchased is null or purchased<attempt.claimed_at or purchased>attempt.accept_purchase_until
               or purchased>evidence.received_at+interval '5 minutes' or event_at<purchased
             then reason:='test_store_v3_purchase_window_mismatch'; end if;
           end if;
         else
           if c.refund_contract<>'cancellation_customer_support_full_paid_video_v1'
             or common->>'eventType' is distinct from 'CANCELLATION' or p_observation->>'cancelReason' is distinct from 'CUSTOMER_SUPPORT'
             or jsonb_typeof(p_observation->'amountMinor') is distinct from 'number'
             or p_observation->'amountMinor' is distinct from to_jsonb(-i.amount_minor)
             or p_observation->'expiresAt' is distinct from 'null'::jsonb
           then reason:='test_store_v3_cancellation_requires_review'; else refund:=true; end if;
         end if;
         if reason is null and not refund and (capture_decision='excluded'
           or capture_status in ('capture_active','qualification_unresolved','qualification_event_conflict','qualification_economic_history','qualification_replay'))
         then reason:='test_store_v3_capture_admission_required'; end if;
         if reason is null and not refund and (capture_decision='unavailable'
           or capture_status='capture_unavailable' or qualification_status='capture_unavailable') then
          -- Transient uncertainty retains immutable evidence without inventing
          -- a terminal hold. Only exact stored evidence may later re-project.
          insert into sandbox_commerce_v1.test_store_v3_capture_deferred(ingress_id,reason)
           values(evidence.id,'capture_admission_unavailable') on conflict do nothing;
          return jsonb_build_object('protocol','scv3-test-store-ingress-result-v1','receiptId',evidence.id,
           'status','recorded','durable',true,'acknowledgementAllowed',true,'authorityGranted',false,'financialAuthority',false);
         end if;
         if reason is null and not refund and (capture_decision is distinct from 'admitted' or capture_status is distinct from 'not_qualification')
         then reason:='test_store_v3_capture_admission_required'; end if;
         if reason is null then
           if exists(select 1 from sandbox_commerce_v1.test_store_v3_original_bindings owner
             where owner.project_id=c.project_id and owner.app_id=c.app_id
               and(owner.original_transaction_id=common->>'originalTransactionId' or owner.transaction_id=common->>'transactionId' or owner.allocation_id=a.id)
               and(owner.original_transaction_id<>common->>'originalTransactionId' or owner.transaction_id<>common->>'transactionId' or owner.allocation_id<>a.id))
           then reason:='test_store_v3_original_reused';
           else
             select * into binding from sandbox_commerce_v1.test_store_v3_original_bindings owner
               where owner.project_id=c.project_id and owner.app_id=c.app_id and owner.original_transaction_id=common->>'originalTransactionId';
             if binding.allocation_id is null then
               insert into sandbox_commerce_v1.test_store_v3_original_bindings values(c.project_id,c.app_id,
                 common->>'originalTransactionId',common->>'transactionId',a.id,evidence.id);
               for previous_negative in select previous.id from sandbox_commerce_v1.test_store_v3_ingress previous
                 join sandbox_commerce_v1.test_store_v3_effects effect on effect.ingress_id=previous.id
                 where previous.project_id=c.project_id and effect.status='held'
                   and previous.observation->>'appId'=c.app_id and previous.observation->>'store'='TEST_STORE'
                   and previous.observation->>'environment'='SANDBOX'
                   and(previous.observation->>'originalTransactionId'=common->>'originalTransactionId'
                     or previous.observation->>'transactionId'=common->>'transactionId')
               loop perform sandbox_commerce_v1.test_store_v3_hold_evidence(previous_negative,'test_store_v3_prior_original_negative'); end loop;
             end if;
             if sandbox_commerce_v1.test_store_v3_is_held(customer.id,a.id) then reason:='test_store_v3_prior_negative_evidence';
             else
               begin
                 applied:=sandbox_commerce_v1.test_store_v3_apply_paid_video(evidence.id,a.id,refund);
                 status:='processed'; reason:='test_store_v3_video_evidence_recorded';
               exception when raise_exception or unique_violation then
                 reason:='test_store_v3_projection_conflict';
               end;
             end if;
           end if;
         end if;
       end if;
     end if;
     if status<>'processed' then perform sandbox_commerce_v1.test_store_v3_hold_evidence(evidence.id,coalesce(reason,'test_store_v3_unclassified_evidence')); end if;
   end if;
 end if;
 result:=jsonb_build_object('protocol','scv3-test-store-ingress-result-v1','receiptId',evidence.id,
   'status',case when conflict then 'conflict' else 'recorded' end,'durable',true,'acknowledgementAllowed',true,'authorityGranted',false,'financialAuthority',false);
 insert into sandbox_commerce_v1.test_store_v3_effects values(evidence.id,status,
   result||jsonb_build_object('projectionReason',reason,'projection',applied));
 return result;
end; $$;
revoke all on function sandbox_commerce_v1.test_store_v3_hold(uuid,text,uuid,uuid,text),
 sandbox_commerce_v1.test_store_v3_hold_evidence(uuid,text,boolean),sandbox_commerce_v1.test_store_v3_apply_paid_video(uuid,uuid,boolean),
 sandbox_commerce_v1.test_store_v3_ingest(uuid,integer,jsonb,jsonb) from public,anon,authenticated,service_role;
reset role;
grant usage,create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.isolated_test_store_ingest_v3(p_connection_id uuid,p_connection_revision integer,p_envelope jsonb,p_observation jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.test_store_v3_ingest(p_connection_id,p_connection_revision,p_envelope,p_observation);
end; $$;
revoke all on function public.isolated_test_store_ingest_v3(uuid,integer,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.isolated_test_store_ingest_v3(uuid,integer,jsonb,jsonb) to service_role;
reset role;
revoke create on schema public from sbx_v1_core_owner;

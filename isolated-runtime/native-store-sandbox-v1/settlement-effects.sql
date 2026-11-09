-- Dormant source-only exact native effects. No observed protocol is seeded.
-- Dispatch/no-charge admission is NOT settlement mapping qualification.
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.native_store_settlement_protocols(
 id uuid not null,revision bigint not null check(revision between 1 and 9007199254740991),primary key(id,revision),
 sample_qualification_id uuid not null,sample_qualification_revision bigint not null,
 sample_claim_id uuid not null references sandbox_commerce_v1.native_store_claims,
 sample_raw_receipt_id uuid not null,
 pair_evidence_sha256 text not null check(pair_evidence_sha256~'^[a-f0-9]{64}$'),
 lifecycle_evidence_sha256 text not null check(lifecycle_evidence_sha256~'^[a-f0-9]{64}$'),
 policy text not null check(policy='exact_native_usd_consumable_v1'),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(sample_qualification_id,sample_qualification_revision) references sandbox_commerce_v1.native_store_protocol_qualifications(id,revision)
);
create table sandbox_commerce_v1.native_store_settlement_revocations(
 protocol_id uuid not null,protocol_revision bigint not null,reason text not null check(length(reason)>0),
 created_at timestamptz not null default clock_timestamp(),primary key(protocol_id,protocol_revision),
 foreign key(protocol_id,protocol_revision) references sandbox_commerce_v1.native_store_settlement_protocols(id,revision)
);
create table sandbox_commerce_v1.native_store_negative_tombstones(
 id uuid primary key default gen_random_uuid(),scope_key text not null,transaction_id text not null,original_transaction_id text not null,
 product_id text not null,buyer_id uuid not null,raw_receipt_id uuid not null references sandbox_commerce_v1.native_store_pending_raw,
 created_at timestamptz not null default clock_timestamp(),unique(scope_key,original_transaction_id)
);
create index native_store_negative_transaction on sandbox_commerce_v1.native_store_negative_tombstones(scope_key,transaction_id);
create table sandbox_commerce_v1.native_store_allocations(
 id uuid primary key default gen_random_uuid(),raw_receipt_id uuid not null unique references sandbox_commerce_v1.native_store_pending_raw,
 claim_id uuid not null unique references sandbox_commerce_v1.native_store_claims,
 selection_id uuid not null unique references sandbox_commerce_v1.native_store_selections,
 reservation_id uuid not null unique references sandbox_commerce_v1.native_store_reservations,
 attempt_id uuid not null unique references sandbox_commerce_v1.native_store_dispatch_attempts,
 protocol_id uuid not null,protocol_revision bigint not null,
 core_receipt_id uuid not null unique references sandbox_commerce_v1.receipts,
 buyer_id uuid not null,scope_key text not null,transaction_id text not null,original_transaction_id text not null,
 created_at timestamptz not null default clock_timestamp(),unique(scope_key,transaction_id),unique(scope_key,original_transaction_id),
 foreign key(protocol_id,protocol_revision) references sandbox_commerce_v1.native_store_settlement_protocols(id,revision)
);
create table sandbox_commerce_v1.native_store_raw_effects(
 raw_receipt_id uuid primary key references sandbox_commerce_v1.native_store_pending_raw,
 raw_sha256 text not null check(raw_sha256~'^[a-f0-9]{64}$'),connection_id uuid not null,connection_revision bigint not null,
 protocol_id uuid not null,protocol_revision bigint not null,event_id text not null,
 kind text not null check(kind in('positive_applied','negative_applied','purchase_tombstoned')),
 claim_id uuid references sandbox_commerce_v1.native_store_claims,projection jsonb not null check(jsonb_typeof(projection)='object'),
 core_receipt_id uuid references sandbox_commerce_v1.receipts,
 tombstone_id uuid references sandbox_commerce_v1.native_store_negative_tombstones,
 created_at timestamptz not null default clock_timestamp(),
 check((kind='positive_applied' and core_receipt_id is not null and tombstone_id is null) or (kind in('negative_applied','purchase_tombstoned') and tombstone_id is not null and core_receipt_id is null)),
 foreign key(protocol_id,protocol_revision) references sandbox_commerce_v1.native_store_settlement_protocols(id,revision)
);
create index native_store_link_project on sandbox_commerce_v1.native_store_core_links(project_id,core_receipt_id);
do $$declare t text;begin
 foreach t in array array['native_store_settlement_protocols','native_store_settlement_revocations','native_store_negative_tombstones','native_store_allocations','native_store_raw_effects'] loop
  execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
  execute format('alter table sandbox_commerce_v1.%I force row level security',t);
  execute format('create policy owner_only on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using(true) with check(true)',t);
  execute format('revoke all on sandbox_commerce_v1.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger immutable before update or delete on sandbox_commerce_v1.%I for each row execute function sandbox_commerce_v1.native_store_quote_immutable()',t);
  execute format('create trigger immutable_truncate before truncate on sandbox_commerce_v1.%I for each statement execute function sandbox_commerce_v1.native_store_quote_immutable()',t);
 end loop;
end $$;
-- Processing completion is append-only and does not erase negative receipt holds.
create function sandbox_commerce_v1.native_store_project_pending(p_project text) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from sandbox_commerce_v1.native_store_pending_raw p
 where p.project_id=p_project and not exists(select 1 from sandbox_commerce_v1.native_store_raw_effects e
 where e.raw_receipt_id=p.raw_receipt_id and e.raw_sha256=p.raw_sha256))
$$;
revoke all on function sandbox_commerce_v1.native_store_project_pending(text) from public,anon,authenticated,service_role;
create or replace function sandbox_commerce_v1.native_store_link_guard() returns trigger
language plpgsql security definer set search_path='' as $$declare r sandbox_commerce_v1.receipts;i sandbox_commerce_v1.intents;begin
 perform sandbox_commerce_v1.native_store_lock_project(new.project_id);
 if sandbox_commerce_v1.native_store_project_pending(new.project_id)
 then raise exception 'native_store_project_evidence_pending';end if;
 select * into strict r from sandbox_commerce_v1.receipts where id=new.core_receipt_id for share nowait;
 select * into strict i from sandbox_commerce_v1.intents where id=r.intent_id for share nowait;
 if r.provider<>'revenuecat' or r.store not in('APP_STORE','PLAY_STORE') or i.buyer_id<>new.buyer_id
  or jsonb_typeof(r.scope_key::jsonb)<>'array' or jsonb_array_length(r.scope_key::jsonb)<>6
  or (r.scope_key::jsonb)->>0 is distinct from 'native-store-sandbox-v1' or (r.scope_key::jsonb)->>1 is distinct from 'revenuecat'
  or (r.scope_key::jsonb)->>2 is distinct from new.project_id or jsonb_typeof((r.scope_key::jsonb)->3) is distinct from 'string' or length(coalesce((r.scope_key::jsonb)->>3,''))=0
  or (r.scope_key::jsonb)->>4 is distinct from r.store or (r.scope_key::jsonb)->>5 is distinct from 'SANDBOX'
  or row(r.provider,r.scope_key,r.store,r.product_id) is distinct from row(i.provider,i.scope_key,i.store,i.product_id)
 then raise exception 'native_store_exact_core_link_required';end if;
 return new;
end $$;

create function sandbox_commerce_v1.native_store_resolve_completed_pending(p_raw uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare p sandbox_commerce_v1.native_store_pending_raw;
begin
 select * into strict p from sandbox_commerce_v1.native_store_pending_raw where raw_receipt_id=p_raw;
 perform sandbox_commerce_v1.native_store_lock_project(p.project_id);
 if not exists(select 1 from sandbox_commerce_v1.native_store_raw_effects e where e.raw_receipt_id=p_raw and e.raw_sha256=p.raw_sha256)
 then raise exception 'native_store_effect_completion_required';end if;
 lock table sandbox_commerce_v1.resource_delivery_holds in row exclusive mode nowait;
 update sandbox_commerce_v1.resource_delivery_holds h set resolved_at=clock_timestamp()
 where h.reason='native_store_pending_raw:'||p_raw and h.resolved_at is null
 and exists(select 1 from sandbox_commerce_v1.native_store_core_links l
 where l.project_id=p.project_id and l.core_receipt_id=h.receipt_id and l.buyer_id=h.buyer_id);
end $$;
revoke all on function sandbox_commerce_v1.native_store_resolve_completed_pending(uuid) from public,anon,authenticated,service_role;
create function sandbox_commerce_v1.native_store_settlement_protocol(p_id uuid,p_revision bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p sandbox_commerce_v1.native_store_settlement_protocols;q sandbox_commerce_v1.native_store_protocol_qualifications;
 c sandbox_commerce_v1.native_store_claims;s sandbox_commerce_v1.native_store_selections;
 r sandbox_commerce_v1.native_store_reservations;a sandbox_commerce_v1.native_store_dispatch_attempts;
 raw jsonb;o jsonb;cat jsonb;scope text;
begin
 perform sandbox_commerce_v1.assert_generation(false);
 if current_setting('transaction_timeout')::interval not between interval '1 microsecond' and interval '5 seconds' then raise exception 'native_store_effect_budget_required';end if;
 lock table sandbox_commerce_v1.native_store_settlement_protocols,sandbox_commerce_v1.native_store_settlement_revocations in share mode nowait;
 select * into p from sandbox_commerce_v1.native_store_settlement_protocols where id=p_id and revision=p_revision for share nowait;
 if p.id is null or exists(select 1 from sandbox_commerce_v1.native_store_settlement_revocations where protocol_id=p_id and protocol_revision=p_revision)
 then raise exception 'native_store_settlement_protocol_unavailable' using errcode='42501';end if;
 select * into strict q from sandbox_commerce_v1.native_store_protocol_qualifications where id=p.sample_qualification_id and revision=p.sample_qualification_revision;
 select * into strict c from sandbox_commerce_v1.native_store_claims where id=p.sample_claim_id;
 select * into strict s from sandbox_commerce_v1.native_store_selections where id=c.selection_id and buyer_id=c.buyer_id;
 select * into strict r from sandbox_commerce_v1.native_store_reservations where selection_id=s.id and buyer_id=s.buyer_id;
 select * into strict a from sandbox_commerce_v1.native_store_dispatch_attempts where reservation_id=r.id and buyer_id=s.buyer_id;
 if not exists(select 1 from sandbox_commerce_v1.native_store_qualified_attempts x where x.attempt_id=a.id and x.qualification_id=q.id and x.qualification_revision=q.revision)
  or r.quote is distinct from s.quote or q.quote_digest<>s.quote->>'quoteDigest'
  or q.catalog_binding_id::text<>substring(s.quote#>>'{catalog,bindingId}' from 15) or q.catalog_revision<>(s.quote#>>'{catalog,revision}')::bigint
 then raise exception 'native_store_settlement_sample_invalid' using errcode='42501';end if;
 cat:=s.quote->'catalog';raw:=native_store_sandbox_v1.settlement_source(p.sample_raw_receipt_id);o:=raw->'observation';
 if raw is null or raw->>'connectionId'<>q.connection_id::text or (raw->>'connectionRevision')::bigint<>q.connection_revision
  or raw->>'projectId' is distinct from cat->>'projectId' or raw->>'appId' is distinct from cat->>'appId' or raw->>'store' is distinct from cat->>'store'
  or raw->>'environment' is distinct from 'SANDBOX' or raw->'conflicted' is distinct from 'false'::jsonb or jsonb_array_length(raw->'eventIds')<>1
  or o->>'parseStatus' is distinct from 'valid' or o->'issues' is distinct from '[]'::jsonb or o->>'eventType' is distinct from 'NON_RENEWING_PURCHASE'
  or o->>'userId' is distinct from c.buyer_id::text or o->>'transactionId' is distinct from c.transaction_identifier
  or o->>'productId' is distinct from c.product_identifier or c.product_identifier is distinct from cat->>'wireProductId'
  or o->>'originalTransactionId' is null or o->>'eventAt' is null
  or o->'conflictingUserIds' is distinct from '[]'::jsonb or o->'transferredFrom' is distinct from '[]'::jsonb or o->'transferredTo' is distinct from '[]'::jsonb
 then raise exception 'native_store_settlement_sample_invalid' using errcode='42501';end if;
 scope:=jsonb_build_array('native-store-sandbox-v1','revenuecat',raw->>'projectId',raw->>'appId',raw->>'store','SANDBOX')::text;
 return jsonb_build_object('id',p.id,'revision',p.revision,'policy',p.policy,'projectId',raw->>'projectId','appId',raw->>'appId','store',raw->>'store',
  'productId',c.product_identifier,'connectionId',q.connection_id,'connectionRevision',q.connection_revision,'scopeKey',scope,
  'platform',q.platform,'nativeBuild',q.native_build,'nativeVersion',q.native_version,'signedAppVersion',q.signed_app_version,'sdkVersion',q.sdk_version);
end $$;
revoke all on function sandbox_commerce_v1.native_store_settlement_protocol(uuid,bigint) from public,anon,authenticated,service_role;
-- This is current retained-access eligibility, never a purchase or settlement permission.
create function sandbox_commerce_v1.native_store_assert_current_allocation(p_receipt uuid,p_buyer uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a sandbox_commerce_v1.native_store_allocations;e sandbox_commerce_v1.native_store_raw_effects;
 c sandbox_commerce_v1.native_store_claims;s sandbox_commerce_v1.native_store_selections;
 r sandbox_commerce_v1.native_store_reservations;attempt sandbox_commerce_v1.native_store_dispatch_attempts;
 q sandbox_commerce_v1.native_store_protocol_qualifications;raw jsonb;mapping jsonb;project text;
begin
 perform sandbox_commerce_v1.assert_generation(false);
 select * into a from sandbox_commerce_v1.native_store_allocations where core_receipt_id=p_receipt and buyer_id=p_buyer;
 if a.id is null then raise exception 'native_store_current_allocation_required' using errcode='42501';end if;
 project:=(a.scope_key::jsonb)->>2;perform sandbox_commerce_v1.native_store_lock_project(project);
 lock table sandbox_commerce_v1.native_store_protocol_revocations in share mode nowait;
 if sandbox_commerce_v1.native_store_project_pending(project) then raise exception 'native_store_project_evidence_pending' using errcode='42501';end if;
 select * into strict e from sandbox_commerce_v1.native_store_raw_effects where raw_receipt_id=a.raw_receipt_id;
 if e.kind<>'positive_applied' or e.core_receipt_id<>p_receipt or e.claim_id is distinct from a.claim_id
 or not exists(select 1 from sandbox_commerce_v1.native_store_core_links l where l.core_receipt_id=p_receipt and l.buyer_id=p_buyer and l.project_id=project)
 or exists(select 1 from sandbox_commerce_v1.native_store_negative_tombstones t where t.scope_key=a.scope_key
 and (t.transaction_id=a.transaction_id or t.original_transaction_id=a.original_transaction_id))
 then raise exception 'native_store_current_allocation_held' using errcode='42501';end if;
 raw:=native_store_sandbox_v1.settlement_source(a.raw_receipt_id);
 mapping:=sandbox_commerce_v1.native_store_settlement_protocol(a.protocol_id,a.protocol_revision);
 if raw is null or raw->>'rawSha256' is distinct from e.raw_sha256
 or raw->>'connectionId' is distinct from e.connection_id::text or raw->>'connectionRevision' is distinct from e.connection_revision::text
 or raw->'originalRevisionRevoked' is distinct from 'false'::jsonb or raw->'conflicted' is distinct from 'false'::jsonb
 or raw->'intakeEnabled' is distinct from 'true'::jsonb or mapping->>'scopeKey' is distinct from a.scope_key
 then raise exception 'native_store_current_original_evidence_required' using errcode='42501';end if;
 select * into strict c from sandbox_commerce_v1.native_store_claims where id=a.claim_id and selection_id=a.selection_id and buyer_id=p_buyer;
 select * into strict s from sandbox_commerce_v1.native_store_selections where id=a.selection_id and buyer_id=p_buyer;
 select * into strict r from sandbox_commerce_v1.native_store_reservations where id=a.reservation_id and selection_id=s.id and buyer_id=p_buyer;
 select * into strict attempt from sandbox_commerce_v1.native_store_dispatch_attempts where id=a.attempt_id and reservation_id=r.id and buyer_id=p_buyer;
 select qualification.* into strict q from sandbox_commerce_v1.native_store_qualified_attempts qa
 join sandbox_commerce_v1.native_store_protocol_qualifications qualification on qualification.id=qa.qualification_id and qualification.revision=qa.qualification_revision
 where qa.attempt_id=attempt.id;
 if exists(select 1 from sandbox_commerce_v1.native_store_protocol_revocations v where v.qualification_id=q.id and v.qualification_revision=q.revision)
 or q.connection_id<>e.connection_id or q.connection_revision<>e.connection_revision or q.quote_digest is distinct from s.quote->>'quoteDigest'
 or r.quote is distinct from s.quote or c.transaction_identifier<>a.transaction_id
 or c.product_identifier is distinct from raw#>>'{observation,productId}'
 or raw#>>'{observation,userId}' is distinct from p_buyer::text
 or raw#>>'{observation,transactionId}' is distinct from a.transaction_id
 or raw#>>'{observation,originalTransactionId}' is distinct from a.original_transaction_id
 then raise exception 'native_store_current_allocation_binding_required' using errcode='42501';end if;
 perform sandbox_commerce_v1.assert_generation(false);
 return jsonb_build_object('allocationId','nssv1_allocation_'||a.id,'projectId',project,'originalTransactionId',a.original_transaction_id);
end $$;
revoke all on function sandbox_commerce_v1.native_store_assert_current_allocation(uuid,uuid) from public,anon,authenticated,service_role;

-- Invalid native candidates are filtered without hiding another valid Test Store
-- grant. Lock contention/timeout is not swallowed as a negative authorization.
create function sandbox_commerce_v1.native_store_current_allocation_ok(p_receipt uuid,p_buyer uuid) returns boolean
language plpgsql volatile security invoker set search_path='' as $$begin
 perform sandbox_commerce_v1.native_store_assert_current_allocation(p_receipt,p_buyer);return true;
 exception when insufficient_privilege or no_data_found then return false;
end $$;
revoke all on function sandbox_commerce_v1.native_store_current_allocation_ok(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function sandbox_commerce_v1.current_resource_grant(p_user uuid,p_product uuid,p_revision bigint)
returns sandbox_commerce_v1.resource_grants language plpgsql volatile security invoker set search_path='' as $$
declare g sandbox_commerce_v1.resource_grants; receipt_until timestamptz;
begin
 select x.* into g from sandbox_commerce_v1.resource_grants x
 join sandbox_commerce_v1.receipts r on r.id=x.receipt_id
 join sandbox_commerce_v1.intents i on i.id=r.intent_id
 where x.buyer_id=p_user and x.product_id=p_product and x.product_revision=p_revision
 and x.revoked_at is null and isfinite(x.starts_at) and x.starts_at<=clock_timestamp()
 and (x.expires_at is null or (isfinite(x.expires_at) and x.expires_at>clock_timestamp()))
 and r.state='verified' and isfinite(r.purchased_at) and r.purchased_at<=clock_timestamp()
 and (r.expires_at is null or (isfinite(r.expires_at) and r.expires_at>clock_timestamp()))
 and (case when r.provider='revenuecat' and r.store in('APP_STORE','PLAY_STORE') then sandbox_commerce_v1.native_store_current_allocation_ok(r.id,p_user) else true end)
 and i.state='verified' and i.buyer_id=p_user and i.resource_id=p_product and i.resource_revision=p_revision
 and not exists(select 1 from sandbox_commerce_v1.resource_delivery_holds h where h.buyer_id=p_user
   and (h.receipt_id is null or h.receipt_id=r.id) and h.resolved_at is null)
 order by x.expires_at desc nulls first,x.id limit 1 for share of x,r,i nowait;
 if not found then raise exception 'sandbox_current_exact_resource_grant_required' using errcode='42501'; end if;
 -- The grant is immutable, but provider receipt facts may later shorten their
 -- window. Return a bounded local projection; never extend or rewrite the grant.
 select expires_at into receipt_until from sandbox_commerce_v1.receipts where id=g.receipt_id;
 g.expires_at:=least(g.expires_at,receipt_until);
 return g;
end; $$;

-- Trusted backend boundary: projection comes only from authenticated original
-- journal replay. SQL rebinds all immutable rows, but does not claim to decrypt
-- ciphertext or authenticate provider HTTP itself. No caller verified flag.
create function sandbox_commerce_v1.native_store_apply_effect(p_raw_receipt_id uuid,p_claim_id uuid,p_protocol_id uuid,p_protocol_revision bigint,p_projection jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw jsonb;o jsonb;mapping jsonb;prior sandbox_commerce_v1.native_store_raw_effects;
 c sandbox_commerce_v1.native_store_claims;s sandbox_commerce_v1.native_store_selections;
 r sandbox_commerce_v1.native_store_reservations;attempt sandbox_commerce_v1.native_store_dispatch_attempts;
 q sandbox_commerce_v1.native_store_protocol_qualifications;allocation sandbox_commerce_v1.native_store_allocations;
 tomb sandbox_commerce_v1.native_store_negative_tombstones;intent sandbox_commerce_v1.intents;
 receipt sandbox_commerce_v1.receipts;grantrow sandbox_commerce_v1.resource_grants;
 resource sandbox_commerce_v1.resources;version sandbox_commerce_v1.resource_versions;offer sandbox_commerce_v1.offers;
 video sandbox_commerce_v1.video_terms;asset sandbox_commerce_v1.delivery_assets;
 buyer uuid;project text;scope text;txn text;chain text;product text;event_id text;kind text;effect_kind text;
 event_at timestamptz;purchased_at timestamptz;amount bigint;owner_until timestamptz;result jsonb;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.assert_provider_service();
 perform sandbox_commerce_v1.assert_generation(false);
 if jsonb_typeof(p_projection) is distinct from 'object' or
 (select array_agg(key order by key) from jsonb_object_keys(p_projection) key) is distinct from
 array['amountMinor','cancelReason','currency','eventAt','kind','protocol','purchasedAt','quantity','rawSha256']::text[]
 or p_projection->>'protocol' is distinct from 'native-store-authenticated-effect-v1'
 or not coalesce(p_projection->>'kind' in('purchase','refund'),false) then raise exception 'native_store_effect_projection_shape';end if;
 raw:=native_store_sandbox_v1.settlement_source(p_raw_receipt_id);o:=raw->'observation';
 mapping:=sandbox_commerce_v1.native_store_settlement_protocol(p_protocol_id,p_protocol_revision);
 if raw is null or raw->>'rawSha256' is distinct from p_projection->>'rawSha256'
 or raw->>'projectId' is distinct from mapping->>'projectId' or raw->>'appId' is distinct from mapping->>'appId'
 or raw->>'store' is distinct from mapping->>'store' or raw->>'environment' is distinct from 'SANDBOX'
 or raw->>'connectionId' is distinct from mapping->>'connectionId' or raw->>'connectionRevision' is distinct from mapping->>'connectionRevision'
 or raw->'conflicted' is distinct from 'false'::jsonb or jsonb_array_length(raw->'eventIds')<>1
 or o->>'parseStatus' is distinct from 'valid' or o->'issues' is distinct from '[]'::jsonb
 or o->'conflictingUserIds' is distinct from '[]'::jsonb or o->'transferredFrom' is distinct from '[]'::jsonb or o->'transferredTo' is distinct from '[]'::jsonb
 or o->>'productId' is distinct from mapping->>'productId'
 or o->>'userId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or coalesce(length(o->>'transactionId'),0)=0 or coalesce(length(o->>'originalTransactionId'),0)=0
 or coalesce(length(o->>'eventId'),0)=0
 then raise exception 'native_store_authenticated_original_required' using errcode='42501';end if;
 project:=raw->>'projectId';scope:=mapping->>'scopeKey';buyer:=(o->>'userId')::uuid;
 txn:=o->>'transactionId';chain:=o->>'originalTransactionId';product:=o->>'productId';event_id:=o->>'eventId';kind:=p_projection->>'kind';
 event_at:=(p_projection->>'eventAt')::timestamptz;
 if event_at is null or not isfinite(event_at) or event_at>clock_timestamp() or event_at is distinct from (o->>'eventAt')::timestamptz
 then raise exception 'native_store_effect_time_invalid';end if;
 if not exists(select 1 from sandbox_commerce_v1.native_store_pending_raw p where p.raw_receipt_id=p_raw_receipt_id and p.project_id=project and p.raw_sha256=raw->>'rawSha256')
 then raise exception 'native_store_effect_pending_parent_required';end if;
 select * into prior from sandbox_commerce_v1.native_store_raw_effects where raw_receipt_id=p_raw_receipt_id;
 if prior.raw_receipt_id is not null then
  if row(prior.raw_sha256,prior.connection_id,prior.connection_revision,prior.protocol_id,prior.protocol_revision,prior.claim_id,prior.projection)
  is distinct from row(raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,p_claim_id,p_projection)
  then raise exception 'native_store_effect_idempotency_conflict';end if;
  if prior.kind='positive_applied' then
   select * into strict allocation from sandbox_commerce_v1.native_store_allocations where raw_receipt_id=p_raw_receipt_id;
   select * into strict grantrow from sandbox_commerce_v1.resource_grants where receipt_id=allocation.core_receipt_id;
  end if;
  return jsonb_build_object('protocol','native-store-effect-result-v1','consumer','native-store-sandbox-v1','rawReceiptId',p_raw_receipt_id,
   'status','already_processed','effectKind',prior.kind,'allocationId',case when allocation.id is null then null else 'nssv1_allocation_'||allocation.id end,
   'grantId',case when grantrow.id is null then null else 'scv1_grant_'||grantrow.id end,'durable',true,'acknowledgementAllowed',true,'grantsAccess',false,'financialAuthority',false,'payable',false);
 end if;
 lock table sandbox_commerce_v1.resource_delivery_holds in row exclusive mode nowait;
 if kind='refund' then
  if p_claim_id is not null or o->>'eventType' is distinct from 'CANCELLATION' or p_projection->>'cancelReason' is distinct from 'CUSTOMER_SUPPORT'
  or p_projection->'amountMinor' is distinct from 'null'::jsonb or p_projection->'currency' is distinct from 'null'::jsonb
  or p_projection->'purchasedAt' is distinct from 'null'::jsonb or p_projection->'quantity' is distinct from 'null'::jsonb
  then raise exception 'native_store_exact_refund_required';end if;
  select * into tomb from sandbox_commerce_v1.native_store_negative_tombstones where scope_key=scope and original_transaction_id=chain;
  if tomb.id is null then
   insert into sandbox_commerce_v1.native_store_negative_tombstones(scope_key,transaction_id,original_transaction_id,product_id,buyer_id,raw_receipt_id)
   values(scope,txn,chain,product,buyer,p_raw_receipt_id) returning * into tomb;
  elsif row(tomb.buyer_id,tomb.product_id,tomb.transaction_id) is distinct from row(buyer,product,txn)
   then raise exception 'native_store_negative_identity_conflict';end if;
  for allocation in select * from sandbox_commerce_v1.native_store_allocations where scope_key=scope and (transaction_id=txn or original_transaction_id=chain) loop
   if allocation.buyer_id<>buyer then raise exception 'native_store_negative_buyer_conflict';end if;
   select * into strict receipt from sandbox_commerce_v1.receipts where id=allocation.core_receipt_id for update nowait;
   if receipt.product_id<>product then raise exception 'native_store_negative_product_conflict';end if;
   insert into sandbox_commerce_v1.resource_delivery_holds(buyer_id,receipt_id,reason)
   values(buyer,receipt.id,'native_store_refund:'||tomb.id);
   update sandbox_commerce_v1.resource_grants set revoked_at=clock_timestamp() where receipt_id=receipt.id and revoked_at is null;
   update sandbox_commerce_v1.receipts set state='refunded',last_event_at=greatest(last_event_at,event_at) where id=receipt.id;
  end loop;
  allocation:=null;grantrow:=null;effect_kind:='negative_applied';
  insert into sandbox_commerce_v1.native_store_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,tombstone_id,claim_id,projection)
  values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,tomb.id,null,p_projection);
 else
  if p_claim_id is null or o->>'eventType' is distinct from 'NON_RENEWING_PURCHASE'
   or p_projection->'cancelReason' is distinct from 'null'::jsonb or p_projection->'quantity' is distinct from '1'::jsonb
   or p_projection->>'currency' is distinct from 'usd' or jsonb_typeof(p_projection->'amountMinor') is distinct from 'number'
   or p_projection->>'amountMinor' !~ '^[1-9][0-9]*$'
   or raw->'originalRevisionRevoked' is distinct from 'false'::jsonb or raw->'intakeEnabled' is distinct from 'true'::jsonb
  then raise exception 'native_store_exact_purchase_required';end if;
  amount:=(p_projection->>'amountMinor')::bigint;purchased_at:=(p_projection->>'purchasedAt')::timestamptz;
  if amount>9007199254740991 or not isfinite(purchased_at) or purchased_at>event_at then raise exception 'native_store_purchase_amount_time';end if;
  select * into strict c from sandbox_commerce_v1.native_store_claims where id=p_claim_id and buyer_id=buyer;
  select * into strict s from sandbox_commerce_v1.native_store_selections where id=c.selection_id and buyer_id=buyer;
  select * into strict r from sandbox_commerce_v1.native_store_reservations where selection_id=s.id and buyer_id=buyer;
  select * into strict attempt from sandbox_commerce_v1.native_store_dispatch_attempts where reservation_id=r.id and buyer_id=buyer;
  lock table sandbox_commerce_v1.native_store_protocol_revocations in share mode nowait;
  select qualification.* into strict q from sandbox_commerce_v1.native_store_qualified_attempts qa
  join sandbox_commerce_v1.native_store_protocol_qualifications qualification on qualification.id=qa.qualification_id and qualification.revision=qa.qualification_revision where qa.attempt_id=attempt.id;
  if c.transaction_identifier<>txn or c.product_identifier<>product or r.quote is distinct from s.quote
   or s.quote#>>'{catalog,projectId}' is distinct from project or s.quote#>>'{catalog,appId}' is distinct from raw->>'appId'
   or s.quote#>>'{catalog,store}' is distinct from raw->>'store' or s.quote#>>'{catalog,wireProductId}' is distinct from product
   or q.connection_id::text<>raw->>'connectionId' or q.connection_revision<>(raw->>'connectionRevision')::bigint
   or q.quote_digest is distinct from s.quote->>'quoteDigest' or (s.quote->>'amountMinor')::bigint<>amount or s.quote->>'currency'<>'usd'
   or row(q.platform,q.native_build,q.native_version,q.signed_app_version,q.sdk_version) is distinct from row(mapping->>'platform',mapping->>'nativeBuild',mapping->>'nativeVersion',mapping->>'signedAppVersion',mapping->>'sdkVersion')
   or purchased_at<date_trunc('milliseconds',attempt.created_at)
   or exists(select 1 from sandbox_commerce_v1.native_store_protocol_revocations v where v.qualification_id=q.id and v.qualification_revision=q.revision)
  then raise exception 'native_store_exact_qualified_allocation_required';end if;
  select * into tomb from sandbox_commerce_v1.native_store_negative_tombstones where scope_key=scope and (transaction_id=txn or original_transaction_id=chain);
  if tomb.id is not null then
   if row(tomb.buyer_id,tomb.product_id) is distinct from row(buyer,product) then raise exception 'native_store_tombstone_identity_conflict';end if;
   effect_kind:='purchase_tombstoned';
   insert into sandbox_commerce_v1.native_store_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,tombstone_id,claim_id,projection)
   values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,tomb.id,c.id,p_projection);
   perform sandbox_commerce_v1.native_store_record_refunded_terminal(r.id,tomb.id);
  else
   perform sandbox_commerce_v1.assert_generation(true);
   select * into strict offer from sandbox_commerce_v1.offers where id=sandbox_commerce_v1.identifier(s.quote->>'offerId','offer') for share nowait;
   select * into strict resource from sandbox_commerce_v1.resources where id=offer.resource_id for share nowait;
   select * into strict version from sandbox_commerce_v1.resource_versions where resource_id=resource.id and revision=offer.resource_revision for share nowait;
   if resource.kind<>'paid_content' or version.kind<>'paid_content' or resource.status<>'published' or offer.status<>'published'
    or resource.revision<>version.revision or resource.creator_id<>version.creator_id or resource.creator_id=buyer
    or s.quote->>'resourceId' is distinct from 'scv1_resource_'||resource.id or (s.quote->>'resourceRevision')::bigint<>version.revision
    or (s.quote->>'offerRevision')::bigint<>offer.revision or s.quote->>'creatorId' is distinct from resource.creator_id::text
    or version.price_minor<>amount or version.currency<>'usd'
   then raise exception 'native_store_current_resource_required';end if;
   select * into strict video from sandbox_commerce_v1.video_terms where resource_id=resource.id and revision=version.revision for share nowait;
   if video.audience<>'paid' then raise exception 'native_store_paid_media_required';end if;
   asset:=sandbox_commerce_v1.clean_resource_asset(video.asset_id,resource.id,version.revision,resource.creator_id,'video');
   if s.quote->'asset' is distinct from jsonb_build_object('id','scv1_asset_'||asset.id,'incarnation',asset.incarnation,
    'sha256',asset.sha256,'byteLength',asset.byte_length,'resourceRevision',asset.resource_revision,'profile','scpv-mp4-h264-aac-v1')
   then raise exception 'native_store_exact_asset_required';end if;
   owner_until:=sandbox_commerce_v1.resource_owner_delivery_deadline(resource.creator_id,buyer);
   insert into sandbox_commerce_v1.intents(buyer_id,buyer_session_id,offer_id,offer_revision,resource_id,resource_revision,creator_id,
    kind,provider,scope_key,store,product_id,amount_minor,currency,state,dispatch_id,dispatched_at)
   values(buyer,attempt.session_id,offer.id,offer.revision,resource.id,version.revision,resource.creator_id,
    'paid_content','revenuecat',scope,raw->>'store',product,amount,'usd','verified',attempt.id,attempt.created_at) returning * into intent;
   perform sandbox_commerce_v1.test_store_v3_assert_media(intent);
   if exists(select 1 from sandbox_commerce_v1.transaction_owners x where x.provider='revenuecat' and x.scope_key=scope and x.store=raw->>'store' and x.original_transaction_id=chain)
   then raise exception 'native_store_transaction_already_owned';end if;
   insert into sandbox_commerce_v1.transaction_owners(provider,scope_key,store,original_transaction_id,buyer_id,product_id)
   values('revenuecat',scope,raw->>'store',chain,buyer,product);
   insert into sandbox_commerce_v1.receipts(intent_id,provider,scope_key,store,product_id,transaction_id,original_transaction_id,state,purchased_at,expires_at,last_event_at)
   values(intent.id,'revenuecat',scope,raw->>'store',product,txn,chain,'verified',purchased_at,null,event_at) returning * into receipt;
   insert into sandbox_commerce_v1.native_store_allocations(raw_receipt_id,claim_id,selection_id,reservation_id,attempt_id,protocol_id,protocol_revision,
    core_receipt_id,buyer_id,scope_key,transaction_id,original_transaction_id)
   values(p_raw_receipt_id,c.id,s.id,r.id,attempt.id,p_protocol_id,p_protocol_revision,receipt.id,buyer,scope,txn,chain) returning * into allocation;
   effect_kind:='positive_applied';
   insert into sandbox_commerce_v1.native_store_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,core_receipt_id,claim_id,projection)
   values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,receipt.id,c.id,p_projection);
   -- The positive completion and exact link are in the SAME transaction as the
   -- grant. Other unresolved project evidence aborts this whole allocation.
   insert into sandbox_commerce_v1.native_store_core_links(core_receipt_id,project_id,buyer_id) values(receipt.id,project,buyer);
   result:=sandbox_commerce_v1.settle_resource_receipt(receipt.id);
   select * into strict grantrow from sandbox_commerce_v1.resource_grants where receipt_id=receipt.id and buyer_id=buyer;
   if grantrow.revoked_at is not null or result->>'status'<>'settled' or result->>'grantId'<>grantrow.id::text
   then raise exception 'native_store_exact_grant_required';end if;
   perform sandbox_commerce_v1.native_store_record_allocated_terminal(r.id,allocation.id);
   if clock_timestamp()>=owner_until then raise exception 'native_store_owner_deadline';end if;
  end if;
 end if;
 perform sandbox_commerce_v1.native_store_resolve_completed_pending(p_raw_receipt_id);
 perform sandbox_commerce_v1.assert_generation(false);
 return jsonb_build_object('protocol','native-store-effect-result-v1','consumer','native-store-sandbox-v1','rawReceiptId',p_raw_receipt_id,
  'status',case when effect_kind='purchase_tombstoned' then 'purchase_tombstoned' else 'processed' end,'effectKind',effect_kind,
  'allocationId',case when allocation.id is null then null else 'nssv1_allocation_'||allocation.id end,
  'grantId',case when grantrow.id is null then null else 'scv1_grant_'||grantrow.id end,
  'durable',true,'acknowledgementAllowed',true,'grantsAccess',false,'financialAuthority',false,'payable',false);
end $$;
revoke all on function sandbox_commerce_v1.native_store_apply_effect(uuid,uuid,uuid,bigint,jsonb) from public,anon,authenticated,service_role;

-- Only the trusted backend can request immutable work context. This does not
-- attest any client observation or grant permission to settle.
create function sandbox_commerce_v1.native_store_effect_context(p_raw_receipt_id uuid,p_claim_id uuid,p_protocol_id uuid,p_protocol_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw jsonb;mapping jsonb;claim jsonb;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 perform sandbox_commerce_v1.assert_provider_service();
 raw:=native_store_sandbox_v1.settlement_source(p_raw_receipt_id);
 if raw is null then raise exception 'native_store_effect_raw_unknown' using errcode='42501';end if;
 mapping:=sandbox_commerce_v1.native_store_settlement_protocol(p_protocol_id,p_protocol_revision);
 if raw->>'projectId' is distinct from mapping->>'projectId' or raw->>'appId' is distinct from mapping->>'appId'
  or raw->>'store' is distinct from mapping->>'store' or raw->>'environment' is distinct from 'SANDBOX'
  or raw->>'connectionId' is distinct from mapping->>'connectionId'
  or raw->>'connectionRevision' is distinct from mapping->>'connectionRevision'
 then raise exception 'native_store_effect_protocol_scope' using errcode='42501';end if;
 if p_claim_id is not null then
  select jsonb_build_object('buyerId',s.buyer_id,'selectionSessionGeneration',s.session_id,
   'claim',sandbox_commerce_v1.native_store_claim_json(c),'quote',s.quote)
  into claim from sandbox_commerce_v1.native_store_claims c join sandbox_commerce_v1.native_store_selections s
   on s.id=c.selection_id and s.buyer_id=c.buyer_id where c.id=p_claim_id;
  if claim is null then raise exception 'native_store_effect_claim_unknown' using errcode='42501';end if;
 end if;
 perform sandbox_commerce_v1.assert_generation(false);
 return jsonb_build_object('protocol','native-store-effect-context-v1','raw',raw,'claim',claim,'settlementProtocol',mapping);
end $$;
revoke all on function sandbox_commerce_v1.native_store_effect_context(uuid,uuid,uuid,bigint) from public,anon,authenticated,service_role;
reset role;
-- Install-context grants only the bounded fresh-owner public CREATE interval.
create function public.native_store_sandbox_effect_context_v1(p_raw_receipt_id uuid,p_claim_id uuid,p_protocol_id uuid,p_protocol_revision bigint)
returns jsonb language sql security definer set search_path='' as $$
 select sandbox_commerce_v1.native_store_effect_context(p_raw_receipt_id,p_claim_id,p_protocol_id,p_protocol_revision)
$$;
alter function public.native_store_sandbox_effect_context_v1(uuid,uuid,uuid,bigint) owner to sbx_v1_core_owner;
revoke all on function public.native_store_sandbox_effect_context_v1(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.native_store_sandbox_effect_context_v1(uuid,uuid,uuid,bigint) to service_role;

create function public.native_store_sandbox_effect_v1(p_raw_receipt_id uuid,p_claim_id uuid,p_protocol_id uuid,p_protocol_revision bigint,p_projection jsonb)
returns jsonb language sql security definer set search_path='' as $$select sandbox_commerce_v1.native_store_apply_effect(p_raw_receipt_id,p_claim_id,p_protocol_id,p_protocol_revision,p_projection)$$;
alter function public.native_store_sandbox_effect_v1(uuid,uuid,uuid,bigint,jsonb) owner to sbx_v1_core_owner;
revoke all on function public.native_store_sandbox_effect_v1(uuid,uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.native_store_sandbox_effect_v1(uuid,uuid,uuid,bigint,jsonb) to service_role;

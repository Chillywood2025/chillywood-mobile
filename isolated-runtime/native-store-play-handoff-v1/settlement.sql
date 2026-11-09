-- SOURCE ONLY: NOT INSTALLED, NOT ENABLED. Requires handoff.sql after the
-- immutable 48-module base closure. Apply only in a separately authorized
-- explicit transaction. No provider connection, mapping, evidence or grant is seeded.
-- Play human-confirmed checkout has separate proof tables. It never inserts a
-- legacy automatic no-charge qualification or weakens any existing foreign key.
grant sbx_v1_core_owner to postgres with inherit false,set true;
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.native_store_play_settlement_protocols(
 id uuid not null,revision bigint not null check(revision between 1 and 9007199254740991),primary key(id,revision),
 sample_setup_id uuid not null,sample_setup_revision bigint not null,
 sample_claim_id uuid not null references sandbox_commerce_v1.native_store_claims,
 sample_raw_receipt_id uuid not null references sandbox_commerce_v1.native_store_pending_raw,
 pair_evidence_sha256 text not null check(pair_evidence_sha256~'^[a-f0-9]{64}$'),
 lifecycle_evidence_sha256 text not null check(lifecycle_evidence_sha256~'^[a-f0-9]{64}$'),
 policy text not null check(policy='exact_native_usd_consumable_v1'),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(sample_setup_id,sample_setup_revision) references sandbox_commerce_v1.native_store_play_handoff_setups(id,revision)
);
create table sandbox_commerce_v1.native_store_play_settlement_revocations(
 protocol_id uuid not null,protocol_revision bigint not null,reason text not null check(length(reason)>0),
 created_at timestamptz not null default clock_timestamp(),primary key(protocol_id,protocol_revision),
 foreign key(protocol_id,protocol_revision) references sandbox_commerce_v1.native_store_play_settlement_protocols(id,revision)
);

create table sandbox_commerce_v1.native_store_play_allocations(
 id uuid primary key default gen_random_uuid(),raw_receipt_id uuid not null unique references sandbox_commerce_v1.native_store_pending_raw,
 claim_id uuid not null unique references sandbox_commerce_v1.native_store_claims,
 selection_id uuid not null unique references sandbox_commerce_v1.native_store_selections,
 reservation_id uuid not null unique references sandbox_commerce_v1.native_store_reservations,
 attempt_id uuid not null unique references sandbox_commerce_v1.native_store_dispatch_attempts,
 protocol_id uuid not null,protocol_revision bigint not null,
 core_receipt_id uuid not null unique references sandbox_commerce_v1.receipts,
 buyer_id uuid not null,scope_key text not null,transaction_id text not null,original_transaction_id text not null,
 created_at timestamptz not null default clock_timestamp(),unique(scope_key,transaction_id),unique(scope_key,original_transaction_id),
 foreign key(protocol_id,protocol_revision) references sandbox_commerce_v1.native_store_play_settlement_protocols(id,revision)
);

create table sandbox_commerce_v1.native_store_play_raw_effects(
 raw_receipt_id uuid primary key references sandbox_commerce_v1.native_store_pending_raw,
 raw_sha256 text not null check(raw_sha256~'^[a-f0-9]{64}$'),connection_id uuid not null,connection_revision bigint not null,
 protocol_id uuid not null,protocol_revision bigint not null,event_id text not null,
 kind text not null check(kind in('positive_applied','negative_applied','purchase_tombstoned')),
 claim_id uuid references sandbox_commerce_v1.native_store_claims,projection jsonb not null check(jsonb_typeof(projection)='object'),
 core_receipt_id uuid references sandbox_commerce_v1.receipts,
 tombstone_id uuid references sandbox_commerce_v1.native_store_negative_tombstones,
 created_at timestamptz not null default clock_timestamp(),
 check((kind='positive_applied' and core_receipt_id is not null and tombstone_id is null) or (kind in('negative_applied','purchase_tombstoned') and tombstone_id is not null and core_receipt_id is null)),
 foreign key(protocol_id,protocol_revision) references sandbox_commerce_v1.native_store_play_settlement_protocols(id,revision)
);

do $$declare t text;begin
 foreach t in array array['native_store_play_settlement_protocols','native_store_play_settlement_revocations','native_store_play_allocations','native_store_play_raw_effects'] loop
  execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
  execute format('alter table sandbox_commerce_v1.%I force row level security',t);
  execute format('create policy owner_only on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using(true) with check(true)',t);
  execute format('revoke all on sandbox_commerce_v1.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger immutable before update or delete on sandbox_commerce_v1.%I for each row execute function sandbox_commerce_v1.native_store_quote_immutable()',t);
  execute format('create trigger immutable_truncate before truncate on sandbox_commerce_v1.%I for each statement execute function sandbox_commerce_v1.native_store_quote_immutable()',t);
 end loop;
end $$;
-- Keep every legacy FK, including the terminal's original allocation FK. An
-- explicit second source is exclusive and has its own equally strict FK.
alter table sandbox_commerce_v1.native_store_reservation_terminals add column play_allocation_id uuid unique references sandbox_commerce_v1.native_store_play_allocations;
alter table sandbox_commerce_v1.native_store_reservation_terminals drop constraint native_store_reservation_terminals_check;
alter table sandbox_commerce_v1.native_store_reservation_terminals add constraint native_store_reservation_terminals_check check(
 (kind='allocated' and reservation_id is not null and num_nonnulls(allocation_id,play_allocation_id)=1 and grant_id is not null and tombstone_id is null and request_id is null and session_id is null)
 or(kind='cancelled_before_consume' and allocation_id is null and play_allocation_id is null and tombstone_id is null and grant_id is null and request_id is not null and session_id is not null)
 or(kind='refunded_before_allocation' and reservation_id is not null and tombstone_id is not null and allocation_id is null and play_allocation_id is null and grant_id is null and request_id is null and session_id is null));
create or replace function sandbox_commerce_v1.native_store_terminal_json(t sandbox_commerce_v1.native_store_reservation_terminals)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id','nssv1_terminal_'||t.id,'selectionId','nssv1_selection_'||t.selection_id,
 'reservationId','nssv1_reservation_'||t.reservation_id,'kind',t.kind,'allocationId','nssv1_allocation_'||coalesce(t.allocation_id,t.play_allocation_id),
 'grantId','scv1_grant_'||t.grant_id,'originalRequestId',t.request_id,'createdAt',t.created_at)
$$;
-- One completion graph prevents a Play effect from clearing unrelated pending
-- evidence. The shared negative tombstones also fence legacy transactions.
create or replace function sandbox_commerce_v1.native_store_project_pending(p_project text) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from sandbox_commerce_v1.native_store_pending_raw p where p.project_id=p_project
 and not exists(select 1 from sandbox_commerce_v1.native_store_raw_effects e where e.raw_receipt_id=p.raw_receipt_id and e.raw_sha256=p.raw_sha256)
 and not exists(select 1 from sandbox_commerce_v1.native_store_play_raw_effects e where e.raw_receipt_id=p.raw_receipt_id and e.raw_sha256=p.raw_sha256))
$$;

create or replace function sandbox_commerce_v1.native_store_resolve_completed_pending(p_raw uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare p sandbox_commerce_v1.native_store_pending_raw;
begin
 select * into strict p from sandbox_commerce_v1.native_store_pending_raw where raw_receipt_id=p_raw;
 perform sandbox_commerce_v1.native_store_lock_project(p.project_id);
 if not exists(select 1 from sandbox_commerce_v1.native_store_raw_effects e where e.raw_receipt_id=p_raw and e.raw_sha256=p.raw_sha256)
 and not exists(select 1 from sandbox_commerce_v1.native_store_play_raw_effects e where e.raw_receipt_id=p_raw and e.raw_sha256=p.raw_sha256)
 then raise exception 'native_store_effect_completion_required';end if;
 lock table sandbox_commerce_v1.resource_delivery_holds in row exclusive mode nowait;
 update sandbox_commerce_v1.resource_delivery_holds h set resolved_at=clock_timestamp()
 where h.reason='native_store_pending_raw:'||p_raw and h.resolved_at is null
 and exists(select 1 from sandbox_commerce_v1.native_store_core_links l
 where l.project_id=p.project_id and l.core_receipt_id=h.receipt_id and l.buyer_id=h.buyer_id);
end $$;
-- Historical binding is immutable. Enrollment expiry limits the consumed
-- attempt and purchase, not the lifetime of a retained receipt. Explicit
-- revocations always hold current access. Current session authority is checked
-- again at positive allocation and independently on every protected playback.
create function sandbox_commerce_v1.native_store_play_attempt_setup(p_attempt uuid)
returns sandbox_commerce_v1.native_store_play_handoff_setups
language plpgsql security invoker set search_path='' as $$
declare a sandbox_commerce_v1.native_store_dispatch_attempts;h sandbox_commerce_v1.native_store_play_handoff_attempts;
 e sandbox_commerce_v1.native_store_play_enrollments;q sandbox_commerce_v1.native_store_play_handoff_setups;
 r sandbox_commerce_v1.native_store_reservations;s sandbox_commerce_v1.native_store_selections;
begin
 lock table sandbox_commerce_v1.native_store_play_setup_revocations,sandbox_commerce_v1.native_store_play_enrollment_revocations in share mode nowait;
 select * into strict a from sandbox_commerce_v1.native_store_dispatch_attempts where id=p_attempt;
 select * into strict h from sandbox_commerce_v1.native_store_play_handoff_attempts where attempt_id=a.id;
 select * into strict e from sandbox_commerce_v1.native_store_play_enrollments where id=h.enrollment_id and revision=h.enrollment_revision;
 select * into strict q from sandbox_commerce_v1.native_store_play_handoff_setups where id=e.setup_id and revision=e.setup_revision;
 select * into strict r from sandbox_commerce_v1.native_store_reservations where id=a.reservation_id and buyer_id=a.buyer_id;
 select * into strict s from sandbox_commerce_v1.native_store_selections where id=r.selection_id and buyer_id=a.buyer_id;
 if e.buyer_id<>a.buyer_id or e.created_at>a.created_at or q.created_at>a.created_at or e.expires_at<=a.created_at
 or r.quote is distinct from s.quote or r.store<>'PLAY_STORE' or r.environment<>'SANDBOX'
 or s.quote#>>'{catalog,store}' is distinct from 'PLAY_STORE' or s.quote#>>'{catalog,environment}' is distinct from 'SANDBOX'
 or q.quote_digest is distinct from s.quote->>'quoteDigest'
 or q.catalog_binding_id::text is distinct from substring(s.quote#>>'{catalog,bindingId}' from 15)
 or q.catalog_revision is distinct from (s.quote#>>'{catalog,revision}')::bigint
 or exists(select 1 from sandbox_commerce_v1.native_store_play_setup_revocations v where v.setup_id=q.id and v.setup_revision=q.revision)
 or exists(select 1 from sandbox_commerce_v1.native_store_play_enrollment_revocations v where v.enrollment_id=e.id and v.enrollment_revision=e.revision)
 or exists(select 1 from sandbox_commerce_v1.native_store_qualified_attempts x where x.attempt_id=a.id)
 then raise exception 'native_store_play_exact_handoff_required' using errcode='42501';end if;
 return q;
end $$;

create function sandbox_commerce_v1.native_store_play_settlement_protocol(p_id uuid,p_revision bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p sandbox_commerce_v1.native_store_play_settlement_protocols;q sandbox_commerce_v1.native_store_play_handoff_setups;
 c sandbox_commerce_v1.native_store_claims;s sandbox_commerce_v1.native_store_selections;
 r sandbox_commerce_v1.native_store_reservations;a sandbox_commerce_v1.native_store_dispatch_attempts;
 raw jsonb;o jsonb;cat jsonb;scope text;
begin
 perform sandbox_commerce_v1.assert_generation(false);
 if current_setting('transaction_timeout')::interval not between interval '1 microsecond' and interval '5 seconds' then raise exception 'native_store_effect_budget_required';end if;
 lock table sandbox_commerce_v1.native_store_play_settlement_protocols,sandbox_commerce_v1.native_store_play_settlement_revocations in share mode nowait;
 select * into p from sandbox_commerce_v1.native_store_play_settlement_protocols where id=p_id and revision=p_revision for share nowait;
 if p.id is null or exists(select 1 from sandbox_commerce_v1.native_store_play_settlement_revocations where protocol_id=p_id and protocol_revision=p_revision)
 then raise exception 'native_store_play_settlement_protocol_unavailable' using errcode='42501';end if;

 select * into strict c from sandbox_commerce_v1.native_store_claims where id=p.sample_claim_id;
 select * into strict s from sandbox_commerce_v1.native_store_selections where id=c.selection_id and buyer_id=c.buyer_id;
 select * into strict r from sandbox_commerce_v1.native_store_reservations where selection_id=s.id and buyer_id=s.buyer_id;
 select * into strict a from sandbox_commerce_v1.native_store_dispatch_attempts where reservation_id=r.id and buyer_id=s.buyer_id;
 q:=sandbox_commerce_v1.native_store_play_attempt_setup(a.id);
 if q.id<>p.sample_setup_id or q.revision<>p.sample_setup_revision
 then raise exception 'native_store_play_settlement_sample_invalid' using errcode='42501';end if;
 cat:=s.quote->'catalog';raw:=native_store_sandbox_v1.settlement_source(p.sample_raw_receipt_id);o:=raw->'observation';
 if raw is null or raw->>'connectionId'<>q.connection_id::text or (raw->>'connectionRevision')::bigint<>q.connection_revision
  or raw->>'projectId' is distinct from cat->>'projectId' or raw->>'appId' is distinct from cat->>'appId' or raw->>'store' is distinct from cat->>'store'
  or raw->>'environment' is distinct from 'SANDBOX' or raw->'conflicted' is distinct from 'false'::jsonb or jsonb_array_length(raw->'eventIds')<>1
  or o->>'appId' is distinct from raw->>'appId' or o->>'store' is distinct from 'PLAY_STORE' or o->>'environment' is distinct from 'SANDBOX'
  or o->>'parseStatus' is distinct from 'valid' or o->'issues' is distinct from '[]'::jsonb or o->>'eventType' is distinct from 'NON_RENEWING_PURCHASE'
  or o->>'userId' is distinct from c.buyer_id::text or o->>'transactionId' is distinct from c.transaction_identifier
  or o->>'productId' is distinct from c.product_identifier or c.product_identifier is distinct from cat->>'wireProductId'
  or o->>'originalTransactionId' is null or o->>'eventAt' is null
  or o->'conflictingUserIds' is distinct from '[]'::jsonb or o->'transferredFrom' is distinct from '[]'::jsonb or o->'transferredTo' is distinct from '[]'::jsonb
 then raise exception 'native_store_settlement_sample_invalid' using errcode='42501';end if;
 scope:=jsonb_build_array('native-store-sandbox-v1','revenuecat',raw->>'projectId',raw->>'appId',raw->>'store','SANDBOX')::text;
 return jsonb_build_object('id',p.id,'revision',p.revision,'policy',p.policy,'projectId',raw->>'projectId','appId',raw->>'appId','store',raw->>'store',
  'productId',c.product_identifier,'connectionId',q.connection_id,'connectionRevision',q.connection_revision,'scopeKey',scope,
  'platform',q.platform,'nativeBuild',q.native_build,'nativeVersion',q.native_version,'sdkVersion',q.sdk_version,'handoffMode','play_test_sheet_handoff_v1','automaticNoChargeProof',false,'userStoreConfirmationRequired',true);
end $$;
create function sandbox_commerce_v1.native_store_play_assert_current_allocation(p_receipt uuid,p_buyer uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a sandbox_commerce_v1.native_store_play_allocations;e sandbox_commerce_v1.native_store_play_raw_effects;
 c sandbox_commerce_v1.native_store_claims;s sandbox_commerce_v1.native_store_selections;
 r sandbox_commerce_v1.native_store_reservations;attempt sandbox_commerce_v1.native_store_dispatch_attempts;
 q sandbox_commerce_v1.native_store_play_handoff_setups;raw jsonb;mapping jsonb;project text;
begin
 perform sandbox_commerce_v1.assert_generation(false);
 select * into a from sandbox_commerce_v1.native_store_play_allocations where core_receipt_id=p_receipt and buyer_id=p_buyer;
 if a.id is null then raise exception 'native_store_current_allocation_required' using errcode='42501';end if;
 project:=(a.scope_key::jsonb)->>2;perform sandbox_commerce_v1.native_store_lock_project(project);

 if sandbox_commerce_v1.native_store_project_pending(project) then raise exception 'native_store_project_evidence_pending' using errcode='42501';end if;
 select * into strict e from sandbox_commerce_v1.native_store_play_raw_effects where raw_receipt_id=a.raw_receipt_id;
 if e.kind<>'positive_applied' or e.core_receipt_id<>p_receipt or e.claim_id is distinct from a.claim_id
 or not exists(select 1 from sandbox_commerce_v1.native_store_core_links l where l.core_receipt_id=p_receipt and l.buyer_id=p_buyer and l.project_id=project)
 or exists(select 1 from sandbox_commerce_v1.native_store_negative_tombstones t where t.scope_key=a.scope_key
 and (t.transaction_id=a.transaction_id or t.original_transaction_id=a.original_transaction_id))
 then raise exception 'native_store_current_allocation_held' using errcode='42501';end if;
 raw:=native_store_sandbox_v1.settlement_source(a.raw_receipt_id);
 mapping:=sandbox_commerce_v1.native_store_play_settlement_protocol(a.protocol_id,a.protocol_revision);
 if raw is null or raw->>'rawSha256' is distinct from e.raw_sha256
 or raw->>'connectionId' is distinct from e.connection_id::text or raw->>'connectionRevision' is distinct from e.connection_revision::text
 or raw->'originalRevisionRevoked' is distinct from 'false'::jsonb or raw->'conflicted' is distinct from 'false'::jsonb
 or raw->'intakeEnabled' is distinct from 'true'::jsonb or mapping->>'scopeKey' is distinct from a.scope_key
 then raise exception 'native_store_current_original_evidence_required' using errcode='42501';end if;
 select * into strict c from sandbox_commerce_v1.native_store_claims where id=a.claim_id and selection_id=a.selection_id and buyer_id=p_buyer;
 select * into strict s from sandbox_commerce_v1.native_store_selections where id=a.selection_id and buyer_id=p_buyer;
 select * into strict r from sandbox_commerce_v1.native_store_reservations where id=a.reservation_id and selection_id=s.id and buyer_id=p_buyer;
 select * into strict attempt from sandbox_commerce_v1.native_store_dispatch_attempts where id=a.attempt_id and reservation_id=r.id and buyer_id=p_buyer;
 q:=sandbox_commerce_v1.native_store_play_attempt_setup(attempt.id);
 if q.connection_id<>e.connection_id or q.connection_revision<>e.connection_revision or q.quote_digest is distinct from s.quote->>'quoteDigest'
 or r.quote is distinct from s.quote or c.transaction_identifier<>a.transaction_id
 or c.product_identifier is distinct from raw#>>'{observation,productId}'
 or raw#>>'{observation,userId}' is distinct from p_buyer::text
 or raw#>>'{observation,transactionId}' is distinct from a.transaction_id
 or raw#>>'{observation,originalTransactionId}' is distinct from a.original_transaction_id
 then raise exception 'native_store_current_allocation_binding_required' using errcode='42501';end if;
 perform sandbox_commerce_v1.assert_generation(false);
 return jsonb_build_object('allocationId','nssv1_allocation_'||a.id,'projectId',project,'originalTransactionId',a.original_transaction_id);
end $$;
create function sandbox_commerce_v1.native_store_play_apply_effect(p_raw_receipt_id uuid,p_claim_id uuid,p_protocol_id uuid,p_protocol_revision bigint,p_projection jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw jsonb;o jsonb;mapping jsonb;prior sandbox_commerce_v1.native_store_play_raw_effects;
 c sandbox_commerce_v1.native_store_claims;s sandbox_commerce_v1.native_store_selections;
 r sandbox_commerce_v1.native_store_reservations;attempt sandbox_commerce_v1.native_store_dispatch_attempts;
 q sandbox_commerce_v1.native_store_play_handoff_setups;allocation sandbox_commerce_v1.native_store_play_allocations;
 tomb sandbox_commerce_v1.native_store_negative_tombstones;intent sandbox_commerce_v1.intents;
 receipt sandbox_commerce_v1.receipts;grantrow sandbox_commerce_v1.resource_grants;
 resource sandbox_commerce_v1.resources;version sandbox_commerce_v1.resource_versions;offer sandbox_commerce_v1.offers;
 video sandbox_commerce_v1.video_terms;asset sandbox_commerce_v1.delivery_assets;
 buyer uuid;project text;scope text;txn text;chain text;product text;event_id text;kind text;effect_kind text;
 event_at timestamptz;purchased_at timestamptz;amount bigint;owner_until timestamptz;result jsonb;buyer_authority jsonb;enrollment_until timestamptz;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.assert_provider_service();
 perform sandbox_commerce_v1.assert_generation(false);
 if jsonb_typeof(p_projection) is distinct from 'object' or
 (select array_agg(key order by key) from jsonb_object_keys(p_projection) key) is distinct from
 array['amountMinor','cancelReason','currency','eventAt','kind','protocol','purchasedAt','quantity','rawSha256']::text[]
 or p_projection->>'protocol' is distinct from 'native-store-authenticated-effect-v1'
 or not coalesce(p_projection->>'kind' in('purchase','refund'),false) then raise exception 'native_store_effect_projection_shape';end if;
 raw:=native_store_sandbox_v1.settlement_source(p_raw_receipt_id);o:=raw->'observation';
 mapping:=sandbox_commerce_v1.native_store_play_settlement_protocol(p_protocol_id,p_protocol_revision);
 if raw is null or raw->>'rawSha256' is distinct from p_projection->>'rawSha256'
 or raw->>'projectId' is distinct from mapping->>'projectId' or raw->>'appId' is distinct from mapping->>'appId'
 or raw->>'store' is distinct from mapping->>'store' or raw->>'environment' is distinct from 'SANDBOX'
 or raw->>'connectionId' is distinct from mapping->>'connectionId' or raw->>'connectionRevision' is distinct from mapping->>'connectionRevision'
 or raw->'conflicted' is distinct from 'false'::jsonb or jsonb_array_length(raw->'eventIds')<>1
 or o->>'appId' is distinct from raw->>'appId' or o->>'store' is distinct from 'PLAY_STORE' or o->>'environment' is distinct from 'SANDBOX'
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
 if exists(select 1 from sandbox_commerce_v1.native_store_raw_effects where raw_receipt_id=p_raw_receipt_id) then raise exception 'native_store_effect_source_conflict';end if;
 select * into prior from sandbox_commerce_v1.native_store_play_raw_effects where raw_receipt_id=p_raw_receipt_id;
 if prior.raw_receipt_id is not null then
  if row(prior.raw_sha256,prior.connection_id,prior.connection_revision,prior.protocol_id,prior.protocol_revision,prior.claim_id,prior.projection)
  is distinct from row(raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,p_claim_id,p_projection)
  then raise exception 'native_store_effect_idempotency_conflict';end if;
  if prior.kind='positive_applied' then
   select * into strict allocation from sandbox_commerce_v1.native_store_play_allocations where raw_receipt_id=p_raw_receipt_id;
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
  for allocation in select * from sandbox_commerce_v1.native_store_play_allocations where scope_key=scope and (transaction_id=txn or original_transaction_id=chain) loop
   if allocation.buyer_id<>buyer then raise exception 'native_store_negative_buyer_conflict';end if;
   select * into strict receipt from sandbox_commerce_v1.receipts where id=allocation.core_receipt_id for update nowait;
   if receipt.product_id<>product then raise exception 'native_store_negative_product_conflict';end if;
   insert into sandbox_commerce_v1.resource_delivery_holds(buyer_id,receipt_id,reason)
   values(buyer,receipt.id,'native_store_refund:'||tomb.id);
   update sandbox_commerce_v1.resource_grants set revoked_at=clock_timestamp() where receipt_id=receipt.id and revoked_at is null;
   update sandbox_commerce_v1.receipts set state='refunded',last_event_at=greatest(last_event_at,event_at) where id=receipt.id;
  end loop;
  allocation:=null;grantrow:=null;effect_kind:='negative_applied';
  insert into sandbox_commerce_v1.native_store_play_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,tombstone_id,claim_id,projection)
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
  q:=sandbox_commerce_v1.native_store_play_attempt_setup(attempt.id);
  select e.expires_at into strict enrollment_until from sandbox_commerce_v1.native_store_play_handoff_attempts h
   join sandbox_commerce_v1.native_store_play_enrollments e on e.id=h.enrollment_id and e.revision=h.enrollment_revision where h.attempt_id=attempt.id;
  if c.transaction_identifier<>txn or c.product_identifier<>product or r.quote is distinct from s.quote
   or s.quote#>>'{catalog,projectId}' is distinct from project or s.quote#>>'{catalog,appId}' is distinct from raw->>'appId'
   or s.quote#>>'{catalog,store}' is distinct from raw->>'store' or s.quote#>>'{catalog,wireProductId}' is distinct from product
   or q.connection_id::text<>raw->>'connectionId' or q.connection_revision<>(raw->>'connectionRevision')::bigint
   or q.quote_digest is distinct from s.quote->>'quoteDigest' or (s.quote->>'amountMinor')::bigint<>amount or s.quote->>'currency'<>'usd'
   or row(q.platform,q.native_build,q.native_version,q.sdk_version) is distinct from row(mapping->>'platform',mapping->>'nativeBuild',mapping->>'nativeVersion',mapping->>'sdkVersion')
   or purchased_at<date_trunc('milliseconds',attempt.created_at)
   or purchased_at>=enrollment_until
  then raise exception 'native_store_exact_qualified_allocation_required';end if;
  select * into tomb from sandbox_commerce_v1.native_store_negative_tombstones where scope_key=scope and (transaction_id=txn or original_transaction_id=chain);
  if tomb.id is not null then
   if row(tomb.buyer_id,tomb.product_id) is distinct from row(buyer,product) then raise exception 'native_store_tombstone_identity_conflict';end if;
   effect_kind:='purchase_tombstoned';
   insert into sandbox_commerce_v1.native_store_play_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,tombstone_id,claim_id,projection)
   values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,tomb.id,c.id,p_projection);
   perform sandbox_commerce_v1.native_store_play_record_refunded_terminal(r.id,tomb.id);
  else
   perform sandbox_commerce_v1.assert_generation(true);
   buyer_authority:=sandbox_commerce_v1.assert_authority(buyer,attempt.session_id,'buyer');
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
   insert into sandbox_commerce_v1.native_store_play_allocations(raw_receipt_id,claim_id,selection_id,reservation_id,attempt_id,protocol_id,protocol_revision,
    core_receipt_id,buyer_id,scope_key,transaction_id,original_transaction_id)
   values(p_raw_receipt_id,c.id,s.id,r.id,attempt.id,p_protocol_id,p_protocol_revision,receipt.id,buyer,scope,txn,chain) returning * into allocation;
   effect_kind:='positive_applied';
   insert into sandbox_commerce_v1.native_store_play_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,core_receipt_id,claim_id,projection)
   values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,receipt.id,c.id,p_projection);
   -- The positive completion and exact link are in the SAME transaction as the
   -- grant. Other unresolved project evidence aborts this whole allocation.
   insert into sandbox_commerce_v1.native_store_core_links(core_receipt_id,project_id,buyer_id) values(receipt.id,project,buyer);
   result:=sandbox_commerce_v1.settle_resource_receipt(receipt.id);
   select * into strict grantrow from sandbox_commerce_v1.resource_grants where receipt_id=receipt.id and buyer_id=buyer;
   if grantrow.revoked_at is not null or result->>'status'<>'settled' or result->>'grantId'<>grantrow.id::text
   then raise exception 'native_store_exact_grant_required';end if;
   perform sandbox_commerce_v1.native_store_play_record_allocated_terminal(r.id,allocation.id);
   perform sandbox_commerce_v1.assert_fresh(buyer_authority);
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
create function sandbox_commerce_v1.native_store_play_record_allocated_terminal(p_reservation uuid,p_allocation uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare r sandbox_commerce_v1.native_store_reservations;a sandbox_commerce_v1.native_store_play_allocations;g uuid;t sandbox_commerce_v1.native_store_reservation_terminals;
begin
 select * into strict r from sandbox_commerce_v1.native_store_reservations where id=p_reservation;
 if not pg_try_advisory_xact_lock(hashtextextended('native-store-reserve:'||r.buyer_id,691)) then raise exception 'native_store_terminal_busy' using errcode='55P03';end if;
 perform sandbox_commerce_v1.native_store_lock_project(r.project_id);
 select * into strict a from sandbox_commerce_v1.native_store_play_allocations where id=p_allocation;
 select id into g from sandbox_commerce_v1.resource_grants where receipt_id=a.core_receipt_id and buyer_id=r.buyer_id;
 if a.reservation_id<>r.id or a.selection_id<>r.selection_id or a.buyer_id<>r.buyer_id or g is null
 or not exists(select 1 from sandbox_commerce_v1.native_store_dispatch_attempts x where x.id=a.attempt_id and x.reservation_id=r.id and x.buyer_id=r.buyer_id)
 or not exists(select 1 from sandbox_commerce_v1.native_store_claims c where c.id=a.claim_id and c.selection_id=r.selection_id and c.buyer_id=r.buyer_id)
 or not exists(select 1 from sandbox_commerce_v1.native_store_play_raw_effects e where e.raw_receipt_id=a.raw_receipt_id and e.kind='positive_applied' and e.claim_id=a.claim_id and e.core_receipt_id=a.core_receipt_id and e.protocol_id=a.protocol_id and e.protocol_revision=a.protocol_revision)
 then raise exception 'native_store_terminal_allocation_mismatch';end if;
 select * into t from sandbox_commerce_v1.native_store_reservation_terminals where selection_id=r.selection_id;
 if t.id is not null then
  if t.kind<>'allocated' or t.play_allocation_id is distinct from a.id or t.allocation_id is not null or t.reservation_id<>r.id or t.grant_id<>g then raise exception 'native_store_terminal_conflict';end if;
  return;
 end if;
 insert into sandbox_commerce_v1.native_store_reservation_terminals(reservation_id,selection_id,buyer_id,kind,play_allocation_id,grant_id)
 values(r.id,r.selection_id,r.buyer_id,'allocated',a.id,g);
end $$;
create function sandbox_commerce_v1.native_store_play_record_refunded_terminal(p_reservation uuid,p_tombstone uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare r sandbox_commerce_v1.native_store_reservations;n sandbox_commerce_v1.native_store_negative_tombstones;t sandbox_commerce_v1.native_store_reservation_terminals;
begin
 select * into strict r from sandbox_commerce_v1.native_store_reservations where id=p_reservation;
 if not pg_try_advisory_xact_lock(hashtextextended('native-store-reserve:'||r.buyer_id,691)) then raise exception 'native_store_terminal_busy' using errcode='55P03';end if;
 perform sandbox_commerce_v1.native_store_lock_project(r.project_id);
 select * into strict n from sandbox_commerce_v1.native_store_negative_tombstones where id=p_tombstone;
 if n.buyer_id<>r.buyer_id or n.product_id<>r.product_id
 or n.scope_key is distinct from jsonb_build_array('native-store-sandbox-v1','revenuecat',r.project_id,r.app_id,r.store,r.environment)::text
 or not exists(select 1 from sandbox_commerce_v1.native_store_dispatch_attempts where reservation_id=r.id and buyer_id=r.buyer_id)
 or not exists(select 1 from sandbox_commerce_v1.native_store_claims c where c.selection_id=r.selection_id and c.buyer_id=r.buyer_id and c.product_identifier=r.product_id and c.transaction_identifier in(n.transaction_id,n.original_transaction_id))
 or not exists(select 1 from sandbox_commerce_v1.native_store_play_raw_effects e where e.tombstone_id=n.id and e.kind in('negative_applied','purchase_tombstoned'))
 or exists(select 1 from sandbox_commerce_v1.native_store_play_allocations where reservation_id=r.id)
 or exists(select 1 from sandbox_commerce_v1.native_store_allocations where reservation_id=r.id)
 then raise exception 'native_store_terminal_refund_mismatch';end if;
 select * into t from sandbox_commerce_v1.native_store_reservation_terminals where selection_id=r.selection_id;
 if t.id is not null then
  if t.kind<>'refunded_before_allocation' or t.tombstone_id<>n.id or t.reservation_id<>r.id then raise exception 'native_store_terminal_conflict';end if;
  return;
 end if;
 insert into sandbox_commerce_v1.native_store_reservation_terminals(reservation_id,selection_id,buyer_id,kind,tombstone_id)
 values(r.id,r.selection_id,r.buyer_id,'refunded_before_allocation',n.id);
end $$;
-- Pinned compatibility body copied from the immutable base closure. The
-- original function OID is retained so all existing dependencies use the wrapper.
create function sandbox_commerce_v1.native_store_settlement_protocol_pre_play_handoff(p_id uuid,p_revision bigint) returns jsonb
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
revoke all on function sandbox_commerce_v1.native_store_settlement_protocol_pre_play_handoff(uuid,bigint) from public,anon,authenticated,service_role;
create or replace function sandbox_commerce_v1.native_store_settlement_protocol(p_id uuid,p_revision bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$begin
 if exists(select 1 from sandbox_commerce_v1.native_store_play_settlement_protocols where id=p_id and revision=p_revision) then return sandbox_commerce_v1.native_store_play_settlement_protocol(p_id,p_revision);end if;
 return sandbox_commerce_v1.native_store_settlement_protocol_pre_play_handoff(p_id,p_revision);
end $$;

-- Pinned compatibility body copied from the immutable base closure. The
-- original function OID is retained so all existing dependencies use the wrapper.
create function sandbox_commerce_v1.native_store_assert_current_allocation_pre_play_handoff(p_receipt uuid,p_buyer uuid) returns jsonb
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
revoke all on function sandbox_commerce_v1.native_store_assert_current_allocation_pre_play_handoff(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function sandbox_commerce_v1.native_store_assert_current_allocation(p_receipt uuid,p_buyer uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$begin
 if exists(select 1 from sandbox_commerce_v1.native_store_play_allocations where core_receipt_id=p_receipt) then return sandbox_commerce_v1.native_store_play_assert_current_allocation(p_receipt,p_buyer);end if;
 return sandbox_commerce_v1.native_store_assert_current_allocation_pre_play_handoff(p_receipt,p_buyer);
end $$;

-- Pinned compatibility body copied from the immutable base closure. The
-- original function OID is retained so all existing dependencies use the wrapper.
create function sandbox_commerce_v1.native_store_apply_effect_pre_play_handoff(p_raw_receipt_id uuid,p_claim_id uuid,p_protocol_id uuid,p_protocol_revision bigint,p_projection jsonb)
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
revoke all on function sandbox_commerce_v1.native_store_apply_effect_pre_play_handoff(uuid,uuid,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
create or replace function sandbox_commerce_v1.native_store_apply_effect(p_raw_receipt_id uuid,p_claim_id uuid,p_protocol_id uuid,p_protocol_revision bigint,p_projection jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 -- Route by a primary-key lookup without waiting on DDL or changing a caller's
 -- stricter lock timeout. The selected implementation arms the sole absolute
 -- transaction timer and rechecks elapsed time before any effect write.
 if current_setting('transaction_timeout') is distinct from '0' or current_setting('transaction_isolation')<>'read committed'
  or clock_timestamp()>=transaction_timestamp()+interval '5 seconds'
 then raise exception 'sandbox_timeout_context_invalid' using errcode='42501';end if;
 perform sandbox_commerce_v1.assert_provider_service();
 lock table sandbox_commerce_v1.native_store_play_settlement_protocols in access share mode nowait;
 if exists(select 1 from sandbox_commerce_v1.native_store_play_settlement_protocols where id=p_protocol_id and revision=p_protocol_revision) then return sandbox_commerce_v1.native_store_play_apply_effect(p_raw_receipt_id,p_claim_id,p_protocol_id,p_protocol_revision,p_projection);end if;
 return sandbox_commerce_v1.native_store_apply_effect_pre_play_handoff(p_raw_receipt_id,p_claim_id,p_protocol_id,p_protocol_revision,p_projection);
end $$;

create function sandbox_commerce_v1.native_store_play_mapping_identity_guard() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if not pg_try_advisory_xact_lock(hashtextextended('native-store-protocol-source:'||new.id,692)) then raise exception 'native_store_protocol_source_busy' using errcode='55P03';end if;
 if TG_TABLE_NAME='native_store_play_settlement_protocols' then
  if exists(select 1 from sandbox_commerce_v1.native_store_settlement_protocols where id=new.id) then raise exception 'native_store_protocol_source_conflict';end if;
 else
  if exists(select 1 from sandbox_commerce_v1.native_store_play_settlement_protocols where id=new.id) then raise exception 'native_store_protocol_source_conflict';end if;
 end if;
 return new;
end $$;
create trigger play_mapping_source before insert on sandbox_commerce_v1.native_store_play_settlement_protocols for each row execute function sandbox_commerce_v1.native_store_play_mapping_identity_guard();
create trigger play_mapping_source before insert on sandbox_commerce_v1.native_store_settlement_protocols for each row execute function sandbox_commerce_v1.native_store_play_mapping_identity_guard();

create function sandbox_commerce_v1.native_store_play_effect_candidate(p_raw_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw jsonb;o jsonb;chosen jsonb;mapping jsonb;candidates jsonb;prior sandbox_commerce_v1.native_store_play_raw_effects;
 held jsonb:=jsonb_build_object('protocol','native-store-effect-candidate-v1','rawReceiptId',p_raw_receipt_id,'status','held','work',null,'acknowledgementAllowed',false);
begin
 perform sandbox_commerce_v1.assert_generation(false);
 perform sandbox_commerce_v1.assert_provider_service();
 raw:=native_store_sandbox_v1.settlement_source(p_raw_receipt_id);o:=raw->'observation';
 if raw is null or raw->>'store' is distinct from 'PLAY_STORE' or raw->>'environment' is distinct from 'SANDBOX' or raw->'conflicted' is distinct from 'false'::jsonb
  or jsonb_array_length(raw->'eventIds')<>1 or o->>'appId' is distinct from raw->>'appId' or o->>'store' is distinct from 'PLAY_STORE' or o->>'environment' is distinct from 'SANDBOX'
  or o->>'parseStatus' is distinct from 'valid' or o->'issues' is distinct from '[]'::jsonb
  or o->'conflictingUserIds' is distinct from '[]'::jsonb or o->'transferredFrom' is distinct from '[]'::jsonb or o->'transferredTo' is distinct from '[]'::jsonb
  or coalesce(o->>'userId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or coalesce(length(o->>'transactionId'),0)=0 or coalesce(length(o->>'originalTransactionId'),0)=0
  or coalesce(length(o->>'productId'),0)=0 or coalesce(length(o->>'eventId'),0)=0
  or o->>'eventType' not in('NON_RENEWING_PURCHASE','CANCELLATION') then return held;end if;
 if o->>'eventType'='NON_RENEWING_PURCHASE' and (raw->'intakeEnabled' is distinct from 'true'::jsonb or raw->'originalRevisionRevoked' is distinct from 'false'::jsonb) then return held;end if;
 -- A completed effect has an immutable original pair; never rediscover a newer
 -- candidate for the same receipt. The worker/apply still revalidate evidence.
 select * into prior from sandbox_commerce_v1.native_store_play_raw_effects where raw_receipt_id=p_raw_receipt_id;
 if prior.raw_receipt_id is not null then
  if prior.raw_sha256 is distinct from raw->>'rawSha256' then return held;end if;
  chosen:=jsonb_build_object('rawReceiptId',p_raw_receipt_id,'claimId',prior.claim_id,'protocolId',prior.protocol_id,'protocolRevision',prior.protocol_revision);
 else
  with mappings as (
   select p.id,p.revision,q.platform,q.native_build,q.native_version,q.sdk_version
   from sandbox_commerce_v1.native_store_play_settlement_protocols p
   join sandbox_commerce_v1.native_store_play_handoff_setups q on q.id=p.sample_setup_id and q.revision=p.sample_setup_revision
   join sandbox_commerce_v1.native_store_claims sample on sample.id=p.sample_claim_id
   join sandbox_commerce_v1.native_store_selections s on s.id=sample.selection_id and s.buyer_id=sample.buyer_id
   where not exists(select 1 from sandbox_commerce_v1.native_store_play_settlement_revocations v where v.protocol_id=p.id and v.protocol_revision=p.revision)
    and q.connection_id::text=raw->>'connectionId' and q.connection_revision::text=raw->>'connectionRevision'
    and s.quote#>>'{catalog,projectId}'=raw->>'projectId' and s.quote#>>'{catalog,appId}'=raw->>'appId'
    and s.quote#>>'{catalog,store}'=raw->>'store' and s.quote#>>'{catalog,environment}'='SANDBOX'
    and sample.product_identifier=o->>'productId' and s.quote#>>'{catalog,wireProductId}'=o->>'productId'
  ), pairs as (
   select c.id claim_id,m.id protocol_id,m.revision protocol_revision
   from sandbox_commerce_v1.native_store_claims c
   join sandbox_commerce_v1.native_store_selections s on s.id=c.selection_id and s.buyer_id=c.buyer_id
   join sandbox_commerce_v1.native_store_reservations r on r.selection_id=s.id and r.buyer_id=s.buyer_id and r.quote=s.quote
   join sandbox_commerce_v1.native_store_dispatch_attempts a on a.reservation_id=r.id and a.buyer_id=s.buyer_id
   join sandbox_commerce_v1.native_store_play_handoff_attempts ha on ha.attempt_id=a.id
   join sandbox_commerce_v1.native_store_play_enrollments e on e.id=ha.enrollment_id and e.revision=ha.enrollment_revision and e.buyer_id=a.buyer_id
   join sandbox_commerce_v1.native_store_play_handoff_setups q on q.id=e.setup_id and q.revision=e.setup_revision
   join mappings m on row(q.platform,q.native_build,q.native_version,q.sdk_version)
    =row(m.platform,m.native_build,m.native_version,m.sdk_version)
   where o->>'eventType'='NON_RENEWING_PURCHASE' and c.buyer_id=(o->>'userId')::uuid
    and c.transaction_identifier=o->>'transactionId' and c.product_identifier=o->>'productId'
    and s.quote#>>'{catalog,projectId}'=raw->>'projectId' and s.quote#>>'{catalog,appId}'=raw->>'appId'
    and s.quote#>>'{catalog,store}'=raw->>'store' and s.quote#>>'{catalog,environment}'='SANDBOX'
    and s.quote#>>'{catalog,wireProductId}'=o->>'productId'
    and q.connection_id::text=raw->>'connectionId' and q.connection_revision::text=raw->>'connectionRevision'
    and q.quote_digest=s.quote->>'quoteDigest'
    and not exists(select 1 from sandbox_commerce_v1.native_store_play_setup_revocations v where v.setup_id=q.id and v.setup_revision=q.revision)
    and not exists(select 1 from sandbox_commerce_v1.native_store_play_enrollment_revocations v where v.enrollment_id=e.id and v.enrollment_revision=e.revision)
   union all
   select null::uuid,m.id,m.revision from mappings m where o->>'eventType'='CANCELLATION'
  ) select coalesce(jsonb_agg(jsonb_build_object('rawReceiptId',p_raw_receipt_id,'claimId',p.claim_id,'protocolId',p.protocol_id,'protocolRevision',p.protocol_revision)),'[]'::jsonb)
   into candidates from (select * from pairs limit 2) p;
  -- LIMIT 2 is only an ambiguity detector, never a selection ordering rule.
  if jsonb_array_length(candidates)<>1 then return held;end if;
  chosen:=candidates->0;
 end if;
 mapping:=sandbox_commerce_v1.native_store_play_settlement_protocol((chosen->>'protocolId')::uuid,(chosen->>'protocolRevision')::bigint);
 if mapping->>'projectId' is distinct from raw->>'projectId' or mapping->>'appId' is distinct from raw->>'appId'
  or mapping->>'store' is distinct from raw->>'store' or mapping->>'productId' is distinct from o->>'productId'
  or mapping->>'connectionId' is distinct from raw->>'connectionId' or mapping->>'connectionRevision' is distinct from raw->>'connectionRevision'
 then return held;end if;
 perform sandbox_commerce_v1.assert_generation(false);
 return jsonb_build_object('protocol','native-store-effect-candidate-v1','rawReceiptId',p_raw_receipt_id,'status','candidate','work',chosen,'acknowledgementAllowed',false);
end $$;
-- Pinned compatibility body copied from the immutable base closure. The
-- original function OID is retained so all existing dependencies use the wrapper.
create function sandbox_commerce_v1.native_store_effect_candidate_pre_play_handoff(p_raw_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw jsonb;o jsonb;chosen jsonb;mapping jsonb;candidates jsonb;prior sandbox_commerce_v1.native_store_raw_effects;
 held jsonb:=jsonb_build_object('protocol','native-store-effect-candidate-v1','rawReceiptId',p_raw_receipt_id,'status','held','work',null,'acknowledgementAllowed',false);
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 perform sandbox_commerce_v1.assert_provider_service();
 raw:=native_store_sandbox_v1.settlement_source(p_raw_receipt_id);o:=raw->'observation';
 if raw is null or raw->>'environment' is distinct from 'SANDBOX' or raw->'conflicted' is distinct from 'false'::jsonb
  or jsonb_array_length(raw->'eventIds')<>1 or o->>'parseStatus' is distinct from 'valid' or o->'issues' is distinct from '[]'::jsonb
  or o->'conflictingUserIds' is distinct from '[]'::jsonb or o->'transferredFrom' is distinct from '[]'::jsonb or o->'transferredTo' is distinct from '[]'::jsonb
  or coalesce(o->>'userId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or coalesce(length(o->>'transactionId'),0)=0 or coalesce(length(o->>'originalTransactionId'),0)=0
  or coalesce(length(o->>'productId'),0)=0 or coalesce(length(o->>'eventId'),0)=0
  or o->>'eventType' not in('NON_RENEWING_PURCHASE','CANCELLATION') then return held;end if;
 if o->>'eventType'='NON_RENEWING_PURCHASE' and (raw->'intakeEnabled' is distinct from 'true'::jsonb or raw->'originalRevisionRevoked' is distinct from 'false'::jsonb) then return held;end if;
 -- A completed effect has an immutable original pair; never rediscover a newer
 -- candidate for the same receipt. The worker/apply still revalidate evidence.
 select * into prior from sandbox_commerce_v1.native_store_raw_effects where raw_receipt_id=p_raw_receipt_id;
 if prior.raw_receipt_id is not null then
  if prior.raw_sha256 is distinct from raw->>'rawSha256' then return held;end if;
  chosen:=jsonb_build_object('rawReceiptId',p_raw_receipt_id,'claimId',prior.claim_id,'protocolId',prior.protocol_id,'protocolRevision',prior.protocol_revision);
 else
  with mappings as (
   select p.id,p.revision,q.platform,q.native_build,q.native_version,q.signed_app_version,q.sdk_version
   from sandbox_commerce_v1.native_store_settlement_protocols p
   join sandbox_commerce_v1.native_store_protocol_qualifications q on q.id=p.sample_qualification_id and q.revision=p.sample_qualification_revision
   join sandbox_commerce_v1.native_store_claims sample on sample.id=p.sample_claim_id
   join sandbox_commerce_v1.native_store_selections s on s.id=sample.selection_id and s.buyer_id=sample.buyer_id
   where not exists(select 1 from sandbox_commerce_v1.native_store_settlement_revocations v where v.protocol_id=p.id and v.protocol_revision=p.revision)
    and q.connection_id::text=raw->>'connectionId' and q.connection_revision::text=raw->>'connectionRevision'
    and s.quote#>>'{catalog,projectId}'=raw->>'projectId' and s.quote#>>'{catalog,appId}'=raw->>'appId'
    and s.quote#>>'{catalog,store}'=raw->>'store' and s.quote#>>'{catalog,environment}'='SANDBOX'
    and sample.product_identifier=o->>'productId' and s.quote#>>'{catalog,wireProductId}'=o->>'productId'
  ), pairs as (
   select c.id claim_id,m.id protocol_id,m.revision protocol_revision
   from sandbox_commerce_v1.native_store_claims c
   join sandbox_commerce_v1.native_store_selections s on s.id=c.selection_id and s.buyer_id=c.buyer_id
   join sandbox_commerce_v1.native_store_reservations r on r.selection_id=s.id and r.buyer_id=s.buyer_id and r.quote=s.quote
   join sandbox_commerce_v1.native_store_dispatch_attempts a on a.reservation_id=r.id and a.buyer_id=s.buyer_id
   join sandbox_commerce_v1.native_store_qualified_attempts qa on qa.attempt_id=a.id
   join sandbox_commerce_v1.native_store_protocol_qualifications q on q.id=qa.qualification_id and q.revision=qa.qualification_revision
   join mappings m on row(q.platform,q.native_build,q.native_version,q.signed_app_version,q.sdk_version)
    =row(m.platform,m.native_build,m.native_version,m.signed_app_version,m.sdk_version)
   where o->>'eventType'='NON_RENEWING_PURCHASE' and c.buyer_id=(o->>'userId')::uuid
    and c.transaction_identifier=o->>'transactionId' and c.product_identifier=o->>'productId'
    and s.quote#>>'{catalog,projectId}'=raw->>'projectId' and s.quote#>>'{catalog,appId}'=raw->>'appId'
    and s.quote#>>'{catalog,store}'=raw->>'store' and s.quote#>>'{catalog,environment}'='SANDBOX'
    and s.quote#>>'{catalog,wireProductId}'=o->>'productId'
    and q.connection_id::text=raw->>'connectionId' and q.connection_revision::text=raw->>'connectionRevision'
    and q.quote_digest=s.quote->>'quoteDigest'
    and not exists(select 1 from sandbox_commerce_v1.native_store_protocol_revocations v where v.qualification_id=q.id and v.qualification_revision=q.revision)
   union all
   select null::uuid,m.id,m.revision from mappings m where o->>'eventType'='CANCELLATION'
  ) select coalesce(jsonb_agg(jsonb_build_object('rawReceiptId',p_raw_receipt_id,'claimId',p.claim_id,'protocolId',p.protocol_id,'protocolRevision',p.protocol_revision)),'[]'::jsonb)
   into candidates from (select * from pairs limit 2) p;
  -- LIMIT 2 is only an ambiguity detector, never a selection ordering rule.
  if jsonb_array_length(candidates)<>1 then return held;end if;
  chosen:=candidates->0;
 end if;
 mapping:=sandbox_commerce_v1.native_store_settlement_protocol((chosen->>'protocolId')::uuid,(chosen->>'protocolRevision')::bigint);
 if mapping->>'projectId' is distinct from raw->>'projectId' or mapping->>'appId' is distinct from raw->>'appId'
  or mapping->>'store' is distinct from raw->>'store' or mapping->>'productId' is distinct from o->>'productId'
  or mapping->>'connectionId' is distinct from raw->>'connectionId' or mapping->>'connectionRevision' is distinct from raw->>'connectionRevision'
 then return held;end if;
 perform sandbox_commerce_v1.assert_generation(false);
 return jsonb_build_object('protocol','native-store-effect-candidate-v1','rawReceiptId',p_raw_receipt_id,'status','candidate','work',chosen,'acknowledgementAllowed',false);
end $$;
revoke all on function sandbox_commerce_v1.native_store_effect_candidate_pre_play_handoff(uuid) from public,anon,authenticated,service_role;
-- The router owns the sole absolute transaction timer. The deterministic
-- armed variant differs from the pinned original only at that timer call.
create function sandbox_commerce_v1.native_store_effect_candidate_pre_play_handoff_armed(p_raw_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw jsonb;o jsonb;chosen jsonb;mapping jsonb;candidates jsonb;prior sandbox_commerce_v1.native_store_raw_effects;
 held jsonb:=jsonb_build_object('protocol','native-store-effect-candidate-v1','rawReceiptId',p_raw_receipt_id,'status','held','work',null,'acknowledgementAllowed',false);
begin
 perform sandbox_commerce_v1.assert_generation(false);
 perform sandbox_commerce_v1.assert_provider_service();
 raw:=native_store_sandbox_v1.settlement_source(p_raw_receipt_id);o:=raw->'observation';
 if raw is null or raw->>'environment' is distinct from 'SANDBOX' or raw->'conflicted' is distinct from 'false'::jsonb
  or jsonb_array_length(raw->'eventIds')<>1 or o->>'parseStatus' is distinct from 'valid' or o->'issues' is distinct from '[]'::jsonb
  or o->'conflictingUserIds' is distinct from '[]'::jsonb or o->'transferredFrom' is distinct from '[]'::jsonb or o->'transferredTo' is distinct from '[]'::jsonb
  or coalesce(o->>'userId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or coalesce(length(o->>'transactionId'),0)=0 or coalesce(length(o->>'originalTransactionId'),0)=0
  or coalesce(length(o->>'productId'),0)=0 or coalesce(length(o->>'eventId'),0)=0
  or o->>'eventType' not in('NON_RENEWING_PURCHASE','CANCELLATION') then return held;end if;
 if o->>'eventType'='NON_RENEWING_PURCHASE' and (raw->'intakeEnabled' is distinct from 'true'::jsonb or raw->'originalRevisionRevoked' is distinct from 'false'::jsonb) then return held;end if;
 -- A completed effect has an immutable original pair; never rediscover a newer
 -- candidate for the same receipt. The worker/apply still revalidate evidence.
 select * into prior from sandbox_commerce_v1.native_store_raw_effects where raw_receipt_id=p_raw_receipt_id;
 if prior.raw_receipt_id is not null then
  if prior.raw_sha256 is distinct from raw->>'rawSha256' then return held;end if;
  chosen:=jsonb_build_object('rawReceiptId',p_raw_receipt_id,'claimId',prior.claim_id,'protocolId',prior.protocol_id,'protocolRevision',prior.protocol_revision);
 else
  with mappings as (
   select p.id,p.revision,q.platform,q.native_build,q.native_version,q.signed_app_version,q.sdk_version
   from sandbox_commerce_v1.native_store_settlement_protocols p
   join sandbox_commerce_v1.native_store_protocol_qualifications q on q.id=p.sample_qualification_id and q.revision=p.sample_qualification_revision
   join sandbox_commerce_v1.native_store_claims sample on sample.id=p.sample_claim_id
   join sandbox_commerce_v1.native_store_selections s on s.id=sample.selection_id and s.buyer_id=sample.buyer_id
   where not exists(select 1 from sandbox_commerce_v1.native_store_settlement_revocations v where v.protocol_id=p.id and v.protocol_revision=p.revision)
    and q.connection_id::text=raw->>'connectionId' and q.connection_revision::text=raw->>'connectionRevision'
    and s.quote#>>'{catalog,projectId}'=raw->>'projectId' and s.quote#>>'{catalog,appId}'=raw->>'appId'
    and s.quote#>>'{catalog,store}'=raw->>'store' and s.quote#>>'{catalog,environment}'='SANDBOX'
    and sample.product_identifier=o->>'productId' and s.quote#>>'{catalog,wireProductId}'=o->>'productId'
  ), pairs as (
   select c.id claim_id,m.id protocol_id,m.revision protocol_revision
   from sandbox_commerce_v1.native_store_claims c
   join sandbox_commerce_v1.native_store_selections s on s.id=c.selection_id and s.buyer_id=c.buyer_id
   join sandbox_commerce_v1.native_store_reservations r on r.selection_id=s.id and r.buyer_id=s.buyer_id and r.quote=s.quote
   join sandbox_commerce_v1.native_store_dispatch_attempts a on a.reservation_id=r.id and a.buyer_id=s.buyer_id
   join sandbox_commerce_v1.native_store_qualified_attempts qa on qa.attempt_id=a.id
   join sandbox_commerce_v1.native_store_protocol_qualifications q on q.id=qa.qualification_id and q.revision=qa.qualification_revision
   join mappings m on row(q.platform,q.native_build,q.native_version,q.signed_app_version,q.sdk_version)
    =row(m.platform,m.native_build,m.native_version,m.signed_app_version,m.sdk_version)
   where o->>'eventType'='NON_RENEWING_PURCHASE' and c.buyer_id=(o->>'userId')::uuid
    and c.transaction_identifier=o->>'transactionId' and c.product_identifier=o->>'productId'
    and s.quote#>>'{catalog,projectId}'=raw->>'projectId' and s.quote#>>'{catalog,appId}'=raw->>'appId'
    and s.quote#>>'{catalog,store}'=raw->>'store' and s.quote#>>'{catalog,environment}'='SANDBOX'
    and s.quote#>>'{catalog,wireProductId}'=o->>'productId'
    and q.connection_id::text=raw->>'connectionId' and q.connection_revision::text=raw->>'connectionRevision'
    and q.quote_digest=s.quote->>'quoteDigest'
    and not exists(select 1 from sandbox_commerce_v1.native_store_protocol_revocations v where v.qualification_id=q.id and v.qualification_revision=q.revision)
   union all
   select null::uuid,m.id,m.revision from mappings m where o->>'eventType'='CANCELLATION'
  ) select coalesce(jsonb_agg(jsonb_build_object('rawReceiptId',p_raw_receipt_id,'claimId',p.claim_id,'protocolId',p.protocol_id,'protocolRevision',p.protocol_revision)),'[]'::jsonb)
   into candidates from (select * from pairs limit 2) p;
  -- LIMIT 2 is only an ambiguity detector, never a selection ordering rule.
  if jsonb_array_length(candidates)<>1 then return held;end if;
  chosen:=candidates->0;
 end if;
 mapping:=sandbox_commerce_v1.native_store_settlement_protocol((chosen->>'protocolId')::uuid,(chosen->>'protocolRevision')::bigint);
 if mapping->>'projectId' is distinct from raw->>'projectId' or mapping->>'appId' is distinct from raw->>'appId'
  or mapping->>'store' is distinct from raw->>'store' or mapping->>'productId' is distinct from o->>'productId'
  or mapping->>'connectionId' is distinct from raw->>'connectionId' or mapping->>'connectionRevision' is distinct from raw->>'connectionRevision'
 then return held;end if;
 perform sandbox_commerce_v1.assert_generation(false);
 return jsonb_build_object('protocol','native-store-effect-candidate-v1','rawReceiptId',p_raw_receipt_id,'status','candidate','work',chosen,'acknowledgementAllowed',false);
end $$;
revoke all on function sandbox_commerce_v1.native_store_effect_candidate_pre_play_handoff_armed(uuid) from public,anon,authenticated,service_role;
create or replace function sandbox_commerce_v1.native_store_effect_candidate(p_raw_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$declare raw jsonb;begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.assert_provider_service();
 raw:=native_store_sandbox_v1.settlement_source(p_raw_receipt_id);
 if raw->>'store'='PLAY_STORE' then return sandbox_commerce_v1.native_store_play_effect_candidate(p_raw_receipt_id);end if;
 return sandbox_commerce_v1.native_store_effect_candidate_pre_play_handoff_armed(p_raw_receipt_id);
end $$;
-- New and compatibility helpers stay owner-private. Public service-only RPCs retain
-- their signatures and call the new dispatch wrappers by name.

revoke all on function sandbox_commerce_v1.native_store_terminal_json(sandbox_commerce_v1.native_store_reservation_terminals) from public,anon,authenticated,service_role;
revoke all on function sandbox_commerce_v1.native_store_project_pending(text) from public,anon,authenticated,service_role;
revoke all on function sandbox_commerce_v1.native_store_resolve_completed_pending(uuid) from public,anon,authenticated,service_role;
revoke all on function sandbox_commerce_v1.native_store_play_attempt_setup(uuid) from public,anon,authenticated,service_role;
revoke all on function sandbox_commerce_v1.native_store_play_settlement_protocol(uuid,bigint) from public,anon,authenticated,service_role;
revoke all on function sandbox_commerce_v1.native_store_play_assert_current_allocation(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function sandbox_commerce_v1.native_store_play_apply_effect(uuid,uuid,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
revoke all on function sandbox_commerce_v1.native_store_play_record_allocated_terminal(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function sandbox_commerce_v1.native_store_play_record_refunded_terminal(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function sandbox_commerce_v1.native_store_settlement_protocol(uuid,bigint) from public,anon,authenticated,service_role;
revoke all on function sandbox_commerce_v1.native_store_assert_current_allocation(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function sandbox_commerce_v1.native_store_apply_effect(uuid,uuid,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
revoke all on function sandbox_commerce_v1.native_store_play_mapping_identity_guard() from public,anon,authenticated,service_role;
revoke all on function sandbox_commerce_v1.native_store_play_effect_candidate(uuid) from public,anon,authenticated,service_role;
revoke all on function sandbox_commerce_v1.native_store_effect_candidate(uuid) from public,anon,authenticated,service_role;
reset role;
grant sbx_v1_core_owner to postgres with inherit false,set false;

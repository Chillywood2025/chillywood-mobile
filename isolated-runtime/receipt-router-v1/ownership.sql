set local role receipt_router_v1_owner;
-- A typed source bridge, not an arbitrary service claim, must supply this
-- provenance. Legacy import kinds are reserved for separately reviewed static
-- bridges; no default importer or generic 'verified JSON' endpoint exists.
create table receipt_router_v1.original_admissions (
  store_app_identity text not null,store text not null,environment text not null,original_transaction_id text not null,
  admission_kind text not null check(admission_kind in ('isolated_verified_receipt_v1',
    'legacy_premium_authenticated_replay_v1','legacy_creator_authenticated_replay_v1')),
  router_receipt_id uuid not null references receipt_router_v1.receipts(id),
  source_receipt_id uuid not null,source_intent_id uuid,source_dispatch_id uuid,
  source_event_id text not null,source_scope_key text not null,
  admitted_at timestamptz not null default clock_timestamp(),
  primary key(store_app_identity,store,environment,original_transaction_id),
  foreign key(store_app_identity,store,environment,original_transaction_id)
    references receipt_router_v1.originals(store_app_identity,store,environment,original_transaction_id),
  check(admission_kind<>'isolated_verified_receipt_v1' or (source_intent_id is not null and source_dispatch_id is not null))
);
alter table receipt_router_v1.original_admissions enable row level security;
alter table receipt_router_v1.original_admissions force row level security;
create policy router_owner on receipt_router_v1.original_admissions for all to receipt_router_v1_owner using(true) with check(true);
create trigger immutable before update or delete on receipt_router_v1.original_admissions
  for each row execute function receipt_router_v1.immutable();
revoke all on receipt_router_v1.original_admissions from public,anon,authenticated,service_role;

create function receipt_router_v1.arm_source_import_context() returns void
language plpgsql volatile security invoker set search_path='' as $$
declare remaining integer;
begin
  if current_setting('transaction_isolation')<>'read committed' or current_setting('transaction_timeout')<>'0'
  then raise exception 'receipt_router_source_context_invalid' using errcode='42501'; end if;
  remaining:=floor(extract(epoch from (transaction_timestamp()+interval '5 seconds'-clock_timestamp()))*1000);
  if remaining<1 or remaining>5000 then raise exception 'receipt_router_source_context_expired' using errcode='42501'; end if;
  perform set_config('transaction_timeout',remaining::text,true);
end; $$;
create function receipt_router_v1.source_candidate(p_receipt uuid)
returns table(scope_id uuid,raw_sha256 text,project_id text,app_id text,store text,environment text,
  provider_event_id text,provider_event_type text,event_at timestamptz,user_id uuid,
  product_id text,transaction_id text,original_transaction_id text)
language plpgsql volatile security definer set search_path='' as $$
declare r receipt_router_v1.receipts;o jsonb;s receipt_router_v1.scopes;
begin
  lock table receipt_router_v1.receipts,receipt_router_v1.events,receipt_router_v1.conflicts,
    receipt_router_v1.scopes,receipt_router_v1.catalog in share mode nowait;
  select * into strict r from receipt_router_v1.receipts where id=p_receipt;o:=r.envelope->'observation';
  if o->>'parseStatus' is distinct from 'valid' or o->>'eventType' in ('TEST','TRANSFER')
    or o->>'userId' is null or o->>'userId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or not receipt_router_v1.exact_text(o->>'eventId') or not receipt_router_v1.exact_text(o->>'originalTransactionId')
    or o->>'eventAt' is null or not isfinite((o->>'eventAt')::timestamptz)
    or not exists(select 1 from receipt_router_v1.events e where e.first_receipt_id=r.id
      and not exists(select 1 from receipt_router_v1.conflicts x where x.event_id=e.id))
  then raise exception 'receipt_router_candidate_unavailable' using errcode='42501'; end if;
  select * into strict s from receipt_router_v1.scopes x where x.project_id=r.project_id and x.app_id=o->>'appId'
    and x.store=o->>'store' and x.environment=o->>'environment';
  return query select s.id,r.raw_sha256,s.project_id,s.app_id,s.store,s.environment,
    o->>'eventId',o->>'eventType',(o->>'eventAt')::timestamptz,(o->>'userId')::uuid,
    o->>'productId',o->>'transactionId',o->>'originalTransactionId';
end; $$;

-- INTERNAL privileged commit half. It validates all router-side immutable facts
-- and derives domain/generation from the exclusive catalog. It does NOT verify
-- caller-supplied source IDs itself. Only a statically reviewed SECURITY DEFINER
-- bridge that locks/checks its actual source rows may receive EXECUTE. Never
-- grant this function to service_role or create a generic public wrapper.
create function receipt_router_v1.commit_original_from_source(
  p_receipt uuid,p_scope uuid,p_product text,p_original text,p_buyer uuid,p_intent uuid,
  p_kind text,p_source_receipt uuid,p_source_event text,p_source_dispatch uuid,p_source_scope text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r receipt_router_v1.receipts;s receipt_router_v1.scopes;c receipt_router_v1.catalog;
  b receipt_router_v1.originals;a receipt_router_v1.original_admissions;o jsonb;expected_domain text;
begin
  if current_setting('transaction_isolation')<>'read committed' or clock_timestamp()>=transaction_timestamp()+interval '5 seconds'
    or p_buyer is null or p_source_receipt is null or not receipt_router_v1.exact_text(p_product)
    or not receipt_router_v1.exact_text(p_original) or not receipt_router_v1.exact_text(p_source_event)
    or not receipt_router_v1.exact_text(p_source_scope)
  then raise exception 'receipt_router_source_admission_invalid' using errcode='22023'; end if;
  expected_domain:=case p_kind when 'isolated_verified_receipt_v1' then 'isolated_sandbox'
    when 'legacy_premium_authenticated_replay_v1' then 'legacy_premium'
    when 'legacy_creator_authenticated_replay_v1' then 'legacy_creator' end;
  if expected_domain is null or (expected_domain='isolated_sandbox' and (p_intent is null or p_source_dispatch is null))
  then raise exception 'receipt_router_source_admission_invalid' using errcode='22023'; end if;
  -- No conflicting event can be admitted while another redelivery is changing
  -- its evidence. These are only new private router tables.
  lock table receipt_router_v1.receipts,receipt_router_v1.events,receipt_router_v1.conflicts,
    receipt_router_v1.scopes,receipt_router_v1.catalog in share mode nowait;
  select * into strict r from receipt_router_v1.receipts where id=p_receipt;
  select * into strict s from receipt_router_v1.scopes where id=p_scope;
  select * into strict c from receipt_router_v1.catalog where scope_id=p_scope and product_id=p_product;
  o:=r.envelope->'observation';
  if o->>'parseStatus' is distinct from 'valid' or o->>'eventType' in ('TEST','TRANSFER')
    or r.project_id<>s.project_id or o->>'appId' is distinct from s.app_id or o->>'store' is distinct from s.store
    or o->>'environment' is distinct from s.environment or o->>'userId' is distinct from p_buyer::text
    or o->>'eventId' is distinct from p_source_event or o->>'originalTransactionId' is distinct from p_original
    or (o->>'productId' is not null and o->>'productId'<>p_product) or c.owner_domain<>expected_domain
    or not exists(select 1 from receipt_router_v1.events e where e.first_receipt_id=r.id
      and not exists(select 1 from receipt_router_v1.conflicts x where x.event_id=e.id))
  then raise exception 'receipt_router_source_evidence_mismatch' using errcode='42501'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended(jsonb_build_array('receipt-router-original',s.store_app_identity,s.store,s.environment,p_original)::text,683))
  then raise exception 'receipt_router_original_busy' using errcode='55P03'; end if;
  select * into b from receipt_router_v1.originals where store_app_identity=s.store_app_identity and store=s.store
    and environment=s.environment and original_transaction_id=p_original;
  if found then
    select * into a from receipt_router_v1.original_admissions where store_app_identity=s.store_app_identity and store=s.store
      and environment=s.environment and original_transaction_id=p_original;
    if a.admission_kind is null or b.scope_id<>s.id or b.product_id<>p_product or b.original_buyer_id<>p_buyer
      or b.owner_domain<>c.owner_domain or b.owner_generation<>c.owner_generation or b.intent_id is distinct from p_intent
      or a.admission_kind<>p_kind or a.source_receipt_id<>p_source_receipt or a.source_intent_id is distinct from p_intent
      or a.source_dispatch_id is distinct from p_source_dispatch or a.source_scope_key<>p_source_scope
    then raise exception 'receipt_router_original_admission_conflict' using errcode='42501'; end if;
    perform receipt_router_v1.backfill_original_holds(s.store_app_identity,s.store,s.environment,p_original);
    return jsonb_build_object('status','already_admitted','authorityGranted',false,'providerDispatchAllowed',false);
  end if;
  insert into receipt_router_v1.originals values(s.id,s.store_app_identity,s.store,s.environment,p_original,p_product,
    c.owner_domain,c.owner_generation,p_buyer,p_intent,1,r.id);
  insert into receipt_router_v1.original_admissions values(s.store_app_identity,s.store,s.environment,p_original,p_kind,
    r.id,p_source_receipt,p_intent,p_source_dispatch,p_source_event,p_source_scope,clock_timestamp());
  perform receipt_router_v1.backfill_original_holds(s.store_app_identity,s.store,s.environment,p_original);
  return jsonb_build_object('status','original_admitted','authorityGranted',false,'providerDispatchAllowed',false);
end; $$;

-- This is a negative projection, not a grant validator. Callers MUST derive the
-- complete query scope from their own qualified source mapping. Clear means
-- only 'no matching router veto', never valid ownership or effective access.
-- The outer consumer must arm a real bounded transaction timer once; this
-- private helper never resets or extends it. No public wrapper is provided.
create function receipt_router_v1.read_hold(p_project text,p_app text,p_store text,p_environment text,
  p_subject uuid,p_owner_domain text,p_owner_generation bigint,p_original text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare s receipt_router_v1.scopes;h record;original receipt_router_v1.originals;admission receipt_router_v1.original_admissions;
  o jsonb;cfg receipt_router_v1.configuration;reason text;
begin
  if p_subject is null or not receipt_router_v1.exact_text(p_project) or not receipt_router_v1.exact_text(p_app)
    or p_store is null or p_store not in ('APP_STORE','PLAY_STORE') or p_environment is null or p_environment not in ('SANDBOX','PRODUCTION')
    or p_owner_domain is null or p_owner_domain not in ('legacy_premium','legacy_creator','isolated_sandbox')
    or p_owner_generation is null or p_owner_generation<1 or (p_original is not null and not receipt_router_v1.exact_text(p_original))
  then raise exception 'receipt_router_hold_scope_required' using errcode='22023'; end if;
  if current_setting('transaction_isolation')<>'read committed' or clock_timestamp()>=transaction_timestamp()+interval '5 seconds'
  then raise exception 'receipt_router_hold_context_invalid' using errcode='42501'; end if;
  select * into strict cfg from receipt_router_v1.configuration for share nowait;
  lock table receipt_router_v1.pending_holds,receipt_router_v1.originals,receipt_router_v1.original_admissions,
    receipt_router_v1.scopes,receipt_router_v1.catalog,receipt_router_v1.receipts,receipt_router_v1.events,receipt_router_v1.conflicts
    in share mode nowait;
  select * into s from receipt_router_v1.scopes where project_id=p_project and app_id=p_app and store=p_store and environment=p_environment;
  if not found or cfg.ownership_coverage<>'complete' then
    return jsonb_build_object('protocol','rc-router-hold-v1','state','unavailable','reason','scope_qualification_incomplete','authorityGranted',false);
  end if;
  -- Authentication still establishes the reporting project when malformed
  -- bytes establish no trustworthy subject. Absence of a child is not clear.
  -- This is scoped coverage unavailability, not a fabricated null-user hold.
  -- Rejected fields never choose a scope. A registry-proven intersection of
  -- reporting-project store scopes nevertheless proves possible economic alias
  -- coverage, and must be unavailable too until that uncertainty is reconciled.
  if exists(select 1 from receipt_router_v1.receipts raw_parent where (raw_parent.project_id=p_project
    or exists(select 1 from receipt_router_v1.scopes reporting_scope where reporting_scope.project_id=raw_parent.project_id
      and reporting_scope.store_app_identity=s.store_app_identity and reporting_scope.store=s.store
      and reporting_scope.environment=s.environment))
    and (raw_parent.envelope#>>'{observation,parseStatus}'='invalid'
      or raw_parent.envelope#>>'{observation,eventType}' not in
        ('TEST','INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','SUBSCRIPTION_PAUSED','PRODUCT_CHANGE')
      or exists(select 1 from receipt_router_v1.events event_parent where event_parent.first_receipt_id=raw_parent.id
        and exists(select 1 from receipt_router_v1.conflicts event_conflict where event_conflict.event_id=event_parent.id))
      or exists(select 1 from receipt_router_v1.conflicts event_conflict where event_conflict.receipt_id=raw_parent.id))
    and not exists(select 1 from receipt_router_v1.pending_holds child where child.evidence_receipt_id=raw_parent.id))
  then return jsonb_build_object('protocol','rc-router-hold-v1','state','unavailable',
    'reason','unscopable_authenticated_evidence','authorityGranted',false); end if;
  for h in select ph.*,r.envelope->'observation' observation from receipt_router_v1.pending_holds ph
    join receipt_router_v1.receipts r on r.id=ph.evidence_receipt_id
    where ph.subject_id=p_subject and (
      (ph.project_id=p_project and (ph.app_id is null or ph.app_id=p_app)
        and (ph.store is null or ph.store=p_store) and (ph.environment is null or ph.environment=p_environment))
      or exists(select 1 from receipt_router_v1.scopes observed where observed.project_id=ph.project_id
        and observed.app_id=ph.app_id and observed.store=ph.store and observed.environment=ph.environment
        and observed.store_app_identity=s.store_app_identity and observed.store=s.store and observed.environment=s.environment))
    order by ph.created_at,ph.event_id,ph.evidence_receipt_id loop
    o:=h.observation;
    -- A queued positive candidate is not negative evidence. Conflict or invalid
    -- identity remains unresolved; never let a later positive clear old holds.
    if o->>'parseStatus'='valid' and o->>'eventType' in ('TEST','INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','SUBSCRIPTION_PAUSED','PRODUCT_CHANGE')
      and not exists(select 1 from receipt_router_v1.conflicts where event_id=h.event_id) then continue; end if;
    original:=null;admission:=null;
    if o->>'eventType' is distinct from 'TRANSFER'
      and exists(select 1 from receipt_router_v1.scopes observed where observed.project_id=h.project_id
        and observed.app_id=h.app_id and observed.store=h.store and observed.environment=h.environment
        and observed.store_app_identity=s.store_app_identity and observed.store=s.store and observed.environment=s.environment)
      and h.original_transaction_id is not null then
      select * into original from receipt_router_v1.originals where store_app_identity=s.store_app_identity and store=s.store
        and environment=s.environment and original_transaction_id=h.original_transaction_id;
      if found then
        select * into admission from receipt_router_v1.original_admissions where store_app_identity=original.store_app_identity
          and store=original.store and environment=original.environment and original_transaction_id=original.original_transaction_id
          and admission_kind=case original.owner_domain when 'isolated_sandbox' then 'isolated_verified_receipt_v1'
            when 'legacy_premium' then 'legacy_premium_authenticated_replay_v1' when 'legacy_creator' then 'legacy_creator_authenticated_replay_v1' end;
      end if;
    end if;
    if admission.admission_kind is not null and o->>'parseStatus'='valid'
      and o->>'eventType' in ('CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION')
      and not exists(select 1 from receipt_router_v1.conflicts where event_id=h.event_id) then
      if original.owner_domain<>p_owner_domain or original.owner_generation<>p_owner_generation
        or (p_original is not null and original.original_transaction_id<>p_original) then continue; end if;
      reason:='exact_original_pending';
    else
      -- Unknown subject effects cannot cross into a guessed project/app. Only
      -- a qualified economic-original admission may bridge registered RC
      -- aliases of the exact same store application/store/environment.
      if admission.admission_kind is null and (h.project_id<>p_project or (h.app_id is not null and h.app_id<>p_app)
        or (h.store is not null and h.store<>p_store) or (h.environment is not null and h.environment<>p_environment))
      then continue; end if;
      -- A proven economic original can establish the affected store scope even
      -- when malformed/conflicting evidence cannot select a domain or lineage.
      -- Keep that owner's subject unresolved across qualified aliases; do not
      -- incorrectly turn ambiguity into clear under the original reporting app.
      -- In particular, a productless TRANSFER never narrows by reported SKU or
      -- one selected Premium original. Both canonical identity children veto
      -- all queried lineages for that subject/scope pending full reconciliation.
      reason:='subject_scope_unresolved';
    end if;
    return jsonb_build_object('protocol','rc-router-hold-v1','state','held','reason',reason,
      'eventId',h.event_id,'evidenceReceiptId',h.evidence_receipt_id,'authorityGranted',false);
  end loop;
  return jsonb_build_object('protocol','rc-router-hold-v1','state','clear','reason','no_matching_router_effect','authorityGranted',false);
end; $$;
revoke all on function receipt_router_v1.commit_original_from_source(uuid,uuid,text,text,uuid,uuid,text,uuid,text,uuid,text),
  receipt_router_v1.read_hold(text,text,text,text,uuid,text,bigint,text),receipt_router_v1.source_candidate(uuid),
  receipt_router_v1.arm_source_import_context() from public,anon,authenticated,service_role;
reset role;

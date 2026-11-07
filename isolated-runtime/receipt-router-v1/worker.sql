set local role receipt_router_v1_owner;
create index jobs_ready on receipt_router_v1.jobs(next_attempt_at,event_id) where state in ('queued','leased');
create index pending_holds_subject on receipt_router_v1.pending_holds(subject_id,project_id);
create index subjects_identity on receipt_router_v1.subjects(canonical_subject,receipt_id) where canonical_subject is not null;

create function receipt_router_v1.scope_json(s receipt_router_v1.scopes) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('projectId',s.project_id,'appId',s.app_id,'store',s.store,
    'environment',s.environment,'storeAppIdentity',s.store_app_identity)
$$;
create function receipt_router_v1.claim(p_worker uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg receipt_router_v1.configuration;j receipt_router_v1.jobs;e receipt_router_v1.events;
  snapshot jsonb;variants jsonb;
begin
  if p_worker is null then raise exception 'receipt_router_worker_invalid' using errcode='22023'; end if;
  select * into strict cfg from receipt_router_v1.configuration for share nowait;
  if not cfg.worker_enabled then return jsonb_build_object('status','disabled','authorityGranted',false); end if;
  select * into j from receipt_router_v1.jobs
    where (state='queued' and next_attempt_at<=clock_timestamp()) or (state='leased' and lease_until<=clock_timestamp())
    order by next_attempt_at,event_id for update skip locked limit 1;
  if not found then return jsonb_build_object('status','idle','authorityGranted',false); end if;
  select * into strict e from receipt_router_v1.events where id=j.event_id;
  update receipt_router_v1.jobs set state='leased',lease=gen_random_uuid(),lease_generation=lease_generation+1,
    lease_until=clock_timestamp()+interval '30 seconds',worker_id=p_worker,attempts=attempts+1,
    snapshot_revision=cfg.catalog_revision,last_reason=null where event_id=j.event_id returning * into j;
  -- Conflict variants remain separate authenticated parents. Never merge them
  -- into fictitious bytes or let the last arrival overwrite the first event.
  select jsonb_agg(jsonb_build_object('receiptId',r.id,'connectionId',r.connection_id,
    'connectionRevision',r.connection_revision,'projectId',r.project_id,'envelope',r.envelope) order by r.id)
    into variants from receipt_router_v1.receipts r where r.id=e.first_receipt_id
      or r.id in(select receipt_id from receipt_router_v1.conflicts where event_id=e.id);
  if jsonb_array_length(variants)>32 then
    update receipt_router_v1.jobs set state='reconciliation_pending',lease=null,lease_until=null,worker_id=null,
      last_reason='event_variant_limit_requires_review' where event_id=j.event_id;
    return jsonb_build_object('status','held','authorityGranted',false);
  end if;
  snapshot:=jsonb_build_object('revision',cfg.catalog_revision,'coverage',cfg.ownership_coverage,'projectId',e.project_id,
    'scopes',coalesce((select jsonb_agg(receipt_router_v1.scope_json(s)) from
      (select * from receipt_router_v1.scopes where project_id=e.project_id order by id limit 33) s),'[]'::jsonb),
    'catalog',coalesce((select jsonb_agg(jsonb_build_object('scope',receipt_router_v1.scope_json(s),
      'productId',c.product_id,'owner',jsonb_build_object('domain',c.owner_domain,'generation',c.owner_generation)))
      from (select c.* from receipt_router_v1.catalog c join receipt_router_v1.scopes s on s.id=c.scope_id
        where s.project_id=e.project_id order by c.scope_id,c.product_id limit 5001) c
      join receipt_router_v1.scopes s on s.id=c.scope_id),'[]'::jsonb),
    'originals',coalesce((select jsonb_agg(jsonb_build_object('scope',receipt_router_v1.scope_json(s),
      'productId',b.product_id,'owner',jsonb_build_object('domain',b.owner_domain,'generation',b.owner_generation),
      'originalTransactionId',b.original_transaction_id,'originalBuyerId',b.original_buyer_id,
      'intentId',b.intent_id,'revision',b.revision))
      from (select b.* from receipt_router_v1.originals b join receipt_router_v1.scopes s on s.id=b.scope_id
        where s.project_id=e.project_id and exists(select 1 from receipt_router_v1.receipts r
          where (r.id=e.first_receipt_id or r.id in(select receipt_id from receipt_router_v1.conflicts where event_id=e.id))
            and (b.original_transaction_id=r.envelope#>>'{observation,originalTransactionId}'
              or exists(select 1 from receipt_router_v1.subjects x where x.receipt_id=r.id and x.canonical_subject=b.original_buyer_id)))
        order by b.scope_id,b.original_transaction_id limit 5001) b
      join receipt_router_v1.scopes s on s.id=b.scope_id),'[]'::jsonb));
  return jsonb_build_object('protocol','rc-router-job-v1','status','leased','eventId',j.event_id,
    'lease',j.lease,'leaseGeneration',j.lease_generation,'leaseUntil',j.lease_until,
    'conflicted',jsonb_array_length(variants)>1,'variants',variants,'snapshot',snapshot,'authorityGranted',false);
end; $$;

create function receipt_router_v1.complete_plan(p_event uuid,p_lease uuid,p_generation bigint,p_plan jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j receipt_router_v1.jobs;cfg receipt_router_v1.configuration;r uuid;entry jsonb;k text;v jsonb;
begin
  select * into strict cfg from receipt_router_v1.configuration for share nowait;
  select * into j from receipt_router_v1.jobs where event_id=p_event for update nowait;
  if not found or not cfg.worker_enabled or j.state<>'leased' or j.lease is distinct from p_lease
    or j.lease_generation is distinct from p_generation or j.lease_until<=clock_timestamp()
    or j.snapshot_revision is distinct from cfg.catalog_revision
  then raise exception 'receipt_router_lease_stale' using errcode='42501'; end if;
  if p_plan is null or jsonb_typeof(p_plan) is distinct from 'object' or octet_length(p_plan::text)>2097152
    or not p_plan ?& array['protocol','grantsAuthority','providerDispatchAllowed','legacyProjectionAllowed','acknowledgementAllowed',
      'disposition','reason','snapshotRevision','owner','productId','originalTransactionId','holdTargets','requiresCompleteProviderEvidence']
    or p_plan-array['protocol','grantsAuthority','providerDispatchAllowed','legacyProjectionAllowed','acknowledgementAllowed',
      'disposition','reason','snapshotRevision','owner','productId','originalTransactionId','holdTargets','requiresCompleteProviderEvidence']<>'{}'::jsonb
    or p_plan->>'protocol' is distinct from 'rc-router-plan-v1'
    or p_plan->'grantsAuthority' is distinct from 'false'::jsonb or p_plan->'providerDispatchAllowed' is distinct from 'false'::jsonb
    or p_plan->'legacyProjectionAllowed' is distinct from 'false'::jsonb or p_plan->'acknowledgementAllowed' is distinct from 'false'::jsonb
    or jsonb_typeof(p_plan->'snapshotRevision') is distinct from 'number'
    or p_plan->>'snapshotRevision' is distinct from cfg.catalog_revision::text
    or jsonb_typeof(p_plan->'disposition') is distinct from 'string'
    or p_plan->>'disposition' not in ('no_effect_test','owner_candidate','awaiting_binding','reconciliation_required','unresolved_scope')
    or jsonb_typeof(p_plan->'reason') is distinct from 'string' or not receipt_router_v1.exact_text(p_plan->>'reason')
    or jsonb_typeof(p_plan->'holdTargets') is distinct from 'array' or jsonb_array_length(p_plan->'holdTargets')>20000
    or jsonb_typeof(p_plan->'requiresCompleteProviderEvidence') is distinct from 'boolean'
  then raise exception 'receipt_router_plan_invalid' using errcode='22023'; end if;
  foreach k in array array['productId','originalTransactionId'] loop
    if jsonb_typeof(p_plan->k) is distinct from 'null' and
      (jsonb_typeof(p_plan->k) is distinct from 'string' or not receipt_router_v1.exact_text(p_plan->>k))
    then raise exception 'receipt_router_plan_invalid' using errcode='22023'; end if;
  end loop;
  v:=p_plan->'owner';
  if jsonb_typeof(v) is distinct from 'null' and (jsonb_typeof(v) is distinct from 'object'
    or not v ?& array['domain','generation'] or v-array['domain','generation']<>'{}'::jsonb
    or jsonb_typeof(v->'domain') is distinct from 'string' or v->>'domain' not in ('legacy_premium','legacy_creator','isolated_sandbox')
    or jsonb_typeof(v->'generation') is distinct from 'number' or v->>'generation'!~'^[1-9][0-9]{0,14}$')
  then raise exception 'receipt_router_plan_invalid' using errcode='22023'; end if;
  -- Plans are evidence, never a projection instruction. Every target must cite
  -- an observed canonical identity or immutable owner from this exact event.
  for entry in select value from jsonb_array_elements(p_plan->'holdTargets') loop
    if jsonb_typeof(entry) is distinct from 'object' or not entry ?& array['subjectId','evidenceRole','originalTransactionId','owner']
      or entry-array['subjectId','evidenceRole','originalTransactionId','owner']<>'{}'::jsonb
      or jsonb_typeof(entry->'subjectId') is distinct from 'string'
      or entry->>'subjectId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(entry->'evidenceRole') is distinct from 'string'
      or entry->>'evidenceRole' not in ('reported','source','target','bound_owner')
      or not exists(select 1 from receipt_router_v1.receipts x join receipt_router_v1.events e on e.id=p_event
        where (x.id=e.first_receipt_id or x.id in(select receipt_id from receipt_router_v1.conflicts where event_id=e.id))
        and (exists(select 1 from receipt_router_v1.subjects s where s.receipt_id=x.id and s.canonical_subject::text=entry->>'subjectId')
          or exists(select 1 from receipt_router_v1.originals b join receipt_router_v1.scopes s on s.id=b.scope_id
            where b.original_buyer_id::text=entry->>'subjectId' and s.project_id=x.project_id
              and s.app_id=x.envelope#>>'{observation,appId}' and s.store=x.envelope#>>'{observation,store}'
              and s.environment=x.envelope#>>'{observation,environment}'
              and b.original_transaction_id=x.envelope#>>'{observation,originalTransactionId}')))
    then raise exception 'receipt_router_plan_subject_invalid' using errcode='22023'; end if;
    if jsonb_typeof(entry->'originalTransactionId') is distinct from 'null' and
      (jsonb_typeof(entry->'originalTransactionId') is distinct from 'string' or not receipt_router_v1.exact_text(entry->>'originalTransactionId'))
    then raise exception 'receipt_router_plan_subject_invalid' using errcode='22023'; end if;
    v:=entry->'owner';
    if jsonb_typeof(v) is distinct from 'null' and (jsonb_typeof(v) is distinct from 'object'
      or not v ?& array['domain','generation'] or v-array['domain','generation']<>'{}'::jsonb
      or jsonb_typeof(v->'domain') is distinct from 'string' or v->>'domain' not in ('legacy_premium','legacy_creator','isolated_sandbox')
      or jsonb_typeof(v->'generation') is distinct from 'number' or v->>'generation'!~'^[1-9][0-9]{0,14}$')
    then raise exception 'receipt_router_plan_subject_invalid' using errcode='22023'; end if;
  end loop;
  if p_plan->>'disposition'='no_effect_test' and exists(select 1 from receipt_router_v1.events e
    join receipt_router_v1.receipts x on x.id=e.first_receipt_id where e.id=p_event and
      (x.envelope#>>'{observation,parseStatus}' is distinct from 'valid' or x.envelope#>>'{observation,eventType}' is distinct from 'TEST'
       or exists(select 1 from receipt_router_v1.conflicts where event_id=e.id)))
  then raise exception 'receipt_router_test_plan_invalid' using errcode='22023'; end if;
  insert into receipt_router_v1.plans(event_id,lease_generation,plan) values(p_event,p_generation,p_plan);
  if p_plan->>'disposition' in ('reconciliation_required','unresolved_scope') then
    for r in select first_receipt_id from receipt_router_v1.events where id=p_event
      union select receipt_id from receipt_router_v1.conflicts where event_id=p_event loop
      perform receipt_router_v1.record_pending_holds(p_event,r,true);
    end loop;
  end if;
  update receipt_router_v1.jobs set state=case when p_plan->>'disposition'='no_effect_test' then 'planned' else 'reconciliation_pending' end,
    lease=null,lease_until=null,worker_id=null,last_reason=p_plan->>'reason' where event_id=p_event;
  return jsonb_build_object('status','plan_recorded','authorityGranted',false,'legacyEffectsEnforced',false,'acknowledgementAllowed',false);
end; $$;

create function receipt_router_v1.defer(p_event uuid,p_lease uuid,p_generation bigint,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j receipt_router_v1.jobs;
begin
  if p_reason not in ('storage_key_unavailable','stored_envelope_invalid','planner_unavailable','completion_unknown') or p_reason is null
  then raise exception 'receipt_router_defer_reason_invalid' using errcode='22023'; end if;
  select * into j from receipt_router_v1.jobs where event_id=p_event for update nowait;
  if not found or j.state<>'leased' or j.lease is distinct from p_lease or j.lease_generation is distinct from p_generation
    or j.lease_until<=clock_timestamp() then raise exception 'receipt_router_lease_stale' using errcode='42501'; end if;
  update receipt_router_v1.jobs set state='queued',lease=null,lease_until=null,worker_id=null,
    next_attempt_at=clock_timestamp()+least(3600,30*greatest(j.attempts,1))*interval '1 second',last_reason=p_reason where event_id=p_event;
  return jsonb_build_object('status','deferred','authorityGranted',false);
end; $$;
revoke all on all functions in schema receipt_router_v1 from public,anon,authenticated,service_role;
reset role;

-- Fresh owner creates only the four new public wrappers in the install tx.
grant create on schema public to receipt_router_v1_owner;
set local role receipt_router_v1_owner;
create function public.receipt_router_ingest_v1(p_connection_id uuid,p_connection_revision bigint,p_envelope jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin perform receipt_router_v1.service_context(); return receipt_router_v1.ingest(p_connection_id,p_connection_revision,p_envelope); end; $$;
create function public.receipt_router_claim_v1(p_worker uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform receipt_router_v1.service_context(); return receipt_router_v1.claim(p_worker); end; $$;
create function public.receipt_router_complete_plan_v1(p_event uuid,p_lease uuid,p_generation bigint,p_plan jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin perform receipt_router_v1.service_context(); return receipt_router_v1.complete_plan(p_event,p_lease,p_generation,p_plan); end; $$;
create function public.receipt_router_defer_v1(p_event uuid,p_lease uuid,p_generation bigint,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin perform receipt_router_v1.service_context(); return receipt_router_v1.defer(p_event,p_lease,p_generation,p_reason); end; $$;
revoke all on function public.receipt_router_ingest_v1(uuid,bigint,jsonb),public.receipt_router_claim_v1(uuid),
  public.receipt_router_complete_plan_v1(uuid,uuid,bigint,jsonb),public.receipt_router_defer_v1(uuid,uuid,bigint,text)
  from public,anon,authenticated;
grant execute on function public.receipt_router_ingest_v1(uuid,bigint,jsonb),public.receipt_router_claim_v1(uuid),
  public.receipt_router_complete_plan_v1(uuid,uuid,bigint,jsonb),public.receipt_router_defer_v1(uuid,uuid,bigint,text) to service_role;
reset role;
revoke create on schema public from receipt_router_v1_owner;

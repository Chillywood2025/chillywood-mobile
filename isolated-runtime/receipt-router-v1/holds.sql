set local role receipt_router_v1_owner;
-- A single immutable parent can honestly support many subject effects. No old
-- quarantine hash, legacy history, access grant or membership is changed.
create table receipt_router_v1.pending_holds (
  event_id uuid not null references receipt_router_v1.events(id),
  evidence_receipt_id uuid not null references receipt_router_v1.receipts(id),
  subject_id uuid not null,project_id text not null,app_id text,store text,environment text,original_transaction_id text,
  reason text not null,created_at timestamptz not null default clock_timestamp(),
  primary key(event_id,evidence_receipt_id,subject_id)
);
alter table receipt_router_v1.pending_holds enable row level security;
alter table receipt_router_v1.pending_holds force row level security;
create policy router_owner on receipt_router_v1.pending_holds for all to receipt_router_v1_owner using(true) with check(true);
revoke all on receipt_router_v1.pending_holds from public,anon,authenticated,service_role;
create trigger immutable before update or delete on receipt_router_v1.pending_holds for each row execute function receipt_router_v1.immutable();

create function receipt_router_v1.record_pending_holds(p_event uuid,p_receipt uuid,p_force boolean default false) returns void
language plpgsql security invoker set search_path='' as $$
declare r receipt_router_v1.receipts;o jsonb;
begin
  select * into strict r from receipt_router_v1.receipts where id=p_receipt;
  o:=r.envelope->'observation';
  if not p_force and o->>'parseStatus'='valid' and o->>'eventType' in ('TEST','INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','SUBSCRIPTION_PAUSED','PRODUCT_CHANGE')
    and not exists(select 1 from receipt_router_v1.conflicts where event_id=p_event) then return; end if;
  insert into receipt_router_v1.pending_holds(event_id,evidence_receipt_id,subject_id,project_id,app_id,store,environment,original_transaction_id,reason)
  select p_event,r.id,s.canonical_subject,r.project_id,o->>'appId',o->>'store',o->>'environment',o->>'originalTransactionId',
    case when o->>'eventType'='TRANSFER' then 'transfer_requires_both_subject_reconciliation' else 'removal_or_conflict_requires_reconciliation' end
  from receipt_router_v1.subjects s where s.receipt_id=r.id and s.canonical_subject is not null
    and s.evidence_role in ('reported','source','target','conflicting') on conflict do nothing;
  -- A mismatched reported buyer must not leave the immutable bound owner
  -- unrepresented. This child cites the same parent bytes; it invents no hash.
  insert into receipt_router_v1.pending_holds(event_id,evidence_receipt_id,subject_id,project_id,app_id,store,environment,original_transaction_id,reason)
  select p_event,r.id,b.original_buyer_id,r.project_id,o->>'appId',o->>'store',o->>'environment',b.original_transaction_id,
    'immutable_original_owner_requires_reconciliation'
  from receipt_router_v1.originals b join receipt_router_v1.scopes s
    on s.store_app_identity=b.store_app_identity and s.store=b.store and s.environment=b.environment
  where s.project_id=r.project_id and s.app_id=o->>'appId' and s.store=o->>'store' and s.environment=o->>'environment'
    and b.original_transaction_id=o->>'originalTransactionId' on conflict do nothing;
end; $$;

-- Called atomically by a typed original admission. An earlier negative may
-- have named a wrong/no canonical subject before its real owner was known.
-- Preserve that raw parent and old child; append the newly established owner.
create function receipt_router_v1.backfill_original_holds(p_store_app text,p_store text,p_environment text,p_original text)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare evidence record;counted integer:=0;
begin
  for evidence in select distinct e.id event_id,r.id receipt_id
    from receipt_router_v1.receipts r join receipt_router_v1.scopes s on s.project_id=r.project_id
      and s.app_id=r.envelope#>>'{observation,appId}' and s.store=r.envelope#>>'{observation,store}'
      and s.environment=r.envelope#>>'{observation,environment}'
    join receipt_router_v1.events e on e.first_receipt_id=r.id
      or exists(select 1 from receipt_router_v1.conflicts c where c.event_id=e.id and c.receipt_id=r.id)
    where s.store_app_identity=p_store_app and s.store=p_store and s.environment=p_environment
      and r.envelope#>>'{observation,originalTransactionId}'=p_original
    order by e.id,r.id loop
    counted:=counted+1;
    if counted>1000 then raise exception 'receipt_router_original_history_requires_review' using errcode='54000'; end if;
    perform receipt_router_v1.record_pending_holds(evidence.event_id,evidence.receipt_id);
  end loop;
end; $$;
-- Pure query for a FUTURE reviewed adapter. Not granted to old roles/functions,
-- not wired into legacy writers/delivery, and not a claim of enforcement.
create function receipt_router_v1.has_pending_hold(p_project text,p_user uuid,p_app text,p_store text,p_environment text,p_original text)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from receipt_router_v1.pending_holds h where h.project_id=p_project and h.subject_id=p_user
    and (h.app_id is null or p_app is null or h.app_id=p_app)
    and (h.store is null or p_store is null or h.store=p_store)
    and (h.environment is null or p_environment is null or h.environment=p_environment)
    and (h.original_transaction_id is null or p_original is null or h.original_transaction_id=p_original))
$$;
revoke all on function receipt_router_v1.record_pending_holds(uuid,uuid,boolean),receipt_router_v1.has_pending_hold(text,uuid,text,text,text,text),
  receipt_router_v1.backfill_original_holds(text,text,text,text)
  from public,anon,authenticated,service_role;
reset role;

-- SOURCE CANDIDATE: separate forward extension; no activation rows are seeded.
-- Existing native/shared installed SQL is never rewritten by this source file.
begin;
do $$begin
 if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='native_store_sandbox_v1' and c.relname='connections' and c.relkind='r')
  or not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='sandbox_commerce_v1' and c.relname='native_store_dispatch_attempts' and c.relkind='r')
  or not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='sandbox_commerce_v1' and c.relname='native_store_allocations' and c.relkind='r')
  or to_regprocedure('public.revenuecat_native_legacy_exclusion_v1(uuid,text,text)') is null
 then raise exception 'native_apple_ownership_prerequisite_missing';end if;
 if current_user<>'postgres' or exists(select 1 from pg_roles where rolname=current_user and rolsuper)
  or exists(select 1 from pg_roles r where r.rolname in('native_store_sandbox_v1_owner','sbx_v1_core_owner')
   and (has_schema_privilege(r.oid,'public','CREATE') or not exists(
    select 1 from pg_auth_members m where m.roleid=r.oid and m.member='postgres'::regrole
     and m.grantor='postgres'::regrole and not m.admin_option and not m.inherit_option and not m.set_option)
    or exists(select 1 from pg_auth_members m where m.roleid=r.oid and m.member='postgres'::regrole
     and (m.inherit_option or m.set_option))))
 then raise exception 'native_apple_installer_privilege_state_unqualified';end if;
end $$;
-- Explicit, temporary installer capabilities, restored before commit. Runtime
-- postgres does not inherit either native owner's table privileges. These
-- narrow owner-defined bridges avoid SELECT grants across the RLS boundary.
grant native_store_sandbox_v1_owner,sbx_v1_core_owner to postgres with inherit false,set true;
grant create on schema public to native_store_sandbox_v1_owner;
set local role native_store_sandbox_v1_owner;
create function public.native_apple_connection_matches_internal(p_scope jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare c native_store_sandbox_v1.connections;
begin
 lock table native_store_sandbox_v1.revocations in share mode nowait;
 select * into c from native_store_sandbox_v1.connections
  where id=(p_scope->>'connectionId')::uuid and revision=(p_scope->>'connectionRevision')::bigint for share nowait;
 return c.id is not null and row(c.project_id,c.app_id,c.store,c.environment)
  is not distinct from row(p_scope->>'projectId',p_scope->>'appId',p_scope->>'store',p_scope->>'environment')
  and not exists(select 1 from native_store_sandbox_v1.revocations
   where connection_id=c.id and connection_revision=c.revision);
end $$;
revoke all on function public.native_apple_connection_matches_internal(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.native_apple_connection_matches_internal(jsonb) to postgres;
create function public.native_apple_journal_empty_internal() returns boolean
language plpgsql security definer set search_path='' as $$begin
 lock table native_store_sandbox_v1.receipts in share mode nowait;
 -- A retained encrypted receipt cannot be classified by a guessed SKU. This
 -- first handover requires an empty raw journal, not an unproved absence join.
 return not exists(select 1 from native_store_sandbox_v1.receipts);
end $$;
revoke all on function public.native_apple_journal_empty_internal() from public,anon,authenticated,service_role;
grant execute on function public.native_apple_journal_empty_internal() to postgres;
reset role;
revoke create on schema public from native_store_sandbox_v1_owner;
grant create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.native_apple_native_history_absent_internal(p_product text) returns boolean
language plpgsql security definer set search_path='' as $$begin
 lock table sandbox_commerce_v1.native_store_selections,sandbox_commerce_v1.native_store_claims,
  sandbox_commerce_v1.native_store_reservations,sandbox_commerce_v1.native_store_dispatch_attempts,
  sandbox_commerce_v1.native_store_allocations,sandbox_commerce_v1.native_store_negative_tombstones,
  sandbox_commerce_v1.native_store_pending_raw in share mode nowait;
 return not exists(select 1 from sandbox_commerce_v1.native_store_selections where quote#>>'{catalog,wireProductId}'=p_product)
  and not exists(select 1 from sandbox_commerce_v1.native_store_claims where product_identifier=p_product)
  and not exists(select 1 from sandbox_commerce_v1.native_store_reservations where product_id=p_product)
  and not exists(select 1 from sandbox_commerce_v1.native_store_negative_tombstones where product_id=p_product)
  and not exists(select 1 from sandbox_commerce_v1.native_store_pending_raw);
end $$;
revoke all on function public.native_apple_native_history_absent_internal(text) from public,anon,authenticated,service_role;
grant execute on function public.native_apple_native_history_absent_internal(text) to postgres;
create function public.native_apple_catalog_matches_internal(p_catalog jsonb,p_new_admission boolean) returns boolean
language plpgsql security definer set search_path='' as $$begin
 lock table sandbox_commerce_v1.native_store_catalog_retirements in share mode nowait;
 return exists(select 1 from sandbox_commerce_v1.native_store_catalog_bindings b
  where 'nssv1_catalog_'||b.id=p_catalog->>'bindingId' and b.revision::text=p_catalog->>'revision'
   and b.store='APP_STORE' and p_catalog=jsonb_build_object('bindingId',b.catalog->>'bindingId','revision',b.revision,
    'projectId',b.catalog->>'projectId','appId',b.catalog->>'appId','store',b.store,'environment','SANDBOX','wireProductId',b.catalog->>'wireProductId')
   and (not p_new_admission or not exists(
    select 1 from sandbox_commerce_v1.native_store_catalog_retirements r where r.binding_id=b.id and r.binding_revision=b.revision)));
end $$;
revoke all on function public.native_apple_catalog_matches_internal(jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.native_apple_catalog_matches_internal(jsonb,boolean) to postgres;
reset role;
revoke create on schema public from sbx_v1_core_owner;

create table private.native_apple_sandbox_owners(
 id uuid primary key default gen_random_uuid(),
 provider text not null check(provider='revenuecat_app_store'),
 product_id text not null check(product_id in('com.chillywood.paidvideo.tier1','com.chillywood.paidvideo.tier2',
  'com.chillywood.paidvideo.tier3','com.chillywood.paidvideo.tier4')),
 connection_id uuid not null,connection_revision bigint not null,
 project_id text not null,app_id text not null,store text not null check(store='APP_STORE'),
 environment text not null check(environment='SANDBOX'),created_at timestamptz not null default clock_timestamp(),
 legacy_catalog_identity jsonb not null,
 unique(provider,product_id)
);
create table private.native_apple_sandbox_owner_retirements(
 owner_id uuid primary key references private.native_apple_sandbox_owners,
 reason text not null check(length(btrim(reason)) between 1 and 512),
 created_at timestamptz not null default clock_timestamp()
);
alter table private.native_apple_sandbox_owners enable row level security;
alter table private.native_apple_sandbox_owners force row level security;
alter table private.native_apple_sandbox_owner_retirements enable row level security;
alter table private.native_apple_sandbox_owner_retirements force row level security;
revoke all on private.native_apple_sandbox_owners,private.native_apple_sandbox_owner_retirements
 from public,anon,authenticated,service_role;
create function private.native_apple_owner_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'native_apple_owner_immutable';end $$;
revoke all on function private.native_apple_owner_immutable() from public,anon,authenticated,service_role;
create trigger immutable before update or delete on private.native_apple_sandbox_owners
 for each row execute function private.native_apple_owner_immutable();
create trigger immutable_truncate before truncate on private.native_apple_sandbox_owners
 for each statement execute function private.native_apple_owner_immutable();
create trigger immutable before update or delete on private.native_apple_sandbox_owner_retirements
 for each row execute function private.native_apple_owner_immutable();
create trigger immutable_truncate before truncate on private.native_apple_sandbox_owner_retirements
 for each statement execute function private.native_apple_owner_immutable();

create function private.native_apple_owner_lock(p_transition boolean default false) returns void language plpgsql
 set search_path='' as $$begin
 if p_transition is null then raise exception 'native_apple_owner_lock_invalid';end if;
 if current_setting('transaction_isolation')<>'read committed'
 then raise exception 'native_apple_owner_fresh_snapshot_required';end if;
 -- Ordinary purchases share the handover fence. Only qualification/retirement
 -- is exclusive, so different buyers do not serialize on a global mutex.
 if not (case when p_transition then pg_try_advisory_xact_lock(hashtextextended('native-apple-sandbox-single-owner-v1',0))
  else pg_try_advisory_xact_lock_shared(hashtextextended('native-apple-sandbox-single-owner-v1',0)) end)
 then raise exception 'native_apple_owner_busy' using errcode='55P03';end if;
end $$;
revoke all on function private.native_apple_owner_lock(boolean) from public,anon,authenticated,service_role;

create function private.native_apple_catalog_identity(p_product text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('products',coalesce((select jsonb_agg(jsonb_build_array(p.id,p.product_key,p.provider_product_id) order by p.id)
  from public.monetization_products p where p.provider_product_id=p_product or p.id in(
   select m.product_id from public.monetization_product_store_mappings m where m.provider='revenuecat_app_store' and m.provider_product_id=p_product)),'[]'::jsonb),
  'mappings',coalesce((select jsonb_agg(jsonb_build_array(m.id,m.product_id,m.provider,m.store,m.provider_product_id,m.reference_price_minor,m.reference_currency) order by m.id)
   from public.monetization_product_store_mappings m where m.provider='revenuecat_app_store' and m.provider_product_id=p_product),'[]'::jsonb));
$$;
revoke all on function private.native_apple_catalog_identity(text) from public,anon,authenticated,service_role;

create function private.native_apple_owner_qualify() returns trigger
language plpgsql security definer set search_path='' as $$
declare s jsonb;has_history boolean;
begin
 perform private.native_apple_owner_lock(true);
 if current_setting('transaction_isolation')<>'read committed'
 then raise exception 'native_apple_owner_fresh_snapshot_required';end if;
 lock table public.monetization_products,public.monetization_product_store_mappings,
  public.money_purchase_intents,public.provider_events,public.revenuecat_webhook_ingress_events,
  public.revenuecat_premium_transaction_authority,public.revenuecat_consumable_transaction_intents,
  public.revenuecat_unbound_initial_authority,public.revenuecat_unbound_terminal_authority,
  public.revenuecat_provider_reconciliation_obligations,public.access_grants,
  public.money_access_ledger_events,public.creator_earnings_ledger in share mode nowait;
 s:=jsonb_build_object('connectionId',new.connection_id,'connectionRevision',new.connection_revision,
  'projectId',new.project_id,'appId',new.app_id,'store',new.store,'environment',new.environment);
 if public.native_apple_connection_matches_internal(s) is distinct from true
  or public.native_apple_journal_empty_internal() is distinct from true
  or public.native_apple_native_history_absent_internal(new.product_id) is distinct from true
 then raise exception 'native_apple_owner_native_history_or_scope';end if;
 -- Unknown raw ingress and unattributable events cannot be waved away by an
 -- empty product join. An operator must classify/reconcile them separately;
 -- this function has no override, deletion, or arrival-time adoption option.
 if exists(select 1 from public.revenuecat_webhook_ingress_events i where not exists(
   select 1 from public.provider_events e where e.provider_event_id=i.provider_event_id))
  or exists(select 1 from public.provider_events e where e.product_id is null and e.product_key is null
   and coalesce(e.metadata->>'provider_product_id',e.metadata->>'reported_provider_product_id','') in('','<missing-or-ambiguous>'))
 then raise exception 'native_apple_owner_unknown_legacy_history';end if;
 with mp as materialized(select p.* from public.monetization_products p where p.provider_product_id=new.product_id
   or p.id in(select product_id from public.monetization_product_store_mappings where provider_product_id=new.product_id)),
 mi as materialized(select i.* from public.money_purchase_intents i where i.provider_product_id=new.product_id
   or i.product_id in(select id from mp) or i.product_key in(select product_key from mp)),
 ev as materialized(select e.* from public.provider_events e where e.product_id in(select id from mp)
   or e.product_key in(select product_key from mp) or e.metadata->>'provider_product_id'=new.product_id
   or e.metadata->>'reported_provider_product_id'=new.product_id or e.metadata->>'purchase_intent_id' in(select id::text from mi))
 select exists(select 1 from mi) or exists(select 1 from ev)
  or exists(select 1 from public.revenuecat_unbound_initial_authority where provider_product_id=new.product_id)
  or exists(select 1 from public.revenuecat_unbound_terminal_authority where provider_product_id=new.product_id)
  or exists(select 1 from public.revenuecat_premium_transaction_authority where current_provider_product_id=new.product_id or current_product_id in(select id from mp))
  or exists(select 1 from public.revenuecat_consumable_transaction_intents where product_id in(select id from mp) or purchase_intent_id in(select id from mi))
  or exists(select 1 from public.revenuecat_provider_reconciliation_obligations where provider_product_id=new.product_id or purchase_intent_id in(select id from mi) or provider_event_id in(select id from ev))
  or exists(select 1 from public.access_grants where product_id in(select id from mp) or provider_event_id in(select id from ev) or metadata->>'purchase_intent_id' in(select id::text from mi))
  or exists(select 1 from public.money_access_ledger_events where product_id in(select id from mp) or provider_event_id in(select id from ev) or metadata->>'purchase_intent_id' in(select id::text from mi))
  or exists(select 1 from public.creator_earnings_ledger a where to_jsonb(a)->>'provider_event_id' in(select id::text from ev)
   or a.metadata->>'provider_event_id' in(select id::text from ev) or a.metadata->>'purchase_intent_id' in(select id::text from mi)
   or a.source_id in(select source_id from mi)) into has_history;
 if has_history then raise exception 'native_apple_owner_legacy_history';end if;
 new.legacy_catalog_identity:=private.native_apple_catalog_identity(new.product_id);
 if jsonb_array_length(new.legacy_catalog_identity->'products')=0 or jsonb_array_length(new.legacy_catalog_identity->'mappings')=0
 then raise exception 'native_apple_owner_catalog_missing';end if;
 new.created_at:=clock_timestamp();
 return new;
end $$;
revoke all on function private.native_apple_owner_qualify() from public,anon,authenticated,service_role;
create trigger qualified_owner before insert on private.native_apple_sandbox_owners
 for each row execute function private.native_apple_owner_qualify();
create function private.native_apple_owner_retire() returns trigger
language plpgsql security definer set search_path='' as $$begin
 perform private.native_apple_owner_lock(true);new.created_at:=clock_timestamp();return new;
end $$;
revoke all on function private.native_apple_owner_retire() from public,anon,authenticated,service_role;
create trigger serialized_retirement before insert on private.native_apple_sandbox_owner_retirements
 for each row execute function private.native_apple_owner_retire();

create function private.native_apple_owner_scope(p_scope jsonb,p_product text,p_new_admission boolean)
returns private.native_apple_sandbox_owners language plpgsql security definer set search_path='' as $$
declare o private.native_apple_sandbox_owners;
begin
 perform private.native_apple_owner_lock();
 if p_scope is null or jsonb_typeof(p_scope)<>'object' or p_new_admission is null
  or p_scope-array['protocol','connectionId','connectionRevision','projectId','appId','store','environment','rawSha256']<>'{}'::jsonb
  or not(p_scope ?& array['protocol','connectionId','connectionRevision','projectId','appId','store','environment','rawSha256'])
  or exists(select 1 from jsonb_each(p_scope) e where e.key<>'connectionRevision' and jsonb_typeof(e.value)<>'string')
  or jsonb_typeof(p_scope->'connectionRevision') is distinct from 'number'
  or coalesce(p_scope->>'connectionRevision','')!~'^[1-9][0-9]{0,15}$'
  or (p_scope->>'connectionRevision')::numeric>9007199254740991
  or p_scope->>'protocol' is distinct from 'revenuecat-native-authenticated-scope-v1'
  or p_scope->>'environment' is distinct from 'SANDBOX' or p_scope->>'store' is distinct from 'APP_STORE'
  or coalesce(p_scope->>'rawSha256','')!~'^[a-f0-9]{64}$'
 then raise exception 'native_apple_scope_invalid';end if;
 select * into strict o from private.native_apple_sandbox_owners
  where provider='revenuecat_app_store' and product_id=p_product;
 if row(o.connection_id::text,o.connection_revision::text,o.project_id,o.app_id,o.store,o.environment)
   is distinct from row(p_scope->>'connectionId',p_scope->>'connectionRevision',p_scope->>'projectId',
    p_scope->>'appId',p_scope->>'store',p_scope->>'environment')
  or public.native_apple_connection_matches_internal(p_scope) is distinct from true
  or (p_new_admission and private.native_apple_catalog_identity(p_product) is distinct from o.legacy_catalog_identity)
  or (p_new_admission and exists(select 1 from private.native_apple_sandbox_owner_retirements where owner_id=o.id))
 then raise exception 'native_apple_scope_unqualified';end if;
 return o;
end $$;
revoke all on function private.native_apple_owner_scope(jsonb,text,boolean) from public,anon,authenticated,service_role;

-- Table-level issuance fence covers both generic and iOS legacy intent RPCs,
-- including retained functions. Production intent interception is unchanged.
-- The transition uses this same non-waiting lock before inventory/owner insert.
create function private.native_apple_legacy_intent_fence() returns trigger
language plpgsql security definer set search_path='' as $$begin
 -- Only the reviewed sandbox products participate in the handover lock.
 -- Lock matching products even before ownership exists, so qualification and
 -- a racing legacy insert cannot both succeed. Unrelated/production traffic
 -- must not contend on this lock when the extension is installed empty.
 if new.environment is distinct from 'sandbox' or new.provider is distinct from 'revenuecat_app_store' or not (
  coalesce(new.provider_product_id,'') in('com.chillywood.paidvideo.tier1','com.chillywood.paidvideo.tier2',
   'com.chillywood.paidvideo.tier3','com.chillywood.paidvideo.tier4')
  or exists(select 1 from public.monetization_product_store_mappings m where m.product_id=new.product_id
   and m.provider_product_id in('com.chillywood.paidvideo.tier1','com.chillywood.paidvideo.tier2',
    'com.chillywood.paidvideo.tier3','com.chillywood.paidvideo.tier4'))
  or exists(select 1 from public.monetization_products p where p.id=new.product_id
   and p.provider_product_id in('com.chillywood.paidvideo.tier1','com.chillywood.paidvideo.tier2',
    'com.chillywood.paidvideo.tier3','com.chillywood.paidvideo.tier4'))
 ) then return new;end if;
 perform private.native_apple_owner_lock();
 if new.environment='sandbox' and exists(
  select 1 from private.native_apple_sandbox_owners o where
   new.provider_product_id=o.product_id
   or exists(select 1 from public.monetization_product_store_mappings m
    where m.provider_product_id=o.product_id and m.product_id=new.product_id)
   or exists(select 1 from public.monetization_products p
    where p.id=new.product_id and p.provider_product_id=o.product_id)
 ) then raise exception 'native_apple_legacy_issuance_owned';end if;
 return new;
end $$;
revoke all on function private.native_apple_legacy_intent_fence() from public,anon,authenticated,service_role;
create trigger native_apple_legacy_issuance before insert or update on public.money_purchase_intents
 for each row execute function private.native_apple_legacy_intent_fence();

-- This narrow scalar bridge exposes no owner records to the native role.
-- It is used at every durable native admission boundary; existing APIs retain
-- their own authority/timeout/protocol checks. Retirement never deletes owner.
create function public.native_apple_admission_internal(p_catalog jsonb,p_created_at timestamptz,p_new_admission boolean default true)
returns void language plpgsql security definer set search_path='' as $$
declare o private.native_apple_sandbox_owners;s jsonb;
begin
 if p_new_admission is null then raise exception 'native_apple_admission_invalid';end if;
 if p_catalog->>'store' is distinct from 'APP_STORE' or p_catalog->>'environment' is distinct from 'SANDBOX'
  or coalesce(p_catalog->>'wireProductId','') not in('com.chillywood.paidvideo.tier1',
  'com.chillywood.paidvideo.tier2','com.chillywood.paidvideo.tier3','com.chillywood.paidvideo.tier4')
 then return;end if;
 perform private.native_apple_owner_lock();
 select * into o from private.native_apple_sandbox_owners where product_id=p_catalog->>'wireProductId';
 if o.id is null then return;end if;
 if row(p_catalog->>'projectId',p_catalog->>'appId',p_catalog->>'store',p_catalog->>'environment')
   is distinct from row(o.project_id,o.app_id,o.store,o.environment)
  or p_created_at is null or not isfinite(p_created_at) or p_created_at<o.created_at
  or (p_new_admission and private.native_apple_catalog_identity(o.product_id) is distinct from o.legacy_catalog_identity)
  or public.native_apple_catalog_matches_internal(p_catalog,p_new_admission) is distinct from true
  or (p_new_admission and exists(select 1 from private.native_apple_sandbox_owner_retirements r where r.owner_id=o.id))
 then raise exception 'native_apple_admission_unqualified';end if;
 s:=jsonb_build_object('connectionId',o.connection_id,'connectionRevision',o.connection_revision,
  'projectId',o.project_id,'appId',o.app_id,'store',o.store,'environment',o.environment);
 if public.native_apple_connection_matches_internal(s) is distinct from true
 then raise exception 'native_apple_connection_unqualified';end if;
end $$;
revoke all on function public.native_apple_admission_internal(jsonb,timestamptz,boolean) from public,anon,authenticated,service_role;
grant execute on function public.native_apple_admission_internal(jsonb,timestamptz,boolean) to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.native_apple_admission_fence() returns trigger
language plpgsql security definer set search_path='' as $$
declare q jsonb;t timestamptz;
begin
 if tg_table_name in('native_store_selections','native_store_reservations') then q:=new.quote;
 else
  select r.quote into strict q from sandbox_commerce_v1.native_store_reservations r where r.id=new.reservation_id;
 end if;
 t:=new.created_at;
 perform public.native_apple_admission_internal(q->'catalog',t);
 return new;
end $$;
revoke all on function sandbox_commerce_v1.native_apple_admission_fence() from public,anon,authenticated,service_role;
create trigger native_apple_owned_admission before insert on sandbox_commerce_v1.native_store_selections
 for each row execute function sandbox_commerce_v1.native_apple_admission_fence();
create trigger native_apple_owned_admission before insert on sandbox_commerce_v1.native_store_reservations
 for each row execute function sandbox_commerce_v1.native_apple_admission_fence();
create trigger native_apple_owned_admission before insert on sandbox_commerce_v1.native_store_dispatch_attempts
 for each row execute function sandbox_commerce_v1.native_apple_admission_fence();
create function sandbox_commerce_v1.native_apple_allocation_fence() returns trigger
language plpgsql security definer set search_path='' as $$
declare q jsonb;t timestamptz;
begin
 select r.quote,a.created_at into strict q,t from sandbox_commerce_v1.native_store_reservations r
  join sandbox_commerce_v1.native_store_dispatch_attempts a on a.reservation_id=r.id
  where r.id=new.reservation_id and a.id=new.attempt_id;
 -- Retirement closes admission, not settlement of an already-admitted
 -- attempt. The original native allocator still proves purchase-time and
 -- receipt/claim/subject identity before this durable insert.
 perform public.native_apple_admission_internal(q->'catalog',t,false);
 return new;
end $$;
revoke all on function sandbox_commerce_v1.native_apple_allocation_fence() from public,anon,authenticated,service_role;
create trigger native_apple_owned_allocation before insert on sandbox_commerce_v1.native_store_allocations
 for each row execute function sandbox_commerce_v1.native_apple_allocation_fence();
reset role;
grant native_store_sandbox_v1_owner,sbx_v1_core_owner to postgres with inherit false,set false;

-- Explicit draft stop: never install a partial ownership boundary. Removed only
-- when transition inventory, legacy/native fences and recorder are complete.
do $$begin raise exception 'native_apple_ownership_candidate_incomplete';end $$;
commit;

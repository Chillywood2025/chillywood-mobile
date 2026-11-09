-- Fresh/default-off fixed source closure component. No deployment,
-- qualification, allocation, public RPC, hold-clear or settlement activation.
grant native_store_sandbox_v1_owner to postgres with inherit false,set true;
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.native_store_core_links (
 core_receipt_id uuid primary key references sandbox_commerce_v1.receipts,
 project_id text not null check(length(project_id) between 1 and 512),
 buyer_id uuid not null, created_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.native_store_pending_raw (
 raw_receipt_id uuid primary key, project_id text not null,
 raw_sha256 text not null check(raw_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(), unique(project_id,raw_sha256)
);
do $$declare t text;begin
 foreach t in array array['native_store_core_links','native_store_pending_raw'] loop
  execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
  execute format('alter table sandbox_commerce_v1.%I force row level security',t);
  execute format('create policy owner_only on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using(true) with check(true)',t);
  execute format('revoke all on sandbox_commerce_v1.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger immutable before update or delete on sandbox_commerce_v1.%I for each row execute function sandbox_commerce_v1.native_store_quote_immutable()',t);
  execute format('create trigger immutable_truncate before truncate on sandbox_commerce_v1.%I for each statement execute function sandbox_commerce_v1.native_store_quote_immutable()',t);
 end loop;
end $$;
create function sandbox_commerce_v1.native_store_lock_project(p_project text) returns void
language plpgsql security invoker set search_path='' as $$begin
 if p_project is null or length(p_project) not between 1 and 512
  or current_setting('transaction_isolation')<>'read committed'
  or current_setting('transaction_timeout')::interval<=interval '0'
  or current_setting('transaction_timeout')::interval>interval '5 seconds'
  or clock_timestamp()>=transaction_timestamp()+interval '5 seconds'
 then raise exception 'native_store_fence_context_required';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('native-store-project-fence:'||p_project,691))
 then raise exception 'native_store_fence_busy' using errcode='55P03';end if;
end $$;
create function sandbox_commerce_v1.native_store_link_guard() returns trigger
language plpgsql security definer set search_path='' as $$declare r sandbox_commerce_v1.receipts;i sandbox_commerce_v1.intents;begin
 perform sandbox_commerce_v1.native_store_lock_project(new.project_id);
 if exists(select 1 from sandbox_commerce_v1.native_store_pending_raw p where p.project_id=new.project_id)
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
create trigger native_link_guard before insert on sandbox_commerce_v1.native_store_core_links
 for each row execute function sandbox_commerce_v1.native_store_link_guard();
create function sandbox_commerce_v1.native_store_fence_raw() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if tg_table_schema<>'native_store_sandbox_v1' or tg_table_name<>'receipts' or tg_op<>'INSERT'
 then raise exception 'native_store_raw_trigger_required';end if;
 perform sandbox_commerce_v1.native_store_lock_project(new.project_id);
 insert into sandbox_commerce_v1.native_store_pending_raw(raw_receipt_id,project_id,raw_sha256)
 values(new.id,new.project_id,new.raw_sha256);
 -- Explicit receipt IDs only. Existing core delivery takes SHARE on this table;
 -- intake cannot acknowledge while a conflicting delivery decision commits.
 lock table sandbox_commerce_v1.resource_delivery_holds in row exclusive mode nowait;
 insert into sandbox_commerce_v1.resource_delivery_holds(buyer_id,receipt_id,reason)
 select l.buyer_id,l.core_receipt_id,'native_store_pending_raw:'||new.id
 from sandbox_commerce_v1.native_store_core_links l where l.project_id=new.project_id;
 return new;
end $$;
revoke all on function sandbox_commerce_v1.native_store_lock_project(text),sandbox_commerce_v1.native_store_link_guard(),sandbox_commerce_v1.native_store_fence_raw() from public,anon,authenticated,service_role;
-- Only trigger lookup/EXECUTE, never core tables or grant/allocation routines.
grant usage on schema sandbox_commerce_v1 to native_store_sandbox_v1_owner;
grant execute on function sandbox_commerce_v1.native_store_fence_raw() to native_store_sandbox_v1_owner;
reset role;
set local role native_store_sandbox_v1_owner;
do $$begin if (select enabled from native_store_sandbox_v1.control where singleton) is distinct from false or exists(select 1 from native_store_sandbox_v1.receipts) then raise exception 'native_store_fence_fresh_install_required';end if;end $$;
create trigger native_pending_fence after insert on native_store_sandbox_v1.receipts
 for each row execute function sandbox_commerce_v1.native_store_fence_raw();
reset role;
grant native_store_sandbox_v1_owner to postgres with inherit false,set false;

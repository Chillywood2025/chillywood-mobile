-- Read-only provider observations may span bounded invocations. A partial
-- checkpoint is never a cost observation or financial release.
create table private.stripe_cost_history_checkpoints(
 domain text not null check(domain in('merch','auction')),source_id uuid not null,
 account_id text not null check(account_id~'^acct_[A-Za-z0-9_]+$'),environment text not null,
 source_binding jsonb not null,generation uuid not null default extensions.gen_random_uuid(),
 lease uuid,lease_until timestamptz,checkpoint jsonb not null default '{}',
 completed boolean not null default false,result jsonb,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(domain,source_id),check(octet_length(checkpoint::text)<=10485760)
);
alter table private.stripe_cost_history_checkpoints enable row level security;
alter table private.stripe_cost_history_checkpoints force row level security;
revoke all on private.stripe_cost_history_checkpoints from public,anon,authenticated,service_role;
create table private.stripe_cost_history_receipts(
 generation uuid primary key,domain text not null,source_id uuid not null,account_id text not null,environment text not null,
 source_binding jsonb not null,history_hash text not null,entry_count integer not null,
 verification_started_at timestamptz not null,completed_at timestamptz not null default clock_timestamp(),result jsonb not null
);
alter table private.stripe_cost_history_receipts enable row level security;
alter table private.stripe_cost_history_receipts force row level security;
revoke all on private.stripe_cost_history_receipts from public,anon,authenticated,service_role;
create function private.stripe_cost_history_receipt_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'history_receipt_immutable';end $$;
revoke all on function private.stripe_cost_history_receipt_immutable() from public,anon,authenticated,service_role;
create trigger stripe_cost_history_receipt_immutable before update or delete on private.stripe_cost_history_receipts
for each row execute function private.stripe_cost_history_receipt_immutable();
create function private.stripe_cost_history_context(p_domain text,p_source_id uuid) returns jsonb
language plpgsql volatile set search_path='' as $$
begin
 if p_domain='merch' then
  perform 1 from public.merch_orders where id=p_source_id for update;
  return public.get_merch_cost_reconciliation_context(p_source_id);
 elsif p_domain='auction' then
  perform 1 from private.auction_platform_settlement_contracts where id=p_source_id for update;
  return public.get_auction_cost_reconciliation_context(p_source_id);
 else raise exception 'history_domain_invalid';end if;
end $$;
create function public.begin_stripe_cost_history(p_domain text,p_source_id uuid,p_account_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb;s private.stripe_cost_history_checkpoints;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 if coalesce(p_account_id,'')!~'^acct_[A-Za-z0-9_]+$' then raise exception 'history_account_invalid';end if;
 context:=private.stripe_cost_history_context(p_domain,p_source_id);
 if coalesce(context->>'environment','') not in('sandbox','production','test','live')
  or (context->>'platform_account_id' is not null and context->>'platform_account_id'<>p_account_id)
 then raise exception 'history_source_account_mismatch';end if;
 select * into s from private.stripe_cost_history_checkpoints where domain=p_domain and source_id=p_source_id for update;
 if s.lease_until>clock_timestamp() then return jsonb_build_object('busy',true);end if;
 if s.source_id is null then
  insert into private.stripe_cost_history_checkpoints(domain,source_id,account_id,environment,source_binding)
   values(p_domain,p_source_id,p_account_id,context->>'environment',context) returning * into s;
 elsif s.source_binding is distinct from context or s.account_id<>p_account_id or s.completed then
  update private.stripe_cost_history_checkpoints set source_binding=context,account_id=p_account_id,environment=context->>'environment',
   generation=extensions.gen_random_uuid(),checkpoint='{}',completed=false,result=null,created_at=clock_timestamp()
   where domain=p_domain and source_id=p_source_id returning * into s;
 end if;
 update private.stripe_cost_history_checkpoints set lease=extensions.gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp()
  where domain=p_domain and source_id=p_source_id returning * into s;
 return jsonb_build_object('generation',s.generation,'lease',s.lease,'checkpoint',s.checkpoint,'context',context);
end $$;
create function public.save_stripe_cost_history(p_domain text,p_source_id uuid,p_generation uuid,p_lease uuid,p_checkpoint jsonb,p_facts jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb;s private.stripe_cost_history_checkpoints;v_result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 context:=private.stripe_cost_history_context(p_domain,p_source_id);
 select * into s from private.stripe_cost_history_checkpoints where domain=p_domain and source_id=p_source_id for update;
 if s.generation is distinct from p_generation or s.lease is distinct from p_lease or p_lease is null then raise exception 'history_stale_lease';end if;
 if s.completed then return s.result;end if;
 if s.lease_until is null or s.lease_until<=clock_timestamp() or s.source_binding is distinct from context
  then raise exception 'history_source_changed';end if;
 if jsonb_typeof(p_checkpoint) is distinct from 'object' or octet_length(p_checkpoint::text)>10485760 then raise exception 'history_checkpoint_invalid';end if;
 if p_facts is not null then
  if p_checkpoint->>'phase' is distinct from 'verify'
   or jsonb_typeof(p_checkpoint->'entries') is distinct from 'array'
   or p_checkpoint->>'version' is distinct from '1'
   or coalesce((p_checkpoint->>'cursor')::integer,-1)<>jsonb_array_length(p_checkpoint->'entries')
   or jsonb_array_length(p_checkpoint->'entries')<1
   or (p_checkpoint->>'verificationStartedAt') is null
   or to_timestamp((p_checkpoint->>'verificationStartedAt')::numeric/1000)<clock_timestamp()-interval '6 hours'
   or to_timestamp((p_checkpoint->>'verificationStartedAt')::numeric/1000)>clock_timestamp()
   or p_facts->>'account_id' is distinct from s.account_id
   or p_facts->>'history_generation' is distinct from s.generation::text
   or p_facts->>'history_revalidated' is distinct from 'true'
   then raise exception 'history_complete_proof_required';end if;
  if p_domain='merch' then v_result:=public.record_merch_provider_cost_observation(p_source_id,p_facts);
  else v_result:=public.record_auction_platform_cost_observation(p_source_id,p_facts);end if;
  insert into private.stripe_cost_history_receipts(generation,domain,source_id,account_id,environment,source_binding,history_hash,
   entry_count,verification_started_at,result) values(s.generation,p_domain,p_source_id,s.account_id,s.environment,s.source_binding,
   encode(extensions.digest(p_checkpoint::text,'sha256'),'hex'),jsonb_array_length(p_checkpoint->'entries'),
   to_timestamp((p_checkpoint->>'verificationStartedAt')::numeric/1000),v_result);
  update private.stripe_cost_history_checkpoints set completed=true,result=v_result,checkpoint=p_checkpoint,
   lease_until=null,updated_at=clock_timestamp() where domain=p_domain and source_id=p_source_id;
  return v_result;
 end if;
 update private.stripe_cost_history_checkpoints set checkpoint=p_checkpoint,lease_until=null,updated_at=clock_timestamp()
  where domain=p_domain and source_id=p_source_id;
 return jsonb_build_object('status','history_pending','financialAuthority',false,'observationCreated',false);
end $$;
revoke all on function private.stripe_cost_history_context(text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.begin_stripe_cost_history(text,uuid,text),public.save_stripe_cost_history(text,uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.begin_stripe_cost_history(text,uuid,text),public.save_stripe_cost_history(text,uuid,uuid,uuid,jsonb,jsonb) to service_role;

alter table private.merch_cost_refresh_jobs add column history_progress_hash text;
create function public.continue_merch_cost_history_refresh(p_order_id uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.merch_cost_refresh_jobs;c private.stripe_cost_history_checkpoints;h text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into j from private.merch_cost_refresh_jobs where order_id=p_order_id for update;
 if j.order_id is null or p_lease is null or j.lease is distinct from p_lease or j.lease_until is null or j.lease_until<=clock_timestamp()
  then return '{"stale":true,"financialAuthority":false}'::jsonb;end if;
 select * into c from private.stripe_cost_history_checkpoints where domain='merch' and source_id=p_order_id;
 h:=encode(extensions.digest(c.generation::text||c.checkpoint::text,'sha256'),'hex');
 if c.source_id is null or c.completed or c.lease_until is not null or c.updated_at<j.lease_until-interval '5 minutes'
  or not(coalesce((c.checkpoint->>'cursor')::integer,0)>0 or c.checkpoint->>'phase'='verify')
  or h is null or h is not distinct from j.history_progress_hash
 then return public.complete_merch_cost_refresh(p_order_id,p_lease,false);end if;
 -- Genuine partial progress is not success and not a poison failure. Preserve
 -- last_success_at and the oldest-due queue; use a fixed continuation interval.
 update private.merch_cost_refresh_jobs set lease=null,lease_until=null,checked_at=clock_timestamp(),
  last_result='incomplete',history_progress_hash=h,next_attempt_at=clock_timestamp()+interval '15 minutes' where order_id=p_order_id;
 return '{"stale":false,"historyProgress":true,"financialAuthority":false}'::jsonb;
end $$;
revoke all on function public.continue_merch_cost_history_refresh(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.continue_merch_cost_history_refresh(uuid,uuid) to service_role;

alter table private.auction_observer_jobs add column history_progress_hash text;
create function public.continue_auction_cost_history_refresh(p_contract_id uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.auction_observer_jobs;c private.stripe_cost_history_checkpoints;h text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into j from private.auction_observer_jobs where contract_id=p_contract_id for update;
 if j.contract_id is null or p_lease is null or j.lease is distinct from p_lease or j.lease_until is null or j.lease_until<=clock_timestamp()
  then return '{"stale":true,"financialAuthority":false}'::jsonb;end if;
 select * into c from private.stripe_cost_history_checkpoints where domain='auction' and source_id=p_contract_id;
 h:=encode(extensions.digest(c.generation::text||c.checkpoint::text,'sha256'),'hex');
 if c.source_id is null or c.completed or c.lease_until is not null or c.updated_at<j.lease_until-interval '5 minutes'
  or not(coalesce((c.checkpoint->>'cursor')::integer,0)>0 or c.checkpoint->>'phase'='verify')
  or h is null or h is not distinct from j.history_progress_hash
 then return public.complete_auction_observation(p_contract_id,p_lease,false,'unknown');end if;
 -- Genuine partial progress is not success and not a poison failure. Preserve
 -- last_success_at and the oldest-due queue; use a fixed continuation interval.
 update private.auction_observer_jobs set lease=null,lease_until=null,checked_at=clock_timestamp(),
  last_result='incomplete',domain_status='unknown',history_progress_hash=h,next_attempt_at=clock_timestamp()+interval '15 minutes' where contract_id=p_contract_id;
 return '{"stale":false,"historyProgress":true,"financialAuthority":false}'::jsonb;
end $$;
revoke all on function public.continue_auction_cost_history_refresh(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.continue_auction_cost_history_refresh(uuid,uuid) to service_role;

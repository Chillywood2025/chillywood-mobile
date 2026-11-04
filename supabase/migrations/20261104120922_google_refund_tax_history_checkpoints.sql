-- Forward-only, dormant evidence collection. No provider call, reporting
-- acknowledgement, payment, entitlement, schedule or financial switch is added.
create table private.google_refund_tax_history (
 transaction_id uuid primary key references private.google_play_external_transactions(id),
 account_id text not null check(account_id ~ '^acct_[A-Za-z0-9_]+$'),
 source_binding jsonb not null, generation uuid not null default extensions.gen_random_uuid(),
 lease uuid, lease_until timestamptz, checkpoint jsonb not null default '{}',
 completed boolean not null default false, result jsonb,
 updated_at timestamptz not null default clock_timestamp(),
 check(octet_length(checkpoint::text)<=10485760)
);
alter table private.google_refund_tax_history enable row level security;
alter table private.google_refund_tax_history force row level security;
revoke all on private.google_refund_tax_history from public,anon,authenticated,service_role;

-- Tip producers lock the source before enqueueing Google evidence. Preserve
-- that order: tip source -> Google advisory -> reporting transaction. Auction
-- quote payment bindings and settlement contracts are already immutable.
create function private.lock_google_refund_tax_history_context(p_transaction_id uuid) returns jsonb
language plpgsql set search_path='' as $$
declare t private.google_play_external_transactions; locked private.google_play_external_transactions; context jsonb;
begin
 select * into t from private.google_play_external_transactions where id=p_transaction_id;
 if t.id is null then raise exception 'google_tax_history_transaction_required'; end if;
 if t.feature='creator_tip' then
  perform 1 from public.creator_tip_transactions where id=t.quote_id for share;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('google-external:'||t.feature||':'||t.quote_id,0));
 select * into locked from private.google_play_external_transactions where id=p_transaction_id for update;
 if locked.id is null or locked.feature is distinct from t.feature or locked.quote_id is distinct from t.quote_id
 then raise exception 'google_tax_history_source_changed'; end if;
 context:=private.google_refund_tax_context(p_transaction_id);
 if context is null or coalesce((context->>'tax_minor')::bigint,0)<=0
 then raise exception 'google_tax_history_context_required'; end if;
 return context;
end $$;
revoke all on function private.lock_google_refund_tax_history_context(uuid) from public,anon,authenticated,service_role;

create function public.begin_google_refund_tax_history(p_transaction_id uuid,p_account_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb; s private.google_refund_tax_history;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 context:=private.lock_google_refund_tax_history_context(p_transaction_id);
 if coalesce(p_account_id,'') !~ '^acct_[A-Za-z0-9_]+$'
  or (context->>'platform_account_id' is not null and context->>'platform_account_id'<>p_account_id)
 then raise exception 'google_tax_history_account_mismatch'; end if;
 if not exists(select 1 from private.google_play_external_report_outbox where transaction_id=p_transaction_id
  and operation='refund' and state='blocked_tax' and reason='verified_refund_tax_provenance_required')
 then return jsonb_build_object('eligible',false,'financialAuthority',false); end if;
 select * into s from private.google_refund_tax_history where transaction_id=p_transaction_id for update;
 if s.lease_until>clock_timestamp() then return jsonb_build_object('busy',true,'financialAuthority',false); end if;
 if s.transaction_id is null then
  insert into private.google_refund_tax_history(transaction_id,account_id,source_binding)
   values(p_transaction_id,p_account_id,context) returning * into s;
 elsif s.source_binding is distinct from context or s.account_id<>p_account_id or s.completed
  or (s.checkpoint->>'phase'='verify' and
   to_timestamp((s.checkpoint->>'verificationStartedAt')::numeric/1000)<clock_timestamp()-interval '6 hours') then
  update private.google_refund_tax_history set source_binding=context,account_id=p_account_id,
   generation=extensions.gen_random_uuid(),checkpoint='{}',completed=false,result=null
   where transaction_id=p_transaction_id returning * into s;
 end if;
 update private.google_refund_tax_history set lease=extensions.gen_random_uuid(),
  lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp()
  where transaction_id=p_transaction_id returning * into s;
 return jsonb_build_object('generation',s.generation,'lease',s.lease,'checkpoint',s.checkpoint,'context',context);
end $$;

create function public.save_google_refund_tax_history(p_transaction_id uuid,p_generation uuid,p_lease uuid,
 p_checkpoint jsonb,p_facts jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb; s private.google_refund_tax_history; v_result jsonb; started timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 context:=private.lock_google_refund_tax_history_context(p_transaction_id);
 select * into s from private.google_refund_tax_history where transaction_id=p_transaction_id for update;
 if s.transaction_id is null or p_generation is null or p_lease is null
  or s.generation is distinct from p_generation or s.lease is distinct from p_lease
 then raise exception 'google_tax_history_stale_lease'; end if;
 if s.completed then return s.result; end if;
 if s.lease_until is null or s.lease_until<=clock_timestamp() or s.source_binding is distinct from context
 then raise exception 'google_tax_history_source_changed'; end if;
 if jsonb_typeof(p_checkpoint) is distinct from 'object' or octet_length(p_checkpoint::text)>10485760
 then raise exception 'google_tax_history_checkpoint_invalid'; end if;
 if p_checkpoint<>'{}'::jsonb then
  if p_checkpoint->>'version' is distinct from '1'
   or coalesce(p_checkpoint->>'phase','') not in('collect','verify')
   or jsonb_typeof(p_checkpoint->'entries') is distinct from 'array'
   or jsonb_typeof(p_checkpoint->'cursor') is distinct from 'number'
   or coalesce(p_checkpoint->>'cursor','') !~ '^[0-9]{1,5}$'
   or jsonb_array_length(p_checkpoint->'entries')>10000
   or (p_checkpoint->>'cursor')::integer>jsonb_array_length(p_checkpoint->'entries')
  then raise exception 'google_tax_history_checkpoint_invalid'; end if;
  if p_checkpoint->>'phase'='verify' then
   if jsonb_typeof(p_checkpoint->'verificationStartedAt') is distinct from 'number'
    or coalesce(p_checkpoint->>'verificationStartedAt','') !~ '^[0-9]{1,15}$'
   then raise exception 'google_tax_history_checkpoint_invalid'; end if;
   started:=to_timestamp((p_checkpoint->>'verificationStartedAt')::numeric/1000);
   if started>clock_timestamp() then raise exception 'google_tax_history_checkpoint_invalid'; end if;
  end if;
 end if;
 if p_facts is not null then
  if p_checkpoint->>'phase' is distinct from 'verify' or started is null
   or started<clock_timestamp()-interval '6 hours'
   or (p_checkpoint->>'cursor')::integer<>jsonb_array_length(p_checkpoint->'entries')
   or jsonb_array_length(p_checkpoint->'entries')<1
   or p_facts->>'account_id' is distinct from s.account_id
   or p_facts->>'environment' is distinct from 'test'
   or exists(select 1 from jsonb_array_elements(p_checkpoint->'entries') e
    where jsonb_typeof(e->'observedAt') is distinct from 'number'
     or coalesce(e->>'observedAt','') !~ '^[0-9]{1,15}$')
  then raise exception 'google_tax_history_complete_proof_required'; end if;
  if exists(select 1 from jsonb_array_elements(p_checkpoint->'entries') e
    where to_timestamp((e->>'observedAt')::numeric/1000)<started
     or to_timestamp((e->>'observedAt')::numeric/1000)>clock_timestamp())
  then raise exception 'google_tax_history_complete_proof_required'; end if;
  -- Existing exact-refund, immutable-evidence and outbox guards remain the
  -- authority. Recording evidence is never an acknowledgement from Google.
  v_result:=jsonb_build_object('status','history_complete','financialAuthority',false,
   'evidenceRecorded',public.record_google_refund_tax_evidence(p_transaction_id,p_facts));
 else
  v_result:=jsonb_build_object('status','history_pending','financialAuthority',false);
 end if;
 update private.google_refund_tax_history set checkpoint=p_checkpoint,lease_until=null,
  completed=p_facts is not null,result=v_result,updated_at=clock_timestamp()
  where transaction_id=p_transaction_id;
 return v_result;
end $$;
revoke all on function public.begin_google_refund_tax_history(uuid,text),
 public.save_google_refund_tax_history(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.begin_google_refund_tax_history(uuid,text),
 public.save_google_refund_tax_history(uuid,uuid,uuid,jsonb,jsonb) to service_role;

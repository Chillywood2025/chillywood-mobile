-- Test-only destination-charge credit. No grants or seed rows establish provider
-- qualification; projected tip net is never a spendable source.
create table private.sandbox_tip_payout_qualifications (
 id uuid primary key default gen_random_uuid(),
 account_qualification_id uuid not null references private.sandbox_cashout_qualifications(id),
 connected_payout_fee_minor integer not null check(connected_payout_fee_minor>=0),
 platform_billing_treatment text not null check(platform_billing_treatment='platform_absorbed'),
 all_fee_attribution_verified boolean not null check(all_fee_attribution_verified),
 approved_cost_ownership_policy_reference text not null check(length(btrim(approved_cost_ownership_policy_reference)) between 1 and 500),
 approved_cost_ownership_policy_sha256 text not null check(approved_cost_ownership_policy_sha256 ~ '^[a-f0-9]{64}$'),
 cost_ownership_approval_authority text not null check(length(btrim(cost_ownership_approval_authority)) between 1 and 500),
 cost_ownership_approval_verified boolean not null check(cost_ownership_approval_verified),
 evidence_reference text not null check(length(btrim(evidence_reference)) between 1 and 500),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 verified_at timestamptz not null, expires_at timestamptz not null,
 check(expires_at>verified_at and expires_at<=verified_at+interval '1 day')
);
create table private.sandbox_tip_payout_revocations (
 qualification_id uuid primary key references private.sandbox_tip_payout_qualifications(id),
 revoked_at timestamptz not null default clock_timestamp()
);
create table private.sandbox_tip_prefunded_credit_identities (
 tip_id uuid primary key references public.creator_tip_transactions(id),
 charge_id text not null unique check(charge_id ~ '^ch_[A-Za-z0-9]+$'),
 transfer_id text not null unique check(transfer_id ~ '^tr_[A-Za-z0-9]+$'),
 destination_payment_id text not null unique check(destination_payment_id ~ '^(py|ch)_[A-Za-z0-9]+$'),
 connected_credit_id text not null unique check(connected_credit_id ~ '^txn_[A-Za-z0-9]+$')
);
create table private.sandbox_tip_prefunded_receipts (
 id uuid primary key default gen_random_uuid(), tip_id uuid not null references public.creator_tip_transactions(id),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 evidence_hash text not null unique check(evidence_hash ~ '^[a-f0-9]{64}$'),
 facts jsonb not null, observed_at timestamptz not null,
 received_at timestamptz not null default clock_timestamp()
);
create table private.sandbox_tip_prefunded_executions (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references auth.users(id),
 originating_session_id uuid not null, operation_id uuid not null,
 qualification_id uuid not null references private.sandbox_tip_payout_qualifications(id),
 receipt_id uuid not null references private.sandbox_tip_prefunded_receipts(id),
 gross_minor integer not null check(gross_minor>0), bank_minor integer not null check(bank_minor>0),
 connected_fee_minor integer not null check(connected_fee_minor>=0),
 phase text not null default 'ready' check(phase in ('ready','canceled','payout_unknown','payout_pending','paid','return_pending','returned','needs_review')),
 payout_id text unique check(payout_id ~ '^po_[A-Za-z0-9]+$'), dispatch_token uuid, dispatched_at timestamptz,
 source_hold boolean not null default false, created_at timestamptz not null default clock_timestamp(),
 unique(creator_id,operation_id), check(gross_minor=bank_minor+connected_fee_minor)
);
create table private.sandbox_tip_prefunded_allocations (
 execution_id uuid primary key references private.sandbox_tip_prefunded_executions(id),
 tip_id uuid not null references public.creator_tip_transactions(id),
 connected_credit_id text not null check(connected_credit_id ~ '^txn_[A-Za-z0-9]+$'),
 amount_minor integer not null check(amount_minor>0)
);
create index sandbox_tip_prefunded_allocations_tip_idx on private.sandbox_tip_prefunded_allocations(tip_id);
create table private.sandbox_tip_prefunded_observations (
 execution_id uuid not null references private.sandbox_tip_prefunded_executions(id),
 facts_hash text not null, facts jsonb not null, observed_at timestamptz not null default clock_timestamp(),
 primary key(execution_id,facts_hash)
);
create table private.sandbox_tip_prefunded_returns (
 execution_id uuid primary key references private.sandbox_tip_prefunded_executions(id),
 transaction_id text not null unique check(transaction_id ~ '^txn_[A-Za-z0-9]+$'),
 released_minor integer not null check(released_minor>=0), retained_connected_fee_minor integer not null check(retained_connected_fee_minor>=0)
);
create table private.sandbox_tip_prefunded_dispatch_probes (
 id uuid primary key default gen_random_uuid(), execution_id uuid not null references private.sandbox_tip_prefunded_executions(id),
 receipt_id uuid not null references private.sandbox_tip_prefunded_receipts(id),
 available_minor integer not null check(available_minor>=0), observed_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp()
);
create table private.sandbox_tip_prefunded_probe_consumptions (
 probe_id uuid primary key references private.sandbox_tip_prefunded_dispatch_probes(id),
 execution_id uuid not null unique references private.sandbox_tip_prefunded_executions(id)
);
create table private.sandbox_tip_prefunded_source_holds (
 tip_id uuid not null references public.creator_tip_transactions(id),
 reason text not null check(reason='provider_source_reconciliation_required'),
 held_at timestamptz not null default clock_timestamp(), primary key(tip_id,reason)
);

-- A connected account cannot belong to another creator: retain the existing
-- provider-account unique index and immutable mode binding, not a second registry.
create or replace function private.lock_sandbox_cashout_creator(p_creator uuid) returns void
language plpgsql set search_path='' as $$ begin
 perform 1 from public.creator_tip_transactions where creator_id=p_creator and provider='stripe_connect'
  and provider_environment='test' order by id for update;
 perform 1 from public.merch_orders where creator_id=p_creator and environment='sandbox' order by id for update;
 perform 1 from private.creator_event_auction_quotes where creator_id=p_creator and environment='test' order by id for update;
 perform 1 from private.creator_room_auction_quotes where creator_id=p_creator and environment='test' order by id for update;
 perform 1 from public.money_access_ledger_events where creator_id=p_creator and environment='sandbox' order by id for update;
 perform pg_advisory_xact_lock(hashtextextended('sandbox-cashout:'||p_creator::text,0));
end $$;

create function private.sandbox_tip_qualification_current(p_id uuid,p_creator uuid,p_platform text,p_account text) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from private.sandbox_tip_payout_qualifications f
 join private.sandbox_cashout_qualifications q on q.id=f.account_qualification_id
 join public.creator_payout_accounts a on a.creator_user_id=q.creator_id::text and a.provider='stripe_connect'
  and a.provider_environment='test' and a.provider_account_id=q.account_id
 join private.creator_connect_mode_bindings b on b.payout_account_id=a.id and b.creator_id=a.creator_user_id
  and b.environment='test' and b.provider_account_id=q.account_id
 where f.id=p_id and q.creator_id=p_creator and q.platform_account_id=p_platform and q.account_id=p_account
 and q.payout_type='scheduled' and q.source_type='card' and f.verified_at<=clock_timestamp() and f.expires_at>clock_timestamp()
 and q.verified_at<=clock_timestamp() and q.expires_at>clock_timestamp()
 and not exists(select 1 from private.sandbox_tip_payout_revocations where qualification_id=f.id)
 and not exists(select 1 from private.sandbox_cashout_revocations where qualification_id=q.id));
$$;
create function private.sandbox_tip_remaining(p_tip uuid) returns bigint
language sql stable set search_path='' as $$
 select coalesce((select (facts->>'creditNetMinor')::bigint from private.sandbox_tip_prefunded_receipts where tip_id=p_tip order by observed_at desc,id desc limit 1),0)
 -coalesce((select sum(a.amount_minor-coalesce(r.released_minor,0)) from private.sandbox_tip_prefunded_allocations a
  join private.sandbox_tip_prefunded_executions e on e.id=a.execution_id
  left join private.sandbox_tip_prefunded_returns r on r.execution_id=e.id where a.tip_id=p_tip and e.phase<>'canceled'),0);
$$;
create function private.sandbox_tip_summary(p_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('requestId',e.id,'tipId',r.tip_id,'executionKind','prefunded_destination_tip','status',e.phase,'phase',e.phase,
 'bankMinor',e.bank_minor,'connectedFeeMinor',e.connected_fee_minor,'grossMinor',e.gross_minor,'currency','usd','environment','test',
 'financialAuthority',false,'providerTestPaid',e.phase='paid','bankPaid',false,'sourceHeld',e.source_hold,
 'canCancel',e.phase='ready','platformFeeDisposition','platform_absorbed',
 'qualificationStatus',case when private.sandbox_tip_qualification_current(e.qualification_id,e.creator_id,r.facts->>'platformAccountId',r.facts->>'connectedAccountId') then 'current' else 'expired_or_revoked' end)
 from private.sandbox_tip_prefunded_executions e join private.sandbox_tip_prefunded_receipts r on r.id=e.receipt_id where e.id=p_id;
$$;
create function private.sandbox_tip_cross_lane_guard() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if tg_table_name='sandbox_cashout_executions' then
  if tg_op='INSERT' or (new.phase is distinct from old.phase and new.phase in ('funding_unknown','payout_unknown','reversal_unknown','funding_return_unknown')) then
   perform private.lock_sandbox_cashout_creator(new.creator_id);
   if exists(select 1 from private.sandbox_tip_prefunded_executions where creator_id=new.creator_id and (phase not in ('paid','returned','canceled') or (source_hold and phase<>'canceled')))
   then raise exception 'sandbox_account_writer_pending'; end if;
  end if;
 else
  if tg_op='INSERT' or (new.phase is distinct from old.phase and new.phase='payout_unknown') then
   perform private.lock_sandbox_cashout_creator(new.creator_id);
   if exists(select 1 from private.sandbox_cashout_executions where creator_id=new.creator_id and (phase not in ('paid','returned','canceled') or (source_hold and phase<>'canceled')))
   or exists(select 1 from private.sandbox_tip_prefunded_executions where creator_id=new.creator_id and id<>new.id and (phase not in ('paid','returned','canceled') or (source_hold and phase<>'canceled')))
   then raise exception 'sandbox_account_writer_pending'; end if;
  end if;
 end if;
 return new;
end $$;
create trigger sandbox_fund_first_cross_lane_guard before insert or update on private.sandbox_cashout_executions
 for each row execute function private.sandbox_tip_cross_lane_guard();
create trigger sandbox_prefunded_cross_lane_guard before insert or update on private.sandbox_tip_prefunded_executions
 for each row execute function private.sandbox_tip_cross_lane_guard();
create function private.sandbox_tip_hold_changed_source() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' and row(new.status,new.payment_status,new.tip_amount_cents,new.total_paid_cents,new.currency,
  new.provider_checkout_session_id,new.provider_payment_intent_id,new.provider_account_id,new.refunded_amount_cents,new.refunded_at,new.disputed_at)
  is not distinct from row(old.status,old.payment_status,old.tip_amount_cents,old.total_paid_cents,old.currency,
  old.provider_checkout_session_id,old.provider_payment_intent_id,old.provider_account_id,old.refunded_amount_cents,old.refunded_at,old.disputed_at)
 then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('sandbox-cashout:'||old.creator_id::text,0));
 update private.sandbox_tip_prefunded_executions e set source_hold=true from private.sandbox_tip_prefunded_receipts r
 where e.receipt_id=r.id and r.tip_id=old.id and e.phase<>'canceled';
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger sandbox_tip_hold_changed_source after update or delete on public.creator_tip_transactions
 for each row execute function private.sandbox_tip_hold_changed_source();

create function public.get_my_sandbox_prefunded_tip_source(p_tip_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare u uuid:=private.sandbox_cashout_current_user(); begin
 if not exists(select 1 from public.creator_tip_transactions where id=p_tip_id and creator_id=u and provider='stripe_connect' and provider_environment='test')
 then raise exception 'prefunded_tip_not_found'; end if;
 return jsonb_build_object('tipId',p_tip_id,'executionKind','prefunded_destination_tip','environment','test','financialAuthority',false);
end $$;
create function public.get_my_sandbox_prefunded_tip_cashout(p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare u uuid:=private.sandbox_cashout_current_user(); begin
 if not exists(select 1 from private.sandbox_tip_prefunded_executions where id=p_request_id and creator_id=u)
 then raise exception 'prefunded_cashout_not_found'; end if;
 return private.sandbox_tip_summary(p_request_id);
end $$;
create function public.list_my_sandbox_prefunded_tip_cashouts() returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare u uuid:=private.sandbox_cashout_current_user(); result jsonb; begin
 select coalesce(jsonb_agg(private.sandbox_tip_summary(id) order by created_at desc),'[]') into result
 from(select id,created_at from private.sandbox_tip_prefunded_executions where creator_id=u order by created_at desc,id desc limit 20)e;
 return result;
end $$;
create function public.list_my_sandbox_prefunded_tip_sources() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.sandbox_cashout_current_user(); t record; r private.sandbox_tip_prefunded_receipts;
 f private.sandbox_tip_payout_qualifications; s jsonb; result jsonb:='[]'; remaining bigint; eligible boolean; expiry timestamptz;
begin
 for t in select * from public.creator_tip_transactions where creator_id=u and provider='stripe_connect' and provider_environment='test' order by created_at desc,id desc limit 20 loop
  s:=private.sandbox_tip_source_context(t.id);
  select * into r from private.sandbox_tip_prefunded_receipts where tip_id=t.id order by observed_at desc,id desc limit 1;
  select * into f from private.sandbox_tip_payout_qualifications a where private.sandbox_tip_qualification_current(a.id,u,s->>'platformAccountId',s->>'connectedAccountId') order by verified_at desc,id desc limit 1;
  remaining:=greatest(0,private.sandbox_tip_remaining(t.id));
  expiry:=least(f.expires_at,r.observed_at+interval '5 minutes');
  eligible:=private.sandbox_cashout_enabled() and s is not null and r.source_hash=s->>'sourceVersionHash'
   and f.id is not null and remaining>f.connected_payout_fee_minor and expiry>clock_timestamp()
   and not exists(select 1 from private.sandbox_tip_prefunded_executions where creator_id=u and (phase not in ('paid','returned','canceled') or (source_hold and phase<>'canceled')))
   and not exists(select 1 from private.sandbox_cashout_executions where creator_id=u and (phase not in ('paid','returned','canceled') or (source_hold and phase<>'canceled')));
  result:=result||jsonb_build_array(jsonb_build_object('tipId',t.id,'executionKind','prefunded_destination_tip',
   'status',case when eligible then 'eligible_test_cashout' when t.status='paid' then 'pending_provider_availability' else 'test_tip_received' end,
   'amountMinor',t.tip_amount_cents,'currency','usd','environment','test','financialAuthority',false,'availableMinor',remaining,
   'receiptId',case when eligible then r.id end,'qualificationId',case when eligible then f.id end,
   'bankMinor',case when eligible then remaining-f.connected_payout_fee_minor end,'connectedFeeMinor',case when eligible then f.connected_payout_fee_minor end,
   'operationId',case when eligible then gen_random_uuid() end,'expiresAt',case when eligible then expiry end,
   'platformFeeDisposition',case when eligible then 'platform_absorbed' end));
 end loop; return result;
end $$;
create function public.request_sandbox_prefunded_tip_cashout(p_receipt_id uuid,p_qualification_id uuid,p_operation_id uuid,p_expected_bank_minor integer,p_expected_connected_fee_minor integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.sandbox_cashout_current_user(); r private.sandbox_tip_prefunded_receipts; f private.sandbox_tip_payout_qualifications;
 e private.sandbox_tip_prefunded_executions; s jsonb; available bigint; ident uuid;
begin
 if p_operation_id is null then raise exception 'prefunded_operation_required'; end if;
 perform private.lock_sandbox_cashout_creator(u);
 select * into e from private.sandbox_tip_prefunded_executions where creator_id=u and operation_id=p_operation_id;
 if e.id is not null then
  if e.receipt_id is distinct from p_receipt_id or e.qualification_id is distinct from p_qualification_id
   or e.bank_minor is distinct from p_expected_bank_minor or e.connected_fee_minor is distinct from p_expected_connected_fee_minor
  then raise exception 'prefunded_replay_conflict'; end if;
  return private.sandbox_tip_summary(e.id);
 end if;
 select * into r from private.sandbox_tip_prefunded_receipts where id=p_receipt_id;
 s:=private.sandbox_tip_source_context(r.tip_id);
 select * into f from private.sandbox_tip_payout_qualifications where id=p_qualification_id;
 available:=private.sandbox_tip_remaining(r.tip_id);
 if not private.sandbox_cashout_enabled() or s is null or s->>'creatorId' is distinct from u::text
 or r.source_hash is distinct from s->>'sourceVersionHash' or r.observed_at<clock_timestamp()-interval '5 minutes'
 or not private.sandbox_tip_qualification_current(f.id,u,s->>'platformAccountId',s->>'connectedAccountId')
 or available is null or available<=f.connected_payout_fee_minor or available>2147483647
 or p_expected_bank_minor is distinct from (available-f.connected_payout_fee_minor)::integer
 or p_expected_connected_fee_minor is distinct from f.connected_payout_fee_minor
 then raise exception 'prefunded_quote_unavailable'; end if;
 insert into private.sandbox_tip_prefunded_executions(creator_id,originating_session_id,operation_id,qualification_id,receipt_id,gross_minor,bank_minor,connected_fee_minor)
 values(u,(auth.jwt()->>'session_id')::uuid,p_operation_id,f.id,r.id,available,p_expected_bank_minor,p_expected_connected_fee_minor) returning id into ident;
 insert into private.sandbox_tip_prefunded_allocations values(ident,r.tip_id,r.facts->>'connectedCreditTransactionId',available);
 return private.sandbox_tip_summary(ident);
end $$;

create function private.sandbox_tip_source_context(p_tip_id uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare t public.creator_tip_transactions; b private.sandbox_tip_checkout_platform_bindings; a private.creator_tip_checkout_attempts; h text;
begin
 select * into t from public.creator_tip_transactions where id=p_tip_id;
 select * into b from private.sandbox_tip_checkout_platform_bindings where tip_id=t.id;
 select * into a from private.creator_tip_checkout_attempts where tip_id=t.id;
 if t.id is null or b.tip_id is null or a.tip_id is null or t.provider<>'stripe_connect' or t.provider_environment<>'test'
 or t.status<>'paid' or t.payment_status<>'succeeded' or t.refunded_amount_cents<>0 or t.refunded_at is not null or t.disputed_at is not null
 or t.currency<>'usd' or t.sender_id=t.creator_id or t.tip_amount_cents<>t.total_paid_cents
 or t.provider_checkout_session_id !~ '^cs_test_[A-Za-z0-9]+$' or t.provider_payment_intent_id !~ '^pi_[A-Za-z0-9]+$'
 or t.provider_checkout_session_id is null or t.provider_payment_intent_id is null
 or t.sender_id is distinct from a.buyer_id or t.buyer_account_id is distinct from a.buyer_id
 or t.buyer_session_generation is distinct from a.session_id or b.buyer_id is distinct from a.buyer_id
 or b.request_id is distinct from a.request_id or b.session_id is distinct from a.session_id
 or b.recipient_account_id is distinct from t.provider_account_id
 or b.request_body_sha256 is distinct from encode(extensions.digest(a.request_body::text,'sha256'),'hex')
 or exists(select 1 from private.sandbox_tip_prefunded_source_holds where tip_id=t.id)
 or not exists(select 1 from public.creator_tip_events e join public.monetization_webhook_events w
  on w.event_id=e.provider_event_id and w.provider='stripe_tip'
  where e.tip_transaction_id=t.id and e.provider='stripe_connect' and e.provider_environment='test' and e.event_type in ('checkout_completed','payment_succeeded')
  and w.status='processed')
 then return null; end if;
 h:=encode(extensions.digest(jsonb_build_array(t.id,t.sender_id,t.creator_id,a.request_id,a.session_id,t.status,t.payment_status,
  t.tip_amount_cents,t.total_paid_cents,t.currency,t.provider_checkout_session_id,t.provider_payment_intent_id,
  t.provider_account_id,t.refunded_amount_cents,t.refunded_at,t.disputed_at,b.platform_account_id,b.request_body_sha256)::text,'sha256'),'hex');
 return jsonb_build_object('tipId',t.id,'buyerId',t.sender_id,'creatorId',t.creator_id,'checkoutRequestId',a.request_id,
  'buyerSessionId',a.session_id,'checkoutSessionId',t.provider_checkout_session_id,'paymentIntentId',t.provider_payment_intent_id,
  'platformAccountId',b.platform_account_id,'connectedAccountId',b.recipient_account_id,'environment','test','currency','usd',
  'amountMinor',t.tip_amount_cents,'sourceVersionHash',h,'canonicalStatus','paid');
end $$;
create function public.get_sandbox_prefunded_tip_source_context(p_tip_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$ select private.sandbox_tip_source_context(p_tip_id); $$;

create function public.record_sandbox_prefunded_tip_receipt(p_facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s jsonb; k text; ident uuid; observed timestamptz; h text;
begin
 if jsonb_typeof(p_facts) is distinct from 'object' then raise exception 'prefunded_receipt_invalid'; end if;
 for k in select jsonb_object_keys(p_facts) loop
  if k<>all(array['kind','environment','currency','tipId','buyerId','creatorId','checkoutRequestId','buyerSessionId','checkoutSessionId',
   'platformAccountId','connectedAccountId','paymentIntentId','chargeId','sourceTransferId','destinationPaymentId','connectedCreditTransactionId',
   'creditAmountMinor','creditFeeMinor','creditNetMinor','availableOn','refundedMinor','reversedMinor','disputed','sourceVersionHash','observedAt'])
  then raise exception 'prefunded_receipt_unknown_fact'; end if;
 end loop;
 perform 1 from public.creator_tip_transactions where id=(p_facts->>'tipId')::uuid for update;
 s:=private.sandbox_tip_source_context((p_facts->>'tipId')::uuid);
 if s is null then raise exception 'prefunded_canonical_source_required'; end if;
 foreach k in array array['environment','currency','tipId','buyerId','creatorId','checkoutRequestId','buyerSessionId','checkoutSessionId',
  'platformAccountId','connectedAccountId','paymentIntentId','sourceVersionHash'] loop
  if p_facts->k is distinct from s->k then raise exception 'prefunded_receipt_source_mismatch'; end if;
 end loop;
 observed:=to_timestamp((p_facts->>'observedAt')::bigint);
 if p_facts->>'kind' is distinct from 'prefunded_destination_tip'
 or p_facts->'creditAmountMinor' is distinct from s->'amountMinor'
 or coalesce(p_facts->>'chargeId','') !~ '^ch_[A-Za-z0-9]+$'
 or coalesce(p_facts->>'sourceTransferId','') !~ '^tr_[A-Za-z0-9]+$'
 or coalesce(p_facts->>'destinationPaymentId','') !~ '^(py|ch)_[A-Za-z0-9]+$'
 or coalesce(p_facts->>'connectedCreditTransactionId','') !~ '^txn_[A-Za-z0-9]+$'
 or jsonb_typeof(p_facts->'creditFeeMinor') is distinct from 'number' or jsonb_typeof(p_facts->'creditNetMinor') is distinct from 'number'
 or jsonb_typeof(p_facts->'availableOn') is distinct from 'number' or jsonb_typeof(p_facts->'observedAt') is distinct from 'number'
 or coalesce(p_facts->>'creditFeeMinor','') !~ '^[0-9]+$' or coalesce(p_facts->>'creditNetMinor','') !~ '^[0-9]+$'
 or (p_facts->>'creditNetMinor')::integer<=0
 or (p_facts->>'creditAmountMinor')::bigint-(p_facts->>'creditFeeMinor')::bigint<>(p_facts->>'creditNetMinor')::bigint
 or p_facts->'refundedMinor' is distinct from '0'::jsonb or p_facts->'reversedMinor' is distinct from '0'::jsonb
 or p_facts->'disputed' is distinct from 'false'::jsonb
 or observed is null or observed>clock_timestamp() or observed<clock_timestamp()-interval '30 seconds'
 or coalesce((p_facts->>'availableOn')::bigint,0)<=0 or (p_facts->>'availableOn')::bigint>(p_facts->>'observedAt')::bigint
 then raise exception 'prefunded_receipt_invalid'; end if;
 -- Unique provider identities serialize different tips even across concurrent
 -- transactions. Repeat observations reuse the immutable exact same binding.
 insert into private.sandbox_tip_prefunded_credit_identities values((s->>'tipId')::uuid,p_facts->>'chargeId',p_facts->>'sourceTransferId',p_facts->>'destinationPaymentId',p_facts->>'connectedCreditTransactionId') on conflict(tip_id) do nothing;
 if not exists(select 1 from private.sandbox_tip_prefunded_credit_identities i where i.tip_id=(s->>'tipId')::uuid
  and i.charge_id=p_facts->>'chargeId' and i.transfer_id=p_facts->>'sourceTransferId'
  and i.destination_payment_id=p_facts->>'destinationPaymentId' and i.connected_credit_id=p_facts->>'connectedCreditTransactionId')
 then raise exception 'prefunded_credit_identity_changed'; end if;
 if exists(select 1 from private.sandbox_tip_prefunded_receipts r where r.tip_id=(s->>'tipId')::uuid
  and (r.facts->>'sourceTransferId' is distinct from p_facts->>'sourceTransferId'
   or r.facts->>'connectedCreditTransactionId' is distinct from p_facts->>'connectedCreditTransactionId'
   or r.facts->'creditNetMinor' is distinct from p_facts->'creditNetMinor'))
 then raise exception 'prefunded_credit_identity_changed'; end if;
 h:=encode(extensions.digest(p_facts::text,'sha256'),'hex');
 insert into private.sandbox_tip_prefunded_receipts(tip_id,source_hash,evidence_hash,facts,observed_at)
 values((s->>'tipId')::uuid,s->>'sourceVersionHash',h,p_facts,observed) on conflict(evidence_hash) do nothing;
 select id into ident from private.sandbox_tip_prefunded_receipts where evidence_hash=h;
 return jsonb_build_object('receiptId',ident);
end $$;

create function public.get_sandbox_prefunded_tip_cashout_context(p_request_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('requestId',e.id,'executionId',e.id,'tipId',r.tip_id,'fundingMode','prefunded_destination',
 'platformAccountId',q.platform_account_id,'accountId',q.account_id,'destinationId',q.destination_id,
 'environment','test','method','standard','sourceType','card','grossMinor',e.gross_minor,'appFeeMinor',0,
 'expectedProviderFeeMinor',e.connected_fee_minor,'bankMinor',e.bank_minor,'currency','usd','phase',e.phase,
 'transferId',null,'payoutId',e.payout_id,'reversalId',null,'dispatchKey','cw-cashout-'||e.id::text,
 'dispatchedAt',floor(extract(epoch from e.dispatched_at)),'inlineKnownZeroQualified',false)
 from private.sandbox_tip_prefunded_executions e join private.sandbox_tip_prefunded_receipts r on r.id=e.receipt_id
 join private.sandbox_tip_payout_qualifications f on f.id=e.qualification_id
 join private.sandbox_cashout_qualifications q on q.id=f.account_qualification_id where e.id=p_request_id;
$$;
create function public.prepare_sandbox_prefunded_tip_dispatch(p_request_id uuid,p_receipt_id uuid,p_balance_facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.sandbox_tip_prefunded_executions; original private.sandbox_tip_prefunded_receipts; fresh private.sandbox_tip_prefunded_receipts;
 k text; ident uuid; observed timestamptz;
begin
 select * into e from private.sandbox_tip_prefunded_executions where id=p_request_id;
 if e.id is null then raise exception 'prefunded_cashout_not_found'; end if;
 perform private.lock_sandbox_cashout_creator(e.creator_id);
 select * into e from private.sandbox_tip_prefunded_executions where id=p_request_id for update;
 select * into original from private.sandbox_tip_prefunded_receipts where id=e.receipt_id;
 select * into fresh from private.sandbox_tip_prefunded_receipts where id=p_receipt_id;
 if jsonb_typeof(p_balance_facts) is distinct from 'object' then raise exception 'prefunded_balance_invalid'; end if;
 for k in select jsonb_object_keys(p_balance_facts) loop
  if k<>all(array['accountId','environment','currency','sourceType','availableMinor','observedAt']) then raise exception 'prefunded_balance_unknown_fact'; end if;
 end loop;
 observed:=to_timestamp((p_balance_facts->>'observedAt')::bigint);
 if e.phase<>'ready' or e.source_hold or fresh.id is null or fresh.tip_id is distinct from original.tip_id
 or fresh.source_hash is distinct from original.source_hash or fresh.source_hash is distinct from private.sandbox_tip_source_context(fresh.tip_id)->>'sourceVersionHash'
 or fresh.facts->>'connectedCreditTransactionId' is distinct from original.facts->>'connectedCreditTransactionId'
 or fresh.observed_at<clock_timestamp()-interval '30 seconds'
 or p_balance_facts->>'accountId' is distinct from original.facts->>'connectedAccountId'
 or p_balance_facts->>'environment' is distinct from 'test' or p_balance_facts->>'currency' is distinct from 'usd'
 or p_balance_facts->>'sourceType' is distinct from 'card' or coalesce(p_balance_facts->>'availableMinor','') !~ '^[0-9]+$'
 or jsonb_typeof(p_balance_facts->'availableMinor') is distinct from 'number'
 or jsonb_typeof(p_balance_facts->'observedAt') is distinct from 'number'
 or (p_balance_facts->>'availableMinor')::bigint<e.gross_minor or (p_balance_facts->>'availableMinor')::bigint>2147483647
 or observed is null or observed>clock_timestamp() or observed<clock_timestamp()-interval '30 seconds'
 then raise exception 'prefunded_dispatch_probe_invalid'; end if;
 insert into private.sandbox_tip_prefunded_dispatch_probes(execution_id,receipt_id,available_minor,observed_at)
 values(e.id,fresh.id,(p_balance_facts->>'availableMinor')::integer,observed) returning id into ident;
 return jsonb_build_object('probeId',ident);
end $$;
create function public.claim_sandbox_prefunded_tip_cashout_dispatch(p_request_id uuid,p_stage text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.sandbox_tip_prefunded_executions; r private.sandbox_tip_prefunded_receipts; probe private.sandbox_tip_prefunded_dispatch_probes; tok uuid:=gen_random_uuid();
begin
 -- This lane never creates or reverses a transfer, including recovery.
 if p_stage is distinct from 'payout' then raise exception 'prefunded_stage_forbidden'; end if;
 select * into e from private.sandbox_tip_prefunded_executions where id=p_request_id;
 if e.id is null then raise exception 'prefunded_cashout_not_found'; end if;
 perform private.lock_sandbox_cashout_creator(e.creator_id);
 select * into e from private.sandbox_tip_prefunded_executions where id=p_request_id for update;
 if e.phase<>'ready' then return jsonb_build_object('claimed',false,'token',tok); end if;
 perform 1 from private.sandbox_cashout_control where singleton for share;
 perform 1 from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','creator_monetization_enabled','provider_webhooks_enabled') order by key for share;
 perform 1 from auth.users where id=e.creator_id for share;
 perform 1 from auth.sessions where id=e.originating_session_id and user_id=e.creator_id for share;
 perform 1 from public.sandbox_monetization_testers where user_id=e.creator_id::text for share;
 perform 1 from public.beta_access_memberships where user_id=e.creator_id::text for share;
 perform 1 from public.platform_role_memberships where user_id=e.creator_id::text for share;
 select * into r from private.sandbox_tip_prefunded_receipts where id=e.receipt_id;
 if not private.sandbox_cashout_enabled() or not private.sandbox_cashout_subject_current(e.creator_id,e.originating_session_id)
 or e.source_hold or r.source_hash is distinct from private.sandbox_tip_source_context(r.tip_id)->>'sourceVersionHash'
 or not private.sandbox_tip_qualification_current(e.qualification_id,e.creator_id,r.facts->>'platformAccountId',r.facts->>'connectedAccountId')
 then raise exception 'prefunded_dispatch_authority_required'; end if;
 select p.* into probe from private.sandbox_tip_prefunded_dispatch_probes p join private.sandbox_tip_prefunded_receipts fresh on fresh.id=p.receipt_id
 where p.execution_id=e.id and p.available_minor>=e.gross_minor and p.observed_at>=clock_timestamp()-interval '30 seconds'
 and fresh.observed_at>=clock_timestamp()-interval '30 seconds' and fresh.source_hash=r.source_hash
 and not exists(select 1 from private.sandbox_tip_prefunded_probe_consumptions c where c.probe_id=p.id)
 order by p.created_at desc,p.id desc limit 1;
 if probe.id is null then raise exception 'prefunded_fresh_probe_required'; end if;
 insert into private.sandbox_tip_prefunded_probe_consumptions values(probe.id,e.id);
 update private.sandbox_tip_prefunded_executions set phase='payout_unknown',dispatch_token=tok,dispatched_at=clock_timestamp() where id=e.id;
 return jsonb_build_object('claimed',true,'token',tok);
end $$;
create function public.cancel_sandbox_prefunded_tip_cashout(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare u uuid:=private.sandbox_cashout_current_user(); e private.sandbox_tip_prefunded_executions; begin
 perform private.lock_sandbox_cashout_creator(u);
 select * into e from private.sandbox_tip_prefunded_executions where id=p_request_id and creator_id=u for update;
 if e.id is null then raise exception 'prefunded_cashout_not_found'; end if;
 if e.phase='ready' then update private.sandbox_tip_prefunded_executions set phase='canceled' where id=e.id;
 elsif e.phase<>'canceled' then raise exception 'prefunded_postclaim_cancel_forbidden'; end if;
 return private.sandbox_tip_summary(e.id);
end $$;

create function public.record_sandbox_prefunded_tip_cashout_observation(p_request_id uuid,p_dispatch_token uuid,p_facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.sandbox_tip_prefunded_executions; r private.sandbox_tip_prefunded_receipts; q private.sandbox_cashout_qualifications;
 status text:=p_facts->>'status'; obj text:=p_facts->>'objectId'; k text; debit jsonb:=p_facts->'payoutDebit'; credit jsonb:=p_facts->'payoutReturn'; h text;
begin
 select * into e from private.sandbox_tip_prefunded_executions where id=p_request_id;
 if e.id is null then raise exception 'prefunded_cashout_not_found'; end if;
 perform private.lock_sandbox_cashout_creator(e.creator_id);
 select * into e from private.sandbox_tip_prefunded_executions where id=p_request_id for update;
 select * into r from private.sandbox_tip_prefunded_receipts where id=e.receipt_id;
 select a.* into q from private.sandbox_cashout_qualifications a join private.sandbox_tip_payout_qualifications f on f.account_qualification_id=a.id where f.id=e.qualification_id;
 if jsonb_typeof(p_facts) is distinct from 'object' then raise exception 'prefunded_observation_invalid'; end if;
 for k in select jsonb_object_keys(p_facts) loop
  if k<>all(array['kind','objectId','status','amountMinor','accountId','destinationId','environment','failureBalanceTransactionId','balanceTransactionId','payoutDebit','payoutReturn','returnedMinor','retainedConnectedFeeMinor'])
  then raise exception 'prefunded_observation_unknown_fact'; end if;
 end loop;
 if p_facts->>'kind' is distinct from 'payout' or coalesce(obj,'') !~ '^po_[A-Za-z0-9]+$'
 or p_facts->'amountMinor' is distinct from to_jsonb(e.bank_minor) or p_facts->>'accountId' is distinct from q.account_id
 or p_facts->>'destinationId' is distinct from q.destination_id or p_facts->>'environment' is distinct from 'test'
 or (p_facts->>'balanceTransactionId' is not null and p_facts->>'balanceTransactionId' !~ '^txn_[A-Za-z0-9]+$')
 or (p_facts->>'failureBalanceTransactionId' is not null and p_facts->>'failureBalanceTransactionId' !~ '^txn_[A-Za-z0-9]+$')
 or status is null or status not in ('pending','in_transit','paid','failed','canceled')
 or (p_dispatch_token is not null and p_dispatch_token is distinct from e.dispatch_token)
 or (e.payout_id is not null and obj is distinct from e.payout_id)
 or e.phase not in ('payout_unknown','payout_pending','paid','return_pending','returned','needs_review')
 then raise exception 'prefunded_observation_invalid'; end if;
 if e.phase in ('paid','return_pending','returned') and status in ('pending','in_transit')
 or e.phase in ('return_pending','returned') and status='paid' then raise exception 'prefunded_payout_regression'; end if;
 if debit is not null then
  if jsonb_typeof(debit)<>'object' or debit-'transactionId'-'sourceId'-'amountMinor'-'feeMinor'-'netMinor'-'currency'-'status'-'type'<>'{}'::jsonb
  or coalesce(debit->>'transactionId','') !~ '^txn_[A-Za-z0-9]+$' or debit->>'transactionId' is distinct from p_facts->>'balanceTransactionId'
  or debit->>'sourceId' is distinct from obj or debit->>'type' is distinct from 'payout' or debit->>'currency' is distinct from 'usd'
  or debit->>'status' is distinct from 'available' or debit->'amountMinor' is distinct from to_jsonb(-e.bank_minor)
  or debit->'feeMinor' is distinct from to_jsonb(e.connected_fee_minor) or debit->'netMinor' is distinct from to_jsonb(-e.gross_minor)
  then raise exception 'prefunded_debit_invalid'; end if;
 end if;
 if credit is not null then
  if status not in ('failed','canceled') or debit is null or jsonb_typeof(credit)<>'object'
  or credit-'transactionId'-'sourceId'-'amountMinor'-'feeMinor'-'netMinor'-'currency'-'status'-'type'<>'{}'::jsonb
  or coalesce(credit->>'transactionId','') !~ '^txn_[A-Za-z0-9]+$' or credit->>'transactionId' is distinct from p_facts->>'failureBalanceTransactionId'
  or credit->>'transactionId'=debit->>'transactionId' or credit->>'sourceId' is distinct from obj
  or credit->>'type' is distinct from (case when status='canceled' then 'payout_cancel' else 'payout_failure' end)
  or credit->>'currency' is distinct from 'usd' or credit->>'status' is distinct from 'available'
  or credit->'amountMinor' is distinct from to_jsonb(e.bank_minor) or coalesce(credit->>'feeMinor','') !~ '^[0-9]+$'
  or jsonb_typeof(credit->'feeMinor') is distinct from 'number' or jsonb_typeof(credit->'netMinor') is distinct from 'number'
  or coalesce(credit->>'netMinor','') !~ '^[0-9]+$' or (credit->>'netMinor')::bigint+(credit->>'feeMinor')::bigint<>e.bank_minor
  or p_facts->'returnedMinor' is distinct from credit->'netMinor'
  or p_facts->'retainedConnectedFeeMinor' is distinct from to_jsonb(e.gross_minor-(credit->>'netMinor')::integer)
  then raise exception 'prefunded_return_invalid'; end if;
  insert into private.sandbox_tip_prefunded_returns values(e.id,credit->>'transactionId',(credit->>'netMinor')::integer,e.gross_minor-(credit->>'netMinor')::integer) on conflict(execution_id) do nothing;
  if not exists(select 1 from private.sandbox_tip_prefunded_returns where execution_id=e.id and transaction_id=credit->>'transactionId'
   and released_minor=(credit->>'netMinor')::integer) then raise exception 'prefunded_return_conflict'; end if;
 end if;
 h:=encode(extensions.digest(p_facts::text,'sha256'),'hex');
 insert into private.sandbox_tip_prefunded_observations values(e.id,h,p_facts,clock_timestamp()) on conflict do nothing;
 update private.sandbox_tip_prefunded_executions set payout_id=obj,phase=case when e.phase='returned' then 'returned'
  when credit is not null then 'returned' when status in ('failed','canceled') then 'return_pending'
  when status='paid' and debit is not null then 'paid' when status='paid' then 'needs_review' else 'payout_pending' end where id=e.id;
 return private.sandbox_tip_summary(e.id);
end $$;

create function private.sandbox_tip_revoke_admission() returns trigger
language plpgsql security definer set search_path='' as $$ declare creator uuid; begin
 select q.creator_id into strict creator from private.sandbox_cashout_qualifications q join private.sandbox_tip_payout_qualifications f on f.account_qualification_id=q.id where f.id=new.qualification_id;
 perform private.lock_sandbox_cashout_creator(creator); return new;
end $$;
create trigger sandbox_tip_revoke_admission before insert on private.sandbox_tip_payout_revocations for each row execute function private.sandbox_tip_revoke_admission();
create function public.hold_sandbox_prefunded_tip_source(p_tip_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare creator uuid; begin
 if p_reason is distinct from 'provider_source_reconciliation_required' then raise exception 'prefunded_hold_reason_invalid'; end if;
 select creator_id into creator from public.creator_tip_transactions where id=p_tip_id and provider='stripe_connect' and provider_environment='test';
 if creator is null then raise exception 'prefunded_tip_not_found'; end if;
 perform private.lock_sandbox_cashout_creator(creator);
 insert into private.sandbox_tip_prefunded_source_holds(tip_id,reason) values(p_tip_id,p_reason) on conflict do nothing;
 update private.sandbox_tip_prefunded_executions e set source_hold=true from private.sandbox_tip_prefunded_receipts r
 where e.receipt_id=r.id and r.tip_id=p_tip_id and e.phase<>'canceled';
 return jsonb_build_object('tipId',p_tip_id,'sourceHeld',true,'financialAuthority',false);
end $$;
do $$ declare t text; r record; begin
 foreach t in array array['sandbox_tip_payout_qualifications','sandbox_tip_payout_revocations','sandbox_tip_prefunded_credit_identities','sandbox_tip_prefunded_receipts','sandbox_tip_prefunded_executions','sandbox_tip_prefunded_allocations','sandbox_tip_prefunded_observations','sandbox_tip_prefunded_returns','sandbox_tip_prefunded_dispatch_probes','sandbox_tip_prefunded_probe_consumptions','sandbox_tip_prefunded_source_holds'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  if t<>'sandbox_tip_prefunded_executions' then execute format('create trigger %I before update or delete on private.%I for each row execute function private.guard_event_ticket_terms_immutable()',t||'_immutable',t); end if;
 end loop;
 for r in select p.oid::regprocedure ident,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and (p.proname like 'sandbox_tip_%' or p.proname='lock_sandbox_cashout_creator'))
 or (n.nspname='public' and p.proname in ('hold_sandbox_prefunded_tip_source','get_sandbox_prefunded_tip_source_context','record_sandbox_prefunded_tip_receipt','get_sandbox_prefunded_tip_cashout_context','prepare_sandbox_prefunded_tip_dispatch','claim_sandbox_prefunded_tip_cashout_dispatch','record_sandbox_prefunded_tip_cashout_observation','get_my_sandbox_prefunded_tip_source','get_my_sandbox_prefunded_tip_cashout','list_my_sandbox_prefunded_tip_cashouts','list_my_sandbox_prefunded_tip_sources','request_sandbox_prefunded_tip_cashout','cancel_sandbox_prefunded_tip_cashout')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',r.ident);
  if r.nspname='public' then execute format('grant execute on function %s to %I',r.ident,
   case when r.proname in ('hold_sandbox_prefunded_tip_source','get_sandbox_prefunded_tip_source_context','record_sandbox_prefunded_tip_receipt','get_sandbox_prefunded_tip_cashout_context','prepare_sandbox_prefunded_tip_dispatch','claim_sandbox_prefunded_tip_cashout_dispatch','record_sandbox_prefunded_tip_cashout_observation') then 'service_role' else 'authenticated' end); end if;
 end loop;
end $$;

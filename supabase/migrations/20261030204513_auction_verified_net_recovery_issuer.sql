-- Exact-net recovery after verified refund balance adjustments. No assumed
-- chargeback loss policy, store-fee rebate, tax reversal or guaranteed recovery.
alter table private.auction_reversal_operations add column expected_reversed_minor bigint not null default 0
 check(expected_reversed_minor>=0);
alter table private.auction_reversal_evidence
 drop constraint auction_reversal_evidence_policy_version_check,
 add constraint auction_reversal_evidence_policy_version_check check(policy_version in(
  'synthetic_auction_reversal_test_v1','auction_verified_net_recovery_v1')),
 add column observation_id uuid references private.auction_settlement_observations(id),
 add column refund_evidence_hash text,
 add constraint auction_reversal_verified_observation check(policy_version<>'auction_verified_net_recovery_v1'
  or (observation_id is not null and refund_evidence_hash ~ '^[0-9a-f]{64}$'));

create function public.qualify_auction_refund_recovery_from_net(p_contract_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;o private.auction_transfer_operations;
 observation private.auction_settlement_observations;e private.auction_reversal_evidence;
 facts jsonb;net bigint;creator_net bigint;platform_net bigint;reserved bigint;confirmed bigint;observed_reversed bigint;remaining bigint;
 receipt_refunded bigint;refund_receipts jsonb;v private.auction_platform_qualifications;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id for update;
 perform 1 from public.money_purchase_intents where id=c.purchase_intent_id for update;
 select * into o from private.auction_transfer_operations where contract_id=c.id for update;
 if o.id is null or o.provider_transfer_id is null or not o.recovery_required
 then return jsonb_build_object('status','held','reason','exact_transferred_recovery_required');end if;
 select * into observation from private.auction_settlement_observations where contract_id=c.id order by created_at desc,id desc limit 1;
 facts:=observation.facts;
 if observation.id is null or facts->'disputed' is distinct from 'false'::jsonb
  or facts->>'charge_id'<>o.source_charge_id or facts->>'account_id'<>o.platform_account_id
  or facts->>'balance_status'<>'available' or (facts->>'refunded_minor')::bigint<=0
  or facts->>'tax_minor' is null or facts->>'store_fee_minor' is null
  or facts->>'refund_net_minor' is null or facts->>'tax_reversal_minor' is null
  or (facts->>'store_fee_minor')::bigint<>0
  or exists(select 1 from jsonb_array_elements(facts->'refunds') refund where refund->>'status'<>'available')
 then return jsonb_build_object('status','held','reason','refund_adjustments_unqualified');end if;
 if c.lane='event' then
  if exists(select 1 from private.creator_event_auction_receipts r where r.quote_id=c.quote_id and r.outcome='disputed')
  then return jsonb_build_object('status','held','reason','dispute_loss_policy_unqualified');end if;
  select max((r.evidence->>'refundedAmountMinor')::bigint),jsonb_agg(jsonb_build_object('receiptId',r.id,'providerEventId',r.provider_event_id,
   'amount',r.evidence->'refundedAmountMinor') order by r.id) into receipt_refunded,refund_receipts
  from private.creator_event_auction_receipts r where r.quote_id=c.quote_id and r.outcome='refunded'
   and r.provider_account_id=c.platform_account_id and r.payment_intent_id=facts->>'payment_intent_id';
 else
  if exists(select 1 from private.creator_room_auction_receipts r where r.quote_id=c.quote_id and r.outcome='disputed')
  then return jsonb_build_object('status','held','reason','dispute_loss_policy_unqualified');end if;
  select max((r.evidence->>'refundedAmountMinor')::bigint),jsonb_agg(jsonb_build_object('receiptId',r.id,'providerEventId',r.provider_event_id,
   'amount',r.evidence->'refundedAmountMinor') order by r.id) into receipt_refunded,refund_receipts
  from private.creator_room_auction_receipts r where r.quote_id=c.quote_id and r.outcome='refunded'
   and r.provider_account_id=c.platform_account_id and r.payment_intent_id=facts->>'payment_intent_id';
 end if;
 if receipt_refunded is null or receipt_refunded<>(facts->>'refunded_minor')::bigint
 then return jsonb_build_object('status','held','reason','refund_receipts_not_reconciled');end if;
 net:=(facts->>'gross_minor')::bigint-(facts->>'provider_fee_minor')::bigint-(facts->>'tax_minor')::bigint
  -(facts->>'store_fee_minor')::bigint+(facts->>'refund_net_minor')::bigint+(facts->>'tax_reversal_minor')::bigint;
 platform_net:=greatest(net,0)*2000/10000;creator_net:=greatest(net,0)-platform_net;
 select coalesce(sum(amount_minor) filter(where state<>'canceled'),0),coalesce(sum(amount_minor) filter(where state='confirmed'),0)
  into reserved,confirmed from private.auction_reversal_operations where transfer_operation_id=o.id;
 select coalesce(max((evidence->>'amount_reversed')::bigint),0) into observed_reversed from private.auction_transfer_result_observations
  where operation_id=o.id and evidence->>'object'='transfer';
 -- An external or not-yet-reconciled reversal cannot be silently counted as
 -- one of ours, nor can an uncertain reversal free its reserved capacity.
 if observed_reversed<>confirmed then return jsonb_build_object('status','held','reason','transfer_reversals_not_reconciled');end if;
 remaining:=greatest(o.amount_minor-creator_net-reserved,0);
 if remaining=0 then return jsonb_build_object('status','already_reserved_or_no_recovery','financialAuthority',false);end if;
 select * into v from private.auction_platform_qualifications where capability_id=c.capability_id order by verified_at desc,id desc limit 1;
 -- Fresh platform/recipient binding supplies a finite evidence lifetime, not
 -- new authority to pay a blocked recipient. Reversal eligibility is separate.
 if v.id is null or v.revoked_at is not null or v.verified_at>clock_timestamp() or v.expires_at<=clock_timestamp()
  or row(v.platform_account_id,v.recipient_account_id) is distinct from row(o.platform_account_id,o.destination)
 then return jsonb_build_object('status','held','reason','recovery_account_evidence_required');end if;
 select * into e from private.auction_reversal_evidence where operation_id=o.id and observation_id=observation.id
  and amount_minor=remaining and revoked_at is null and expires_at>clock_timestamp() order by qualified_at desc,id desc limit 1;
 if e.id is null then
  insert into private.auction_reversal_evidence(operation_id,amount_minor,evidence_reference,policy_version,qualified_at,expires_at,observation_id,refund_evidence_hash)
  values(o.id,remaining,'verified_refund_net:'||observation.id||':transfer:'||o.provider_transfer_id,'auction_verified_net_recovery_v1',
   clock_timestamp(),v.expires_at,observation.id,encode(extensions.digest(refund_receipts::text||':'||(facts->'refunds')::text,'sha256'),'hex')) returning * into e;
 end if;
 return jsonb_build_object('status','qualified_test_only','reversalEvidenceId',e.id,'amountMinor',remaining,'financialAuthority',false);
end;$$;
revoke all on function public.qualify_auction_refund_recovery_from_net(uuid) from public,anon,authenticated,service_role;
grant execute on function public.qualify_auction_refund_recovery_from_net(uuid) to service_role;

create function private.auction_recovery_evidence_current(p_evidence_id uuid,p_operation_id uuid default null) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare e private.auction_reversal_evidence;o private.auction_transfer_operations;facts jsonb;net bigint;entitlement bigint;reserved bigint;
 c private.auction_platform_settlement_contracts;refunded bigint;disputed boolean;confirmed bigint;observed_reversed bigint;
begin
 select * into strict e from private.auction_reversal_evidence where id=p_evidence_id;
 if e.policy_version='synthetic_auction_reversal_test_v1' then return true;end if;
 select * into strict o from private.auction_transfer_operations where id=e.operation_id;
 select * into strict c from private.auction_platform_settlement_contracts where id=o.contract_id;
 if e.observation_id is distinct from (select id from private.auction_settlement_observations where contract_id=o.contract_id order by created_at desc,id desc limit 1)
 then return false;end if;
 select observation.facts into facts from private.auction_settlement_observations observation where id=e.observation_id;
 if facts->'disputed' is distinct from 'false'::jsonb or facts->>'tax_reversal_minor' is null
  or facts->>'tax_minor' is null or facts->>'refund_net_minor' is null or facts->>'store_fee_minor' is distinct from '0'
  or facts->>'balance_status'<>'available' then return false;end if;
 select max((receipt.evidence->>'refundedAmountMinor')::bigint) filter(where receipt.outcome='refunded'),
  coalesce(bool_or(receipt.outcome='disputed'),false) into refunded,disputed from (
   select r.evidence,r.outcome from private.creator_event_auction_receipts r where c.lane='event' and r.quote_id=c.quote_id
   union all select r.evidence,r.outcome from private.creator_room_auction_receipts r where c.lane='room' and r.quote_id=c.quote_id
  ) receipt;
 if disputed or refunded is distinct from (facts->>'refunded_minor')::bigint then return false;end if;
 select coalesce(sum(amount_minor),0) into confirmed from private.auction_reversal_operations where transfer_operation_id=o.id and state='confirmed';
 select coalesce(max((evidence->>'amount_reversed')::bigint),0) into observed_reversed from private.auction_transfer_result_observations
  where operation_id=o.id and evidence->>'object'='transfer';
 if confirmed<>observed_reversed then return false;end if;
 net:=(facts->>'gross_minor')::bigint-(facts->>'provider_fee_minor')::bigint-(facts->>'tax_minor')::bigint
  +(facts->>'refund_net_minor')::bigint+(facts->>'tax_reversal_minor')::bigint;
 entitlement:=greatest(net,0)-greatest(net,0)*2000/10000;
 select coalesce(sum(amount_minor),0) into reserved from private.auction_reversal_operations where transfer_operation_id=o.id
  and state<>'canceled' and id is distinct from p_operation_id;
 return e.amount_minor<=greatest(o.amount_minor-entitlement-reserved,0);
end;$$;
revoke all on function private.auction_recovery_evidence_current(uuid,uuid) from public,anon,authenticated,service_role;

do $patch$
declare definition text;needle text;
begin
 definition:=pg_get_functiondef('public.reserve_auction_test_reversal(uuid)'::regprocedure);
 needle:='reserved bigint;';
 if position(needle in definition)=0 then raise exception 'auction_recovery_observed_amount_variable_missing';end if;
 definition:=replace(definition,needle,'reserved bigint;expected_reversed bigint;');
 needle:='insert into private.auction_reversal_operations(transfer_operation_id,evidence_id,amount_minor) values(o.id,e.id,e.amount_minor) returning * into r;';
 if position(needle in definition)=0 then raise exception 'auction_recovery_observed_amount_insert_missing';end if;
 definition:=replace(definition,needle,'select coalesce(max((evidence->>''amount_reversed'')::bigint),0) into expected_reversed
  from private.auction_transfer_result_observations where operation_id=o.id and evidence->>''object''=''transfer'';
 insert into private.auction_reversal_operations(transfer_operation_id,evidence_id,amount_minor,expected_reversed_minor)
  values(o.id,e.id,e.amount_minor,expected_reversed) returning * into r;');
 needle:='or o.provider_transfer_id is null or not o.recovery_required or reserved+e.amount_minor>o.amount_minor';
 if position(needle in definition)=0 then raise exception 'auction_recovery_reservation_patch_missing';end if;
 execute replace(definition,needle,needle||' or not private.auction_recovery_evidence_current(e.id)');
 definition:=pg_get_functiondef('public.claim_auction_test_reversal_dispatch(uuid)'::regprocedure);
 needle:='select * into strict r from private.auction_reversal_operations where id=p_operation_id for update;';
 if position(needle in definition)=0 then raise exception 'auction_recovery_dispatch_lock_patch_missing';end if;
 definition:=replace(definition,needle,'select * into strict r from private.auction_reversal_operations where id=p_operation_id;
 perform 1 from private.auction_platform_settlement_contracts c join private.auction_transfer_operations o on o.contract_id=c.id
  where o.id=r.transfer_operation_id for update of c;
 perform 1 from public.money_purchase_intents i join private.auction_platform_settlement_contracts c on c.purchase_intent_id=i.id
  join private.auction_transfer_operations o on o.contract_id=c.id where o.id=r.transfer_operation_id for update of i;
 perform 1 from private.auction_transfer_operations where id=r.transfer_operation_id for update;
 select * into strict r from private.auction_reversal_operations where id=p_operation_id for update;');
 needle:='if e.revoked_at is not null or e.expires_at<=clock_timestamp() then';
 if position(needle in definition)=0 then raise exception 'auction_recovery_dispatch_qualification_patch_missing';end if;
 execute replace(definition,needle,'if e.revoked_at is not null or e.expires_at<=clock_timestamp() or not private.auction_recovery_evidence_current(e.id,r.id) then');
end;$patch$;

-- Preserve exact own reversal facts even when cumulative postflight evidence
-- is missing/inconsistent. Readiness is separate; an external writer can race
-- Stripe GET/POST because Stripe exposes no compare-and-swap on reversals.
do $patch$
declare definition text;needle text;
begin
 definition:=pg_get_functiondef('public.record_auction_test_reversal_result(uuid,jsonb)'::regprocedure);
 needle:='declare r private.auction_reversal_operations;o private.auction_transfer_operations;';
 if position(needle in definition)=0 then raise exception 'auction_reversal_result_variables_missing';end if;
 definition:=replace(definition,needle,needle||'cumulative_ok boolean:=false;known_reversed bigint;');
 needle:='select * into strict r from private.auction_reversal_operations where id=p_operation_id for update;
 select * into strict o from private.auction_transfer_operations where id=r.transfer_operation_id;';
 if position(needle in definition)=0 then raise exception 'auction_reversal_result_lock_missing';end if;
 definition:=replace(definition,needle,'select * into strict r from private.auction_reversal_operations where id=p_operation_id;
 select * into strict o from private.auction_transfer_operations where id=r.transfer_operation_id for update;
 select * into strict r from private.auction_reversal_operations where id=p_operation_id for update;');
 needle:='-- Reversal success does NOT mark the buyer refund complete or clear recovery.';
 if position(needle in definition)=0 then raise exception 'auction_reversal_postflight_patch_missing';end if;
 definition:=replace(definition,needle,'if jsonb_typeof(p_evidence->''parent_transfer'')=''object'' then
  begin
   perform public.record_auction_test_transfer_result(o.id,p_evidence->''parent_transfer'');
   select coalesce(sum(amount_minor),0) into known_reversed from private.auction_reversal_operations
    where transfer_operation_id=o.id and state=''confirmed'';
   cumulative_ok:=(p_evidence->''parent_transfer''->>''amount_reversed'')::bigint=known_reversed;
  exception when others then cumulative_ok:=false;end;
 end if;
 update private.auction_transfer_operations set recovery_required=true,state=''reconciliation_required'' where id=o.id;
 '||needle);
 needle:='return jsonb_build_object(''status'',''confirmed'',''operationId'',r.id,''financialAuthority'',false,''buyerRefundCompleted'',false);';
 if position(needle in definition)=0 then raise exception 'auction_reversal_postflight_response_missing';end if;
 execute replace(definition,needle,'return jsonb_build_object(''status'',case when cumulative_ok then ''confirmed'' else ''reconciliation_required'' end,
  ''operationId'',r.id,''reversalConfirmed'',true,''cumulativeReconciled'',cumulative_ok,''financialAuthority'',false,''buyerRefundCompleted'',false);');
end;$patch$;

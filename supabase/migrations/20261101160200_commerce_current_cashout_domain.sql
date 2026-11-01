-- Read-only current-domain eligibility. Issuance-time clearance is not a
-- permanent exemption from later return, dispute, fulfillment or tax holds.
create function private.commerce_current_earning_domain_ready(p_earning uuid) returns boolean
language plpgsql stable set search_path='' as $$
declare r private.commerce_payable_releases;o public.merch_orders;c private.auction_platform_settlement_contracts;
 state jsonb;facts jsonb;obs uuid;identity uuid;product text;account text;raw_mode text;evidence uuid;
begin
 select * into r from private.commerce_payable_releases where earnings_ledger_id=p_earning;
 if r.id is null then return true; end if;
 if r.source_type='physical_merch' then
  select * into strict o from public.merch_orders where id=r.source_id;
  if o.environment<>'production' or o.payment_status not in ('paid','refunded') or o.fulfillment_status not in ('shipped','delivered')
   or not exists(select 1 from private.merch_fulfillment_receipts receipt where receipt.order_id=o.id and receipt.creator_id=o.creator_id
    and receipt.fulfillment_revision=o.fulfillment_revision and receipt.status=o.fulfillment_status) then return false; end if;
  state:=private.merch_return_hold_state(o,clock_timestamp());
  if state->>'returnWindowStatus' is distinct from 'elapsed' or jsonb_array_length(state->'returnHoldReasons')<>0 then return false; end if;
  select id,merch.facts into obs,facts from private.merch_provider_cost_observations merch where order_id=o.id order by created_at desc,id desc limit 1;
  identity:=o.id;product:=o.product_id::text;raw_mode:=o.environment;
 else
  select * into strict c from private.auction_platform_settlement_contracts where id=r.source_id;
  if private.auction_release_negative_holds(c.id) then return false; end if;
  select proof.id into evidence from private.auction_release_evidence proof where proof.contract_id=c.id and proof.revoked_at is null
   and proof.environment=c.environment and proof.qualified_at<=clock_timestamp() and proof.expires_at>clock_timestamp() order by proof.qualified_at desc,proof.id desc limit 1;
  if evidence is null or not private.auction_release_mature(c.id,evidence) then return false; end if;
  select id,auction.facts into obs,facts from private.auction_settlement_observations auction where contract_id=c.id order by created_at desc,id desc limit 1;
  identity:=c.quote_id;product:=c.platform_product_id;raw_mode:=c.environment;
 end if;
 account:=facts->>'account_id';
 if facts is null or facts->'disputed' is distinct from 'false'::jsonb or facts->>'balance_status' is distinct from 'available'
  or exists(select 1 from jsonb_array_elements(facts->'refunds') refund where refund->>'status' is distinct from 'available')
  or not exists(select 1 from private.commerce_cost_verification_reads vr where vr.source_observation_id=obs
   and vr.verified_at>=clock_timestamp()-interval '15 minutes') then return false; end if;
 return exists(select 1 from private.commerce_tax_checkout_bindings b join private.commerce_tax_qualifications q on q.id=b.policy_id
  where b.feature=r.source_type and b.identity_id=identity and b.product_id=product and b.account_id=account and b.environment=raw_mode
   and q.enabled and q.revoked_at is null and q.verified_at<=clock_timestamp() and q.expires_at>clock_timestamp()
   and q.provider_verified_at<=clock_timestamp() and q.provider_expires_at>clock_timestamp());
end; $$;
revoke all on function private.commerce_current_earning_domain_ready(uuid) from public,anon,authenticated,service_role;

create function private.lock_commerce_cashout_domains(p_request uuid) returns void
language plpgsql set search_path='' as $$
declare source record;account record;identity uuid;
begin
 -- Call BEFORE creator-payout/request/execution row locks. Do not call from the
 -- lock-free balance read or request-time context creation after reservations.
 for source in select distinct r.source_type,r.source_id from public.creator_payout_allocations a
  join private.commerce_payable_releases r on r.earnings_ledger_id=a.earnings_ledger_id
  where a.payout_request_id=p_request order by r.source_type,r.source_id
 loop
  if source.source_type='physical_merch' then
   perform 1 from public.merch_orders where id=source.source_id for update;
   identity:=source.source_id;
  else
   perform private.lock_auction_release_domain(source.source_id);
   perform private.lock_auction_release_qualification(source.source_id);
   select quote_id into identity from private.auction_platform_settlement_contracts where id=source.source_id for update;
  end if;
  perform 1 from private.commerce_tax_checkout_bindings b join private.commerce_tax_qualifications q on q.id=b.policy_id
   where b.feature=source.source_type and b.identity_id=identity for share of q;
 end loop;
 for account in select distinct s.account_id,s.environment from public.creator_payout_allocations a
  join private.commerce_payable_releases r on r.earnings_ledger_id=a.earnings_ledger_id
  join private.commerce_known_cost_snapshots s on s.id=r.snapshot_id where a.payout_request_id=p_request order by s.account_id,s.environment
 loop perform pg_advisory_xact_lock(hashtextextended('fee-components:'||account.account_id||':'||account.environment,0)); end loop;
end; $$;
revoke all on function private.lock_commerce_cashout_domains(uuid) from public,anon,authenticated,service_role;

do $$ declare definition text;marker text:=E'begin\n';needle text:='perform pg_advisory_xact_lock(hashtextextended(''creator-payout:''||r.creator_id::text,0));'; begin
 definition:=pg_get_functiondef('public.creator_earnings_withdrawable_cents_internal(uuid,timestamptz)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'fee_withdrawable_definition_changed'; end if;
 execute overlay(definition placing marker||' if not private.commerce_current_earning_domain_ready(p_earnings_ledger_id) then return 0; end if;'||E'\n'
  from position(marker in definition) for length(marker));
 if to_regprocedure('public.claim_creator_cashout_dispatch(uuid,text)') is not null then
  definition:=pg_get_functiondef('public.claim_creator_cashout_dispatch(uuid,text)'::regprocedure);
  if position(needle in definition)=0 then raise exception 'cashout_creator_lock_definition_changed'; end if;
  execute replace(definition,needle,'perform private.lock_commerce_cashout_domains(p_request_id);'||E'\n '||needle);
 end if;
end $$;

-- Full refunds resolve monetary exposure, not historical fulfillment facts.
create function private.auction_current_financial_account_ready(p_contract_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;v private.auction_platform_qualifications;v_event_id uuid;
begin
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id;
 select * into v from private.auction_platform_qualifications where capability_id=c.capability_id and environment=c.environment order by verified_at desc,id desc limit 1;
 if v.id is null or not v.enabled or v.revoked_at is not null or v.verified_at>clock_timestamp() or v.expires_at<=clock_timestamp()
  or row(v.platform_account_id,v.recipient_account_id,v.platform_product_id) is distinct from row(c.platform_account_id,c.recipient_account_id,c.platform_product_id)
  or not exists(select 1 from public.creator_payout_accounts account join public.creator_payout_eligibility_records r on r.payout_account_id=account.id
   where account.creator_user_id=c.creator_id::text and account.provider='stripe_connect' and account.provider_environment=c.environment
    and account.provider_account_id=c.recipient_account_id and account.provider_configuration_status='match'
    and account.provider_configuration_account_id=c.recipient_account_id and account.payouts_enabled
    and r.provider_ready and r.kyc_ready and r.payout_account_ready and not r.fraud_hold_active
    and r.admin_review_status not in('pending_review','rejected','on_hold') and r.eligibility_status<>'on_hold')
 then return false;end if;
 return true;
end; $$;
revoke all on function private.auction_current_financial_account_ready(uuid) from public,anon,authenticated,service_role;

create function private.commerce_full_refund_correction_ready(s private.commerce_known_cost_snapshots) returns boolean
language plpgsql stable set search_path='' as $$
declare facts jsonb;obs uuid;identity uuid;product text;mode text;o public.merch_orders;c private.auction_platform_settlement_contracts;
begin
 -- Never issues an initial earning, grants access, or clears a partial remedy.
 -- The remaining net is zero or negative: a later positive delta can only
 -- restore previously assessed costs, not create additional sale proceeds.
 if s.environment<>'live' or s.gross_minor<=0 or s.refunded_minor<>s.gross_minor or s.tax_reversal_minor<>s.tax_minor
  or s.net_minor>0 or s.creator_minor<>0
  or not exists(select 1 from private.commerce_payable_releases prior where prior.source_type=s.source_type
   and prior.source_id=s.source_id and prior.earnings_ledger_id is not null and prior.delta_minor>0) then return false; end if;
 if s.source_type='physical_merch' then
  select * into strict o from public.merch_orders where id=s.source_id;
  select id,ob.facts into obs,facts from private.merch_provider_cost_observations ob where order_id=o.id order by created_at desc,id desc limit 1;
  if not exists(select 1 from private.merch_return_evidence e where e.id=(select id from private.merch_return_evidence where order_id=o.id order by observed_at desc,id desc limit 1)
   and e.dispute_state in('none','resolved')) then return false; end if;
  identity:=o.id;product:=o.product_id::text;mode:=o.environment;
 else
  select * into strict c from private.auction_platform_settlement_contracts where id=s.source_id;
  if not private.auction_current_financial_account_ready(c.id) or exists(select 1 from private.auction_transfer_operations where contract_id=c.id) then return false; end if;
  select id,ob.facts into obs,facts from private.auction_settlement_observations ob where contract_id=c.id order by created_at desc,id desc limit 1;
  identity:=c.quote_id;product:=c.platform_product_id;mode:=c.environment;
 end if;
 if obs is distinct from s.source_observation_id or facts->'disputed' is distinct from 'false'::jsonb
  or facts->>'balance_status' is distinct from 'available'
  or exists(select 1 from jsonb_array_elements(facts->'refunds') refund where refund->>'status' is distinct from 'available')
  or not exists(select 1 from private.commerce_cost_verification_reads r where r.source_observation_id=obs and r.verified_at>=clock_timestamp()-interval '15 minutes')
  then return false; end if;
 if not exists(select 1 from private.commerce_tax_checkout_bindings b join private.commerce_tax_qualifications q on q.id=b.policy_id
  where b.feature=s.source_type and b.identity_id=identity and b.product_id=product and b.account_id=s.account_id and b.environment=mode
   and q.enabled and q.revoked_at is null and q.verified_at<=clock_timestamp() and q.expires_at>clock_timestamp()
   and q.provider_verified_at<=clock_timestamp() and q.provider_expires_at>clock_timestamp()) then return false; end if;
 return private.commerce_tax_fee_settlement_ready(s.source_type,identity);
end; $$;
revoke all on function private.commerce_full_refund_correction_ready(private.commerce_known_cost_snapshots) from public,anon,authenticated,service_role;

do $$ declare definition text;needle text;begin
 definition:=pg_get_functiondef('public.release_commerce_known_earnings(text,uuid)'::regprocedure);
 needle:='if private.commerce_positive_release_ready(s) is distinct from true then';
 if position(needle in definition)=0 then raise exception 'commerce_positive_release_guard_changed'; end if;
 execute replace(definition,needle,'if private.commerce_positive_release_ready(s) is distinct from true and private.commerce_full_refund_correction_ready(s) is distinct from true then');
 definition:=pg_get_functiondef('private.commerce_current_earning_domain_ready(uuid)'::regprocedure);
 needle:='if r.id is null then return true; end if;';
 if position(needle in definition)=0 then raise exception 'commerce_current_domain_guard_changed'; end if;
 execute replace(definition,needle,needle||$guard$
 -- Only an already-accounted exact current snapshot may bypass historical
 -- delivery/remedy status. Outstanding debt still independently blocks cashout.
 if exists(select 1 from private.commerce_payable_releases latest join private.commerce_known_cost_snapshots s on s.id=latest.snapshot_id
  where latest.id=(select id from private.commerce_payable_releases where source_type=r.source_type and source_id=r.source_id order by created_at desc,id desc limit 1)
   and private.commerce_full_refund_correction_ready(s)) then return true; end if;
$guard$);
end $$;

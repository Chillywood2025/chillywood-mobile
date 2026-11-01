-- Known costs and credits are visible without calling them final costs. No
-- source observation or original product-share agreement is rewritten.
create function private.commerce_known_cost_projection(p_feature text,p_source uuid) returns jsonb
language sql stable set search_path='' as $$
 select coalesce((select jsonb_build_object('policyVersion','known_costs_future_unpaid_adjustments_v1',
  'snapshotId',s.id,'observedAt',s.created_at,'knownFeeMinor',s.fee_minor,'knownNetMinor',s.net_minor,
  'knownCreatorShareMinor',s.creator_minor,'knownPlatformShareMinor',s.platform_minor,'recoveryMinor',s.recovery_minor,
  'finalFees',false,'futureAdjustmentsPossible',true,
  'currentEvidence',private.commerce_tax_fee_settlement_ready(p_feature,case when p_feature='physical_merch' then p_source
   else (select quote_id from private.auction_platform_settlement_contracts where id=p_source) end),
  'released',exists(select 1 from private.commerce_payable_releases r where r.snapshot_id=s.id),
  'bankDebitAllowed',false)
  from private.commerce_known_cost_snapshots s where s.source_type=p_feature and s.source_id=p_source order by s.created_at desc,s.id desc limit 1),
  jsonb_build_object('policyVersion','known_costs_future_unpaid_adjustments_v1','knownFeeMinor',null,'knownNetMinor',null,
   'knownCreatorShareMinor',null,'finalFees',false,'futureAdjustmentsPossible',true,'currentEvidence',false,'released',false,'bankDebitAllowed',false));
$$;
revoke all on function private.commerce_known_cost_projection(text,uuid) from public,anon,authenticated,service_role;
alter function public.merch_order_projection_internal(public.merch_orders) rename to merch_order_projection_before_known_fee_policy;
revoke all on function public.merch_order_projection_before_known_fee_policy(public.merch_orders) from public,anon,authenticated,service_role;
create function public.merch_order_projection_internal(o public.merch_orders) returns jsonb
language sql stable set search_path='' as $$
 select public.merch_order_projection_before_known_fee_policy(o)||jsonb_build_object('knownCostPolicy',private.commerce_known_cost_projection('physical_merch',o.id));
$$;
revoke all on function public.merch_order_projection_internal(public.merch_orders) from public,anon,authenticated,service_role;
alter function private.creator_auction_held_projection(private.auction_platform_settlement_contracts) rename to creator_auction_held_projection_before_known_fee_policy;
revoke all on function private.creator_auction_held_projection_before_known_fee_policy(private.auction_platform_settlement_contracts) from public,anon,authenticated,service_role;
create function private.creator_auction_held_projection(c private.auction_platform_settlement_contracts) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.creator_auction_held_projection_before_known_fee_policy(c)||jsonb_build_object('knownCostPolicy',private.commerce_known_cost_projection(c.lane||'_auction',c.id));
$$;
revoke all on function private.creator_auction_held_projection(private.auction_platform_settlement_contracts) from public,anon,authenticated,service_role;

create or replace function public.get_creator_fee_policy_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); terms text:=private.commerce_known_cost_terms(); digest text; entries jsonb;
begin
 if actor is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
  or public.is_account_access_restricted(actor::text) then raise exception 'creator_fee_current_session_required'; end if;
 digest:=encode(extensions.digest(terms,'sha256'),'hex');
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'amountCents',a.amount_minor,'reason',a.reason,'createdAt',a.created_at)
  order by a.created_at desc,a.id),'[]'::jsonb) into entries from (
  select * from (
   select id,amount_minor,reason,created_at from private.commerce_creator_fee_adjustments where creator_id=actor
   union all select earnings_ledger_id,-amount_minor,'verified_fee_credit',created_at from private.creator_fee_credit_sources where creator_id=actor
   union all select r.id,-r.delta_minor,'verified_fee_credit',r.created_at from private.commerce_payable_releases r
    where r.creator_id=actor and r.delta_minor>0 and exists(select 1 from private.commerce_payable_releases old
     where old.source_type=r.source_type and old.source_id=r.source_id and (old.created_at,old.id)<(r.created_at,r.id))
  ) history order by created_at desc,id limit 100
 ) a;
 return jsonb_build_object('version','known_costs_future_unpaid_adjustments_v1','terms',terms,'termsSha256',digest,
  'accepted',exists(select 1 from private.commerce_creator_fee_acceptances where creator_id=actor and terms_sha256=digest
   and policy_version='known_costs_future_unpaid_adjustments_v1'),
  'negativeAdjustmentCents',private.creator_fee_recovery_amount(actor,'usd'),'bankDebitAllowed',false,'adjustments',entries);
end; $$;

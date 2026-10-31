-- Physical merch only: new orders freeze 90/10 NET policy. No backfill of old
-- accepted orders, no fee estimate, no payable balance or provider operation.
alter table public.merch_orders
 add column net_share_policy_version text,
 add column platform_net_share_bps integer,
 add column creator_net_share_bps integer,
 add constraint merch_net_share_terms_check check (
  (net_share_policy_version is null and platform_net_share_bps is null and creator_net_share_bps is null)
  or (num_nonnulls(net_share_policy_version,platform_net_share_bps,creator_net_share_bps)=3 and net_share_policy_version='physical_merch_net_90_10_v1' and platform_net_share_bps=1000 and creator_net_share_bps=9000));

create function public.freeze_merch_net_share_terms() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if row(new.net_share_policy_version,new.platform_net_share_bps,new.creator_net_share_bps)
    is distinct from row(old.net_share_policy_version,old.platform_net_share_bps,old.creator_net_share_bps) then
   raise exception 'merch_accepted_net_share_terms_immutable'; end if;
 elsif new.provider='stripe_physical_goods' then
  if num_nonnulls(new.net_share_policy_version,new.platform_net_share_bps,new.creator_net_share_bps)>0 and (new.net_share_policy_version is distinct from 'physical_merch_net_90_10_v1'
   or new.platform_net_share_bps is distinct from 1000 or new.creator_net_share_bps is distinct from 9000) then
   raise exception 'merch_net_share_terms_invalid'; end if;
  new.net_share_policy_version:='physical_merch_net_90_10_v1';
  new.platform_net_share_bps:=1000; new.creator_net_share_bps:=9000;
 end if;
 return new;
end;
$$;
revoke all on function public.freeze_merch_net_share_terms() from public,anon,authenticated,service_role;
create trigger freeze_merch_net_share_terms before insert or update on public.merch_orders
 for each row execute function public.freeze_merch_net_share_terms();

-- Calculation only: costs must be disjoint verified deductions from the gross
-- amount. Calling this helper is not verification, settlement or payout proof.
-- Platform share floors whole cents; creator receives the remainder.
create function public.preview_physical_merch_net_split(p_gross_minor integer,p_provider_fee_minor integer,
 p_tax_minor integer,p_refunded_minor integer,p_adjustment_minor integer)
returns jsonb language plpgsql immutable set search_path='' as $$
declare net bigint; platform_fee integer;
begin
 if p_gross_minor is null or p_gross_minor<0 then raise exception 'merch_gross_invalid'; end if;
 if p_provider_fee_minor<0 or p_tax_minor<0 or p_refunded_minor<0 or p_adjustment_minor<0 then raise exception 'merch_cost_invalid'; end if;
 if p_provider_fee_minor is null or p_tax_minor is null or p_refunded_minor is null or p_adjustment_minor is null then
  return jsonb_build_object('policyVersion','physical_merch_net_90_10_v1','platformNetShareBps',1000,'creatorNetShareBps',9000,
   'netBaseMinor',null,'platformShareMinor',null,'creatorShareMinor',null,'costsVerified',false,'financialAuthority',false); end if;
 if least(p_provider_fee_minor,p_tax_minor,p_refunded_minor,p_adjustment_minor)<0 then raise exception 'merch_cost_invalid'; end if;
 net:=p_gross_minor::bigint-p_provider_fee_minor-p_tax_minor-p_refunded_minor-p_adjustment_minor;
 if net<0 then raise exception 'merch_costs_exceed_gross'; end if;
 platform_fee:=(net*1000/10000)::integer;
 return jsonb_build_object('policyVersion','physical_merch_net_90_10_v1','platformNetShareBps',1000,'creatorNetShareBps',9000,
  'netBaseMinor',net,'platformShareMinor',platform_fee,'creatorShareMinor',net-platform_fee,
  'costsVerified',false,'financialAuthority',false);
end;
$$;
revoke all on function public.preview_physical_merch_net_split(integer,integer,integer,integer,integer) from public,anon;
grant execute on function public.preview_physical_merch_net_split(integer,integer,integer,integer,integer) to authenticated,service_role;

alter function public.merch_order_projection_internal(public.merch_orders) rename to merch_order_projection_before_net_share;
revoke all on function public.merch_order_projection_before_net_share(public.merch_orders) from public,anon,authenticated,service_role;
create function public.merch_order_projection_internal(o public.merch_orders) returns jsonb language sql stable set search_path='' as $$
 select public.merch_order_projection_before_net_share(o)||jsonb_build_object(
  'netSharePolicyVersion',o.net_share_policy_version,'platformNetShareBps',o.platform_net_share_bps,
  'creatorNetShareBps',o.creator_net_share_bps,'providerFeeMinor',null,'netBaseMinor',null,
  'platformShareMinor',null,'creatorShareMinor',null,'netSettlementStatus','unverified');
$$;
revoke all on function public.merch_order_projection_internal(public.merch_orders) from public,anon,authenticated,service_role;

alter function public.reserve_merch_checkout(uuid,integer,uuid,uuid) rename to reserve_merch_checkout_before_net_share;
revoke all on function public.reserve_merch_checkout_before_net_share(uuid,integer,uuid,uuid) from public,anon,authenticated,service_role;
create function public.reserve_merch_checkout(p_product_id uuid,p_quantity integer,p_attempt_id uuid,p_variant_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; o public.merch_orders%rowtype;
begin
 result:=public.reserve_merch_checkout_before_net_share(p_product_id,p_quantity,p_attempt_id,p_variant_id);
 select * into strict o from public.merch_orders where id=(result->>'id')::uuid;
 if o.buyer_id is distinct from auth.uid() then raise exception 'merch_order_buyer_mismatch'; end if;
 return result||jsonb_build_object('netSharePolicyVersion',o.net_share_policy_version,
 'platformNetShareBps',o.platform_net_share_bps,'creatorNetShareBps',o.creator_net_share_bps);
end;
$$;
revoke all on function public.reserve_merch_checkout(uuid,integer,uuid,uuid) from public,anon,authenticated,service_role;

-- Read projections only. The existing order, observations and ledger remain
-- the sole payment/cost authority. No new receipt, balance or entitlement.
begin;
create function private.stripe_video_purchase_history_item(p_order uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
 'id',o.id,'purchaseIntentId',null,'sourceType','paid_content','sourceId',o.video_id,
 'creatorId',o.creator_id,'productType','paid_content_access','productKey','stripe_sandbox_video',
 'title',coalesce(v.title,'Creator video'),'status',case
   when o.status='refunded' then 'refunded' when o.status='held' then 'reconciliation_required'
   when o.status='failed' then 'failed'
   when o.status='paid' and private.stripe_video_access_current(o.buyer_id,o.video_id) then 'active'
   when o.status='paid' then 'paid_unfulfilled' else 'pending' end,
 'amountMinor',o.amount_minor,'currency',o.currency,'createdAt',o.created_at,
 'purchasedAt',facts.paid_at,'startsAt',null,'expiresAt',null,
 'provider','stripe_connect','environment',o.environment,
 'destination',jsonb_build_object('kind','creator_video','id',o.video_id),
 'receipt',case when facts.paid_at is not null then jsonb_build_object(
   'providerEventId',null,'originalTransactionId',null,'verifiedAt',facts.paid_at) else null end,
 'refund',case when facts.paid_at is not null then jsonb_build_object(
   'state',case when facts.refunded=0 then 'none' when facts.refunded=o.amount_minor then 'full' else 'partial' end,
   'amountMinor',facts.refunded) else null end,
 'terms',jsonb_build_object('orderId',o.id,'priceId',o.price_id,'priceRevision',o.price_revision,
   'checkoutPlatform',o.checkout_platform,'amountMinor',o.amount_minor,'currency',o.currency),
 'termsAvailable',true,'grantsAccess',false)
 from private.stripe_paid_video_orders o left join public.videos v on v.id=o.video_id and v.owner_id=o.creator_id
 cross join lateral (select min(received_at) filter(where kind='paid') paid_at,
   coalesce(max(refund_amount_minor),0) refunded from private.stripe_paid_video_observations where order_id=o.id) facts
 where o.id=p_order
$$;
revoke all on function private.stripe_video_purchase_history_item(uuid) from public,anon,authenticated,service_role;

alter function public.read_my_creator_purchases(integer,timestamptz,uuid,text,uuid)
 rename to read_my_creator_purchases_before_stripe_video;
revoke all on function public.read_my_creator_purchases_before_stripe_video(integer,timestamptz,uuid,text,uuid)
 from public,anon,authenticated,service_role;
create function public.read_my_creator_purchases(
 p_limit integer default 50,p_before_created_at timestamptz default null,p_before_id uuid default null,
 p_source_type text default null,p_source_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare old_page jsonb; merged jsonb; last_item jsonb; more boolean; n integer:=coalesce(p_limit,50);
begin
 -- Preserve all existing caller/session, cursor/filter validation and event remedies.
 old_page:=public.read_my_creator_purchases_before_stripe_video(p_limit,p_before_created_at,p_before_id,p_source_type,p_source_id);
 if auth.uid() is null or old_page->>'userId' is distinct from auth.uid()::text
 then raise exception 'buyer_purchase_history_authority_required'; end if;
 with candidates as (
   select value item from jsonb_array_elements(old_page->'items')
   union all
   select private.stripe_video_purchase_history_item(o.id) from private.stripe_paid_video_orders o
   where o.buyer_id=auth.uid() and (p_source_type is null or (p_source_type='paid_content' and p_source_id=o.video_id))
     and (p_before_created_at is null or (o.created_at,o.id)<(p_before_created_at,p_before_id))
 ), ordered as (select item from candidates order by (item->>'createdAt')::timestamptz desc,(item->>'id')::uuid desc limit n+1)
 select coalesce(jsonb_agg(item order by (item->>'createdAt')::timestamptz desc,(item->>'id')::uuid desc),'[]'::jsonb) into merged from ordered;
 more:=jsonb_array_length(merged)>n or old_page->'nextCursor'<>'null'::jsonb;
 if jsonb_array_length(merged)>n then merged:=merged-n; end if;
 last_item:=merged->(jsonb_array_length(merged)-1);
 return old_page||jsonb_build_object('items',merged,'nextCursor',case when more and last_item is not null then
   jsonb_build_object('createdAt',last_item->'createdAt','id',last_item->'id') else null end);
end $$;
revoke all on function public.read_my_creator_purchases(integer,timestamptz,uuid,text,uuid) from public,anon,service_role;
grant execute on function public.read_my_creator_purchases(integer,timestamptz,uuid,text,uuid) to authenticated;

create or replace function public.list_my_paid_video_transactions(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n integer:=least(greatest(coalesce(p_limit,50),1),100); result jsonb;
begin
 if auth.uid() is null or not coalesce(public.wave1_current_caller_authority_internal(),false)
   or coalesce(public.is_account_access_restricted(auth.uid()::text),true)
 then raise exception 'monetization_session_authority_required'; end if;
 with rows as (
   -- Retain historical receipts exactly, but do not render Stripe gross,
   -- refund and cost adjustments as three separate customer purchases.
   select jsonb_build_object('id',l.id,'providerEventId',l.provider_event_id,'videoId',l.source_id,
     'videoTitle',coalesce(v.title,'Creator video'),'fanId',l.user_id,'creatorId',l.creator_id,
     'amountCents',l.amount_minor,'currency',l.currency,'provider',coalesce(e.provider,'revenuecat_google_play'),
     'providerProductId',e.metadata->>'provider_product_id','status',case when l.payable_state='refunded' then 'refunded'
       when l.payable_state in ('reversed','chargeback') then l.payable_state when l.status='sandbox_only' then 'paid' else l.status end,
     'payoutStatus',l.payable_state,'environment',l.environment,'createdAt',l.created_at,'paidAt',l.created_at) item
   from public.money_access_ledger_events l left join public.videos v on v.id=l.source_id
   left join public.provider_events e on e.id=l.provider_event_id
   where l.creator_id=auth.uid() and l.source_type='paid_content' and not coalesce(l.metadata ? 'stripe_video_order_id',false)
   union all
   select jsonb_build_object('id',o.id,'providerEventId',null,'videoId',o.video_id,
     'videoTitle',p.item->>'title','fanId',o.buyer_id,'creatorId',o.creator_id,'amountCents',o.amount_minor,
     'currency',o.currency,'provider','stripe_connect','providerProductId',null,'status',o.status,
     'payoutStatus','not_payable','environment',o.environment,'createdAt',o.created_at,'paidAt',p.item->'purchasedAt',
     'refund',p.item->'refund')
   from private.stripe_paid_video_orders o cross join lateral (select private.stripe_video_purchase_history_item(o.id) item) p
   where o.creator_id=auth.uid()
 ), limited as (select item from rows order by (item->>'createdAt')::timestamptz desc,(item->>'id')::uuid desc limit n)
 select coalesce(jsonb_agg(item order by (item->>'createdAt')::timestamptz desc,(item->>'id')::uuid desc),'[]'::jsonb) into result from limited;
 return result;
end $$;
revoke all on function public.list_my_paid_video_transactions(integer) from public,anon;
grant execute on function public.list_my_paid_video_transactions(integer) to authenticated,service_role;
commit;

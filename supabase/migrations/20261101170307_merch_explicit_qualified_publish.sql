-- Explicit creator-reviewed live publication. No activation or qualification seeds.
alter table public.merch_products add column publication_revision bigint not null default 1;
create function private.merch_publication_revision() returns trigger language plpgsql set search_path='' as $$
begin new.publication_revision:=old.publication_revision+1;return new;end $$;
create trigger merch_publication_revision before update on public.merch_products for each row execute function private.merch_publication_revision();
revoke all on function private.merch_publication_revision() from public,anon,authenticated,service_role;
create sequence private.merch_publish_authority_epoch;
revoke all on sequence private.merch_publish_authority_epoch from public,anon,authenticated,service_role;
create function private.merch_publish_authority_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin perform nextval('private.merch_publish_authority_epoch');return null;end $$;
revoke all on function private.merch_publish_authority_changed() from public,anon,authenticated,service_role;
do $$declare t text;begin foreach t in array array['public.creator_payout_accounts','public.creator_payout_eligibility_records','public.platform_money_kill_switches','public.provider_readiness_status','private.merch_live_checkout_qualifications','private.commerce_tax_qualifications'] loop
 execute format('create trigger merch_publish_authority_changed after insert or update or delete on %s for each statement execute function private.merch_publish_authority_changed()',t);
end loop;end $$;
create table private.merch_publication_reviews(
 id uuid primary key default extensions.gen_random_uuid(),product_id uuid not null references public.merch_products(id),creator_id uuid not null,
 session_id uuid not null,revision bigint not null,authority_epoch bigint not null,authority jsonb not null,
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '10 minutes'
);
alter table private.merch_publication_reviews enable row level security;
alter table private.merch_publication_reviews force row level security;
revoke all on private.merch_publication_reviews from public,anon,authenticated,service_role;
create trigger merch_publication_reviews_immutable before update or delete on private.merch_publication_reviews for each row execute function private.platform_brand_retention_immutable();
create table private.merch_publication_receipts(review_id uuid primary key references private.merch_publication_reviews(id),product_id uuid not null,
 creator_id uuid not null,published_revision bigint not null,created_at timestamptz not null default clock_timestamp());
alter table private.merch_publication_receipts enable row level security;
alter table private.merch_publication_receipts force row level security;
revoke all on private.merch_publication_receipts from public,anon,authenticated,service_role;
create trigger merch_publication_receipts_immutable before update or delete on private.merch_publication_receipts for each row execute function private.platform_brand_retention_immutable();

create function private.merch_live_publication_authority(p public.merch_products) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.creator_payout_accounts;e public.creator_payout_eligibility_records;q private.commerce_tax_qualifications;platform_account text;photo jsonb;
begin
 if p.photo_asset_id is not null then
  perform 1 from public.platform_brand_assets where id=p.photo_asset_id for share nowait;
  if public.merch_product_projection_internal(p)->>'photoStatus' is distinct from 'ready' then
   return jsonb_build_object('ready',false,'reason','Finish the photo safety scan and approve this photo for display before publishing.');end if;
  select jsonb_build_object('id',id,'updatedAt',updated_at,'state',asset_state) into photo from public.platform_brand_assets where id=p.photo_asset_id;
 end if;
 -- Table SHARE freezes qualification membership as well as selected rows. It
 -- prevents an A->B->A change or a new latest policy racing confirmation.
 lock table public.creator_payout_accounts,public.creator_payout_eligibility_records,public.platform_money_kill_switches,
 public.provider_readiness_status,private.merch_live_checkout_qualifications,private.commerce_tax_qualifications in share mode;
 if not private.merch_live_checkout_ready() then return jsonb_build_object('ready',false,'reason','Live sales are not enabled or platform shipping/legal verification is incomplete.');end if;
 select * into a from public.creator_payout_accounts where creator_user_id=p.creator_id::text and provider='stripe_connect' and provider_environment='live';
 select * into e from public.creator_payout_eligibility_records where payout_account_id=a.id;
 if a.id is null or e.payout_account_id is null or a.provider_configuration_status is distinct from 'match'
  or a.provider_configuration_account_id is distinct from a.provider_account_id or a.payouts_enabled is distinct from true
  or a.provider_configuration_observed_at is null or a.provider_configuration_observed_at<clock_timestamp()-interval '15 minutes' or a.provider_configuration_observed_at>clock_timestamp()
  or e.provider_ready is distinct from true or e.kyc_ready is distinct from true or e.payout_account_ready is distinct from true
  or e.fraud_hold_active is distinct from false or e.admin_review_status in('pending_review','rejected','on_hold') or e.eligibility_status='on_hold'
 then return jsonb_build_object('ready',false,'reason','Complete and verify your live Stripe payout account before publishing for real purchases.');end if;
 select * into q from private.commerce_tax_qualifications where feature='physical_merch' and product_id=p.id::text and environment='production'
 order by verified_at desc,id desc limit 1;
 platform_account:=q.account_id;
 if q.id is null or a.provider_live_observation->>'platformAccountId' is distinct from platform_account or not private.merch_live_checkout_ready(platform_account) or not q.enabled or q.revoked_at is not null
  or q.verified_at>clock_timestamp() or q.expires_at is null or q.expires_at<=clock_timestamp()
  or q.tax_behavior is distinct from 'inclusive' or not q.full_permitted_scope_reviewed or q.permitted_scope<>'US_all_destinations'
  or nullif(btrim(q.professional_basis_reference),'') is null or nullif(btrim(q.coverage_evidence_reference),'') is null
  or q.collection_mode is null or q.collection_mode='store_handled' or q.liability_type is null or q.tax_code is null
  or nullif(btrim(q.provider_settings_evidence_reference),'') is null or nullif(btrim(q.provider_product_evidence_reference),'') is null
  or q.provider_verified_at is null or q.provider_verified_at>clock_timestamp() or q.provider_expires_at is null or q.provider_expires_at<=clock_timestamp()
  or (q.collection_mode='automatic' and nullif(btrim(q.registration_evidence_reference),'') is null)
  or (q.collection_mode='verified_no_collection' and nullif(btrim(q.no_collection_basis_reference),'') is null)
 then return jsonb_build_object('ready',false,'reason','This product needs current tax coverage and provider verification for US shipping destinations.');end if;
 return jsonb_build_object('ready',true,'accountId',a.id,'recipientAccount',a.provider_account_id,'platformAccount',platform_account,'taxPolicy',q.id,'photo',photo);
end $$;
revoke all on function private.merch_live_publication_authority(public.merch_products) from public,anon,authenticated,service_role;

create function public.review_creator_merch_live_publication(p_product_id uuid,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.merch_products;r private.merch_publication_reviews;authority jsonb;epoch bigint;
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'merch_current_session_required';end if;
 perform public.wave1_assert_current_creator_money_authority_internal();
 perform private.platform_brand_retention_lock();
 perform pg_advisory_xact_lock(hashtextextended('merch_product:'||p_product_id,0));
 select * into p from public.merch_products where id=p_product_id and creator_id=auth.uid() for update;
 if p.id is null then raise exception 'merch_product_not_found';end if;
 if p.updated_at is distinct from p_expected_updated_at or p_expected_updated_at is null then raise exception 'merch_product_changed_reload';end if;
 if p.environment='sandbox' and exists(select 1 from public.merch_orders where product_id=p.id) then
  return jsonb_build_object('ready',false,'copyRequired',true,'reason','This test listing has order history. Create a new draft copy to keep test orders and inventory separate.');end if;
 if p.shipping_tracking_mode is null or p.price_minor<=0 or p.stock_quantity<=p.reserved_quantity then
  return jsonb_build_object('ready',false,'reason','Choose shipping tracking, a positive price, and available stock before review.');end if;
 authority:=private.merch_live_publication_authority(p);
 if authority->>'ready'<>'true' then return authority;end if;
 select last_value into epoch from private.merch_publish_authority_epoch;
 insert into private.merch_publication_reviews(product_id,creator_id,session_id,revision,authority_epoch,authority)
 values(p.id,auth.uid(),(auth.jwt()->>'session_id')::uuid,p.publication_revision,epoch,authority) returning * into r;
 return jsonb_build_object('ready',true,'reviewId',r.id,'productId',p.id,'title',p.title,'priceMinor',p.price_minor,'currency',p.currency,
  'availableQuantity',p.stock_quantity-p.reserved_quantity,'trackingMode',p.shipping_tracking_mode,'expiresAt',r.expires_at,'environment','production',
  'summary','Publish for real purchases. You fulfill orders. Buyers receive the 30-day return policy; your earnings are net of fees and later verified adjustments apply only to future unpaid earnings.');
end $$;

create table private.merch_publication_confirmation_context(transaction_id bigint not null,product_id uuid not null,primary key(transaction_id,product_id));
alter table private.merch_publication_confirmation_context enable row level security;
alter table private.merch_publication_confirmation_context force row level security;
revoke all on private.merch_publication_confirmation_context from public,anon,authenticated,service_role;

create function public.confirm_creator_merch_live_publication(p_review_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.merch_publication_reviews;p public.merch_products;authority jsonb;epoch bigint;receipt private.merch_publication_receipts;
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'merch_current_session_required';end if;
 perform public.wave1_assert_current_creator_money_authority_internal();
 select * into r from private.merch_publication_reviews where id=p_review_id and creator_id=auth.uid() and session_id=(auth.jwt()->>'session_id')::uuid;
 if r.id is null then raise exception 'merch_publish_review_required';end if;
 perform private.platform_brand_retention_lock();
 perform pg_advisory_xact_lock(hashtextextended('merch_product:'||r.product_id,0));
 select * into p from public.merch_products where id=r.product_id and creator_id=auth.uid() for update;
 select * into receipt from private.merch_publication_receipts where review_id=r.id;
 if receipt.review_id is not null then return public.merch_product_projection_internal(p);end if;
 if r.expires_at<=clock_timestamp() or p.publication_revision<>r.revision then raise exception 'merch_publish_review_changed';end if;
 if p.environment='sandbox' and exists(select 1 from public.merch_orders where product_id=p.id) then raise exception 'merch_publish_history_requires_copy';end if;
 authority:=private.merch_live_publication_authority(p);
 select last_value into epoch from private.merch_publish_authority_epoch;
 if authority->>'ready'<>'true' or authority is distinct from r.authority or epoch<>r.authority_epoch then raise exception 'merch_publish_eligibility_changed';end if;
 -- Reuse the existing publication/photo/variant/rights checks before changing
 -- mode. Any failure rolls the entire publication transaction back.
 insert into private.merch_publication_confirmation_context values(txid_current(),p.id);
 perform public.save_creator_merch_product_with_tracking(p.id,p.title,p.description,p.image_url,p.price_minor,p.stock_quantity,'published',p.updated_at,p.shipping_tracking_mode);
 update public.merch_products set environment='production',status='active',updated_at=clock_timestamp() where id=p.id returning * into p;
 delete from private.merch_publication_confirmation_context where transaction_id=txid_current() and product_id=p.id;
 insert into private.merch_publication_receipts(review_id,product_id,creator_id,published_revision) values(r.id,p.id,auth.uid(),p.publication_revision);
 return public.merch_product_projection_internal(p);
end $$;
revoke all on function public.review_creator_merch_live_publication(uuid,timestamptz),public.confirm_creator_merch_live_publication(uuid) from public,anon,authenticated,service_role;
grant execute on function public.review_creator_merch_live_publication(uuid,timestamptz),public.confirm_creator_merch_live_publication(uuid) to authenticated;

create function public.copy_creator_merch_live_draft(p_product_id uuid,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.merch_products;fresh uuid:=extensions.gen_random_uuid();result jsonb;options jsonb;
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'merch_current_session_required';end if;
 perform public.wave1_assert_current_creator_money_authority_internal();
 perform private.platform_brand_retention_lock();
 perform pg_advisory_xact_lock(hashtextextended('merch_product:'||p_product_id,0));
 select * into p from public.merch_products where id=p_product_id and creator_id=auth.uid() for update;
 if p.id is null or p.environment<>'sandbox' then raise exception 'merch_test_copy_required';end if;
 if p_expected_updated_at is null or p.updated_at is distinct from p_expected_updated_at then raise exception 'merch_product_changed_reload';end if;
 result:=public.save_creator_merch_product_with_tracking(fresh,p.title,p.description,null,p.price_minor,greatest(0,p.stock_quantity-p.reserved_quantity),'draft',null,p.shipping_tracking_mode);
 if p.variant_mode='options' then
  select jsonb_agg(jsonb_build_object('id',extensions.gen_random_uuid(),'sku',sku,'size',size,'color',color,'stockQuantity',greatest(0,stock_quantity-reserved_quantity),'status',status) order by id)
   into options from public.merch_product_variants where product_id=p.id;
  result:=public.configure_creator_merch_variants(fresh,'options',options,(result->>'updatedAt')::timestamptz);
 end if;
 -- No photo reference, provider/tax authority, order or inventory identity is
 -- copied. Original history and publication are deliberately unchanged.
 return result;
end $$;
revoke all on function public.copy_creator_merch_live_draft(uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.copy_creator_merch_live_draft(uuid,timestamptz) to authenticated;

do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('public.list_creator_merch_products(uuid,boolean,uuid,integer)'::regprocedure);
 needle:='and environment in(''sandbox'',''production'') and (p_manage or publication_status=''published'')';
 if position(needle in definition)=0 then raise exception 'merch_listing_filter_changed';end if;
 execute replace(definition,needle,needle||' and (p_manage or environment=''production'' or creator_id=auth.uid() or public.has_platform_role(array[''owner'',''operator'']) or public.has_active_beta_access())');
end $$;
-- Newly reviewed live listings retain current creator/account/tax readiness at
-- reservation, not merely the platform-wide launch qualification.
do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('public.reserve_merch_checkout_before_net_share(uuid,integer,uuid,uuid)'::regprocedure);
 needle:='if p.environment=''production'' then perform private.assert_merch_live_checkout(); end if;';
 if position(needle in definition)=0 then raise exception 'merch_reservation_mode_guard_changed';end if;
 execute replace(definition,needle,needle||$guard$
 if p.environment='production' and exists(select 1 from private.merch_publication_receipts where product_id=p.id)
  and private.merch_live_publication_authority(p)->>'ready' is distinct from 'true'
 then raise exception 'merch_publish_eligibility_changed';end if;
$guard$);
end $$;

-- Old clients may pause/edit existing live products but cannot republish a
-- paused/draft live product without the explicit reviewed transition.
do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('public.save_creator_merch_product_before_variants(uuid,text,text,text,integer,integer,text,timestamptz)'::regprocedure);
 needle:='if p_publication_status=''published'' then perform public.wave1_assert_current_creator_money_authority_internal(); end if;';
 if position(needle in definition)=0 then raise exception 'merch_publish_writer_changed';end if;
 execute replace(definition,needle,needle||$guard$
 if p_publication_status='published' and exists(select 1 from public.merch_products where id=p_product_id and environment='production' and publication_status<>'published')
  and not exists(select 1 from private.merch_publication_confirmation_context where transaction_id=txid_current() and product_id=p_product_id)
 then raise exception 'merch_publish_review_required';end if;
$guard$);
end $$;

begin;
-- A separate test-only capability never upgrades unknown compliance to VERIFIED.
-- Existing one-argument live/financial predicates are intentionally unchanged.
create function private.ordinary_creator_subject_for_mode(p_creator uuid,p_environment text) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from auth.sessions session_row where session_row.user_id=p_creator
  and (session_row.not_after is null or session_row.not_after>clock_timestamp()))
 and case when p_environment='production' then
  public.wave1_creator_money_subject_authorized_internal(p_creator)
  and private.ordinary_commerce_premium_current(p_creator,'production')
  and private.ordinary_creator_provider_ready(p_creator,'production')
 when p_environment='sandbox' then
  private.ordinary_commerce_premium_current(p_creator,'sandbox')
  and not public.is_account_access_restricted(p_creator::text)
  and exists(select 1 from public.platform_money_kill_switches where key='live_money_enabled' and state='off')
  and exists(select 1 from public.platform_money_kill_switches where key='payouts_enabled' and state='off')
  and exists(select 1 from public.platform_money_kill_switches where key='cashout_enabled' and state='off')
  and public.wave1_user_has_active_legal_requirements_internal(p_creator,'creator_money')
  and exists(select 1 from public.wave1_creator_eligibility e where e.creator_user_id=p_creator
   and e.state in ('PENDING_VERIFICATION','VERIFIED') and e.account_status='ACTIVE'
   and e.age_18_plus is true and e.market='UNITED_STATES' and e.moderation_state='CLEAR'
   and e.creator_role is true and e.legal_accepted is true and e.platform_capability is true
   and e.rollout_eligible is true
   and e.provider_eligible is not false and e.kyc_complete is not false
   and e.tax_complete is not false and e.sanctions_clear is not false and e.payout_eligible is not false)
  and not exists(select 1 from public.creator_payout_eligibility_records e where e.creator_user_id=p_creator::text
   and (e.fraud_hold_active or e.admin_review_status in ('pending_review','rejected','on_hold') or e.eligibility_status='on_hold'))
  and not exists(select 1 from public.creator_payout_accounts a where a.creator_user_id=p_creator::text
   and a.provider_environment='test' and (nullif(btrim(a.disabled_reason),'') is not null
    or a.status in ('restricted','rejected','disabled')))
 else false end;
$$;
revoke all on function private.ordinary_creator_subject_for_mode(uuid,text) from public,anon,authenticated,service_role;
create function private.assert_current_creator_for_mode(p_environment text) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid uuid;
begin
 if p_environment='production' then
  u:=public.wave1_assert_current_creator_money_authority_internal();
  if private.ordinary_creator_subject_for_mode(u,'production') is not true then
   raise exception 'creator_eligibility_required' using errcode='42501'; end if;
  return u;
 end if;
 if p_environment is distinct from 'sandbox' or auth.role() is distinct from 'authenticated'
  or coalesce(auth.jwt()->>'session_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 then raise exception 'creator_session_authority_required' using errcode='42501'; end if;
 sid:=(auth.jwt()->>'session_id')::uuid;
 perform private.lock_ordinary_creator_subject(u,sid,'sandbox');
 perform private.refresh_ordinary_creator_eligibility(u);
 if private.ordinary_commerce_subject_current(u,sid,'sandbox') is not true
  or private.ordinary_creator_subject_for_mode(u,'sandbox') is not true then
  raise exception 'creator_sandbox_authority_required' using errcode='42501'; end if;
 return u;
end $$;
revoke all on function private.assert_current_creator_for_mode(text) from public,anon,authenticated,service_role;

-- Existing paid-order fulfillment and support are historical obligations,
-- not a fresh creator sale. Keep the exact current actor/session/account gate
-- without requiring a renewed creator membership or today's payment mode.
create function private.ordinary_historical_creator_current(p_creator uuid,p_environment text) returns boolean
language sql volatile security definer set search_path='' as $$
 select auth.role()='authenticated' and p_creator=auth.uid()
  and private.ordinary_commerce_buyer_current(p_creator,
   case when coalesce(auth.jwt()->>'session_id','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then (auth.jwt()->>'session_id')::uuid end,p_environment);
$$;
revoke all on function private.ordinary_historical_creator_current(uuid,text) from public,anon,authenticated,service_role;

-- Keep the live decision and evidence intact. This is test tool admission only.
alter function public.wave1_creator_eligibility_readback() rename to wave1_creator_eligibility_readback_pre_sandbox_capability;
revoke all on function public.wave1_creator_eligibility_readback_pre_sandbox_capability() from public,anon,authenticated,service_role;
create function public.wave1_creator_eligibility_readback() returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; sid uuid; permitted boolean:=false;
begin
 r:=public.wave1_creator_eligibility_readback_pre_sandbox_capability();
 if coalesce(auth.jwt()->>'session_id','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
  sid:=(auth.jwt()->>'session_id')::uuid;
  permitted:=auth.role()='authenticated' and private.ordinary_commerce_subject_current(auth.uid(),sid,'sandbox')
   and private.ordinary_creator_subject_for_mode(auth.uid(),'sandbox');
 end if;
 return r||jsonb_build_object('sandboxCapability',jsonb_build_object('environment','sandbox',
  'financialAuthority',false,'canUseCreatorTools',coalesce(permitted,false)));
end $$;
revoke all on function public.wave1_creator_eligibility_readback() from public,anon,authenticated,service_role;
grant execute on function public.wave1_creator_eligibility_readback() to authenticated;

-- tracking wrapper global latch before existing product lock
do $patch$ declare d text; n text:=$needle$begin
$needle$; begin
 d:=pg_get_functiondef('public.save_creator_merch_product_with_tracking'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: tracking wrapper global latch before existing product lock'; end if;
 execute replace(d,n,$replacement$begin
 perform private.platform_brand_retention_lock();
$replacement$);
end $patch$;

-- merch environment declaration
do $patch$ declare d text; n text:=$needle$declare v_product public.merch_products%rowtype; v_user uuid;$needle$; begin
 d:=pg_get_functiondef('public.save_creator_merch_product_before_variants'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: merch environment declaration'; end if;
 execute replace(d,n,$replacement$declare v_product public.merch_products%rowtype; v_user uuid; authority_environment text;$replacement$);
end $patch$;

-- merch current mode before product locks
do $patch$ declare d text; n text:=$needle$ if p_publication_status='published' then perform public.wave1_assert_current_creator_money_authority_internal(); end if;$needle$; begin
 d:=pg_get_functiondef('public.save_creator_merch_product_before_variants'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: merch current mode before product locks'; end if;
 execute replace(d,n,$replacement$ select environment into authority_environment from public.merch_products where id=p_product_id;
 authority_environment:=coalesce(authority_environment,'sandbox');
 if p_publication_status='published' then perform private.assert_current_creator_for_mode(authority_environment); end if;$replacement$);
end $patch$;

-- merch exact mode after wait
do $patch$ declare d text; n text:=$needle$ select * into v_product from public.merch_products where id=p_product_id for update;$needle$; begin
 d:=pg_get_functiondef('public.save_creator_merch_product_before_variants'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: merch exact mode after wait'; end if;
 execute replace(d,n,$replacement$ select * into v_product from public.merch_products where id=p_product_id for update;
 if v_product.id is not null and v_product.environment is distinct from authority_environment then
  raise exception 'merch_mode_changed_reload' using errcode='40001'; end if;$replacement$);
end $patch$;

-- public.configure_creator_merch_variants_before_photo_lock
do $patch$ declare d text; n text:=$needle$public.wave1_assert_current_creator_money_authority_internal()$needle$; begin
 d:=pg_get_functiondef('public.configure_creator_merch_variants_before_photo_lock'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.configure_creator_merch_variants_before_photo_lock'; end if;
 execute replace(d,n,$replacement$private.assert_current_creator_for_mode(p.environment)$replacement$);
end $patch$;

-- public.assign_merch_product_photo
do $patch$ declare d text; n text:=$needle$public.wave1_assert_current_creator_money_authority_internal()$needle$; begin
 d:=pg_get_functiondef('public.assign_merch_product_photo'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.assign_merch_product_photo'; end if;
 execute replace(d,n,$replacement$private.assert_current_creator_for_mode(p.environment)$replacement$);
end $patch$;

-- public.approve_creator_merch_photo
do $patch$ declare d text; n text:=$needle$public.wave1_assert_current_creator_money_authority_internal()$needle$; begin
 d:=pg_get_functiondef('public.approve_creator_merch_photo'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.approve_creator_merch_photo'; end if;
 execute replace(d,n,$replacement$private.assert_current_creator_for_mode(p.environment)$replacement$);
end $patch$;

-- public.set_creator_channel_subscription_offer_at_price
do $patch$ declare d text; n text:=$needle$public.wave1_assert_current_creator_money_authority_internal()$needle$; begin
 d:=pg_get_functiondef('public.set_creator_channel_subscription_offer_at_price'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.set_creator_channel_subscription_offer_at_price'; end if;
 execute replace(d,n,$replacement$private.assert_current_creator_for_mode('sandbox')$replacement$);
end $patch$;

-- public.set_creator_channel_subscription_offer_at_price_pre_binding
do $patch$ declare d text; n text:=$needle$public.wave1_assert_current_creator_money_authority_internal()$needle$; begin
 d:=pg_get_functiondef('public.set_creator_channel_subscription_offer_at_price_pre_binding'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.set_creator_channel_subscription_offer_at_price_pre_binding'; end if;
 execute replace(d,n,$replacement$private.assert_current_creator_for_mode('sandbox')$replacement$);
end $patch$;

-- public.set_creator_vip_pass_offer_at_price
do $patch$ declare d text; n text:=$needle$public.wave1_assert_current_creator_money_authority_internal()$needle$; begin
 d:=pg_get_functiondef('public.set_creator_vip_pass_offer_at_price'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.set_creator_vip_pass_offer_at_price'; end if;
 execute replace(d,n,$replacement$private.assert_current_creator_for_mode('sandbox')$replacement$);
end $patch$;

-- public.set_creator_content_price_pre_finite_paid_video_tier
do $patch$ declare d text; n text:=$needle$public."wave1_assert_current_creator_money_authority_internal"()$needle$; begin
 d:=pg_get_functiondef('public.set_creator_content_price_pre_finite_paid_video_tier'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.set_creator_content_price_pre_finite_paid_video_tier'; end if;
 execute replace(d,n,$replacement$private.assert_current_creator_for_mode('sandbox')$replacement$);
end $patch$;

-- public.set_my_live_watch_party_offer
do $patch$ declare d text; n text:=$needle$public."wave1_assert_current_creator_money_authority_internal"()$needle$; begin
 d:=pg_get_functiondef('public.set_my_live_watch_party_offer'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.set_my_live_watch_party_offer'; end if;
 execute replace(d,n,$replacement$private.assert_current_creator_for_mode('sandbox')$replacement$);
end $patch$;

-- public.request_creator_channel_subscription_price
do $patch$ declare d text; n text:=$needle$public.wave1_assert_current_creator_money_authority_internal()$needle$; begin
 d:=pg_get_functiondef('public.request_creator_channel_subscription_price'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.request_creator_channel_subscription_price'; end if;
 execute replace(d,n,$replacement$private.assert_current_creator_for_mode('sandbox')$replacement$);
end $patch$;

-- public.set_creator_channel_subscription_offer
do $patch$ declare d text; n text:=$needle$public."wave1_assert_current_creator_money_authority_internal"()$needle$; begin
 d:=pg_get_functiondef('public.set_creator_channel_subscription_offer'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.set_creator_channel_subscription_offer'; end if;
 execute replace(d,n,$replacement$private.assert_current_creator_for_mode(case when lower(trim(coalesce(p_status,'sandbox'))) in ('draft','sandbox') then 'sandbox' else 'production' end)$replacement$);
end $patch$;

-- public.set_creator_vip_pass_offer
do $patch$ declare d text; n text:=$needle$public."wave1_assert_current_creator_money_authority_internal"()$needle$; begin
 d:=pg_get_functiondef('public.set_creator_vip_pass_offer'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.set_creator_vip_pass_offer'; end if;
 execute replace(d,n,$replacement$private.assert_current_creator_for_mode(case when lower(trim(coalesce(p_status,'sandbox'))) in ('draft','sandbox') then 'sandbox' else 'production' end)$replacement$);
end $patch$;

-- public.set_paid_creator_event_offer
do $patch$ declare d text; n text:=$needle$public."wave1_assert_current_creator_money_authority_internal"()$needle$; begin
 d:=pg_get_functiondef('public.set_paid_creator_event_offer'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.set_paid_creator_event_offer'; end if;
 execute replace(d,n,$replacement$private.assert_current_creator_for_mode(case when lower(trim(coalesce(p_status,'sandbox'))) in ('draft','sandbox') then 'sandbox' else 'production' end)$replacement$);
end $patch$;

-- public.set_paid_watch_party_offer
do $patch$ declare d text; n text:=$needle$public."wave1_assert_current_creator_money_authority_internal"()$needle$; begin
 d:=pg_get_functiondef('public.set_paid_watch_party_offer'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.set_paid_watch_party_offer'; end if;
 execute replace(d,n,$replacement$private.assert_current_creator_for_mode(case when v_status='sandbox' then 'sandbox' else 'production' end)$replacement$);
end $patch$;

-- public.save_creator_sandbox_monetization_config
do $patch$ declare d text; n text:=$needle$public."wave1_creator_money_subject_authorized_internal"(auth.uid())$needle$; begin
 d:=pg_get_functiondef('public.save_creator_sandbox_monetization_config'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.save_creator_sandbox_monetization_config'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(auth.uid(),'sandbox')$replacement$);
end $patch$;

-- public.save_creator_sandbox_monetization_config_pre_adversarial_integr
do $patch$ declare d text; n text:=$needle$public."wave1_creator_money_subject_authorized_internal"(auth.uid())$needle$; begin
 d:=pg_get_functiondef('public.save_creator_sandbox_monetization_config_pre_adversarial_integr'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.save_creator_sandbox_monetization_config_pre_adversarial_integr'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(auth.uid(),'sandbox')$replacement$);
end $patch$;

-- sandbox creator configuration no manual grant
do $patch$ declare d text; n text:=$needle$public.has_platform_role(array['owner'::text, 'operator'::text])
    or public.has_active_beta_access()$needle$; begin
 d:=pg_get_functiondef('public.save_creator_sandbox_monetization_config_pre_integrity_closeout'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: sandbox creator configuration no manual grant'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(auth.uid(),'sandbox')$replacement$);
end $patch$;

create or replace function public.wave1_enforce_creator_money_exposure() returns trigger
language plpgsql security definer set search_path='' as $$
declare mode text;
begin
 if (tg_op='UPDATE' and tg_table_name='creator_monetization_configs' and new.status in ('disabled','revoked'))
  or (tg_table_name='money_purchase_intents' and new.creator_id is null) then return new; end if;
 if tg_table_name in ('creator_monetization_configs','money_purchase_intents') then mode:=new.environment;
 elsif tg_table_name='creator_tip_transactions' then
  mode:=case new.provider_environment when 'test' then 'sandbox' when 'live' then 'production' end;
 else raise exception 'creator_exposure_mode_unrecognized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('wave1-creator:'||new.creator_id::text,0));
 if private.ordinary_creator_subject_for_mode(new.creator_id,mode) is not true then
  raise exception 'creator_eligibility_required' using errcode='42501'; end if;
 return new;
end $$;

create function public.merch_seller_ready_internal(p_creator_id uuid,p_environment text) returns boolean
language sql volatile security definer set search_path='' as $$
 select private.ordinary_creator_subject_for_mode(p_creator_id,p_environment)
$$;
revoke all on function public.merch_seller_ready_internal(uuid,text) from public,anon,authenticated,service_role;

-- public.reserve_merch_checkout_before_net_share
do $patch$ declare d text; n text:=$needle$public.merch_seller_ready_internal(p.creator_id)$needle$; begin
 d:=pg_get_functiondef('public.reserve_merch_checkout_before_net_share'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.reserve_merch_checkout_before_net_share'; end if;
 execute replace(d,n,$replacement$public.merch_seller_ready_internal(p.creator_id,p.environment)$replacement$);
end $patch$;

-- public.merch_product_projection_before_variants
do $patch$ declare d text; n text:=$needle$public.merch_seller_ready_internal(p.creator_id)$needle$; begin
 d:=pg_get_functiondef('public.merch_product_projection_before_variants'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.merch_product_projection_before_variants'; end if;
 execute replace(d,n,$replacement$public.merch_seller_ready_internal(p.creator_id,p.environment)$replacement$);
end $patch$;

-- public.merch_order_projection_before_variants
do $patch$ declare d text; n text:=$needle$public.merch_seller_ready_internal(o.creator_id)$needle$; begin
 d:=pg_get_functiondef('public.merch_order_projection_before_variants'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.merch_order_projection_before_variants'; end if;
 execute replace(d,n,$replacement$public.merch_seller_ready_internal(o.creator_id,o.environment)$replacement$);
end $patch$;

-- public.transition_merch_checkout_dispatch
do $patch$ declare d text; n text:=$needle$public.merch_seller_ready_internal(o.creator_id)$needle$; begin
 d:=pg_get_functiondef('public.transition_merch_checkout_dispatch'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.transition_merch_checkout_dispatch'; end if;
 execute replace(d,n,$replacement$public.merch_seller_ready_internal(o.creator_id,o.environment)$replacement$);
end $patch$;

-- public.begin_creator_money_checkout
do $patch$ declare d text; n text:=$needle$public.wave1_creator_money_subject_authorized_internal(i.creator_id)$needle$; begin
 d:=pg_get_functiondef('public.begin_creator_money_checkout'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.begin_creator_money_checkout'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(i.creator_id,i.environment)$replacement$);
end $patch$;

-- public.creator_video_paid_precharge_authority_internal
do $patch$ declare d text; n text:=$needle$public."wave1_creator_money_subject_authorized_internal"(v_owner_id)$needle$; begin
 d:=pg_get_functiondef('public.creator_video_paid_precharge_authority_internal'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.creator_video_paid_precharge_authority_internal'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(v_owner_id,p_expected_environment)$replacement$);
end $patch$;

-- public.create_ios_creator_money_purchase_intent_pre_specialized_routin
do $patch$ declare d text; n text:=$needle$public."wave1_creator_money_subject_authorized_internal"(v_creator)$needle$; begin
 d:=pg_get_functiondef('public.create_ios_creator_money_purchase_intent_pre_specialized_routin'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.create_ios_creator_money_purchase_intent_pre_specialized_routin'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(v_creator,v_environment)$replacement$);
end $patch$;

-- public.create_ios_creator_money_purchase_intent_pre_protected_video_cl
do $patch$ declare d text; n text:=$needle$public."wave1_creator_money_subject_authorized_internal"(v_creator)$needle$; begin
 d:=pg_get_functiondef('public.create_ios_creator_money_purchase_intent_pre_protected_video_cl'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.create_ios_creator_money_purchase_intent_pre_protected_video_cl'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(v_creator,case v_required_status when 'sandbox' then 'sandbox' when 'active' then 'production' end)$replacement$);
end $patch$;

-- public.create_ios_app_store_intent_pre_source_lock
do $patch$ declare d text; n text:=$needle$public."wave1_creator_money_subject_authorized_internal"(v_creator)$needle$; begin
 d:=pg_get_functiondef('public.create_ios_app_store_intent_pre_source_lock'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.create_ios_app_store_intent_pre_source_lock'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(v_creator,v_mapping.environment)$replacement$);
end $patch$;

-- public.read_my_creator_event_reservation
do $patch$ declare d text; n text:=$needle$public.wave1_creator_money_subject_authorized_internal(i.creator_id)$needle$; begin
 d:=pg_get_functiondef('public.read_my_creator_event_reservation'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.read_my_creator_event_reservation'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(i.creator_id,i.environment)$replacement$);
end $patch$;

-- public.create_creator_channel_subscription_purchase_intent
do $patch$ declare d text; n text:=$needle$public.wave1_creator_money_subject_authorized_internal(v_offer.creator_id)$needle$; begin
 d:=pg_get_functiondef('public.create_creator_channel_subscription_purchase_intent'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.create_creator_channel_subscription_purchase_intent'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(v_offer.creator_id,case v_offer.status when 'sandbox' then 'sandbox' when 'active' then 'production' end)$replacement$);
end $patch$;

-- public.resolve_creator_channel_subscription_access_pre_historical_clos
do $patch$ declare d text; n text:=$needle$public."wave1_creator_money_subject_authorized_internal"(p_creator_id)$needle$; begin
 d:=pg_get_functiondef('public.resolve_creator_channel_subscription_access_pre_historical_clos'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.resolve_creator_channel_subscription_access_pre_historical_clos'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(p_creator_id,case v_offer.status when 'sandbox' then 'sandbox' when 'active' then 'production' end)$replacement$);
end $patch$;

-- public.resolve_paid_creator_event_pass_access_pre_historical_closeout
do $patch$ declare d text; n text:=$needle$public."wave1_creator_money_subject_authorized_internal"(v_offer."creator_id")$needle$; begin
 d:=pg_get_functiondef('public.resolve_paid_creator_event_pass_access_pre_historical_closeout'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.resolve_paid_creator_event_pass_access_pre_historical_closeout'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(v_offer."creator_id",case v_offer.status when 'sandbox' then 'sandbox' when 'active' then 'production' end)$replacement$);
end $patch$;

-- public.resolve_paid_watch_party_ticket_access_pre_historical_closeout
do $patch$ declare d text; n text:=$needle$public."wave1_creator_money_subject_authorized_internal"(v_offer."creator_id")$needle$; begin
 d:=pg_get_functiondef('public.resolve_paid_watch_party_ticket_access_pre_historical_closeout'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.resolve_paid_watch_party_ticket_access_pre_historical_closeout'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(v_offer."creator_id",case v_offer.status when 'sandbox' then 'sandbox' when 'active' then 'production' end)$replacement$);
end $patch$;

-- public.resolve_creator_vip_pass_access_pre_historical_closeout
do $patch$ declare d text; n text:=$needle$public."wave1_creator_money_subject_authorized_internal"(p_creator_id)$needle$; begin
 d:=pg_get_functiondef('public.resolve_creator_vip_pass_access_pre_historical_closeout'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.resolve_creator_vip_pass_access_pre_historical_closeout'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(p_creator_id,case v_offer.status when 'sandbox' then 'sandbox' when 'active' then 'production' end)$replacement$);
end $patch$;

-- public.resolve_creator_vip_pass_access
do $patch$ declare d text; n text:=$needle$public."wave1_creator_money_subject_authorized_internal"(p_creator_id)$needle$; begin
 d:=pg_get_functiondef('public.resolve_creator_vip_pass_access'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.resolve_creator_vip_pass_access'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(p_creator_id,case v_offer.status when 'sandbox' then 'sandbox' when 'active' then 'production' end)$replacement$);
end $patch$;

-- public.resolve_creator_content_access_pre_subscription_doctrine
do $patch$ declare d text; n text:=$needle$public."wave1_creator_money_subject_authorized_internal"(v_owner_id)$needle$; begin
 d:=pg_get_functiondef('public.resolve_creator_content_access_pre_subscription_doctrine'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: public.resolve_creator_content_access_pre_subscription_doctrine'; end if;
 execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(v_owner_id,case v_price.status when 'sandbox' then 'sandbox' when 'active' then 'production' end)$replacement$);
end $patch$;

-- get_merch_fulfillment_address historical obligation authority
do $patch$ declare d text; n text:=$needle$public.wave1_creator_money_subject_authorized_internal(o.creator_id)$needle$; begin
 d:=pg_get_functiondef('public.get_merch_fulfillment_address'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: get_merch_fulfillment_address historical obligation authority'; end if;
 execute replace(d,n,$replacement$private.ordinary_historical_creator_current(o.creator_id,o.environment)$replacement$);
end $patch$;

-- respond_merch_return_case historical obligation authority
do $patch$ declare d text; n text:=$needle$public.wave1_creator_money_subject_authorized_internal(o.creator_id)$needle$; begin
 d:=pg_get_functiondef('public.respond_merch_return_case'::regproc);
 if position(n in d)=0 then raise exception 'sandbox_capability_patch_missing: respond_merch_return_case historical obligation authority'; end if;
 execute replace(d,n,$replacement$private.ordinary_historical_creator_current(o.creator_id,o.environment)$replacement$);
end $patch$;
commit;

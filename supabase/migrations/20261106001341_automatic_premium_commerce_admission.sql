begin;
-- Ordinary buyers do not need Premium. Paid creator capabilities do. All
-- helpers are private; these changes grant no admin role or provider authority.
create function private.ordinary_commerce_premium_current(p_user uuid,p_environment text) returns boolean
language sql volatile security definer set search_path='' as $$
 select p_user is not null and p_environment in ('sandbox','production')
 and exists(select 1 from auth.users u where u.id=p_user and u.deleted_at is null
  and u.email_confirmed_at is not null and coalesce(u.raw_app_meta_data->>'accountDeidentified','false')<>'true')
 and public.premium_subject_has_finite_authority_internal(p_user::text)
 and exists(select 1 from public.user_entitlements e where e.user_id=p_user::text and e.entitlement_key='premium'
  and e.source='revenuecat' and e.status in ('active','trialing','grace_period') and e.revoked_at is null
  and e.starts_at<=clock_timestamp() and e.expires_at>clock_timestamp()
  and (e.metadata->>'environment'='production' or (p_environment='sandbox' and e.metadata->>'environment'='sandbox')));
$$;
create function private.ordinary_commerce_buyer_current(p_user uuid,p_session uuid,p_environment text) returns boolean
language sql volatile security definer set search_path='' as $$
 select p_user is not null and p_session is not null and p_environment in ('sandbox','production')
 and exists(select 1 from auth.users u where u.id=p_user and u.deleted_at is null and u.email_confirmed_at is not null
  and coalesce(u.raw_app_meta_data->>'accountDeidentified','false')<>'true')
 and public.creator_tip_buyer_session_authority_internal(p_user,p_session);
$$;
create function private.ordinary_commerce_subject_current(p_user uuid,p_session uuid,p_environment text) returns boolean
language sql volatile security definer set search_path='' as $$
 select private.ordinary_commerce_buyer_current(p_user,p_session,p_environment)
 and private.ordinary_commerce_premium_current(p_user,p_environment);
$$;
revoke all on function private.ordinary_commerce_premium_current(uuid,text),
 private.ordinary_commerce_buyer_current(uuid,uuid,text),private.ordinary_commerce_subject_current(uuid,uuid,text)
 from public,anon,authenticated,service_role;

-- Match canonical Premium producers, including quarantines that have no row yet.
create function private.lock_ordinary_commerce_premium_subjects(p_users uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid; provider_name text; environment_name text;
begin
 for u in select distinct x from unnest(p_users) x where x is not null order by x loop
  perform public.lock_revenuecat_premium_owner_users_internal(u,u);
 end loop;
 for u in select distinct x from unnest(p_users) x where x is not null order by x loop
  foreach provider_name in array array['revenuecat_app_store','revenuecat_google_play'] loop
   foreach environment_name in array array['sandbox','production'] loop
    perform public.lock_revenuecat_premium_quarantine_scopes_internal(provider_name,u,environment_name);
   end loop;
  end loop;
 end loop;
 perform 1 from public.revenuecat_premium_transaction_authority where user_id=any(p_users)
  order by provider,original_transaction_id for share;
 perform 1 from public.user_entitlements where user_id in(select x::text from unnest(p_users) x)
  and entitlement_key='premium' order by user_id,entitlement_key for share;
 perform 1 from public.access_grants where user_id=any(p_users) and grant_type='premium' order by user_id,id for share;
end $$;
revoke all on function private.lock_ordinary_commerce_premium_subjects(uuid[]) from public,anon,authenticated,service_role;

-- Existing-row locks do not prevent a new fraud hold from arriving. Share the
-- creator fence with all insertions before checking the current hold rows.
create function private.ordinary_creator_hold_insert_fence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('ordinary-creator-hold:'||new.creator_user_id,0));
 return new;
end $$;
revoke all on function private.ordinary_creator_hold_insert_fence() from public,anon,authenticated,service_role;
create trigger ordinary_creator_hold_insert_fence before insert on public.creator_payout_eligibility_records
for each row execute function private.ordinary_creator_hold_insert_fence();

create or replace function public.resolve_sandbox_monetization_tester(p_user_id text default null,p_email text default null)
returns boolean language sql volatile security definer set search_path='' as $$
 select public.platform_exact_current_session_authority_internal() and public.wave1_current_caller_authority_internal()
 and (nullif(trim(coalesce(p_user_id,'')),'') is null or trim(p_user_id)=auth.uid()::text)
 and (nullif(lower(trim(coalesce(p_email,''))),'') is null or exists(select 1 from auth.users u
  where u.id=auth.uid() and u.email_confirmed_at is not null and lower(trim(u.email))=lower(trim(p_email))))
 and private.ordinary_commerce_buyer_current(auth.uid(),case when coalesce(auth.jwt()->>'session_id','')
  ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then (auth.jwt()->>'session_id')::uuid end,'sandbox');
$$;
-- Retain compatibility RPC ACL. The name no longer implies tester membership.
comment on function public.resolve_sandbox_monetization_tester(text,text) is
 'Compatibility resolver for ordinary sandbox buyers: exact current account/session/legal authority, no tester grant and no Premium requirement.';

-- creator mode Premium
do $patch$ declare d text; n text:=$needle$select p_creator_id is not null$needle$; begin
 d:=pg_get_functiondef('public.wave1_creator_money_subject_authorized_internal(uuid)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: creator mode Premium'; end if;
 execute replace(d,n,$replacement$select p_creator_id is not null
    and private.ordinary_commerce_premium_current(p_creator_id,case when exists(select 1 from public.platform_money_kill_switches where key='live_money_enabled' and state='on') then 'production' else 'sandbox' end)$replacement$);
end $patch$;

-- remove random cohort only
do $patch$ declare d text; n text:=$needle$mod(hashtextextended('chillywood-wave1-us-rollout-v1:' || p_creator_user_id::text, 20260814), 100) = 0$needle$; begin
 d:=pg_get_functiondef('public.wave1_evaluate_creator_eligibility(uuid,jsonb,text,text)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: remove random cohort only'; end if;
 execute replace(d,n,$replacement$true$replacement$);
end $patch$;

-- accurate creator rollout
do $patch$ declare d text; n text:=$needle$CONTROLLED_1_PERCENT_UNITED_STATES$needle$; begin
 d:=pg_get_functiondef('public.wave1_creator_eligibility_readback()'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: accurate creator rollout'; end if;
 execute replace(d,n,$replacement$AUTOMATIC_PREMIUM_UNITED_STATES$replacement$);
end $patch$;

-- reserve_merch_checkout_before_net_share free buyers
do $patch$ declare d text; n text:=$needle$public.has_platform_role(array['owner','operator']) or public.has_active_beta_access()$needle$; begin
 d:=pg_get_functiondef('public.reserve_merch_checkout_before_net_share(uuid,integer,uuid,uuid)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: reserve_merch_checkout_before_net_share free buyers'; end if;
 execute replace(d,n,$replacement$public.resolve_sandbox_monetization_tester()$replacement$);
end $patch$;

-- merch_product_projection_before_variants free buyers
do $patch$ declare d text; n text:=$needle$public.has_platform_role(array['owner','operator']) or public.has_active_beta_access()$needle$; begin
 d:=pg_get_functiondef('public.merch_product_projection_before_variants(public.merch_products)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: merch_product_projection_before_variants free buyers'; end if;
 execute replace(d,n,$replacement$public.resolve_sandbox_monetization_tester()$replacement$);
end $patch$;

-- merch_order_projection_before_variants free buyers
do $patch$ declare d text; n text:=$needle$public.has_platform_role(array['owner','operator']) or public.has_active_beta_access()$needle$; begin
 d:=pg_get_functiondef('public.merch_order_projection_before_variants(public.merch_orders)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: merch_order_projection_before_variants free buyers'; end if;
 execute replace(d,n,$replacement$public.resolve_sandbox_monetization_tester()$replacement$);
end $patch$;

-- list_creator_merch_products free buyers
do $patch$ declare d text; n text:=$needle$public.has_platform_role(array['owner','operator']) or public.has_active_beta_access()$needle$; begin
 d:=pg_get_functiondef('public.list_creator_merch_products(uuid,boolean,uuid,integer)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: list_creator_merch_products free buyers'; end if;
 execute replace(d,n,$replacement$public.resolve_sandbox_monetization_tester()$replacement$);
end $patch$;

-- product buyer copy
do $patch$ declare d text; n text:=$needle$Checkout is available only to approved sandbox testers. Public sales are not active.$needle$; begin
 d:=pg_get_functiondef('public.merch_product_projection_before_variants(public.merch_products)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: product buyer copy'; end if;
 execute replace(d,n,$replacement$Sign in with your current account to use sandbox checkout. Real payments are not active.$replacement$);
end $patch$;

-- order buyer copy
do $patch$ declare d text; n text:=$needle$Checkout is limited to currently approved sandbox testers.$needle$; begin
 d:=pg_get_functiondef('public.merch_order_projection_before_variants(public.merch_orders)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: order buyer copy'; end if;
 execute replace(d,n,$replacement$Sign in with your current account to continue sandbox checkout.$replacement$);
end $patch$;

-- mode aware free buyer reservation
do $patch$ declare d text; n text:=$needle$ if p.environment='production' then perform private.assert_merch_live_checkout(); end if;$needle$; begin
 d:=pg_get_functiondef('public.reserve_merch_checkout_before_net_share(uuid,integer,uuid,uuid)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: mode aware free buyer reservation'; end if;
 execute replace(d,n,$replacement$ if not private.ordinary_commerce_buyer_current(auth.uid(),(auth.jwt()->>'session_id')::uuid,p.environment) then raise exception 'merch_current_session_required'; end if;
 if p.environment='production' then perform private.assert_merch_live_checkout(); end if;$replacement$);
end $patch$;

-- subscription exact buyer guard
do $patch$ declare d text; n text:=$needle$public.has_platform_role(array['owner','operator']) or public.has_active_beta_access()
      or $needle$; begin
 d:=pg_get_functiondef('public.create_creator_channel_subscription_purchase_intent(uuid)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: subscription exact buyer guard'; end if;
 execute replace(d,n,$replacement$$replacement$);
end $patch$;

-- Connect automatic creator access
do $patch$ declare d text; n text:=$needle$public.platform_subject_has_role_internal(p_creator::text,array['owner','operator'])
   or exists(select 1 from public.beta_access_memberships b where b.user_id=p_creator::text and b.access_status='active')
   or exists(select 1 from public.sandbox_monetization_testers approved_tester where approved_tester.user_id=p_creator::text and approved_tester.status='active'
    and (approved_tester.expires_at is null or approved_tester.expires_at>clock_timestamp()))$needle$; begin
 d:=pg_get_functiondef('public.get_creator_connect_onboarding_route(uuid,uuid)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: Connect automatic creator access'; end if;
 execute replace(d,n,$replacement$private.ordinary_commerce_subject_current(p_creator,p_session,'sandbox')$replacement$);
end $patch$;

-- Connect creator membership
do $patch$ declare d text; n text:=$needle$and public.creator_tip_buyer_session_authority_internal(p_creator,p_session)$needle$; begin
 d:=pg_get_functiondef('private.creator_connect_onboarding_subject(uuid,uuid)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: Connect creator membership'; end if;
 execute replace(d,n,$replacement$and private.ordinary_commerce_subject_current(p_creator,p_session,case when exists(select 1 from public.platform_money_kill_switches where key='live_money_enabled' and state='on') then 'production' else 'sandbox' end)$replacement$);
end $patch$;

-- Historical status and positively undispatched cancellation remain available
-- after Premium expires. New test cashouts require current creator authority.
create or replace function private.sandbox_cashout_current_user() returns uuid
language plpgsql stable set search_path='' as $$
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true
 then raise exception 'sandbox_current_session_required'; end if;
 return auth.uid();
end $$;
create or replace function private.sandbox_cashout_subject_current(p_user uuid,p_session uuid) returns boolean
language sql volatile set search_path='' as $$
 select private.ordinary_commerce_subject_current(p_user,p_session,'sandbox')
 and public.wave1_user_has_active_legal_requirements_internal(p_user,'payout')
 and exists(select 1 from public.wave1_creator_eligibility e where e.creator_user_id=p_user
  and e.state not in ('SUSPENDED','REVOKED') and e.account_status='ACTIVE'
  and e.age_18_plus and e.legal_accepted and e.creator_role and e.market='UNITED_STATES'
  and e.moderation_state='CLEAR' and e.platform_capability
  and e.tax_complete is distinct from false and e.sanctions_clear is distinct from false)
 and not exists(select 1 from public.creator_payout_eligibility_records e where e.creator_user_id=p_user::text
  and (e.fraud_hold_active or e.admin_review_status in ('pending_review','rejected','on_hold') or e.eligibility_status='on_hold'));
$$;

-- new test cashout creator admission
do $patch$ declare d text; n text:=$needle$ if p_amount_minor is null$needle$; begin
 d:=pg_get_functiondef('public.preview_sandbox_creator_cashout(integer,text)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: new test cashout creator admission'; end if;
 execute replace(d,n,$replacement$ if not private.sandbox_cashout_subject_current(u,(auth.jwt()->>'session_id')::uuid) then return jsonb_build_object('ready',false,'reason','sandbox_origin_creator_required','environment','test','financialAuthority',false); end if;
 if p_amount_minor is null$replacement$);
end $patch$;

-- preserve proved historical recovery
do $patch$ declare d text; n text:=$needle$if not private.sandbox_cashout_enabled() then$needle$; begin
 d:=pg_get_functiondef('public.claim_sandbox_creator_cashout_dispatch(uuid,text)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: preserve proved historical recovery'; end if;
 execute replace(d,n,$replacement$if p_stage in ('funding','payout') and not private.sandbox_cashout_enabled() then$replacement$);
end $patch$;

-- test cashout creator fences
do $patch$ declare d text; n text:=$needle$  perform 1 from public.sandbox_monetization_testers where user_id=e.creator_id::text for share;
  perform 1 from public.beta_access_memberships where user_id=e.creator_id::text for share;
  perform 1 from public.platform_role_memberships where user_id=e.creator_id::text for share;$needle$; begin
 d:=pg_get_functiondef('public.claim_sandbox_creator_cashout_dispatch(uuid,text)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: test cashout creator fences'; end if;
 execute replace(d,n,$replacement$  perform private.lock_ordinary_commerce_premium_subjects(array[e.creator_id]);
  perform pg_advisory_xact_lock_shared(hashtextextended('ordinary-creator-hold:'||e.creator_id::text,0));
  perform 1 from public.creator_payout_eligibility_records where creator_user_id=e.creator_id::text order by id for share;
  perform pg_advisory_xact_lock(hashtextextended('wave1-creator:'||e.creator_id::text,0));
  perform 1 from public.wave1_creator_eligibility where creator_user_id=e.creator_id for share;
  perform 1 from public.wave1_legal_document_versions where market='UNITED_STATES' order by document_key,version,capability for share;
  perform 1 from public.wave1_legal_acceptances where user_id=e.creator_id order by id for share;$replacement$);
end $patch$;

-- cashout accurate creator copy
do $patch$ declare d text; n text:=$needle$sandbox_origin_tester_required$needle$; begin
 d:=pg_get_functiondef('public.claim_sandbox_creator_cashout_dispatch(uuid,text)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: cashout accurate creator copy'; end if;
 execute replace(d,n,$replacement$sandbox_origin_creator_required$replacement$);
end $patch$;

-- dispatch current free buyer and creator fences
do $patch$ declare d text; n text:=$needle$ -- Retained global latch precedes buyer, product, variant, order, provenance.$needle$; begin
 d:=pg_get_functiondef('public.transition_merch_checkout_dispatch(uuid,uuid,uuid,text,jsonb)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: dispatch current free buyer and creator fences'; end if;
 execute replace(d,n,$replacement$ if p_action='dispatch' then
  perform 1 from auth.users where id in (p_buyer_id,o.creator_id) order by id for share;
  perform 1 from auth.sessions where id=p_session_id and user_id=p_buyer_id for share;
  perform private.lock_ordinary_commerce_premium_subjects(array[o.creator_id]);
  perform 1 from public.creator_payout_accounts where creator_user_id=o.creator_id::text order by id for share;
  perform pg_advisory_xact_lock_shared(hashtextextended('ordinary-creator-hold:'||o.creator_id::text,0));
  perform 1 from public.creator_payout_eligibility_records where creator_user_id=o.creator_id::text order by id for share;
  perform pg_advisory_xact_lock(hashtextextended('wave1-creator:'||o.creator_id::text,0));
  perform 1 from public.wave1_creator_eligibility where creator_user_id=o.creator_id for share;
  perform 1 from public.wave1_legal_document_versions where market='UNITED_STATES' order by document_key,version,capability for share;
  perform 1 from public.wave1_legal_acceptances where user_id in(p_buyer_id,o.creator_id) order by user_id,id for share;
  perform 1 from public.platform_money_kill_switches order by key for share;
  if not private.ordinary_commerce_buyer_current(p_buyer_id,p_session_id,o.environment)
   or not public.merch_seller_ready_internal(o.creator_id)
   or (o.environment='sandbox' and not public.is_money_feature_allowed('merch_enabled',false))
   or (o.environment='production' and not private.merch_live_checkout_ready())
  then return '{"authorized":false,"aborted":false}'::jsonb; end if;
 end if;
 -- Retained global latch precedes buyer, product, variant, order, provenance.$replacement$);
end $patch$;

-- dispatch current publication
do $patch$ declare d text; n text:=$needle$ if p_action='dispatch' and o.environment='production' then$needle$; begin
 d:=pg_get_functiondef('public.transition_merch_checkout_dispatch(uuid,uuid,uuid,text,jsonb)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: dispatch current publication'; end if;
 execute replace(d,n,$replacement$ if p_action='dispatch' and not exists(select 1 from public.merch_products p where p.id=o.product_id
  and p.creator_id=o.creator_id and p.environment=o.environment and p.publication_status='published'
  and p.status=case when o.environment='production' then 'active' else 'sandbox' end
  and p.provider='stripe_physical_goods' and p.is_physical_good and not p.creates_digital_access)
 then return '{"authorized":false,"aborted":false}'::jsonb; end if;
 if p_action='dispatch' and o.environment='production' then$replacement$);
end $patch$;

-- event free buyer current mode
do $patch$ declare d text; n text:=$needle$  if i.environment='sandbox' and not public.resolve_sandbox_monetization_tester(i.user_id::text,null)$needle$; begin
 d:=pg_get_functiondef('public.begin_creator_event_checkout(uuid,uuid)'::regprocedure);
 if position(n in d)=0 then raise exception 'automatic_commerce_patch_missing: event free buyer current mode'; end if;
 execute replace(d,n,$replacement$  if not private.ordinary_commerce_buyer_current(i.user_id,(i.session_generation)::uuid,i.environment)$replacement$);
end $patch$;

commit;

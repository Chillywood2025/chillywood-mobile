begin;
select no_plan();
set local timezone='UTC';
-- Real local provider-reconciliation functions create the authority chain.
-- All data and effects are synthetic, rollback-only; no HTTP/provider calls.
insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values
 ('9b550000-0000-4000-8000-000000000001',false,false,now()),
 ('9b550000-0000-4000-8000-000000000002',false,false,now()),
 ('9b550000-0000-4000-8000-000000000003',false,false,now()),
 ('9b550000-0000-4000-8000-000000000004',false,false,now());
insert into auth.sessions(id,user_id,not_after) values
 ('9b550000-0000-4000-8000-000000000101','9b550000-0000-4000-8000-000000000001',now()+interval '1 day'),
 ('9b550000-0000-4000-8000-000000000102','9b550000-0000-4000-8000-000000000002',now()+interval '1 day'),
 ('9b550000-0000-4000-8000-000000000103','9b550000-0000-4000-8000-000000000003',now()+interval '1 day'),
 ('9b550000-0000-4000-8000-000000000104','9b550000-0000-4000-8000-000000000004',now()+interval '1 day');
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
 select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
 from auth.sessions s cross join public.wave1_legal_document_versions d
 where s.user_id::text like '9b550000-%' and d.active and d.market='UNITED_STATES'
   and (d.capability='account' or (s.user_id='9b550000-0000-4000-8000-000000000001' and d.capability in ('creator','creator_money')));
insert into public.wave1_creator_eligibility(creator_user_id,state,account_status,age_18_plus,legal_accepted,creator_role,moderation_state,market,rollout_eligible,platform_capability,
 provider_eligible,kyc_complete,tax_complete,sanctions_clear,payout_eligible,authority_source,last_operation_key) values
 ('9b550000-0000-4000-8000-000000000001','VERIFIED','ACTIVE',true,true,true,'CLEAR','UNITED_STATES',true,true,true,true,true,true,true,'local_social_test','social_creator_fixture');
update public.platform_money_kill_switches set state='sandbox_only' where key='revenuecat_app_store_enabled';
insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes,vip_access_required) values
 ('9b551000-0000-4000-8000-000000000001','9b550000-0000-4000-8000-000000000001','VIP social fixture','public','clean','cloudflare_r2','chillywood-media-origin','9b550000-0000-4000-8000-000000000001/vip.mp4','9b550000-0000-4000-8000-000000000001/vip.mp4','video/mp4',1024,true),
 ('9b551000-0000-4000-8000-000000000002','9b550000-0000-4000-8000-000000000001','Paid social fixture','public','clean','cloudflare_r2','chillywood-media-origin','9b550000-0000-4000-8000-000000000001/paid.mp4','9b550000-0000-4000-8000-000000000001/paid.mp4','video/mp4',1024,false);
update public.videos set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now() where owner_id='9b550000-0000-4000-8000-000000000001';
insert into public.creator_content_prices(creator_id,content_type,content_id,is_paid,price_cents,currency,status,provider,provider_product_id,provider_product_key,metadata)
 select '9b550000-0000-4000-8000-000000000001','creator_video','9b551000-0000-4000-8000-000000000002',true,
 m.reference_price_minor,m.reference_currency,'sandbox',m.provider,m.provider_product_id,p.product_key,'{"sandbox_only":true,"not_payable":true}'::jsonb
 from public.monetization_product_store_mappings m join public.monetization_products p on p.id=m.product_id
 where m.provider='revenuecat_app_store' and m.provider_product_id='com.chillywood.paidvideo.tier1' and m.environment='sandbox';
insert into public.creator_vip_pass_offers(id,creator_id,title,price_cents,currency,pass_type,status,provider,provider_product_key,provider_product_id) values
 ('9b552000-0000-4000-8000-000000000001','9b550000-0000-4000-8000-000000000001','Social VIP',99,'usd','one_time','sandbox','revenuecat','vip_pass_store_catalog','com.chillywood.vip.tier1');
insert into public.creator_channel_subscription_offers(id,creator_id,title,price_cents,currency,interval,status,provider,provider_product_id) values
 ('9b552000-0000-4000-8000-000000000002','9b550000-0000-4000-8000-000000000001','Social subscription',499,'usd','monthly','sandbox','revenuecat','com.chillywood.channel.subscription.slot1');
insert into public.money_purchase_intents(id,user_id,product_id,product_key,product_type,provider,provider_product_id,source_type,source_id,creator_id,environment,status,
 amount_minor,currency,idempotency_key,expires_at,session_generation,metadata)
 select f.intent_id,f.user_id,m.product_id,p.product_key,p.product_type,m.provider,m.provider_product_id,f.source_type,f.source_id,
 '9b550000-0000-4000-8000-000000000001','sandbox','pending',m.reference_price_minor,m.reference_currency,f.intent_id::text,now()+interval '15 minutes',f.session_id::text,
 '{"sandbox_only":true,"not_payable":true}'::jsonb
 from (values
 ('9b553000-0000-4000-8000-000000000001'::uuid,'9b550000-0000-4000-8000-000000000002'::uuid,'com.chillywood.vip.tier1','vip_pass','9b552000-0000-4000-8000-000000000001'::uuid,'9b550000-0000-4000-8000-000000000102'::uuid),
 ('9b553000-0000-4000-8000-000000000002'::uuid,'9b550000-0000-4000-8000-000000000003'::uuid,'com.chillywood.paidvideo.tier1','paid_content','9b551000-0000-4000-8000-000000000002'::uuid,'9b550000-0000-4000-8000-000000000103'::uuid),
 ('9b553000-0000-4000-8000-000000000003'::uuid,'9b550000-0000-4000-8000-000000000004'::uuid,'com.chillywood.channel.subscription.slot1','channel_subscription','9b552000-0000-4000-8000-000000000002'::uuid,'9b550000-0000-4000-8000-000000000104'::uuid)
 ) f(intent_id,user_id,product_id,source_type,source_id,session_id)
 join public.monetization_product_store_mappings m on m.provider_product_id=f.product_id and m.provider='revenuecat_app_store' and m.environment='sandbox'
 join public.monetization_products p on p.id=m.product_id;
select is((select count(*)::integer from public.money_purchase_intents where id::text like '9b553000-%'),3,'fixture has three exact pending purchase bindings');
select is(public.process_revenuecat_app_store_event_atomic('social_vip_initial','INITIAL_PURCHASE','9b550000-0000-4000-8000-000000000002','com.chillywood.vip.tier1','sandbox',now(),null,99,'usd',repeat('a',64),'social_vip_original',null)->>'status','processed','real local VIP reconciliation processes');
select is(public.process_revenuecat_app_store_event_atomic('social_paid_initial','INITIAL_PURCHASE','9b550000-0000-4000-8000-000000000003','com.chillywood.paidvideo.tier1','sandbox',now(),null,99,'usd',repeat('b',64),'social_paid_original',null)->>'status','processed','real local paid video reconciliation processes');
select is(public.process_revenuecat_app_store_event_atomic('social_sub_initial','INITIAL_PURCHASE','9b550000-0000-4000-8000-000000000004','com.chillywood.channel.subscription.slot1','sandbox',now(),now()+interval '30 days',499,'usd',repeat('c',64),'social_sub_original',null)->>'status','processed','real local subscription reconciliation processes');

select ok(private.social_notification_video_allowed('9b551000-0000-4000-8000-000000000001','9b550000-0000-4000-8000-000000000002'),'exact current verified VIP can receive video activity');
select ok(private.social_notification_video_allowed('9b551000-0000-4000-8000-000000000002','9b550000-0000-4000-8000-000000000003'),'exact verified paid-video buyer can receive activity');
select ok(private.social_notification_video_allowed('9b551000-0000-4000-8000-000000000002','9b550000-0000-4000-8000-000000000004'),'exact creator subscription can receive ordinary Paid Video activity');
select ok(not private.social_notification_video_allowed('9b551000-0000-4000-8000-000000000001','9b550000-0000-4000-8000-000000000004'),'subscription never substitutes for VIP');
select ok(not private.social_notification_video_allowed('9b551000-0000-4000-8000-000000000001','9b550000-0000-4000-8000-000000000003'),'paid-video purchase never substitutes for VIP');
insert into public.creator_video_comments(id,video_id,user_id,body) values
 ('9b554000-0000-4000-8000-000000000001','9b551000-0000-4000-8000-000000000001','9b550000-0000-4000-8000-000000000002','VIP parent'),
 ('9b554000-0000-4000-8000-000000000002','9b551000-0000-4000-8000-000000000002','9b550000-0000-4000-8000-000000000003','Paid parent'),
 ('9b554000-0000-4000-8000-000000000003','9b551000-0000-4000-8000-000000000002','9b550000-0000-4000-8000-000000000004','Subscription parent');
insert into public.creator_video_comments(id,video_id,user_id,body,parent_comment_id) values
 ('9b554000-0000-4000-8000-000000000011','9b551000-0000-4000-8000-000000000001','9b550000-0000-4000-8000-000000000001','VIP owner reply','9b554000-0000-4000-8000-000000000001'),
 ('9b554000-0000-4000-8000-000000000012','9b551000-0000-4000-8000-000000000002','9b550000-0000-4000-8000-000000000001','Paid owner reply','9b554000-0000-4000-8000-000000000002'),
 ('9b554000-0000-4000-8000-000000000013','9b551000-0000-4000-8000-000000000002','9b550000-0000-4000-8000-000000000001','Subscription owner reply','9b554000-0000-4000-8000-000000000003');
do $$ declare claim jsonb; begin
 for claim in select public.claim_notification_activity_batch(10) loop
  perform public.prepare_notification_activity((claim->>'eventId')::uuid,(claim->>'leaseToken')::uuid);
  perform public.finish_notification_activity((claim->>'eventId')::uuid,(claim->>'leaseToken')::uuid);
 end loop;
end $$;
select is((select count(*)::integer from public.notifications where notification_type='video_reply' and user_id='9b550000-0000-4000-8000-000000000002'),1,
 'verified VIP reply source creates one exact parent-author bell row');
select is((select count(*)::integer from public.notifications where notification_type='video_reply' and user_id='9b550000-0000-4000-8000-000000000003'),1,
 'verified paid-video reply source creates one exact parent-author bell row');
select is((select count(*)::integer from public.notifications where notification_type='video_reply' and user_id='9b550000-0000-4000-8000-000000000004'),1,
 'verified subscription reply source creates one exact parent-author bell row');
savepoint original_vip;
update public.creator_vip_passes set access_grant_id=(select access_grant_id from public.creator_channel_subscriptions where subscriber_id='9b550000-0000-4000-8000-000000000004') where fan_id='9b550000-0000-4000-8000-000000000002';
select ok(not private.social_notification_video_allowed('9b551000-0000-4000-8000-000000000001','9b550000-0000-4000-8000-000000000002'),'neighbor grant cannot authorize VIP activity');
rollback to original_vip;
select throws_ok($$update public.creator_vip_passes set expires_at=now()+interval '60 days' where fan_id='9b550000-0000-4000-8000-000000000002'$$,
 '23514',null,'existing schema rejects noncanonical VIP period');
update public.creator_vip_passes set activated_at=now()-interval '31 days',expires_at=now()-interval '1 day' where fan_id='9b550000-0000-4000-8000-000000000002';
select ok(not private.social_notification_video_allowed('9b551000-0000-4000-8000-000000000001','9b550000-0000-4000-8000-000000000002'),'expired canonical VIP period cannot authorize activity');
rollback to original_vip;
update public.creator_vip_passes set revoked_at=now() where fan_id='9b550000-0000-4000-8000-000000000002';
select ok(not private.social_notification_video_allowed('9b551000-0000-4000-8000-000000000001','9b550000-0000-4000-8000-000000000002'),'revoked VIP suppresses activity');
rollback to original_vip;
update public.creator_vip_passes set refunded_at=now() where fan_id='9b550000-0000-4000-8000-000000000002';
select ok(not private.social_notification_video_allowed('9b551000-0000-4000-8000-000000000001','9b550000-0000-4000-8000-000000000002'),'refunded VIP suppresses activity');
rollback to original_vip;
savepoint original_subscription;
update public.creator_channel_subscriptions set current_period_start=now()-interval '31 days',current_period_end=now()-interval '1 second' where subscriber_id='9b550000-0000-4000-8000-000000000004';
select ok(not private.social_notification_video_allowed('9b551000-0000-4000-8000-000000000002','9b550000-0000-4000-8000-000000000004'),'expired subscription cannot authorize activity');
rollback to original_subscription;
update public.creator_channel_subscriptions set access_grant_id=(select access_grant_id from public.creator_vip_passes where fan_id='9b550000-0000-4000-8000-000000000002') where subscriber_id='9b550000-0000-4000-8000-000000000004';
select ok(not private.social_notification_video_allowed('9b551000-0000-4000-8000-000000000002','9b550000-0000-4000-8000-000000000004'),'wrong subscription grant cannot authorize activity');
rollback to original_subscription;
update public.creator_channel_subscriptions set revoked_at=now() where subscriber_id='9b550000-0000-4000-8000-000000000004';
select ok(not private.social_notification_video_allowed('9b551000-0000-4000-8000-000000000002','9b550000-0000-4000-8000-000000000004'),'revoked subscription suppresses activity');
rollback to original_subscription;
update public.access_grants set refunded_at=now(),status='refunded' where user_id='9b550000-0000-4000-8000-000000000004' and grant_type='channel_subscription';
select ok(not private.social_notification_video_allowed('9b551000-0000-4000-8000-000000000002','9b550000-0000-4000-8000-000000000004'),'refunded subscription grant suppresses activity');
rollback to original_subscription;
savepoint original_paid;
update public.access_grants set refunded_at=now(),status='refunded' where user_id='9b550000-0000-4000-8000-000000000003' and grant_type='paid_content_access';
select ok(not private.social_notification_video_allowed('9b551000-0000-4000-8000-000000000002','9b550000-0000-4000-8000-000000000003'),'refunded paid-video grant suppresses activity');
rollback to original_paid;
update public.access_grants set revoked_at=now(),status='revoked' where user_id='9b550000-0000-4000-8000-000000000003' and grant_type='paid_content_access';
select ok(not private.social_notification_video_allowed('9b551000-0000-4000-8000-000000000002','9b550000-0000-4000-8000-000000000003'),'revoked paid-video grant suppresses activity');
select * from finish();
rollback;

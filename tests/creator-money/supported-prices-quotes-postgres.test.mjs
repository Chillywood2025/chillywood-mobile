import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

const migration='20261026164507_creator_supported_prices_and_purchase_quotes.sql';
const referenceGuardsMigration='20261027021608_creator_monetization_reference_guard_integration.sql';
const subscriptionBindingsMigration='20261030155923_creator_subscription_catalog_bindings.sql';
const auctionPaymentMigration='20261030155939_creator_event_auction_payment_projection.sql';
// These successors depend on the quote/auction projection or wrap its functions.
// Defer and replay the explicit dependency chain; none are skipped in the final schema.
const successors=[
  '20261030165642_google_external_transaction_reporting.sql',
  '20261030165918_creator_room_auction_payment_projection.sql',
  '20261030182620_ios_external_checkout_admission.sql',
  '20261030182836_creator_auction_lifecycle_notifications.sql',
  '20261030185719_creator_tip_route_fee_comparison.sql',
  '20261030190449_creator_tip_cross_rail_action_claim.sql',
  '20261030193217_creator_tip_exact_selected_capability_quote.sql',
  '20261030200311_creator_auction_platform_settlement.sql',
  '20261030202414_auction_transfer_execution_boundary.sql',
  '20261030204119_event_auction_release_policy.sql',
  '20261030204252_auction_release_qualification_serialization.sql',
  '20261030204513_auction_verified_net_recovery_issuer.sql',
  '20261031013158_auction_held_visibility_observer.sql',
  '20261031033642_auction_approved_automation.sql',
  '20261031033820_commerce_tax_readiness.sql',
  '20261031033911_merch_tracking_correction_intake.sql',
  '20261031034904_merch_tracking_reviewed_supersession.sql',
  '20261031173602_google_external_program_capability_binding.sql',
  '20261031173636_commerce_fee_report_observations.sql',
  '20261031191024_discovery_notification_subject_context.sql',
  '20261031191128_notification_display_context_read.sql',
];
// Full migrated schema, real application predicates/triggers and provider SQL.
// Only managed auth/storage infrastructure is the shared fixture; no network.
test('catalog selection and immutable quote survive source edits, duplicates, terminal order and account changes', {timeout:240_000}, async t=>{
  // The guard integration requires the quote table created by this migration.
  // Keep the original pre-price negative control, then install dependencies in order.
  const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,excludeMigrations:[migration,referenceGuardsMigration,subscriptionBindingsMigration,auctionPaymentMigration,...successors]});
  let step='setup'; let checks=0;
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
  const deny=async(fn,rx)=>{await assert.rejects(fn,rx);checks++;};
  const buyer='e9000000-0000-4000-8000-000000000001', buyerSession='e9000000-0000-4000-8000-000000000002';
  const other='e9000000-0000-4000-8000-000000000003', otherSession='e9000000-0000-4000-8000-000000000004';
  const hostSession='e9000000-0000-4000-8000-000000000005';
  let host;
  const claim=async(user,session,platform='ios')=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','authenticated',false),set_config('request.headers',$2,false)",[JSON.stringify({role:'authenticated',sub:user,session_id:session}),JSON.stringify({'x-chillywood-platform':platform})]);
    await db.exec('set role authenticated');
  };
  const service=async()=>{await db.exec('reset role');await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.jwt.claim.role','service_role',false)");};
  const isolate=async(fn)=>{await db.exec('begin');try{return await fn();}finally{await db.exec('rollback');}};
  try {
    host=await scalar("select md5('quotes-host:'||n::text)::uuid from generate_series(1,1000)n where mod(hashtextextended('chillywood-wave1-us-rollout-v1:'||md5('quotes-host:'||n::text)::uuid::text,20260814),100)=0 limit 1");
    await db.query('insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values($1,false,false,now()),($2,false,false,now()),($3,false,false,now())',[host,buyer,other]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4),($5,$6)',[hostSession,host,buyerSession,buyer,otherSession,other]);
    await db.query("insert into public.user_profiles(user_id,username,display_name) values($1,'quote_host','Quote host'),($2,'quote_buyer','Quote buyer'),($3,'quote_other','Other buyer') on conflict(user_id) do nothing",[host,buyer,other]);
    await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
      select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
      from auth.sessions s cross join public.wave1_legal_document_versions d where s.user_id in($1,$2,$3) and d.active and d.market='UNITED_STATES'
      and (d.capability='account' or (s.user_id=$1 and d.capability in('creator','creator_money')))`,[host,buyer,other]);
    await service();
    eq((await scalar(`select public.wave1_evaluate_creator_eligibility($1,'{"accountStatus":"ACTIVE","age18Plus":true,"legalAccepted":true,"creatorRole":true,"moderationState":"CLEAR","market":"UNITED_STATES","rolloutEligible":false,"platformCapability":true,"providerEligible":true,"kycComplete":true,"taxComplete":true,"sanctionsClear":true,"payoutEligible":true,"inputVersions":{"evaluationSequence":1}}','quotes-fixture','local_pgtap')`,[host])).state,'VERIFIED');
    await db.exec("update public.platform_money_kill_switches set state='sandbox_only' where key in('revenuecat_app_store_enabled','revenuecat_google_play_enabled','provider_webhooks_enabled','creator_monetization_enabled','watch_party_tickets_enabled','paid_content_enabled','digital_sales_enabled','tips_enabled')");
    await db.query('insert into public.sandbox_monetization_testers(user_id) values($1),($2),($3)',[host,buyer,other]);
    await db.query("insert into public.watch_party_rooms(party_id,title_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility) values('QUOTEPRICE','quote-title',$1,'title','open','party_pass',true,'private')",[host]);
    step='negative control';
    await claim(host,hostSession);
    await deny(()=>db.query("select public.set_paid_watch_party_offer('QUOTEPRICE','Original room',299,null,'sandbox')"),/approved_sandbox_price_required/);
    await service();
    await db.exec(fs.readFileSync(new URL(`../../supabase/migrations/${migration}`,import.meta.url),'utf8'));
    await db.exec(fs.readFileSync(new URL(`../../supabase/migrations/${referenceGuardsMigration}`,import.meta.url),'utf8'));
    await db.exec(fs.readFileSync(new URL(`../../supabase/migrations/${subscriptionBindingsMigration}`,import.meta.url),'utf8'));
    await db.exec(fs.readFileSync(new URL(`../../supabase/migrations/${auctionPaymentMigration}`,import.meta.url),'utf8'));
    for(const successor of successors)await db.exec(fs.readFileSync(new URL(`../../supabase/migrations/${successor}`,import.meta.url),'utf8'));
    eq(await scalar("select to_regclass('private.google_play_external_capability_program_bindings') is not null"),true,'exact program-binding successor is replayed after its prerequisites');
    eq(await scalar("select to_regclass('private.commerce_fee_report_observations') is not null"),true,'fee-report successor is replayed after its settlement prerequisite');
    step='catalog and creator';
    await claim(host,hostSession);
    const ios=await scalar("select public.list_creator_supported_prices('watch_party_live','ios','sandbox')");
    eq(ios.map(p=>p.amountMinor),[99,299,499,999]);
    eq(ios.every(p=>p.provider==='revenuecat_app_store'&&p.status==='sandbox'&&!p.providerVerified),true);
    eq((await scalar("select public.list_creator_supported_prices('watch_party_live','android','sandbox')")).map(p=>p.amountMinor),[99]);
    eq(await scalar("select public.list_creator_supported_prices('watch_party_live','ios','production')"),[]);
    eq(await scalar("select public.list_creator_supported_prices('live_watch_party_access','ios','sandbox')"),[]);
    await deny(()=>db.query("select public.set_paid_watch_party_offer('QUOTEPRICE','Unsupported room',250,null,'sandbox')"),/creator_store_price_not_supported/);
    const offer=await scalar("select public.set_paid_watch_party_offer('QUOTEPRICE','Original room',299,null,'sandbox')");
    eq(offer.priceCents,299);
    eq(await scalar("select public.list_creator_supported_prices('watch_party_live','android','sandbox',$1)",[offer.id]),[]);
    eq((await scalar("select public.list_creator_supported_prices('watch_party_live','ios','sandbox',$1)",[offer.id])).map(p=>p.amountMinor),[299]);
    step='actual issuance';
    await claim(buyer,buyerSession);
    const purchase=await scalar("select public.create_ios_app_store_purchase_intent('com.chillywood.seatpass.tier2','watch_party_live',$1,'{}')",[offer.id]);
    eq(purchase.amountMinor,299);eq(purchase.quote.amountMinor,299);eq(purchase.quote.title,'Original room');
    eq(purchase.quote.terms.destination,{type:'party_room',id:'QUOTEPRICE'});
    const firstClaim=await scalar('select public.begin_creator_money_checkout($1,$2)',[purchase.id,'e9000000-0000-4000-8000-000000000010']);
    eq(firstClaim.startAuthorized,true);eq(firstClaim.id,purchase.id);eq(firstClaim.amountMinor,299);
    eq((await scalar('select public.begin_creator_money_checkout($1,$2)',[purchase.id,'e9000000-0000-4000-8000-000000000010'])).startAuthorized,false,'lost claim response never authorizes a second SDK call');
    eq((await scalar('select public.begin_creator_money_checkout($1,$2)',[purchase.id,'e9000000-0000-4000-8000-000000000011'])).startAuthorized,false,'a new attempt UUID cannot reauthorize the same purchase');
    await deny(()=>db.query("select public.create_ios_app_store_purchase_intent('com.chillywood.seatpass.tier2','watch_party_live',$1,'{}')",[offer.id]),/source_purchase_intent_already_pending/);
    await claim(other,otherSession);
    await deny(()=>db.query('select public.begin_creator_money_checkout($1,$2)',[purchase.id,'e9000000-0000-4000-8000-000000000012']),/creator_money_checkout_intent_unavailable/);
    eq(await scalar('select count(*)::integer from public.creator_money_purchase_quotes'),0,'other buyer cannot read protected quote');
    await deny(()=>db.query('update public.creator_money_purchase_quotes set amount_minor=1'),/permission denied/);
    await service();
    await deny(()=>db.query('update public.money_purchase_intents set checkout_attempt_id=null,checkout_started_at=null where id=$1',[purchase.id]),/creator_money_checkout_attempt_immutable/);
    await deny(()=>db.query('update public.money_purchase_intents set amount_minor=999 where id=$1',[purchase.id]),/purchase_intent_quote_immutable/);
    await deny(()=>db.query('update public.money_purchase_intents set user_id=$1 where id=$2',[other,purchase.id]),/purchase_intent_quote_immutable|purchase_intent_current_session_required/);
    await deny(()=>db.query('update public.money_purchase_intents set platform_id=$1 where id=$2',[other,purchase.id]),/purchase_intent_quote_immutable/);
    await deny(()=>db.query('update public.money_purchase_intents set event_terms_revision_id=$1 where id=$2',[other,purchase.id]),/purchase_intent_quote_immutable|event_ticket_terms_immutable/);
    await deny(()=>db.query('update public.creator_money_purchase_quotes set title=\'Edited\' where purchase_intent_id=$1',[purchase.id]),/purchase_quote_immutable/);
    await claim(host,hostSession);
    await scalar("select public.set_paid_watch_party_offer('QUOTEPRICE','Edited room',999,null,'sandbox')");
    await claim(buyer,buyerSession);
    eq(await scalar('select title from public.creator_money_purchase_quotes where purchase_intent_id=$1',[purchase.id]),'Original room');
    step='actual fulfillment immutable quote';
    await service();
    const purchasedAt=new Date().toISOString();
    const event=async(id,type='INITIAL_PURCHASE',original='quotes-original',subject=buyer)=>scalar(`select public.process_revenuecat_app_store_event_atomic($1,$2,$3,'com.chillywood.seatpass.tier2','sandbox',now(),null,299,'usd',repeat('a',64),$4,null,$5)`,[id,type,subject,original,purchasedAt]);
    const paid=await event('quotes-paid');eq(paid.status,'processed',JSON.stringify(paid));
    eq(await scalar('select amount_minor from public.money_access_ledger_events where id=$1',[paid.ledgerEventId]),299);
    eq((await event('quotes-paid')).duplicateProviderEvent,true);
    await deny(()=>db.query("select public.process_revenuecat_app_store_event_atomic('quotes-paid','INITIAL_PURCHASE',$1,'com.chillywood.seatpass.tier2','sandbox',now(),null,299,'usd',repeat('a',64),'quotes-original',null,'2000-01-01')",[buyer]),/creator_purchase_time_receipt_mismatch/);
    await deny(()=>db.query("update public.creator_money_provider_purchase_times set purchased_at='2000-01-01'"),/creator_purchase_time_receipt_immutable/);
    await isolate(async()=>{
      eq((await event('quotes-wrong-owner','REFUND','quotes-original',other)).status,'ignored');
      eq(await scalar('select status from public.money_purchase_intents where id=$1',[purchase.id]),'consumed');
      eq(await scalar("select public.revenuecat_authority_quarantined_internal('revenuecat_app_store',$1,'sandbox')",[buyer]),true);
    });
    const refunded=await event('quotes-refund','REFUND');eq(refunded.status,'processed',JSON.stringify(refunded));
    eq(await scalar('select status from public.money_purchase_intents where id=$1',[purchase.id]),'revoked');
    eq(await scalar('select amount_minor from public.money_access_ledger_events where id=$1',[refunded.ledgerEventId]),299);
    eq((await event('quotes-refund','REFUND')).duplicateEvent,true);
    eq((await event('quotes-reopen')).status,'ignored');
    step='finite vip and subscription selection';
    await claim(host,hostSession);
    const vipPrices=await scalar("select public.list_creator_supported_prices('vip_pass','ios','sandbox')");
    const vip=await scalar("select public.set_creator_vip_pass_offer_at_price('Quoted VIP','Existing 30 day terms','sandbox',$1)",[vipPrices.find(p=>p.amountMinor===299).priceId]);
    eq(vip.priceCents,299);
    const channelPrices=await scalar("select public.list_creator_supported_prices('channel_subscription','ios','sandbox')");
    eq([...new Set(channelPrices.map(p=>p.amountMinor))],[499]);
    const channel=await scalar("select public.set_creator_channel_subscription_offer_at_price('Quoted channel','Monthly','sandbox',$1)",[channelPrices[0].priceId]);
    eq(channel.priceCents,499);
    await deny(()=>db.query("select public.set_creator_vip_pass_offer_at_price('Wrong type','Monthly','sandbox',$1)",[channelPrices[0].priceId]),/creator_store_price_not_supported/);
    await claim(buyer,buyerSession);
    const vipIntent=await scalar('select public.create_creator_vip_pass_purchase_intent($1)',[vip.id]);eq(vipIntent.amountMinor,299);eq(vipIntent.quote.terms.premiumIncluded,false);
    const channelIntent=await scalar('select public.create_creator_channel_subscription_purchase_intent($1)',[channel.id]);eq(channelIntent.amountMinor,499);
    eq((await scalar('select public.begin_creator_money_checkout($1,$2)',[vipIntent.id,'e9000000-0000-4000-8000-000000000013'])).startAuthorized,true);
    eq((await scalar('select public.begin_creator_money_checkout($1,$2)',[channelIntent.id,'e9000000-0000-4000-8000-000000000014'])).startAuthorized,true);
    await claim(other,otherSession);
    await deny(()=>db.query("select public.pause_creator_offer('vip_pass',$1)",[vip.id]),/creator_offer_not_available/);
    await claim(host,hostSession);
    const paused=await scalar("select public.pause_creator_offer('vip_pass',$1)",[vip.id]);eq(paused.priceCents,299);eq(paused.status,'paused');
    step='paid video and tip exact catalog quotes';
    const video='e9000000-0000-4000-8000-000000000006';
    await service();
    await db.query(`insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes,vip_access_required)
      values($1::uuid,$2::uuid,'Quoted video','public','clean','cloudflare_r2','chillywood-media-origin',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4','video/mp4',1024,false)`,[video,host]);
    await db.query("update public.videos set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now() where id=$1",[video]);
    await db.query("insert into public.creator_tip_settings(creator_id,tips_enabled,status,min_amount_cents,max_amount_cents,currency) values($1,true,'active',100,1000,'usd')",[host]);
    await claim(host,hostSession);
    eq((await scalar("select public.set_creator_content_price('creator_video',$1,true,299,'usd')",[video])).status,'saved');
    await claim(buyer,buyerSession);
    eq(await scalar("select public.list_creator_supported_prices('paid_content','android','sandbox',$1)",[video]),[]);
    const videoIntent=await scalar("select public.create_ios_creator_money_purchase_intent('paid_video',$1,299,'{}')",[video]);eq(videoIntent.amountMinor,299);eq(videoIntent.quote.title,'Quoted video');
    eq(await scalar("select public.list_creator_supported_prices('creator_tip','android','sandbox',$1)",[host]),[],'documented99-cent Android tip does not bypass existing100-cent minimum');
    const tips=await scalar("select public.list_creator_supported_prices('creator_tip','ios','sandbox',$1)",[host]);eq(tips.map(p=>p.amountMinor),[299,499,999]);
    const tipIntent=await scalar("select public.create_ios_app_store_purchase_intent('com.chillywood.tip.tier2','creator_tip',$1,'{}')",[host]);eq(tipIntent.amountMinor,299);eq(tipIntent.quote.terms.premiumIncluded,false);
    eq((await scalar('select public.begin_creator_money_checkout($1,$2)',[videoIntent.id,'e9000000-0000-4000-8000-000000000015'])).startAuthorized,true);
    eq((await scalar('select public.begin_creator_money_checkout($1,$2)',[tipIntent.id,'e9000000-0000-4000-8000-000000000016'])).startAuthorized,true);
    await claim(host,hostSession);
    await scalar("select public.set_creator_content_price('creator_video',$1,true,999,'usd')",[video]);
    await service();
    await db.query("update public.creator_tip_settings set min_amount_cents=500,suggested_amounts_cents=array[999] where creator_id=$1",[host]);
    const videoPaid=await scalar("select public.process_revenuecat_app_store_event_atomic('quotes-video-paid','INITIAL_PURCHASE',$1,'com.chillywood.paidvideo.tier2','sandbox',now(),null,299,'usd',repeat('c',64),'quotes-video-original',null)",[buyer]);eq(videoPaid.status,'processed',JSON.stringify(videoPaid));
    const tipPaid=await scalar("select public.process_revenuecat_app_store_event_atomic('quotes-tip-paid','INITIAL_PURCHASE',$1,'com.chillywood.tip.tier2','sandbox',now(),null,299,'usd',repeat('d',64),'quotes-tip-original',null)",[buyer]);eq(tipPaid.status,'processed',JSON.stringify(tipPaid));
    eq(await scalar('select amount_minor from public.money_access_ledger_events where id=$1',[tipPaid.ledgerEventId]),299);
    eq(await scalar("select count(*)::integer from public.access_grants where grant_type='creator_tip'"),0);
    step='Live Stage checkout claim and current source/expiry controls';
    await service();
    await db.exec("update public.platform_money_kill_switches set state='sandbox_only' where key in('live_watch_party_access_enabled','live_watch_party_seats_enabled')");
    await db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility) values('QUOTESTAGE',$1,'live','open','open',true,'private')",[host]);
    await claim(host,hostSession,'android');
    const stage=await scalar("select public.set_my_live_watch_party_offer('QUOTESTAGE','live_watch_party_access_pass',true,'live_watch_party_access_pass_sandbox_099')");
    await claim(buyer,buyerSession,'android');
    const stageIntent=await scalar('select public.create_live_watch_party_purchase_intent($1)',[stage.offerId]);
    eq((await scalar('select public.begin_creator_money_checkout($1,$2)',[stageIntent.id,'e9000000-0000-4000-8000-000000000019'])).startAuthorized,true);
    eq((await scalar('select public.begin_creator_money_checkout($1,$2)',[stageIntent.id,'e9000000-0000-4000-8000-000000000020'])).startAuthorized,false);
    await claim(other,otherSession);
    const unstarted=await scalar("select public.create_ios_app_store_purchase_intent('com.chillywood.seatpass.tier4','watch_party_live',$1,'{}')",[offer.id]);
    await service();await db.query("update public.paid_watch_party_offers set status='paused' where id=$1",[offer.id]);
    await claim(other,otherSession);
    await deny(()=>db.query('select public.begin_creator_money_checkout($1,$2)',[unstarted.id,'e9000000-0000-4000-8000-000000000021']),/creator_money_checkout_source_unavailable/);
    await service();
    await db.query("update public.paid_watch_party_offers set status='sandbox' where id=$1",[offer.id]);
    // Synthetic expired row still passes all real session/catalog/quote triggers;
    // no production predicate or immutable guard is disabled for this control.
    const expired='e9000000-0000-4000-8000-000000000022';
    await db.query(`insert into public.money_purchase_intents select (jsonb_populate_record(null::public.money_purchase_intents,
      to_jsonb(i)||jsonb_build_object('id',$2::uuid,'idempotency_key','fixture-expired-checkout','expires_at',clock_timestamp()-interval '1 second'))).*
      from public.money_purchase_intents i where id=$1`,[unstarted.id,expired]);
    const preexisting='e9000000-0000-4000-8000-000000000024';
    await db.query(`insert into public.money_purchase_intents select (jsonb_populate_record(null::public.money_purchase_intents,
      to_jsonb(i)||jsonb_build_object('id',$2::uuid,'idempotency_key','fixture-preexisting-checkout'))).*
      from public.money_purchase_intents i where id=$1`,[unstarted.id,preexisting]);
    await claim(other,otherSession);
    await deny(()=>db.query('select public.begin_creator_money_checkout($1,$2)',[expired,'e9000000-0000-4000-8000-000000000023']),/creator_money_checkout_intent_unavailable/);
    eq((await scalar('select public.begin_creator_money_checkout($1,$2)',[unstarted.id,'e9000000-0000-4000-8000-000000000025'])).startAuthorized,true);
    await deny(()=>db.query('select public.begin_creator_money_checkout($1,$2)',[preexisting,'e9000000-0000-4000-8000-000000000026']),/creator_money_checkout_resolution_required/);
    step='unresolved checkout cannot create replacement after expiry';
    await service();
    await db.query("update public.money_purchase_intents set status='expired' where id=$1",[channelIntent.id]);
    await claim(buyer,buyerSession);
    await deny(()=>db.query('select public.create_creator_channel_subscription_purchase_intent($1)',[channel.id]),/creator_money_checkout_resolution_required/);
    eq((await scalar('select public.begin_creator_money_checkout($1,$2)',[channelIntent.id,'e9000000-0000-4000-8000-000000000017'])).startAuthorized,false);
    step='stale session';
    await service();await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[buyerSession]);
    await claim(buyer,buyerSession);
    await deny(()=>db.query("select public.list_creator_supported_prices('vip_pass','ios','sandbox')"),/buyer_session_authority_required/);
    eq(await scalar('select count(*)::integer from public.creator_money_purchase_quotes'),0);
    await deny(()=>db.query('select public.begin_creator_money_checkout($1,$2)',[vipIntent.id,'e9000000-0000-4000-8000-000000000018']),/buyer_session_authority_required/);
    await service();
    const stale=await scalar("select public.process_revenuecat_app_store_event_atomic('quotes-stale-vip','INITIAL_PURCHASE',$1,'com.chillywood.vip.tier2','sandbox',now(),null,299,'usd',repeat('b',64),'quotes-stale-vip-original',null)",[buyer]);
    eq(stale.status,'ignored');eq(stale.reason,'purchase_intent_session_authority_not_current');
    eq(await scalar("select count(*)::integer from public.revenuecat_provider_reconciliation_obligations where original_transaction_id='quotes-stale-vip-original'"),1);
    t.diagnostic(`${checks} assertions; baseline99-only negative control, actual creator/issuance/provider/terminal functions, real sessions/RLS and quote immutability; no provider transport`);
  } catch(error) {error.message=`${step}: ${error.message}${error.where?` (${error.where})`:''}`;throw error;}
  finally {await db.close();}
});

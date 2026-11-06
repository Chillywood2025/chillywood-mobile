// Current-schema sequential fixture checks ONLY. PGlite cannot establish
// independent PostgreSQL backend contention or the native blocking schedules.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {commerceSeedAdapter,seedCommerceCreator,seedQualifiedCommerceCreator,assertBuyerHasNoPremium} from './helpers/automatic-commerce-fixture.mjs';
import {seedCurrentEventCommerceCreator} from './helpers/current-event-commerce-fixture.mjs';
import {seedCashoutExecutionFixture} from './helpers/cashout-execution-fixture.mjs';

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const lit=value=>`'${String(value).replaceAll("'","''")}'`;

test('registered native fixtures seed real creator authority before source calls and retain actual lock barriers',()=>{
 for(const file of ['subscription-bindings-native','room-seat-auction-concurrency','commerce-fee-concurrency']) {
  const source=read(`scripts/test-${file}-postgres.mjs`);
  const seed=source.indexOf('await seedCurrentEventCommerceCreator(commerceSeedAdapter(query))');
  assert.ok(seed>0,file);
  const firstSourceCall=source.search(/(?:const offer=rpc|const auction=rpc|const a=await fixture)/u);
  assert.ok(firstSourceCall>seed,`${file}: seed precedes first guarded creator operation`);
  if(file!=='subscription-bindings-native')assert.ok(source.indexOf("query(readFileSync('tests/fixtures/creator-external-payment-authority.sql'")<seed);
  for(const marker of ['pg_blocking_pids(w.pid)',"w.wait_event_type='Lock'",'restore.assertSourceUnchanged()'])assert.ok(source.includes(marker),`${file}: ${marker}`);
 }
 const cashout=read('scripts/test-sandbox-cashout-concurrency-postgres.mjs');
 const begin=cashout.indexOf('async function seed()'),premium=cashout.indexOf('await seedCommerceCreator',begin);
 const closed=cashout.indexOf("query(\"update public.platform_money_kill_switches set state='off'",begin);
 assert.ok(closed>begin&&closed<premium,'close live mode before sandbox Premium');
 assert.ok(cashout.includes('await seedQualifiedCommerceCreator(commerceSeedAdapter(query),{id:a.creator,session:a.session},{providerAccountId:account})'));
 assert.ok(cashout.includes('pg_blocking_pids(w.pid)'));
 const tip=read('scripts/test-tip-cross-rail-concurrency-postgres.mjs');
 const tipSeed=tip.indexOf('await seedCurrentEventCommerceCreator');
 assert.ok(tip.indexOf('const baselineAccessGrants=')<tip.indexOf('tests/fixtures/'),'inherited snapshot precedes every fixture');
 assert.ok(tipSeed>0&&tipSeed<tip.indexOf('const raceAccessGrants='),'race snapshot follows canonical creator seed');
 assert.ok(tip.indexOf('assert.ok(query(inheritedAccessGrantsSql)===baselineAccessGrants')>tipSeed);
 assert.ok(tip.includes("kind like 'buyer%'"));
 const connect=read('scripts/test-connect-dual-mode-concurrency-postgres.mjs');
 const connectSeed=connect.indexOf("await seedCommerceCreator(commerceSeedAdapter(query),{id:creator,session},{environment:'production'})");
 assert.ok(connectSeed>0&&connectSeed<connect.indexOf('const a=start('));
 const connectMoneyOff=connect.indexOf("query(\"update public.platform_money_kill_switches set state='off'",connectSeed);
 assert.ok(connectMoneyOff>connectSeed&&connectMoneyOff<connect.indexOf('const a=start('));
 assert.ok(connect.includes('pg_blocking_pids(w.pid)'));
});

test('native commerce fixture preflight: canonical creator Premium, Free buyers, exact cohorts and mode ordering',async t=>{
 const {db}=await createDatabase();
 // Each native query is a new psql connection. Reset only connection-local
 // context here so this sequential adapter cannot accidentally retain a role.
 const query=async sql=>{
  await db.exec("reset role;select set_config('request.jwt.claims','{}',false),set_config('request.jwt.claim.role','',false),set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.session_id','',false)");
  try {
   return (await db.exec(sql)).flatMap(result=>result.rows.map(row=>Object.values(row).map(value=>
    value===null?'':typeof value==='boolean'?(value?'t':'f'):typeof value==='object'?JSON.stringify(value):String(value)).join('|'))).join('\n');
  }catch(error){await db.exec('rollback');throw error;}
 };
 const adapter=commerceSeedAdapter(query);
 try {
  await query(read('tests/fixtures/event-reservation-authority.sql'));
  const actors=JSON.parse(await query("select jsonb_object_agg(kind,jsonb_build_object('id',user_id,'session',session_id)) from event_reservation_fixture.actors"));
  const claims=(actor,role='authenticated')=>`set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:actor.id,session_id:actor.session}))};set local request.headers='{"x-chillywood-platform":"ios"}';`;
  const rpc=async(actor,sql,role)=>JSON.parse((await query(`begin;${claims(actor,role)}select to_jsonb(${sql});commit;`)).split('\n').at(-1));
  const noBuyerPremium=async()=>{for(const [kind,actor] of Object.entries(actors))if(kind.startsWith('buyer'))await assertBuyerHasNoPremium(adapter,actor);};
  await t.test('unadapted published fixture reproduces the exact subscription failure',async()=>{
   await assert.rejects(rpc(actors.creator,"public.set_creator_channel_subscription_offer('Native cohorts','Monthly','sandbox')"),/creator_session_premium_required/u);
   await noBuyerPremium();
  });
  await query(read('tests/fixtures/creator-external-payment-authority.sql'));
  await seedCurrentEventCommerceCreator(adapter);
  const grants=await query("select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb) from public.access_grants g");
  await t.test('canonical creator setup preserves all twenty Free buyers and disabled money',async()=>{
   assert.equal(await query(`select private.ordinary_commerce_premium_current(${lit(actors.creator.id)},'sandbox')`),'t');
   assert.equal(await query(`select private.ordinary_creator_provider_ready(${lit(actors.creator.id)},'sandbox')`),'t');
   assert.equal(await query("select bool_and(state='off') from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled')"),'t');
   assert.equal(await query(`select count(*) from public.provider_events where user_id=${lit(actors.creator.id)} and status='processed' and environment='sandbox'`),'1');
   await noBuyerPremium();
  });
  await t.test('subscription cohort setup and duplicate-intent errors execute the current RPCs',async()=>{
   const offer=await rpc(actors.creator,"public.set_creator_channel_subscription_offer('Native cohorts','Monthly','sandbox')");
   const ids={1299:'cb100000-0000-4000-8000-000000000001',1599:'cb100000-0000-4000-8000-000000000002'};
   for(const [amount,id] of Object.entries(ids)){
    await query(`insert into public.monetization_product_store_mappings select
     (jsonb_populate_record(null::public.monetization_product_store_mappings,to_jsonb(m)||jsonb_build_object(
      'id','${id}'::uuid,'provider_product_id','fixture.native.subscription.${amount}','tier','fixture${amount}',
      'apple_subscription_group','fixture_native_subscription','reference_price_minor',${amount},
      'metadata',jsonb_build_object('subscription_period','P1M','creator_subscription_catalog_approved',true)))).*
     from public.monetization_product_store_mappings m where provider_product_id='com.chillywood.channel.subscription.slot1';
     set role service_role;
     select public.approve_creator_channel_subscription_catalog_binding('${offer.id}','${id}','ios','sandbox');`);
   }
   await rpc(actors.creator,`public.set_creator_channel_subscription_offer_at_price('Native cohorts','Monthly','sandbox','${ids[1299]}')`);
   const first=await rpc(actors.buyer16,`public.create_creator_channel_subscription_purchase_intent('${offer.id}')`);
   assert.equal(first.amountMinor,1299);
   await assert.rejects(rpc(actors.buyer16,`public.create_creator_channel_subscription_purchase_intent('${offer.id}')`),/source_purchase_intent_already_pending/u);
   await rpc(actors.creator,`public.set_creator_channel_subscription_offer_at_price('New cohort','Monthly','sandbox','${ids[1599]}')`);
   const next=await rpc(actors.buyer17,`public.create_creator_channel_subscription_purchase_intent('${offer.id}')`);
   assert.equal(next.amountMinor,1599);assert.equal(next.subscriptionCatalogBinding.priceId,ids[1599]);
   assert.deepEqual(next.quote.terms.subscriptionCatalogBinding,next.subscriptionCatalogBinding);
   assert.equal(await query(`select count(*) from public.money_purchase_intents i join public.creator_money_purchase_quotes q on q.purchase_intent_id=i.id
    join public.creator_channel_subscription_catalog_bindings b on b.id=i.subscription_catalog_binding_id
    where i.source_id='${offer.id}' and (i.amount_minor<>b.amount_minor or q.amount_minor<>b.amount_minor
     or i.provider_product_id<>b.provider_product_id or q.subscription_catalog_binding_id<>b.id)`),'0');
  });
  await t.test('room auction, Party offer and event setup retain current source authority without granting access',async()=>{
   const party='NATIVE-FIXTURE-STAGE';
   await query(`begin;${claims(actors.creator)}insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
    values('${party}','${actors.creator.id}','live','open','open',true,'private');commit;`);
   const prepared=await rpc(actors.creator,`public.prepare_creator_room_seat_auction('${party}')`);
   const auction=await rpc(actors.creator,`public.create_creator_room_seat_auction('${party}','stage_reserved_seat',100,25,now()+interval '1 hour',now()+interval '2 hours','test',gen_random_uuid(),'${prepared.roomSessionId}')`);
   assert.ok(auction.id);
   await query("insert into public.titles(id,title,video_url,is_published,status) values('12121212-1212-4212-8212-121212121212','Synthetic room title','https://fixture.invalid/title.mp4',true,'published')");
   await query(`begin;${claims(actors.creator)}insert into public.watch_party_rooms(party_id,title_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
    values('NATIVE-FIXTURE-PARTY','12121212-1212-4212-8212-121212121212','${actors.creator.id}','title','open','party_pass',true,'private');commit;`);
   const partyOffer=await rpc(actors.creator,"public.set_paid_watch_party_offer('NATIVE-FIXTURE-PARTY','Limited admission',99,1,'sandbox')");
   assert.ok(partyOffer.id);
   const event=await query("select id from event_reservation_fixture.events where name='show1'");
   const sale=await rpc(actors.creator,`public.configure_paid_creator_event_sale('${event}','Native sandbox show',99,1,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day')`);
   assert.ok(sale.termsRevisionId);
   assert.equal(await query("select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb) from public.access_grants g"),grants,'creation and pending intents cannot add or alter access grants');
   await noBuyerPremium();
  });
  await t.test('tip cross-rail fixture admits exact source quotes while Free buyers gain no content',async()=>{
   await query(read('tests/fixtures/creator-external-payment-capabilities.sql'));
   const tip=randomUUID(),action=randomUUID(),buyer=actors.buyer9;
   const quote={tipId:tip,creatorId:actors.creator.id,amountCents:299,currency:'usd',privateNote:null,providerAccountId:'acct_fixture',
    capabilityId:'ef000000-0000-4000-8000-000000000001',body:{client_reference_id:tip,'metadata[chillywood_tip_id]':tip,
     'metadata[fan_user_id]':buyer.id,'metadata[creator_user_id]':actors.creator.id,'line_items[0][price_data][currency]':'usd',
     'line_items[0][price_data][unit_amount]':299,'payment_intent_data[transfer_data][destination]':'acct_fixture',
     'payment_method_types[0]':'card',mode:'payment',expires_at:Math.floor(Date.now()/1000)+3600}};
   const intent=await rpc(actors.buyer10,`public.create_ios_app_store_purchase_intent('com.chillywood.tip.tier2','creator_tip','${actors.creator.id}','{}')`);
   assert.ok(intent.id);
   const attempt=await rpc(buyer,`public.reserve_creator_tip_checkout_attempt('${buyer.id}','${buyer.session}','${action}',${lit(JSON.stringify(quote))}::jsonb)`,'service_role');
   assert.ok(attempt);
   assert.equal(await query("select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb) from public.access_grants g"),grants);
   await noBuyerPremium();
  });
  await t.test('Connect dual-mode onboarding gets Premium without inventing verified provider or compliance facts',async()=>{
   const actor={id:randomUUID(),session:randomUUID()},testId=randomUUID(),platform='acct_nativePlatform',liveAccount='acct_nativeLive';
   await query(`insert into auth.users(id,email_confirmed_at,is_sso_user,is_anonymous) values('${actor.id}',now(),false,false);
    insert into auth.sessions(id,user_id) values('${actor.session}','${actor.id}');
    insert into public.wave1_legal_document_versions(document_key,version,market,capability,effective_at) values('payout_terms','native-dual-mode','UNITED_STATES','payout',now()-interval '1 day') on conflict do nothing;
    insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
    select '${actor.id}',public.wave1_sha256('${actor.id}'),document_key,version,market,'member',capability,'${actor.session}','service_reconciliation' from public.wave1_legal_document_versions where active and market='UNITED_STATES';
    insert into public.wave1_creator_eligibility(creator_user_id,state,account_status,age_18_plus,legal_accepted,creator_role,moderation_state,market,rollout_eligible,platform_capability,provider_eligible,kyc_complete,tax_complete,sanctions_clear,payout_eligible,authority_source,last_operation_key)
    values('${actor.id}','PENDING_VERIFICATION','ACTIVE',true,true,true,'CLEAR','UNITED_STATES',true,true,null,null,null,null,null,'synthetic_fixture','native');
    insert into public.creator_payout_accounts(id,creator_user_id,provider,provider_environment,provider_account_id) values('${testId}','${actor.id}','stripe_connect','test','acct_nativeTest');
    insert into private.creator_connect_onboarding_policy(environment,enabled,platform_account_id,configuration_key,country,currency,return_url,refresh_url,controller_pricing_evidence_hash,hosted_onboarding_evidence_hash,verified_at,expires_at)
    values('live',true,'${platform}','stripe_connect_live_express_recipient_controller_v1','US','usd','https://synthetic.invalid/return','https://synthetic.invalid/refresh',repeat('a',64),repeat('b',64),clock_timestamp(),clock_timestamp()+interval '1 day');`);
   const confirm=`public.confirm_creator_connect_live_setup('${actor.id}','${actor.session}','distinct-live-account-v1')`;
   await assert.rejects(rpc(actor,confirm,'service_role'),/creator_session_premium_required/u);
   await seedCommerceCreator(adapter,actor);
   assert.equal(await query(`select private.ordinary_creator_provider_ready('${actor.id}','sandbox')`),'f');
   assert.equal((await rpc(actor,confirm,'service_role')).status,'creator_onboarding_eligibility_required','sandbox Premium cannot authorize live hosted setup');
   await seedCommerceCreator(adapter,actor,{environment:'production'});
   await query("update public.platform_money_kill_switches set state='off' where key in ('live_money_enabled','payouts_enabled')");
   // Unknown onboarding evidence is not verified evidence. Conversely, each
   // explicit false is a real disqualification, never a pending placeholder.
   for(const column of ['provider_eligible','kyc_complete','tax_complete','sanctions_clear','payout_eligible']){
    const result=JSON.parse((await query(`begin;update public.wave1_creator_eligibility set ${column}=false where creator_user_id='${actor.id}';
     ${claims(actor,'service_role')}select public.get_creator_connect_onboarding_route('${actor.id}','${actor.session}');rollback;`)).split('\n').at(-1));
    assert.equal(result.status,'creator_onboarding_eligibility_required',`${column}: explicit false still blocks onboarding`);
   }
   assert.equal((await rpc(actor,confirm,'service_role')).status,'available');
   const reserved=await rpc(actor,`public.reserve_creator_connect_account_creation('${actor.id}','${actor.session}')`,'service_role');
   assert.ok(reserved.attemptId);
   assert.equal((await rpc(actor,`public.claim_creator_connect_account_creation('${actor.id}','${actor.session}','${reserved.attemptId}')`,'service_role')).claimed,true);
   const facts={attemptId:reserved.attemptId,creatorId:actor.id,platformAccountId:platform,accountId:liveAccount,environment:'live',modeVerified:true,configurationKey:'stripe_connect_live_express_recipient_controller_v1',country:'US',currency:'usd',payoutSchedule:'manual',controllerStatus:'match'};
   assert.equal((await rpc(actor,`public.record_creator_connect_created_account('${actor.id}','${actor.session}','${reserved.attemptId}','${liveAccount}',${lit(JSON.stringify(facts))}::jsonb)`,'service_role')).bound,true);
   assert.equal(await query(`select private.ordinary_creator_provider_ready('${actor.id}','production')`),'f');
   assert.equal(await query(`select bool_and(state='PENDING_VERIFICATION' and provider_eligible is null and kyc_complete is null and tax_complete is null and sanctions_clear is null and payout_eligible is null)
    from public.wave1_creator_eligibility where creator_user_id='${actor.id}'`),'t');
   assert.equal(await query("select count(*) from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled') and state<>'off'"),'0');
  });
  await t.test('cashout seed closes inherited live mode before a genuinely sandbox Premium event',async()=>{
   const cashout=await seedCashoutExecutionFixture(db,{creatorId:randomUUID(),sessionId:randomUUID(),recipientAccountId:'acct_'+randomUUID().replaceAll('-',''),reserveInitialRequest:false});
   const actor={id:cashout.creator,session:cashout.session};
   // This control captures why the former native ordering was stale, without
   // removing any source guard or manufacturing an entitlement/grant row.
   assert.equal(await query("select state from public.platform_money_kill_switches where key='live_money_enabled'"),'on');
   await query("update public.platform_money_kill_switches set state='off' where key in ('live_money_enabled','payouts_enabled','cashout_enabled')");
   await seedCommerceCreator(adapter,actor);
   assert.equal(await query(`select private.ordinary_commerce_premium_current('${actor.id}','sandbox')`),'t');
   assert.equal(await query(`select private.ordinary_commerce_premium_current('${actor.id}','production')`),'f');
   const suffix=randomUUID().replaceAll('-',''),schema='auction_native_'+suffix,account='acct_native'+suffix;
   await query(read('tests/fixtures/event-reservation-authority.sql').replaceAll('event_reservation_fixture',schema).replaceAll('event-reservation',`native-${suffix}`));
   await query(read('tests/fixtures/creator-external-payment-authority.sql').replaceAll('event_reservation_fixture',schema).replaceAll('acct_fixture',account));
   const auctionActors=JSON.parse(await query(`select jsonb_object_agg(kind,jsonb_build_object('id',user_id,'session',session_id)) from ${schema}.actors`));
   await seedQualifiedCommerceCreator(adapter,auctionActors.creator,{providerAccountId:account});
   for(const [kind,buyer] of Object.entries(auctionActors))if(kind.startsWith('buyer'))await assertBuyerHasNoPremium(adapter,buyer);
   const event=await query(`select id from ${schema}.events where name='show1'`);
   const sale=await rpc(auctionActors.creator,`public.configure_paid_creator_event_sale('${event}','Native sandbox show',99,1,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day')`);
   assert.ok(sale.termsRevisionId);
  });
  await t.test('pgTAP authority helpers are transaction-local and not usable by runtime roles',async()=>{
   await query(`begin;${read('supabase/tests/fixtures/automatic-commerce.inc')}`);
   assert.equal(await db.query("select has_function_privilege('authenticated','pg_temp.seed_creator_premium(uuid,text)','execute') allowed").then(result=>result.rows[0].allowed),false);
   await db.exec('rollback');
   assert.equal((await db.query("select to_regprocedure('pg_temp.seed_creator_premium(uuid,text)') helper")).rows[0].helper,null);
   await db.exec(`begin;${read('supabase/tests/fixtures/automatic-commerce.inc')}`);
   await db.exec('rollback');
  });
  t.diagnostic('Sequential fixture preflight only. Independent native PostgreSQL contention NOT RUN.');
 }finally{await db.close();}
});

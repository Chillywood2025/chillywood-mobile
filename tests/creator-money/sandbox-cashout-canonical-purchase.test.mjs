import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

// Real purchase-intent and provider processors in a full disposable schema.
// Only users, legal acceptance, test product/account qualification and the signed
// provider delivery inputs are fixtures. No provider/earnings ledger is inserted
// by this test. This does not establish a real store receipt or live readiness.
test('canonical subscriptions, renewals, tips, video, VIP, fixed tickets and room admission reserve sandbox sources and invalidate on refunds', {timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 // Explicit simulated settlement: 5% tax + 20% platform (never on tips)
 // + 3% provider + 2 minor units fixed. No fixture claims actual provider fees.
 const simulatedNet=(amount,isTip=false)=>amount-Math.ceil(amount*.05)-(isTip?0:Math.ceil(amount*.2))-Math.ceil(amount*.03)-2;
 const hostSession='cd000000-0000-4000-8000-000000000001';
 const buyers=['cd000000-0000-4000-8000-000000000010','cd000000-0000-4000-8000-000000000020'];
 const sessions=['cd000000-0000-4000-8000-000000000011','cd000000-0000-4000-8000-000000000021'];
 const service=async()=>{await db.exec('reset role');await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.jwt.claim.role','service_role',false)");};
 const claim=async(user,session,platform='ios')=>{
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','authenticated',false),set_config('request.headers',$2,false)",
   [JSON.stringify({role:'authenticated',sub:user,session_id:session}),JSON.stringify({'x-chillywood-platform':platform})]);
  await db.exec('set role authenticated');
 };
 try {
  const host=await scalar("select md5('sandbox-cashout-canonical-host:'||n)::uuid from generate_series(1,10000)n where mod(hashtextextended('chillywood-wave1-us-rollout-v1:'||md5('sandbox-cashout-canonical-host:'||n)::uuid::text,20260814),100)=0 limit 1");
  for(const [user,session] of [[host,hostSession],...buyers.map((user,i)=>[user,sessions[i]])]){
   await db.query('insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values($1,false,false,now())',[user]);
   await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);
   await db.query('insert into public.sandbox_monetization_testers(user_id) values($1)',[user]);
  }
  await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
   select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
   from auth.sessions s cross join public.wave1_legal_document_versions d where d.active and d.market='UNITED_STATES'
   and (d.capability='account' or (s.user_id=$1 and d.capability in('creator','creator_money')))`,[host]);
  await service();
  assert.equal((await scalar(`select public.wave1_evaluate_creator_eligibility($1,
   '{"accountStatus":"ACTIVE","age18Plus":true,"legalAccepted":true,"creatorRole":true,"moderationState":"CLEAR","market":"UNITED_STATES","rolloutEligible":true,"platformCapability":true,"providerEligible":true,"kycComplete":true,"taxComplete":true,"sanctionsClear":true,"payoutEligible":true,"inputVersions":{"evaluationSequence":1}}',
   'sandbox-cashout-canonical-fixture','local_pgtap')`,[host])).state,'VERIFIED');
  await db.exec("update public.platform_money_kill_switches set state='sandbox_only' where key in ('revenuecat_app_store_enabled','revenuecat_google_play_enabled','provider_webhooks_enabled','creator_monetization_enabled','digital_sales_enabled','stripe_connect_enabled'); update public.platform_money_kill_switches set state='off' where key in ('live_money_enabled','payouts_enabled','cashout_enabled')");
  const qualification=await scalar(`insert into private.sandbox_cashout_qualifications(creator_id,platform_account_id,account_id,destination_id,payout_type,source_type,
   provider_fee_bps,provider_fee_fixed_minor,settlement_policy_version,simulated_tax_bps,simulated_platform_bps,simulated_provider_bps,simulated_provider_fixed_minor,
   manual_schedule_verified,exclusive_writer_verified,zero_additional_application_fee_verified,platform_fee_payer_verified,test_mode_verified,provider_evidence_reference,verified_at,expires_at)
   values($1,'acct_canonicalSandboxPlatform','acct_canonicalSandboxCreator','ba_canonicalSandboxDestination','scheduled','card',0,0,
   'SYNTHETIC-CANONICAL-TEST-tip-policy-v2',500,2000,300,2,true,true,true,true,true,'SYNTHETIC DISPOSABLE TEST ONLY',now()-interval '1 minute',now()+interval '1 day') returning id`,[host]);
  await claim(host,hostSession);
  const offer=await scalar("select public.set_creator_channel_subscription_offer('Sandbox cashout canonical monthly','Monthly','sandbox')");
  await service();
  await db.exec("update public.platform_money_kill_switches set state='sandbox_only' where key='tips_enabled'");
  await db.query("insert into public.creator_tip_settings(creator_id,tips_enabled,status,min_amount_cents,max_amount_cents,currency) values($1,true,'active',100,1000,'usd')",[host]);
  const receipts=[];
  for(const [index,platform] of ['ios','android'].entries()){
   await claim(buyers[index],sessions[index],platform);
   const intent=await scalar('select public.create_creator_channel_subscription_purchase_intent($1)',[offer.id]);
   assert.equal(intent.amountMinor,499);
   assert.equal(intent.provider,platform==='ios'?'revenuecat_app_store':'revenuecat_google_play');
   assert.equal((await scalar('select public.begin_creator_money_checkout($1,gen_random_uuid())',[intent.id])).startAuthorized,true);
   await service();
   const fn=platform==='ios'?'process_revenuecat_app_store_event_atomic':'process_revenuecat_google_play_event_atomic';
   const original=`canonical-cashout-${platform}-original`;
   const process=type=>scalar(`select public.${fn}($1,$2,$3,$4,'sandbox',now(),now()+interval '31 days',$5,'usd',repeat('a',64),$6,null)`,
    [`canonical-cashout-${platform}-${type}`,type,buyers[index],intent.providerProductId,intent.amountMinor,original]);
   const purchased=await process('INITIAL_PURCHASE');
   assert.equal(purchased.status,'processed',JSON.stringify(purchased));
   assert.ok(purchased.ledgerEventId,'canonical processor returned ledger identity');
   const ledger=(await db.query('select * from public.money_access_ledger_events where id=$1',[purchased.ledgerEventId])).rows[0];
   assert.equal(ledger.creator_id,host);assert.equal(ledger.user_id,buyers[index]);
   assert.equal(ledger.environment,'sandbox');assert.equal(ledger.payable_state,'not_payable');
   assert.equal(ledger.amount_minor,499);
   const source=await scalar('select private.sandbox_cashout_source($1,$2)',[purchased.ledgerEventId,qualification]);
   assert.equal(source?.netMinor,simulatedNet(499),`${platform} canonical subscription retains simulated platform, tax and provider deductions`);
   const duplicate=await process('INITIAL_PURCHASE');
   assert.equal(duplicate.ledgerEventId,purchased.ledgerEventId,'duplicate provider delivery must not create a second source');
   const renewed=await process('RENEWAL');
   assert.equal(renewed.status,'processed',JSON.stringify(renewed));
   assert.notEqual(renewed.ledgerEventId,purchased.ledgerEventId);
   assert.equal((await scalar('select private.sandbox_cashout_source($1,$2)',[renewed.ledgerEventId,qualification]))?.netMinor,simulatedNet(499));
   assert.equal((await process('RENEWAL')).ledgerEventId,renewed.ledgerEventId,'renewal replay must not earn twice');
   receipts.push({platform,purchased,renewed,process});
   // Existing Android99 is admitted exactly despite legacy min100 metadata.
   // No new SKU or provider qualification is invented.
   await claim(buyers[index],sessions[index],platform);
   const tip=await scalar(platform==='ios'
    ? "select public.create_ios_app_store_purchase_intent('com.chillywood.tip.tier2','creator_tip',$1,'{}')"
    : "select public.create_money_purchase_intent('creator_tip_sandbox_099','creator_tip',$1,'{}')",[host]);
   assert.equal(tip.amountMinor,platform==='ios'?299:99);
   assert.equal((await scalar('select public.begin_creator_money_checkout($1,gen_random_uuid())',[tip.id])).startAuthorized,true);
   await service();
   const tipProcess=type=>scalar(`select public.${fn}($1,$2,$3,$4,'sandbox',now(),null,$5,'usd',repeat('b',64),$6,null)`,
    [`canonical-tip-${platform}-${type}`,type,buyers[index],tip.providerProductId,tip.amountMinor,`canonical-tip-${platform}-original`]);
   const tipped=await tipProcess('NON_RENEWING_PURCHASE');
   assert.equal(tipped.status,'processed',JSON.stringify(tipped));
   const tipSource=await scalar('select private.sandbox_cashout_source($1,$2)',[tipped.ledgerEventId,qualification]);
   const tipBinding=await scalar(`select jsonb_build_object('ledger',to_jsonb(m),'provider',to_jsonb(p),'product',to_jsonb(c),'intent',to_jsonb(i))
    from public.money_access_ledger_events m join public.provider_events p on p.id=m.provider_event_id
    left join public.monetization_products c on c.id=m.product_id left join public.money_purchase_intents i on i.id::text=m.metadata->>'purchase_intent_id' where m.id=$1`,[tipped.ledgerEventId]);
   assert.equal(tipSource?.netMinor,simulatedNet(tip.amountMinor,true),`canonical tip waives only platform deduction, never simulated tax/provider costs: ${JSON.stringify(tipBinding)}`);
   assert.equal(tipSource.netMinor,platform==='ios'?273:89,'tip subtracts simulated tax/provider costs, never platform commission');
   // Real-SQL negative control reproduces the original blanket platform fee in
   // this disposable transaction, then restores the reviewed helper atomically.
   const sourceDefinition=await scalar("select pg_get_functiondef('private.sandbox_cashout_source(uuid,uuid)'::regprocedure)");
   const blanketPlatform=sourceDefinition.replace('platform_bps:=0;','platform_bps:=q.simulated_platform_bps;');
   assert.notEqual(blanketPlatform,sourceDefinition,'negative control targets exact tip platform exemption');
   await db.exec('begin');
   try{
    await db.exec(blanketPlatform);
    const incorrect=await scalar('select private.sandbox_cashout_source($1,$2)',[tipped.ledgerEventId,qualification]);
    assert.equal(incorrect?.netMinor,simulatedNet(tip.amountMinor),'old blanket formula incorrectly subtracts platform commission');
    assert.notEqual(incorrect.netMinor,tipSource.netMinor);
   }finally{await db.exec('rollback');}
   const tipLedger=(await db.query('select * from public.money_access_ledger_events where id=$1',[tipped.ledgerEventId])).rows[0];
   assert.equal(tipLedger.amount_minor,platform==='ios'?299:99);
   assert.equal(tipLedger.environment,'sandbox');assert.equal(tipLedger.payable_state,'not_payable');
   // Future offer availability/pricing cannot rewrite the consumed receipt's
   // original economics or revoke its historical no-commission tip identity.
   await db.exec('begin');
   try{
    if(platform==='ios') await db.query("update public.monetization_product_store_mappings set status='disabled',reference_price_minor=999 where id::text=$1",[tipBinding.intent.metadata.store_mapping_id]);
    else await db.query("update public.monetization_products set status='disabled',metadata=jsonb_set(metadata,'{price_tier}','\"999\"'::jsonb) where id=$1",[tipBinding.product.id]);
    await db.query('update public.creator_tip_settings set min_amount_cents=500 where creator_id=$1',[host]);
    const historical=await scalar('select private.sandbox_cashout_source($1,$2)',[tipLedger.id,qualification]);
    assert.deepEqual(historical,tipSource,'unpublishing/repricing current offer preserves exact historical tip net and hash');
   }finally{await db.exec('rollback');}

   for(const [label,sql,args] of [
    ['source kind',"update public.money_access_ledger_events set source_type='paid_content' where id=$1",[tipLedger.id]],
    ['ledger product','update public.money_access_ledger_events set product_id=$2 where id=$1',[tipLedger.id,ledger.product_id]],
    ['provider product','update public.provider_events set product_id=$2 where id=$1',[tipLedger.provider_event_id,ledger.product_id]],
    ['provider rail',"update public.provider_events set provider=$2 where id=$1",[tipLedger.provider_event_id,platform==='ios'?'revenuecat_google_play':'revenuecat_app_store']],
    ['provider intent linkage',"update public.provider_events set metadata=jsonb_set(metadata,'{purchase_intent_id}',to_jsonb(gen_random_uuid()::text)) where id=$1",[tipLedger.provider_event_id]],
    ['provider transaction linkage',"update public.provider_events set metadata=jsonb_set(metadata,'{original_transaction_id}','\"different-canonical-original\"'::jsonb) where id=$1",[tipLedger.provider_event_id]],
   ]){
    await db.exec('begin');
    try{
     await db.query(sql,args);
     const changed=await scalar('select private.sandbox_cashout_source($1,$2)',[tipLedger.id,qualification]);
     assert.ok(changed===null||changed.netMinor===simulatedNet(tip.amountMinor),`${label} mismatch cannot obtain tip waiver`);
     assert.notEqual(changed?.sourceHash,tipSource.sourceHash,`${label} identity change invalidates original source hash`);
    }finally{await db.exec('rollback');}
   }
   assert.equal((await tipProcess('NON_RENEWING_PURCHASE')).ledgerEventId,tipped.ledgerEventId);
   receipts.push({platform,purchased:tipped,process:tipProcess});
  }
  await service();
  await db.exec("update public.platform_money_kill_switches set state='sandbox_only' where key in ('watch_party_tickets_enabled','paid_content_enabled')");
  const video='cd000000-0000-4000-8000-000000000030';
  const event='cd000000-0000-4000-8000-000000000040';
  await db.query("insert into public.creator_events(id,host_user_id,event_title,event_type,status,starts_at,ends_at,time_zone,replay_policy,visibility) values($1,$2,'Canonical fixed ticket','live_first','scheduled',now()+interval '7 days',now()+interval '7 days 2 hours','America/New_York','none','public')",[event,host]);
  await db.query(`insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes,vip_access_required)
   values($1::uuid,$2::uuid,'Canonical cashout video','public','clean','cloudflare_r2','chillywood-media-origin',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4','video/mp4',1024,false)`,[video,host]);
  await db.query("update public.videos set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now() where id=$1",[video]);
  await db.query("insert into public.watch_party_rooms(party_id,title_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility) values('CANONICAL-CASHOUT-ROOM','canonical-title',$1,'title','open','party_pass',true,'private')",[host]);
  await claim(host,hostSession);
  assert.equal((await scalar("select public.set_creator_content_price('creator_video',$1,true,99,'usd')",[video])).status,'saved');
  const vipPrices=await scalar("select public.list_creator_supported_prices('vip_pass','ios','sandbox')");
  const vip=await scalar("select public.set_creator_vip_pass_offer_at_price('Canonical VIP','Existing 30 day terms','sandbox',$1)",[vipPrices.find(p=>p.amountMinor===499).priceId]);
  const room=await scalar("select public.set_paid_watch_party_offer('CANONICAL-CASHOUT-ROOM','Canonical admission',99,null,'sandbox')");
  const ticket=await scalar("select public.configure_paid_creator_event_sale($1,'Canonical fixed ticket',99,5,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day')",[event]);
  for(const [lane,platform,source,sql] of [
   ['paid_video','ios',video,"select public.create_ios_creator_money_purchase_intent('paid_video',$1,99,'{}')"],
   ['paid_video','android',video,"select public.create_money_purchase_intent('paid_content_access_sandbox_099','paid_content',$1,'{}')"],
   ['vip_pass','ios',vip.id,'select public.create_creator_vip_pass_purchase_intent($1)'],
   ['vip_pass','android',vip.id,'select public.create_creator_vip_pass_purchase_intent($1)'],
   ['watch_party_live','ios',room.id,"select public.create_ios_app_store_purchase_intent('com.chillywood.seatpass.tier1','watch_party_live',$1,'{}')"],
   ['watch_party_live','android',room.id,"select public.create_money_purchase_intent('watch_party_live_ticket_sandbox_099','watch_party_live',$1,'{}')"],
   ['event','ios',ticket.id,`select public.create_reserved_creator_event_purchase_intent($1,'${ticket.termsRevisionId}')`],
   ['event','android',ticket.id,`select public.create_reserved_creator_event_purchase_intent($1,'${ticket.termsRevisionId}')`],
  ]){
   const index=platform==='ios'?0:1;
   await claim(buyers[index],sessions[index],platform);
   const intent=await scalar(sql,[source]);
   assert.equal((await scalar(`select public.${lane==='event'?'begin_creator_event_checkout':'begin_creator_money_checkout'}($1,gen_random_uuid())`,[intent.id])).startAuthorized,true,`${lane} checkout`);
   await service();
   const fn=platform==='ios'?'process_revenuecat_app_store_event_atomic':'process_revenuecat_google_play_event_atomic';
   const process=type=>scalar(`select public.${fn}($1,$2,$3,$4,'sandbox',now(),null,$5,'usd',repeat('c',64),$6,null,$7)`,
    [`canonical-${lane}-${platform}-${type}`,type,buyers[index],intent.providerProductId,intent.amountMinor,`canonical-${lane}-${platform}-original`,intent.createdAt]);
   const purchased=await process('NON_RENEWING_PURCHASE');
   assert.equal(purchased.status,'processed',`${lane}: ${JSON.stringify(purchased)}`);
   assert.equal((await scalar('select private.sandbox_cashout_source($1,$2)',[purchased.ledgerEventId,qualification]))?.netMinor,
    simulatedNet(intent.amountMinor),`${lane} canonical source keeps 20% platform plus simulated tax/provider costs`);
   if(lane==='paid_video'){
    const before=await scalar('select private.sandbox_cashout_source($1,$2)',[purchased.ledgerEventId,qualification]);
    assert.equal(before.netMinor,69,'99 paid content minus 5 tax, 20 platform, 3 provider, 2 fixed');
    await db.exec('begin');
    try{
     await db.query(`update public.money_access_ledger_events set metadata=metadata||'{"is_tip":true,"platform_minor":0,"no_app_fee":true,"source_type":"creator_tip"}'::jsonb where id=$1`,[purchased.ledgerEventId]);
     const forged=await scalar('select private.sandbox_cashout_source($1,$2)',[purchased.ledgerEventId,qualification]);
     assert.equal(forged?.netMinor,before.netMinor,'client-like tip/no-fee metadata never waives paid-content platform fee');
     assert.notEqual(forged.sourceHash,before.sourceHash,'changed source evidence invalidates old reservation hash');
    }finally{await db.exec('rollback');}
   }
   assert.equal((await process('NON_RENEWING_PURCHASE')).ledgerEventId,purchased.ledgerEventId);
   receipts.push({platform:`${platform}/${lane}`,purchased,process});
  }
  await service();
  await db.exec("update public.platform_money_kill_switches set state='sandbox_only' where key in ('live_watch_party_access_enabled','live_watch_party_seats_enabled')");
  await db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility) values('CANONICAL-CASHOUT-STAGE',$1,'live','open','open',true,'private')",[host]);
  for(const kind of ['access','seat']){
  await claim(host,hostSession,'android');
  const stage=await scalar(`select public.set_my_live_watch_party_offer('CANONICAL-CASHOUT-STAGE','live_watch_party_${kind}_pass',true,'live_watch_party_${kind}_pass_sandbox_099')`);
  await claim(buyers[1],sessions[1],'android');
  const stageIntent=await scalar('select public.create_live_watch_party_purchase_intent($1)',[stage.offerId]);
  assert.equal((await scalar('select public.begin_creator_money_checkout($1,gen_random_uuid())',[stageIntent.id])).startAuthorized,true);
  await service();
  const stageProcess=type=>scalar("select public.process_revenuecat_live_watch_party_event_atomic('revenuecat_google_play',$1,$2,$3,$4,'sandbox',now(),99,'usd',repeat('d',64),$5)",
   [`canonical-live-stage-${kind}-${type}`,type,buyers[1],stageIntent.providerProductId,`canonical-live-stage-${kind}-original`]);
  const stagePaid=await stageProcess('NON_RENEWING_PURCHASE');
  assert.equal(stagePaid.status,'processed',JSON.stringify(stagePaid));
  assert.equal((await scalar('select private.sandbox_cashout_source($1,$2)',[stagePaid.ledgerEventId,qualification]))?.netMinor,simulatedNet(99),'dedicated Live Stage access retains platform/tax/provider deductions');
  assert.equal((await stageProcess('NON_RENEWING_PURCHASE')).duplicateProviderEvent,true);
  // The native seat pass proves eligibility only, not host approval, a speaking
  // role or the separately auctioned reserved stage-seat inventory claim.
  receipts.push({platform:`android/live_stage_${kind}`,purchased:stagePaid,process:stageProcess,refundStatus:'refunded'});
  }
  assert.equal(await scalar("select count(*)::int from public.money_access_ledger_events where creator_id=$1 and environment='sandbox'",[host]),receipts.length+receipts.filter(r=>r.renewed).length);
  await service();
  await db.exec('update private.sandbox_cashout_control set enabled=true');
  await db.query("insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,country) values($1,'stripe_connect','test','acct_canonicalSandboxCreator','US')",[host]);
  const net=await scalar("select sum((private.sandbox_cashout_source(id,$2)->>'netMinor')::int)::int from public.money_access_ledger_events where creator_id=$1",[host,qualification]);
  await claim(host,hostSession);
  const quote=await scalar("select public.preview_sandbox_creator_cashout($1,'scheduled')",[net]);assert.equal(quote.ready,true);
  const reserved=await scalar("select public.request_sandbox_creator_cashout($1,'scheduled',$2,gen_random_uuid(),$3,$4,$5)",[net,qualification,quote.appFeeMinor,quote.expectedProviderFeeMinor,quote.bankMinor]);
  await service();
  assert.equal(await scalar('select count(*)::int from private.sandbox_cashout_allocations where execution_id=$1',[reserved.requestId]),receipts.length+receipts.filter(r=>r.renewed).length,'every canonical lane has its own reserved ledger allocation');
  assert.equal(await scalar("select count(*)::int from private.sandbox_cashout_allocations a where execution_id=$1 and amount_minor<>(private.sandbox_cashout_source(money_ledger_id,$2)->>'netMinor')::int",[reserved.requestId,qualification]),0);
  for(const {platform,purchased,renewed,process,refundStatus='processed'} of receipts){
   const refund=await process('REFUND');assert.equal(refund.status,refundStatus,JSON.stringify(refund));
   assert.equal(await scalar('select private.sandbox_cashout_source($1,$2)',[purchased.ledgerEventId,qualification]),null,`${platform} canonical refund must invalidate the original source`);
   if(renewed) assert.equal(await scalar('select private.sandbox_cashout_source($1,$2)',[renewed.ledgerEventId,qualification]),null,'same-transaction refund holds renewable earnings');
   assert.equal(await scalar('select source_hold from private.sandbox_cashout_executions where id=$1',[reserved.requestId]),true,`${platform} reserved cashout stays held throughout canonical refunds`);
  }
  assert.equal(await scalar("select count(*)::int from public.money_access_ledger_events where creator_id=$1 and payable_state in ('payable','paid')",[host]),0);
  assert.equal(await scalar('select count(*)::int from private.creator_cashout_executions'),0);
 }finally{await db.close();}
});

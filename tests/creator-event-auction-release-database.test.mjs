import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

test('historical event release protocol replays forward into current tax-fee reserve and dispatch holds',{timeout:180000},async()=>{
 const realNow=Date.now;let offset=0;Date.now=()=>realNow()+offset;
 const migrationDir=new URL('../supabase/migrations/',import.meta.url);
 const successors=fs.readdirSync(migrationDir).filter(name=>name.endsWith('.sql')&&name>='20261031033642_').sort();
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false,excludeMigrations:successors});
 try{
  for(const file of ['event-reservation-authority','creator-external-payment-authority','event-broadcast-producer-authority'])
   await db.exec(fs.readFileSync(new URL(`./fixtures/${file}.sql`,import.meta.url),'utf8'));
  const rows=async(sql,params)=>(await db.query(sql,params)).rows;
  const actors=Object.fromEntries((await rows('select * from event_reservation_fixture.actors')).map(a=>[a.kind,a]));
  const lit=x=>`'${String(x).replaceAll("'","''")}'`;
  const rpc=async(who,sql,role='authenticated')=>{
   const a=actors[who];try{const results=await db.exec(`begin;set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:a.user_id,session_id:a.session_id}))};
    set local request.headers='{"x-chillywood-platform":"ios"}';select ${sql} result;commit;`);return results.flatMap(r=>r.rows).at(-1).result;
   }catch(e){await db.exec('rollback');throw e;}
  };
  const event=randomUUID();
  await db.exec(`insert into public.creator_events(id,host_user_id,event_title,event_type,status,starts_at,ends_at,time_zone,
    replay_policy,replay_available_at,replay_expires_at,visibility)
    values('${event}','${actors.creator.user_id}','Synthetic auction with explicit replay','live_first','scheduled',
      clock_timestamp()+interval '40 minutes',clock_timestamp()+interval '40 minutes 5 seconds','America/New_York',
      'until_expiration',clock_timestamp()+interval '40 minutes 6 seconds',clock_timestamp()+interval '40 minutes 8 seconds','public')`);
  const offer=await rpc('creator',`public.configure_paid_creator_event_sale('${event}','Exact live show and replay',99,2,'sandbox',
    'America/New_York',now()-interval '1 hour',now()+interval '39 minutes')`);
  const prepared=await rpc('creator',`public.prepare_creator_event_broadcast('${event}')`);
  await db.exec(`insert into private.creator_event_broadcast_approvals(creator_id,creator_event_id,rights_status,max_minutes,expires_at,private_origin,approved_by,approved_session_id)
    values('${actors.creator.user_id}','${event}','creator_owned',30,now()+interval '2 hours','https://private.example.test','${actors.buyer19.user_id}','${actors.buyer19.session_id}');
    insert into public.livekit_room_assignments(app_room_id,livekit_room_name,assigned_server_id,assignment_reason,room_type)
    select '${prepared.roomId}','${prepared.roomId}',id,'synthetic event release fixture','live_stage' from public.livekit_servers where server_id='event-test-server';`);
  const cap=(await rows(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,platform,storefront,storefront_country,
    route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
    values('event_auction','${actors.creator.user_id}','acct_fixture','ios','UNITED_STATES','US','external_browser_checkout','usd','test','card',50,100000,
     'synthetic only','synthetic only',now(),now()+interval '4 hours',true) returning id`))[0].id;
  await db.exec(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
    values('${cap}','${actors.buyer1.user_id}','${actors.buyer1.session_id}','synthetic only',now(),now()+interval '10 minutes')`);
  const product=(await rows(`insert into public.monetization_products(product_key,product_type,display_name,provider,provider_product_id,environment,status,is_android_digital,is_physical_good)
    values('auction_release_fixture','event_pass','Synthetic event release','stripe_event_auction','prod_Release','sandbox','sandbox',false,false) returning id`))[0].id;
  await db.exec(`insert into private.creator_event_auction_product_bindings values('${cap}','${product}','synthetic independent platform mapping',now())`);
  const renew=()=>db.exec(`insert into private.auction_platform_qualifications(capability_id,platform_account_id,recipient_account_id,product_id,platform_product_id,
    evidence_reference,recipient_transfer_capability,enabled,verified_at,expires_at)
    values('${cap}','acct_platform','acct_fixture','${product}','prod_Release','synthetic current platform qualification','active',true,clock_timestamp(),clock_timestamp()+interval '10 minutes')`);
  await renew();
  const auction=await rpc('creator',`public.create_creator_event_auction('${event}','${offer.termsRevisionId}',237,1,clock_timestamp()+interval '600 milliseconds',now()+interval '35 minutes','test')`);
  await rpc('buyer1',`public.place_creator_event_auction_bid('${auction.id}',237,'${randomUUID()}',null)`);
  await new Promise(r=>setTimeout(r,650));
  const quote=await rpc('buyer1',`public.create_creator_event_auction_award_quote('${auction.id}',null)`),attempt=randomUUID();
  const claim=await rpc('buyer1',`public.prepare_creator_event_auction_platform_checkout('${quote.id}','${actors.buyer1.user_id}','${actors.buyer1.session_id}','${attempt}')`,'service_role');
  await rpc('buyer1',`public.bind_creator_event_auction_checkout('${quote.id}','${attempt}','cs_test_Release','pi_Release','acct_platform',237,'usd')`,'service_role');
  const paid={eventId:'evt_Release',eventType:'checkout.session.completed',occurredAt:new Date(Date.now()).toISOString(),accountId:'acct_platform',environment:'test',
    objectId:'cs_test_Release',paymentIntentId:'pi_Release',checkoutSessionId:'cs_test_Release',quoteId:quote.id,buyerId:actors.buyer1.user_id,
    creatorId:actors.creator.user_id,auctionId:auction.id,amountMinor:237,currency:'usd',outcome:'paid',refundedAmountMinor:null,providerProductId:'prod_Release',
    settlementContractId:claim.settlementContractId,settlementPolicy:claim.settlementPolicy};
  assert.equal((await rpc('buyer1',`public.process_stripe_event_auction_receipt(${lit(JSON.stringify(paid))}::jsonb,'${createHash('sha256').update(JSON.stringify(paid)).digest('hex')}')`,'service_role')).status,'fulfilled');
  const contract=claim.settlementContractId,qualify=()=>rpc('buyer1',`public.qualify_auction_event_release_from_domain('${contract}')`,'service_role');
  const facts={account_id:'acct_platform',environment:'test',currency:'usd',charge_id:'ch_Release',payment_intent_id:'pi_Release',balance_id:'txn_Release',
    balance_status:'available',disputed:false,financial_authority:false,gross_minor:237,provider_fee_minor:37,tax_minor:0,store_fee_minor:0,
    refunded_minor:0,refund_net_minor:0,tax_reversal_minor:0,refunds:[]};
  await rpc('buyer1',`public.record_auction_platform_cost_observation('${contract}',${lit(JSON.stringify(facts))}::jsonb)`,'service_role');
  assert.equal((await qualify()).status,'held','a paid ticket alone cannot fulfill the show');
  const schedule=(await rows(`select starts_at,ends_at,replay_expires_at from public.creator_events where id='${event}'`))[0];
  offset=schedule.starts_at.getTime()-1000-realNow();
  await rpc('creator',`public.heartbeat_watch_party_room_session('${prepared.roomId}','active',false,false,true)`);
  await rpc('creator','public.heartbeat_creator_event_broadcast_worker()','service_role');
  const source=await rpc('creator',`public.claim_creator_event_broadcast_start('${event}','${actors.creator.user_id}','${actors.creator.session_id}')`,'service_role');
  assert.equal(source.claimed,true,JSON.stringify(source));
  const ns=(await rows(`select (extract(epoch from a.started_at)*1000000000+1000)::text started,
    (extract(epoch from e.ends_at)*1000000000)::text ended from private.creator_event_broadcast_attempts a
    join public.creator_events e on e.id=a.creator_event_id where a.id='${source.attemptId}'`))[0];
  const start=BigInt(ns.started.split('.')[0]).toString(),end=BigInt(ns.ended.split('.')[0]).toString();
  const timing={startedAtNs:start,endedAtNs:end,segmentsStartedAtNs:start,segmentsEndedAtNs:end,
    durationNs:(BigInt(end)-BigInt(start)).toString(),segmentCount:'3',interrupted:false};
  const receipt=(status,t=timing)=>rpc('creator',`public.record_creator_event_broadcast_provider_coverage('${event}','${actors.creator.user_id}',
    '${actors.creator.session_id}','${source.attemptId}','EG_release','${status}',
    '${source.privateOrigin}/${source.outputPrefix}/${status==='ACTIVE'?'live':'index'}.m3u8',
    '${source.outputPrefix}/${status==='ACTIVE'?'live':'index'}.m3u8',true,true,${lit(JSON.stringify(t))}::jsonb,
    '${source.serverId}','${source.roomId}','${source.outputPrefix}')`,'service_role');
  offset=schedule.starts_at.getTime()+30-realNow();
  await receipt('ACTIVE',{startedAtNs:start,interrupted:false});
  await rpc('creator',`public.manage_creator_event_lifecycle('${event}','start',(select updated_at from public.creator_events where id='${event}'))`);
  await receipt('ACTIVE',{startedAtNs:start,interrupted:false});
  assert.equal((await qualify()).status,'held','actual start does not prove promised completion');
  offset=schedule.ends_at.getTime()+30-realNow();
  await receipt('COMPLETE');
  await rpc('creator',`public.manage_creator_event_lifecycle('${event}','end',(select updated_at from public.creator_events where id='${event}'))`);
  await renew();
  assert.equal((await qualify()).reason,'replay_period_open');
  offset=schedule.replay_expires_at.getTime()+30-realNow();
  const released=await qualify();assert.equal(released.status,'qualified_test_only',JSON.stringify(released));
  const reserved=await rpc('buyer1',`public.reserve_auction_test_transfer('${contract}')`,'service_role');assert.equal(reserved.status,'reserved');
  // Actual unknown provider evidence arriving after eligibility revokes the
  // undispatched reservation without inventing a refund or a no-show decision.
  await rpc('creator',`public.record_creator_event_broadcast_provider('${event}','${actors.creator.user_id}',
    '${actors.creator.session_id}','${source.attemptId}','EG_release','UNKNOWN',null,null,false,false)`,'service_role');
  const operation=(await rows(`select * from private.auction_transfer_operations where id='${reserved.operationId}'`))[0];
  assert.equal(operation.state,'canceled');assert.equal(operation.recovery_required,true);
  assert.equal((await rpc('buyer1',`public.claim_auction_test_transfer_dispatch('${reserved.operationId}')`,'service_role')).dispatchAuthorized,false);
  assert.equal((await rows(`select count(*) n from public.creator_event_purchase_remedies where purchase_intent_id='${claim.purchaseIntentId}'`))[0].n,0);
  // Original positive reservation is historical only; current source requires
  // actual service-fee qualification even for a previously recorded operation.
  const priorOperations=(await rows('select count(*)::int n from private.auction_transfer_operations'))[0].n;
  for(const file of successors)await db.exec(fs.readFileSync(new URL(file,migrationDir),'utf8'));
  const current=await rpc('buyer1',`public.reserve_auction_test_transfer('${contract}')`,'service_role');
  assert.equal(current.status,'held');assert.equal(current.reason,'tax_service_fee_unverified');
  const dispatch=await rpc('buyer1',`public.claim_auction_test_transfer_dispatch('${reserved.operationId}')`,'service_role');
  assert.equal(dispatch.dispatchAuthorized,false);assert.equal(dispatch.reason,'tax_service_fee_unverified');
  assert.equal((await rows('select count(*)::int n from private.auction_transfer_operations'))[0].n,priorOperations);
  assert.equal((await rows('select count(*)::int n from private.commerce_tax_qualifications'))[0].n,0);
 }finally{Date.now=realNow;await db.close();}
});

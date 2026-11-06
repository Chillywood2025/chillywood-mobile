import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedCommerceCreator,seedCommerceBuyer,acceptCommerceCreatorTerms,assertBuyerHasNoPremium,seedSyntheticStrictCreatorProvider} from './helpers/automatic-commerce-fixture.mjs';

// These are disposable SQL receipts and protected media fixtures, not provider
// verification. No Connect account or VERIFIED creator facts are seeded.
test('declared Sandbox creators deliver exact paid access without acquiring live financial authority', {timeout:240000}, async t=>{
  const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const service=async()=>{
    await db.exec('reset role');
    await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
  };
  const claim=async(actor,platform='ios')=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",
      [JSON.stringify({role:'authenticated',sub:actor.id,session_id:actor.session}),JSON.stringify({'x-chillywood-platform':platform})]);
    await db.exec('set role authenticated');
  };
  const isolate=async(fn)=>{await service();await db.exec('begin');try{await fn();}finally{await db.exec('rollback');await service();}};
  let step='declaration';
  try {
    const host=await seedCommerceCreator(db),buyer=await seedCommerceBuyer(db),other=await seedCommerceBuyer(db);
    await acceptCommerceCreatorTerms(db,host);
    await claim(host);
    const declaration=await one("select public.declare_creator_money_eligibility(true,'US','CA')");
    assert.equal(declaration.state,'PENDING_VERIFICATION');
    assert.equal(declaration.taxComplete,null);assert.equal(declaration.sanctionsClear,null);
    assert.equal(declaration.canCreateMoneyExposure,false);
    assert.equal(declaration.sandboxCapability.canUseCreatorTools,true);
    await service();
    assert.equal(await one('select count(*)::int from public.creator_payout_accounts where creator_user_id=$1',[host.id]),0);
    assert.equal(await one("select private.ordinary_creator_subject_for_mode($1,'production')",[host.id]),false);
    await db.exec(`update public.platform_money_kill_switches set state='sandbox_only' where key in
      ('revenuecat_app_store_enabled','revenuecat_google_play_enabled','provider_webhooks_enabled',
       'creator_monetization_enabled','digital_sales_enabled','watch_party_tickets_enabled')`);

    step='current VIP offer and protected video';
    const video=randomUUID();
    await db.query(`insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,
      storage_object_key,storage_path,mime_type,file_size_bytes,vip_access_required)
      values($1::uuid,$2::uuid,'Sandbox protected video','public','clean','cloudflare_r2','chillywood-media-origin',
      $2::uuid::text||'/'||$1::uuid::text||'/source.mp4',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4','video/mp4',1024,false)`,[video,host.id]);
    await claim(host);
    await assert.rejects(()=>one('select public.set_creator_video_vip_access($1,true)',[video]),/vip_offer_catalog_required/);
    const vipPrices=await one("select public.list_creator_supported_prices('vip_pass','ios','sandbox')");
    const vip=await one("select public.set_creator_vip_pass_offer_at_price('Sandbox VIP','Finite access','sandbox',$1)",
      [vipPrices.find(price=>price.amountMinor===499).priceId]);
    assert.equal((await one('select public.set_creator_video_vip_access($1,true)',[video])).vipRequired,true);
    await isolate(async()=>{
      await db.query("update public.creator_vip_pass_offers set status='paused' where id=$1",[vip.id]);
      await claim(host);
      await assert.rejects(()=>one('select public.set_creator_video_vip_access($1,true)',[video]),/vip_offer_catalog_required/);
    });

    step='paid party offer';
    const party=`SANDBOX-${randomUUID().replaceAll('-','').toUpperCase()}`;
    await db.query(`insert into public.watch_party_rooms(party_id,title_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
      values($1,'sandbox-paid-title',$2,'title','open','party_pass',true,'private')`,[party,host.id]);
    await claim(host);
    const partyOffer=await one("select public.set_paid_watch_party_offer($1,'Sandbox seat',99,null,'sandbox')",[party]);
    assert.equal(await one('select public.watch_party_room_current_user_access_allowed($1)',[party]),true);

    step='paid event and preparation';
    const event=randomUUID();
    await service();
    await db.query(`insert into public.creator_events(id,host_user_id,event_title,event_type,status,starts_at,ends_at,time_zone,replay_policy,visibility)
      values($1,$2,'Sandbox show','live_first','scheduled',now()-interval '1 hour',now()+interval '2 hours','America/New_York','none','public')`,[event,host.id]);
    await claim(host);
    const eventOffer=await one("select public.configure_paid_creator_event_sale($1,'Sandbox admission',99,10,'sandbox','America/New_York',now()-interval '2 hours',now()+interval '1 hour')",[event]);
    const preparation=await one('select public.prepare_creator_event_broadcast($1)',[event]);
    await service();
    const broadcastActor=()=>one('select private.creator_event_broadcast_actor_current($1,$2,$3,true)',[host.id,host.session,preparation.roomId]);
    assert.equal(await broadcastActor(),true,'an exact Sandbox event supplies creator mode, not provider approval');
    await one('select public.heartbeat_creator_event_broadcast_worker()');
    assert.equal((await one("select public.read_creator_event_broadcast_producer_authority($1,$2,$3,'start')",[event,host.id,host.session])).reason,
      'event_broadcast_approval_required','Sandbox creator capability does not bypass broadcast provider qualification');
    assert.equal(await one('select private.creator_event_broadcast_actor_current($1,$2,$3,true)',[host.id,other.session,preparation.roomId]),false);

    step='actual store receipt projections';
    const purchased=[];
    for(const [lane,sql,source] of [
      ['vip','select public.create_creator_vip_pass_purchase_intent($1)',vip.id],
      ['party',"select public.create_ios_app_store_purchase_intent('com.chillywood.seatpass.tier1','watch_party_live',$1,'{}')",partyOffer.id],
      ['event',`select public.create_reserved_creator_event_purchase_intent($1,'${eventOffer.termsRevisionId}')`,eventOffer.id],
    ]) {
      await claim(buyer);
      const intent=await one(sql,[source]);
      assert.equal(intent.environment,'sandbox');
      assert.equal((await one(`select public.${lane==='event'?'begin_creator_event_checkout':'begin_creator_money_checkout'}($1,$2)`,[intent.id,randomUUID()])).startAuthorized,true);
      await service();
      const receipt=await one(`select public.process_revenuecat_app_store_event_atomic($1,'NON_RENEWING_PURCHASE',$2,$3,'sandbox',
        now(),null,$4,'usd',repeat('d',64),$5,null,$6)`,
      [`sandbox-access-${lane}`,buyer.id,intent.providerProductId,intent.amountMinor,`sandbox-access-original-${lane}`,intent.createdAt]);
      assert.equal(receipt.status,'processed',`${lane}: ${JSON.stringify(receipt)}`);
      const ledger=await one('select to_jsonb(l) from public.money_access_ledger_events l where id=$1',[receipt.ledgerEventId]);
      assert.equal(ledger.environment,'sandbox');assert.equal(ledger.payable_state,'not_payable');
      const grant=await one("select to_jsonb(g) from public.access_grants g where metadata->>'purchase_intent_id'=$1",[intent.id]);
      assert.equal(grant.environment,'sandbox');assert.equal(grant.status,'sandbox_only');
      purchased.push({lane,intent,receipt,grant});
    }
    const roomAccess=async(actor=buyer)=>{await claim(actor);return one('select public.watch_party_room_current_user_access_allowed($1)',[party]);};
    const livekit=async(actor=buyer)=>{await service();await db.exec('set role service_role');return one('select public.resolve_watch_party_livekit_viewer_authority($1,$2,$3)',[party,actor.id,actor.session]);};
    assert.equal(await roomAccess(),true);assert.equal(await roomAccess(other),false);
    const viewerAuthority=await livekit();
    assert.equal(viewerAuthority.allowed,true,JSON.stringify(viewerAuthority));assert.equal(viewerAuthority.hostAuthority,false);
    assert.ok(new Date(viewerAuthority.expiresAt).getTime()<=Date.now()+31000,'viewer authority remains short-lived');
    const hostAuthority=await livekit(host);assert.equal(hostAuthority.allowed,true);assert.equal(hostAuthority.hostAuthority,true);
    await service();
    assert.equal(await one('select private.party_room_host_authority_current(r) from public.watch_party_rooms r where party_id=$1',[party]),true);
    assert.equal(await one('select private.room_attendance_source_access_pre_paid_stage(r,$2) from public.watch_party_rooms r where party_id=$1',[party,buyer.id]),true);
    await claim(buyer);assert.equal((await one('select public.resolve_creator_vip_pass_access($1)',[host.id])).allowed,true);
    await claim(other);assert.equal((await one('select public.resolve_creator_vip_pass_access($1)',[host.id])).allowed,false);
    await claim(buyer);assert.equal((await one('select public.resolve_creator_event_destination($1)',[event])).reason,'waiting_for_show');

    step='protected event destination';
    await service();
    // A synthetic approved source tests access routing only. It does not run
    // Egress or grant provider approval to this creator's prepared broadcast.
    const broadcast=await one(`insert into public.room_broadcast_sessions(source_type,source_room_id,creator_event_id,host_user_id,channel_user_id,
      broadcast_status,egress_provider,egress_id,egress_status,hls_playback_url,playback_url_status,rights_status,access_type,
      is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket,metadata)
      values('creator_event',$1,$1,$2,$2,'active_later','livekit_egress_later','synthetic-sandbox-access','active_later',
      'https://media.example/sandbox-access/index.m3u8','event_ticketed_available','creator_owned','ticketed',false,true,false,true,
      '{"event_ticketed_approved":true}') returning id`,[event,host.id]);
    await db.query(`insert into public.spectator_hls_playback_records(broadcast_session_id,source_room_id,creator_event_id,host_user_id,channel_user_id,
      visibility,playback_status,playlist_path,rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket)
      values($1,$2,$2,$3,$3,'private','live','sandbox-access/index.m3u8','creator_owned','ticketed',false,true,false,true)`,[broadcast,event,host.id]);
    await claim(host);await one("select public.manage_creator_event_lifecycle($1,'start',(select updated_at from public.creator_events where id=$1))",[event]);
    const destination=async(actor=buyer)=>{await claim(actor);return one('select public.resolve_creator_event_destination($1)',[event]);};
    assert.equal((await destination()).allowed,true);assert.equal((await destination(other)).allowed,false);

    step='purchased rights outlive seller sale authority';
    const purchasedDelivery=async(label)=>{
      assert.equal(await roomAccess(),true,`${label}: purchased Party admission`);
      assert.equal((await livekit()).allowed,true,`${label}: purchased viewer LiveKit authority`);
      await service();
      assert.equal(await one('select private.room_attendance_source_access_pre_paid_stage(r,$2) from public.watch_party_rooms r where party_id=$1',[party,buyer.id]),true,`${label}: attendance delivery`);
      assert.equal((await destination()).allowed,true,`${label}: exact purchased event playback`);
      assert.equal((await one('select public.resolve_creator_vip_pass_access($1)',[host.id])).allowed,true,`${label}: retained VIP rights`);
    };
    for(const [label,mutate] of [
      ['seller Premium expiry',async()=>{
        await db.query("update public.user_entitlements set expires_at=now()-interval '1 second' where user_id=$1 and entitlement_key='premium'",[host.id]);
      }],
      ['seller session expiry',async()=>{
        await db.query("update auth.sessions set not_after=now()-interval '1 second' where user_id=$1",[host.id]);
        await one('select private.refresh_ordinary_creator_eligibility($1)',[host.id]);
        assert.equal(await one('select legal_accepted from public.wave1_creator_eligibility where creator_user_id=$1',[host.id]),false,'cached legal mirror reflects absent active seller sessions');
      }],
      ['seller logout',async()=>{
        await db.query('delete from auth.sessions where user_id=$1',[host.id]);
        assert.equal(await one('select count(*)::int from auth.sessions where user_id=$1',[host.id]),0,'seller really has no remaining session');
        await one('select private.refresh_ordinary_creator_eligibility($1)',[host.id]);
      }],
      ['later provider and payout-readiness loss',async()=>{
        await db.query('update public.wave1_creator_eligibility set provider_eligible=false,kyc_complete=false,tax_complete=false,payout_eligible=false where creator_user_id=$1',[host.id]);
      }],
      ['global live-mode switch',async()=>{
        await db.exec("set local request.jwt.claim.role='service_role'");
        await db.query("update public.platform_money_kill_switches set state='on' where key='live_money_enabled'");
        await db.exec("set local request.jwt.claim.role=''");
      }],
    ]) await isolate(async()=>{
      await mutate();
      assert.equal(await one("select private.ordinary_creator_subject_for_mode($1,'sandbox')",[host.id]),false,`${label}: no new-sale seller authority`);
      assert.equal(await one("select private.creator_paid_delivery_subject_safe($1,'sandbox')",[host.id]),true,`${label}: retained delivery safety`);
      await purchasedDelivery(label);
    });
    await isolate(async()=>{
      await seedSyntheticStrictCreatorProvider(db,host);
      await db.query("update public.creator_payout_accounts set last_provider_sync_at=now()-interval '16 minutes',provider_configuration_observed_at=now()-interval '16 minutes' where creator_user_id=$1",[host.id]);
      await db.query("update private.creator_provider_observation_jobs set observed_at=now()-interval '16 minutes' where creator_id=$1",[host.id]);
      assert.equal(await one("select private.ordinary_creator_provider_ready($1,'sandbox')",[host.id]),false,'stale provider cannot authorize a new provider action');
      await purchasedDelivery('seller provider observation expiry');
    });

    step='historical delivery keeps real restrictions';
    for(const [label,sql] of [
      ['seller account ban',"update auth.users set banned_until=now()+interval '1 day' where id=$1"],
      ['seller deidentification',"update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{\"accountDeidentified\":true}'::jsonb where id=$1"],
      ['seller confirmation removed',"update auth.users set email_confirmed_at=null where id=$1"],
      ['seller suspension',"update public.wave1_creator_eligibility set state='SUSPENDED' where creator_user_id=$1"],
      ['seller moderation',"update public.wave1_creator_eligibility set moderation_state='SUSPENDED' where creator_user_id=$1"],
      ['seller age disqualification',"update public.wave1_creator_eligibility set age_18_plus=false where creator_user_id=$1"],
      ['seller excluded market',"update public.wave1_creator_eligibility set market='EXCLUDED_TERRITORY' where creator_user_id=$1"],
      ['seller sanctions failure',"update public.wave1_creator_eligibility set sanctions_clear=false where creator_user_id=$1"],
      ['seller legal invalidation',"update public.wave1_legal_acceptances set invalidated_at=now() where user_id=$1 and capability='creator_money'"],
    ]) await isolate(async()=>{
      await db.query(sql,[host.id]);
      assert.equal(await one("select private.creator_paid_delivery_subject_safe($1,'sandbox')",[host.id]),false,label);
      assert.equal(await roomAccess(),false,label);assert.equal((await livekit()).allowed,false,label);
      assert.equal((await destination()).allowed,false,label);
    });
    await isolate(async()=>{
      await seedSyntheticStrictCreatorProvider(db,host);
      await db.query('update public.creator_payout_eligibility_records set fraud_hold_active=true where creator_user_id=$1',[host.id]);
      assert.equal(await roomAccess(),false,'explicit fraud hold');assert.equal((await destination()).allowed,false,'explicit fraud hold');
    });

    step='mode mismatches and recovery';
    await isolate(async()=>{
      const productionProduct=randomUUID(),productionKey=`synthetic_production_access_${productionProduct}`;
      await db.query(`insert into public.monetization_products
        (id,product_key,product_type,display_name,provider,provider_product_id,environment,status,is_android_digital,metadata)
        values($1,$2,'watch_party_live_ticket','Synthetic production catalog only','revenuecat_google_play',$2,
          'production','active',true,'{"provider_proof":true,"live_money_enabled_at_activation":true}')`,[productionProduct,productionKey]);
      await db.query(`update public.paid_watch_party_offers set status='active',provider_product_key=$2,provider_product_id=$2,
        metadata=metadata||'{"live_money_enabled_at_activation":true}'::jsonb where id=$1`,[partyOffer.id,productionKey]);
      assert.equal(await one(`select private.paid_access_catalog_environment('watch_party_live_ticket',provider_product_key,
        provider,provider_product_id,status) from public.paid_watch_party_offers where id=$1`,[partyOffer.id]),'production');
      assert.equal(await roomAccess(host),false,'exact production catalog cannot reuse a declared Sandbox creator');
      assert.equal((await livekit(host)).allowed,false);
    });
    await isolate(async()=>{
      await db.query("update public.paid_watch_party_offers set status='sold_out' where id=$1",[partyOffer.id]);
      assert.equal(await roomAccess(host),true,'sold-out Sandbox derives mode from catalog');
      await service();
      await db.query("update public.paid_watch_party_offers set provider_product_id='wrong-product' where id=$1",[partyOffer.id]);
      assert.equal(await roomAccess(host),false,'sold-out label alone does not authorize host');
      assert.equal((await livekit(host)).allowed,false);
    });
    await isolate(async()=>{
      await db.query("update public.paid_creator_events set status='paused' where id=$1",[eventOffer.id]);
      assert.equal(await broadcastActor(),true,'pausing new ticket sales preserves the ability to deliver a purchased event');
      await db.query("update public.paid_creator_events set status='sold_out' where id=$1",[eventOffer.id]);
      assert.equal(await broadcastActor(),true,'sold-out event keeps exact Sandbox mode');
      await db.query("update public.paid_creator_events set provider_product_id='wrong-product' where id=$1",[eventOffer.id]);
      assert.equal(await broadcastActor(),false);
      assert.equal(await one('select private.creator_event_broadcast_actor_current($1,$2,$3,false)',[host.id,host.session,preparation.roomId]),true,'stop and recovery do not gain a creator qualification gate');
    });
    await isolate(async()=>{
      // This retained activation trigger reads the legacy single-role GUC.
      // Clear it again before testing helpers that bind their own exact JWT.
      await db.exec("set local request.jwt.claim.role='service_role'");
      await db.query("update public.platform_money_kill_switches set state='on' where key='live_money_enabled'");
      await db.exec("set local request.jwt.claim.role=''");
      assert.equal(await roomAccess(host),false);assert.equal(await roomAccess(),true,'existing paid viewer survives global sale-mode flip');
      assert.equal((await destination()).allowed,true,'existing event purchase survives global sale-mode flip');
      await service();assert.equal(await broadcastActor(),false);
      await claim(host);assert.equal((await one('select public.set_creator_video_vip_access($1,false)',[video])).vipRequired,false,'removing VIP protection remains available');
    });
    const partyPurchase=purchased.find(p=>p.lane==='party');
    await isolate(async()=>{
      await db.query("update public.paid_watch_party_tickets set status='refunded',refunded_at=now() where access_grant_id=$1",[partyPurchase.grant.id]);
      assert.equal(await roomAccess(),false);assert.equal((await livekit()).allowed,false);
    });
    await isolate(async()=>{
      await db.query("update public.paid_creator_event_passes set status='revoked',revoked_at=now() where creator_event_id=$1 and buyer_id=$2",[event,buyer.id]);
      assert.equal((await destination()).allowed,false);
    });
    await service();
    assert.equal(await one('select public.wave1_creator_money_subject_authorized_internal($1)',[host.id]),false);
    assert.equal(await one('select private.creator_paid_delivery_subject_safe($1,null)',[host.id]),false,'an absent captured mode fails closed');
    const finalFacts=await one('select to_jsonb(e) from public.wave1_creator_eligibility e where creator_user_id=$1',[host.id]);
    assert.equal(finalFacts.state,'PENDING_VERIFICATION');assert.equal(finalFacts.tax_complete,null);assert.equal(finalFacts.sanctions_clear,null);
    assert.equal(await one('select count(*)::int from public.creator_payout_accounts where creator_user_id=$1',[host.id]),0);
    assert.equal(await one("select count(*)::int from public.sandbox_monetization_testers where user_id in ($1,$2,$3)",[host.id,buyer.id,other.id]),0);
    await assertBuyerHasNoPremium(db,buyer);await assertBuyerHasNoPremium(db,other);
    for(const signature of ['private.paid_access_catalog_environment(text,text,text,text,text)','private.creator_vip_current_catalog_environment(uuid)',
      'private.creator_paid_delivery_legal_current(uuid)','private.creator_paid_delivery_subject_safe(uuid,text)',
      'private.creator_room_paid_delivery_subject_allowed(text,uuid,text)']) {
      for(const role of ['anon','authenticated','service_role']) assert.equal(await one('select has_function_privilege($1,$2,\'execute\')',[role,signature]),false);
    }
    t.diagnostic('Real declaration, finite Premium projection, three exact store receipts, private creator mode bindings, refund denial, and unchanged broadcast qualification; no production provider action.');
  } catch(error) {error.message=`${step}: ${error.message}${error.where?`\n${error.where}`:''}`;throw error;}
  finally {await db.close();}
});

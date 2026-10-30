import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

// Actual full application SQL, immutable quote triggers and provider lifecycle;
// no authority predicates are replaced. PGlite is not native concurrency proof.
for(const implicitApiGrants of [true,false]) test(`creator subscription cohorts preserve exact original receipts and new approved prices on both stores (implicit API grants ${implicitApiGrants})`, {timeout:240_000}, async t=>{
  const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants});
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  let step='fixtures';
  const hostSession='cb000000-0000-4000-8000-000000000001';
  const buyers=['cb000000-0000-4000-8000-000000000010','cb000000-0000-4000-8000-000000000020','cb000000-0000-4000-8000-000000000030'];
  const sessions=['cb000000-0000-4000-8000-000000000011','cb000000-0000-4000-8000-000000000021','cb000000-0000-4000-8000-000000000031'];
  const service=async()=>{await db.exec('reset role');await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false),set_config('request.jwt.claim.role','service_role',false)`);};
  const claim=async(user,session,platform='ios')=>{
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','authenticated',false),set_config('request.headers',$2,false)`,
      [JSON.stringify({role:'authenticated',sub:user,session_id:session}),JSON.stringify({'x-chillywood-platform':platform})]);
    await db.exec('set role authenticated');
  };
  try {
    const host=await scalar(`select md5('subscription-bindings-host:'||n)::uuid from generate_series(1,10000)n
      where mod(hashtextextended('chillywood-wave1-us-rollout-v1:'||md5('subscription-bindings-host:'||n)::uuid::text,20260814),100)=0 limit 1`);
    for(const [user,session] of [[host,hostSession],...buyers.map((v,i)=>[v,sessions[i]])]){
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
      'subscription-bindings-fixture','local_pgtap')`,[host])).state,'VERIFIED');
    await db.exec(`update public.platform_money_kill_switches set state='sandbox_only'
      where key in('revenuecat_app_store_enabled','revenuecat_google_play_enabled','provider_webhooks_enabled','creator_monetization_enabled','digital_sales_enabled')`);
    await claim(host,hostSession);
    const offer=await scalar(`select public.set_creator_channel_subscription_offer('Creator monthly','Monthly','sandbox')`);
    step='legacy original cohort';
    await claim(buyers[0],sessions[0]);
    const legacy=await scalar('select public.create_creator_channel_subscription_purchase_intent($1)',[offer.id]);
    assert.equal(legacy.amountMinor,499); assert.equal(legacy.subscriptionCatalogBinding,undefined);
    const event=async(id,type,intent,buyer,original)=>{
      await service();
      const fn=intent.provider==='revenuecat_app_store'?'process_revenuecat_app_store_event_atomic':'process_revenuecat_google_play_event_atomic';
      // Provider occurrence is not a few microseconds AFTER this transaction's
      // authoritative now(): that would intentionally be future-start access.
      return scalar(`select public.${fn}($1,$2,$3,$4,'sandbox',now(),now()+interval '31 days',$5,'usd',repeat('a',64),$6,null)`,
        [id,type,buyer,intent.providerProductId,intent.amountMinor,original]);
    };
    assert.equal((await event('binding-legacy-initial','INITIAL_PURCHASE',legacy,buyers[0],'binding-legacy-original')).status,'processed');
    step='synthetic preprovisioned identities';
    const iosId='cb000000-0000-4000-8000-000000000101';
    const androidId='cb000000-0000-4000-8000-000000000102';
    await db.query(`insert into public.monetization_product_store_mappings
      select (jsonb_populate_record(null::public.monetization_product_store_mappings,to_jsonb(mapping)||jsonb_build_object(
        'id',$1::uuid,'provider_product_id','fixture.creator.monthly.1299','tier','fixture1299',
        'apple_subscription_group','fixture_creator_monthly','reference_price_minor',1299,
        'metadata',jsonb_build_object('subscription_period','P1M','creator_subscription_catalog_approved',true)))).*
      from public.monetization_product_store_mappings mapping where provider_product_id='com.chillywood.channel.subscription.slot1'`,[iosId]);
    await db.query(`insert into public.monetization_products
      select (jsonb_populate_record(null::public.monetization_products,to_jsonb(product)||jsonb_build_object(
        'id',$1::uuid,'product_key','fixture_channel_monthly_1299','provider_product_id','fixture_channel_monthly_1299',
        'metadata',jsonb_build_object('subscription_period','P1M','creator_subscription_catalog_approved',true,
          'price_tier','1299','sandbox_purchase_intents_enabled',true)))).*
      from public.monetization_products product where product_key='channel_subscription_sandbox_monthly_499'`,[androidId]);
    const reservedGroupId='cb000000-0000-4000-8000-000000000104';
    await db.query(`insert into public.monetization_product_store_mappings
      select (jsonb_populate_record(null::public.monetization_product_store_mappings,to_jsonb(mapping)||jsonb_build_object(
        'id',$2::uuid,'provider_product_id','fixture.different.sku.legacy.group','tier','fixtureReserved',
        'apple_subscription_group','chillywood_channel_slot_1'))).*
      from public.monetization_product_store_mappings mapping where id=$1`,[iosId,reservedGroupId]);
    await db.exec('set role service_role');
    await assert.rejects(()=>db.query(`select public.approve_creator_channel_subscription_catalog_binding($1,$2,'ios','sandbox')`,
      [offer.id,reservedGroupId]),/subscription_legacy_group_reserved/);
    await assert.rejects(()=>db.query(`select public.approve_creator_channel_subscription_catalog_binding($1,
      (select id from public.monetization_products where product_key='channel_subscription_sandbox_monthly_499'),'android','sandbox')`,
      [offer.id]),/subscription_legacy_product_reserved/);
    await db.exec('reset role');
    for(const [id,platform] of [[iosId,'ios'],[androidId,'android']]){
      await db.exec('set role service_role');
      const binding=await scalar('select public.approve_creator_channel_subscription_catalog_binding($1,$2,$3,\'sandbox\')',[offer.id,id,platform]);
      assert.match(binding,/^[0-9a-f-]{36}$/);
      await db.exec('reset role');
    }
    await claim(host,hostSession);
    const selected=await scalar(`select public.set_creator_channel_subscription_offer_at_price('Creator new cohort','Monthly','sandbox',$1)`,[iosId]);
    assert.equal(selected.priceCents,1299);
    step='actual new intents, quotes and immutable identity';
    const intents=[];
    for(const [i,platform] of [[1,'ios'],[2,'android']]){
      await claim(buyers[i],sessions[i],platform);
      const intent=await scalar('select public.create_creator_channel_subscription_purchase_intent($1)',[offer.id]);
      assert.equal(intent.amountMinor,1299); assert.equal(intent.quote.amountMinor,1299);
      assert.equal(intent.subscriptionCatalogBinding.platform,platform);
      assert.equal(intent.subscriptionCatalogBinding.creatorId,host);
      assert.equal(intent.subscriptionCatalogBinding.offerId,offer.id);
      assert.deepEqual(intent.quote.terms.subscriptionCatalogBinding,intent.subscriptionCatalogBinding);
      assert.equal((await scalar('select public.begin_creator_money_checkout($1,gen_random_uuid())',[intent.id])).startAuthorized,true);
      await assert.rejects(()=>db.query('select public.create_creator_channel_subscription_purchase_intent($1)',[offer.id]),/source_purchase_intent_already_pending/);
      await assert.rejects(()=>db.query('select * from public.creator_channel_subscription_catalog_bindings'),/permission denied/);
      intents.push(intent);
      await service();
      await assert.rejects(()=>db.query('update public.money_purchase_intents set subscription_catalog_binding_id=null where id=$1',[intent.id]),/subscription_intent_binding_immutable/);
      assert.equal((await event(`binding-${platform}-initial`,'INITIAL_PURCHASE',intent,buyers[i],`binding-${platform}-original`)).status,'processed');
    }
    await assert.rejects(()=>db.query('update public.monetization_product_store_mappings set reference_price_minor=1599 where id=$1',[iosId]),/subscription_bound_product_identity_immutable/);
    await assert.rejects(()=>db.query(`update public.monetization_products set metadata=metadata||'{"price_tier":"1599"}' where id=$1`,[androidId]),/subscription_bound_product_identity_immutable/);
    const nextIosId='cb000000-0000-4000-8000-000000000103';
    await db.query(`insert into public.monetization_product_store_mappings
      select (jsonb_populate_record(null::public.monetization_product_store_mappings,to_jsonb(mapping)||jsonb_build_object(
        'id',$2::uuid,'provider_product_id','fixture.creator.monthly.1599','tier','fixture1599','reference_price_minor',1599))).*
      from public.monetization_product_store_mappings mapping where id=$1`,[iosId,nextIosId]);
    await db.exec('set role service_role');
    const nextBinding=await scalar(`select public.approve_creator_channel_subscription_catalog_binding($1,$2,'ios','sandbox')`,[offer.id,nextIosId]);
    await db.exec('reset role');
    assert.equal(await scalar('select version from public.creator_channel_subscription_catalog_bindings where id=$1',[nextBinding]),2);
    await claim(host,hostSession);
    assert.equal((await scalar(`select public.set_creator_channel_subscription_offer_at_price('Creator third cohort','Monthly','sandbox',$1)`,[nextIosId])).priceCents,1599);
    step='retire new cohort selection without corrupting historical renewal';
    await service();
    await db.exec('update public.creator_channel_subscription_catalog_bindings set available_for_new_purchases=false');
    await claim(host,hostSession);
    await assert.rejects(()=>db.query(`select public.set_creator_channel_subscription_offer_at_price('Unavailable','Monthly','sandbox',$1)`,[iosId]),/creator_store_price_not_supported/);
    for(const [i,intent] of [[0,legacy],[1,intents[0]],[2,intents[1]]]){
      const platform=i===2?'android':'ios';
      const original=i===0?'binding-legacy-original':`binding-${platform}-original`;
      const renewed=await event(`binding-renewal-${i}`,'RENEWAL',intent,buyers[i],original);
      assert.equal(renewed.status,'processed',JSON.stringify(renewed));
      await claim(buyers[i],sessions[i],platform);
      step=`historical restore cohort ${i}; access ${JSON.stringify(await scalar('select public.resolve_creator_channel_subscription_access($1)',[host]))}`;
      const restored=await scalar('select public.create_creator_channel_subscription_purchase_intent($1)',[offer.id]);
      assert.equal(restored.alreadySubscribed,true); assert.equal(restored.id,intent.id);
      assert.equal(restored.amountMinor,intent.amountMinor);
      assert.deepEqual(restored.subscriptionCatalogBinding,intent.subscriptionCatalogBinding);
    }
    await service();
    assert.equal(await scalar(`select count(*)::integer from public.creator_money_purchase_quotes where subscription_catalog_binding_id is not null`),2);
    t.diagnostic('Real SQL initial purchase, quote, checkout, renewal and historical no-charge restore passed for legacy499 and approved1299 iOS/Android; no provider calls or native concurrency claim.');
  } catch(error){error.message=`${step}: ${error.message}`;throw error;}
  finally {await db.close();}
});

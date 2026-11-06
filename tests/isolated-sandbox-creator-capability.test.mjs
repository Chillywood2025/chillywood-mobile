import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedCommerceCreator,acceptCommerceCreatorTerms,seedCommerceBuyer,withCommerceActor,assertBuyerHasNoPremium} from './helpers/automatic-commerce-fixture.mjs';

test('declared Premium creator with unknown live evidence can use isolated Sandbox with free buyers', {timeout:240000}, async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 try {
  const creator=await seedCommerceCreator(db),buyer=await seedCommerceBuyer(db),android=await seedCommerceBuyer(db);
  await acceptCommerceCreatorTerms(db,creator);
  const declared=await withCommerceActor(db,creator,async()=>(await db.query("select public.declare_creator_money_eligibility(true,'US','CA') value")).rows[0].value);
  assert.equal(declared.state,'PENDING_VERIFICATION');
  assert.equal(declared.canCreateMoneyExposure,false);
  assert.equal(declared.taxComplete,null);assert.equal(declared.sanctionsClear,null);
  assert.deepEqual(declared.sandboxCapability,{environment:'sandbox',financialAuthority:false,canUseCreatorTools:true});
  assert.equal((await db.query('select count(*)::int n from public.creator_payout_accounts where creator_user_id=$1',[creator.id])).rows[0].n,0,'store/platform checkout does not invent Connect evidence');
  const capability=async mode=>(await db.query('select private.ordinary_creator_subject_for_mode($1,$2) ok',[creator.id,mode])).rows[0].ok;
  assert.equal(await capability('sandbox'),true);assert.equal(await capability('production'),false);
  assert.equal((await db.query('select public.wave1_creator_money_subject_authorized_internal($1) ok',[creator.id])).rows[0].ok,false,'strict one-argument financial authority stays closed');
  for(const column of ['provider_eligible','kyc_complete','tax_complete','sanctions_clear','payout_eligible']) {
   await db.exec('begin');try{await db.query(`update public.wave1_creator_eligibility set ${column}=false where creator_user_id=$1`,[creator.id]);
    assert.equal(await capability('sandbox'),false,`${column} explicit disqualification`);
   }finally{await db.exec('rollback');}
  }
  for(const state of ['SUSPENDED','REVOKED']) {
   await db.exec('begin');try{await db.query('update public.wave1_creator_eligibility set state=$2 where creator_user_id=$1',[creator.id,state]);
    assert.equal(await capability('sandbox'),false);
   }finally{await db.exec('rollback');}
  }
  await assert.rejects(()=>withCommerceActor(db,creator,()=>db.query("select private.assert_current_creator_for_mode('production')")),/permission denied|eligibility|authority/);

  await db.exec(`update public.platform_money_kill_switches set state='sandbox_only' where key in
    ('merch_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled','provider_webhooks_enabled','creator_monetization_enabled','digital_sales_enabled','tips_enabled')`);
  const rpc=(actor,sql,args=[],platform='ios',role='authenticated')=>withCommerceActor(db,actor,async()=>{
   await db.query("select set_config('request.headers',$1,true)",[JSON.stringify({'x-chillywood-platform':platform})]);
   return (await db.query(sql,args)).rows[0].value;
  },role);
  const offer=await rpc(creator,"select public.set_creator_channel_subscription_offer('Ordinary monthly','Monthly','sandbox') value");
  const subscription=await rpc(buyer,'select public.create_creator_channel_subscription_purchase_intent($1) value',[offer.id]);
  assert.equal(subscription.amountMinor,499);
  assert.equal(subscription.environment,'sandbox');
  assert.equal((await rpc(buyer,'select public.begin_creator_money_checkout($1,$2) value',[subscription.id,randomUUID()])).startAuthorized,true);

  const event=randomUUID();
  await db.query(`insert into public.creator_events(id,host_user_id,event_title,event_type,status,starts_at,ends_at,time_zone,replay_policy,visibility)
    values($1,$2,'Ordinary online show','live_first','scheduled',now()+interval '7 days',now()+interval '7 days 2 hours','America/New_York','none','public')`,[event,creator.id]);
  const sale=await rpc(creator,"select public.configure_paid_creator_event_sale($1,'Online admission',99,10,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day') value",[event]);
  const ticket=await rpc(buyer,'select public.create_reserved_creator_event_purchase_intent($1,$2) value',[sale.id,sale.termsRevisionId]);
  assert.equal((await rpc(buyer,'select public.begin_creator_event_checkout($1,$2) value',[ticket.id,randomUUID()])).startAuthorized,true);

  const tipSettings=await rpc(creator,"select to_jsonb(public.upsert_my_creator_tip_settings(true,array[100,300],300,100,1000,'usd')) value");
  assert.equal(tipSettings.status,'setup_incomplete','native testing does not manufacture external Connect readiness');
  const ios=await rpc(buyer,"select public.create_ios_app_store_purchase_intent('com.chillywood.tip.tier2','creator_tip',$1,'{}') value",[creator.id]);
  assert.equal(ios.amountMinor,299);
  const google=await rpc(android,"select public.create_money_purchase_intent('creator_tip_sandbox_099','creator_tip',$1,'{}') value",[creator.id],'android');
  assert.equal(google.amountMinor,99);
  assert.equal((await db.query("select count(*)::int n from public.money_purchase_intents where creator_id=$1 and environment<>'sandbox'",[creator.id])).rows[0].n,0);

  const product=randomUUID();
  await rpc(creator,"select public.save_creator_merch_product_with_tracking($1,'Ordinary physical item','Physical only',null,1000,5,'published',null,'tracked') value",[product]);
  const merch=await rpc(buyer,"select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,'tracked',1000,'usd') value",[buyer.id,buyer.session,product,randomUUID()],'ios','service_role');
  assert.ok(merch.id);
  const reserved=async()=>(await db.query('select reserved_quantity n from public.merch_products where id=$1',[product])).rows[0].n;
  const before=await reserved();
  for(const state of ['off','live']) {
   await db.exec('begin');
   try {
    await db.exec(`set local request.jwt.claim.role='service_role';set local request.jwt.claims='{"role":"service_role"}';
      update public.platform_money_kill_switches set state='${state==='off'?'off':'on'}' where key='${state==='off'?'merch_enabled':'live_money_enabled'}';`);
    // Use exact actor claims inside this rollback-only mode mutation, not a
    // nested withCommerceActor transaction that could accidentally commit it.
    await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'service_role',sub:buyer.id,session_id:buyer.session})]);
    await db.exec('set local role service_role');
    await assert.rejects(()=>db.query("select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,'tracked',1000,'usd')",[buyer.id,buyer.session,product,randomUUID()]),/mode|disabled|unavailable|not_ready|not_active/);
   }finally{await db.exec('rollback');}
   assert.equal(await reserved(),before,'blocked global mode cannot allocate inventory');
  }
  await assertBuyerHasNoPremium(db,buyer);await assertBuyerHasNoPremium(db,android);
  assert.equal((await db.query('select count(*)::int n from public.sandbox_monetization_testers where user_id in($1,$2,$3)',[creator.id,buyer.id,android.id])).rows[0].n,0);
  await assert.rejects(()=>rpc({...buyer,session:android.session},'select public.create_creator_channel_subscription_purchase_intent($1) value',[offer.id]),/session|authority|authenticated/);
 }finally{await db.close();}
});

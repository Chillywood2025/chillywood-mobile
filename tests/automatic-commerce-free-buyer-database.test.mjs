import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedQualifiedCommerceCreator,seedCommerceBuyer,withCommerceActor,assertBuyerHasNoPremium} from './helpers/automatic-commerce-fixture.mjs';

test('free ordinary buyers can reserve merch, subscription, event and both native-store intents', {timeout:240000}, async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 try {
  const creator=await seedQualifiedCommerceCreator(db),buyer=await seedCommerceBuyer(db),android=await seedCommerceBuyer(db);
  await db.exec(`update public.platform_money_kill_switches set state='sandbox_only' where key in
    ('merch_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled','provider_webhooks_enabled','creator_monetization_enabled','digital_sales_enabled','tips_enabled')`);
  const rpc=(actor,sql,args=[],platform='ios',role='authenticated')=>withCommerceActor(db,actor,async()=>{
   await db.query("select set_config('request.headers',$1,true)",[JSON.stringify({'x-chillywood-platform':platform})]);
   return (await db.query(sql,args)).rows[0].value;
  },role);
  const offer=await rpc(creator,"select public.set_creator_channel_subscription_offer('Ordinary monthly','Monthly','sandbox') value");
  const subscription=await rpc(buyer,'select public.create_creator_channel_subscription_purchase_intent($1) value',[offer.id]);
  assert.equal(subscription.amountMinor,499);
  assert.equal((await rpc(buyer,'select public.begin_creator_money_checkout($1,$2) value',[subscription.id,randomUUID()])).startAuthorized,true);

  const event=randomUUID();
  await db.query(`insert into public.creator_events(id,host_user_id,event_title,event_type,status,starts_at,ends_at,time_zone,replay_policy,visibility)
    values($1,$2,'Ordinary online show','live_first','scheduled',now()+interval '7 days',now()+interval '7 days 2 hours','America/New_York','none','public')`,[event,creator.id]);
  const sale=await rpc(creator,"select public.configure_paid_creator_event_sale($1,'Online admission',99,10,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day') value",[event]);
  const ticket=await rpc(buyer,'select public.create_reserved_creator_event_purchase_intent($1,$2) value',[sale.id,sale.termsRevisionId]);
  assert.equal((await rpc(buyer,'select public.begin_creator_event_checkout($1,$2) value',[ticket.id,randomUUID()])).startAuthorized,true);

  await db.query("insert into public.creator_tip_settings(creator_id,tips_enabled,status,min_amount_cents,max_amount_cents,currency) values($1,true,'active',100,1000,'usd')",[creator.id]);
  const ios=await rpc(buyer,"select public.create_ios_app_store_purchase_intent('com.chillywood.tip.tier2','creator_tip',$1,'{}') value",[creator.id]);
  assert.equal(ios.amountMinor,299);
  const google=await rpc(android,"select public.create_money_purchase_intent('creator_tip_sandbox_099','creator_tip',$1,'{}') value",[creator.id],'android');
  assert.equal(google.amountMinor,99);

  const product=randomUUID();
  await rpc(creator,"select public.save_creator_merch_product_with_tracking($1,'Ordinary physical item','Physical only',null,1000,5,'published',null,'tracked') value",[product]);
  const merch=await rpc(buyer,"select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,'tracked',1000,'usd') value",[buyer.id,buyer.session,product,randomUUID()],'ios','service_role');
  assert.ok(merch.id);
  await assertBuyerHasNoPremium(db,buyer);await assertBuyerHasNoPremium(db,android);
  assert.equal((await db.query('select count(*)::int n from public.sandbox_monetization_testers where user_id in($1,$2,$3)',[creator.id,buyer.id,android.id])).rows[0].n,0);
  await assert.rejects(()=>rpc({...buyer,session:android.session},'select public.create_creator_channel_subscription_purchase_intent($1) value',[offer.id]),/session|authority|authenticated/);
 }finally{await db.close();}
});

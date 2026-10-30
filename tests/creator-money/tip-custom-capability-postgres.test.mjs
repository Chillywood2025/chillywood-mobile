import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('real SQL custom tip capability uses trusted eligibility and exact method bounds, never a creator floor', {timeout:240_000}, async t => {
  const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
  let checks=0;
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  // Fixtures use the disposable owner; application RPCs use real API roles.
  const asRole=async(role,sql,args=[])=>{
    assert.ok(['authenticated','service_role'].includes(role));
    await db.exec(`set role ${role}`);
    try{return await one(sql,args);}finally{await db.exec('reset role');}
  };
  const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
  const deny=async(fn,rx=/external_payment_capability_unavailable/)=>{await assert.rejects(fn,rx);checks++;};
  try {
    await db.exec(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
    const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
    const buyer=actors.find(x=>x.kind==='buyer1'),other=actors.find(x=>x.kind==='buyer2'),creator=actors.find(x=>x.kind==='creator');
    const cap='ef000000-0000-4000-8000-000000000001';
    const resolve=(amount=51,who=buyer,feature='creator_tip',id=cap)=>one(
      "select private.resolve_creator_external_payment_capability($1,$2,$3,$4,$5,'usd','test',$6)",
      [who.user_id,who.session_id,feature,creator.user_id,amount,id]);
    await deny(()=>resolve());
    await db.exec(fs.readFileSync('tests/fixtures/creator-external-payment-capabilities.sql','utf8'));
    await db.exec(fs.readFileSync('tests/fixtures/creator-external-payment-authority.sql','utf8'));
    const bound=await resolve();eq(bound.minAmountMinor,50);eq(bound.maxAmountMinor,100000);eq(bound.platform,'ios');
    eq(bound.routeKind,'external_browser_checkout');eq(bound.storefrontCountry,'US');
    assert.ok(Date.parse(bound.expiresAt)>Date.parse(bound.eligibilityExpiresAt),'short-lived dispatch eligibility is not the provider payment deadline');
    for(const amount of [50,51,99,123,100000])eq((await resolve(amount)).capabilityId,cap);
    for(const amount of [0,37,49,100001,null])await deny(()=>resolve(amount));
    await deny(()=>resolve(51,{...buyer,session_id:other.session_id}));
    await deny(()=>resolve(51,buyer,'event_auction'));
    await deny(()=>resolve(51,buyer,'creator_tip','ef000000-0000-4000-8000-000000000099'));
    for(const mutation of [
      "update public.creator_payout_accounts set charges_enabled=false",
      "update public.creator_payout_accounts set provider_configuration_status='unknown',provider_configuration_observed_at=null,provider_configuration_account_id=null",
      "update public.creator_payout_eligibility_records set fraud_hold_active=true",
    ]) {
      await db.exec('begin');await db.exec(mutation);await deny(()=>resolve());await db.exec('rollback');
    }
    for(const [index,change] of [{enabled:false},{verified_at:'2000-01-01T00:00:00Z',expires_at:'2000-01-01T01:00:00Z'},
      {storefront_country:'CA'},{platform:'web',storefront_country:'CA'},{platform:'android'},{route_kind:'android_external_content_link'},
      {verified_at:'2099-01-01T00:00:00Z',expires_at:'2099-01-01T01:00:00Z'}].entries()) {
      const id=`ef000000-0000-4000-8000-${String(index+100).padStart(12,'0')}`;
      await db.query('insert into private.creator_external_payment_capabilities select (jsonb_populate_record(null::private.creator_external_payment_capabilities,to_jsonb(c)||$1::jsonb)).* from private.creator_external_payment_capabilities c where id=$2',
        [JSON.stringify({...change,id}),cap]);
      await db.query("insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at) values($1,$2,$3,'synthetic',now()-interval '1 minute',now()+interval '5 minutes')",[id,buyer.user_id,buyer.session_id]);
      await deny(()=>resolve(51,buyer,'creator_tip',id));
    }
    // Negative control: deleting one synthetic eligibility and then removing
    // the real resolver's buyer/session predicate must reproduce cross-buyer
    // admission. Restoring the function must close it again.
    await db.query('delete from private.creator_external_payment_eligibility where buyer_id=$1',[other.user_id]);
    await deny(()=>resolve(51,other));
    const resolverDefinition=await one("select pg_get_functiondef('private.resolve_creator_external_payment_capability(uuid,uuid,text,uuid,integer,text,text,uuid)'::regprocedure)");
    const mutant=resolverDefinition.replace('eligibility.buyer_id=p_buyer_id and eligibility.session_id=p_session_id','true')
      .replace('buyer_id=p_buyer_id and session_id=p_session_id','true');
    assert.notEqual(mutant,resolverDefinition);await db.exec(mutant);
    eq((await resolve(51,other)).capabilityId,cap);
    await db.exec(resolverDefinition);await deny(()=>resolve(51,other));
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:buyer.user_id,session_id:buyer.session_id,role:'authenticated'})]);
    const quote=await asRole('authenticated','select public.get_creator_tip_amount_quote($1,51)',[creator.user_id]);
    eq(quote.available,true);eq(quote.amountCents,51);eq(quote.buyerId,buyer.user_id);
    eq('providerAccountId' in quote,false);eq('eligibilityId' in quote,false);
    const below=await asRole('authenticated','select public.get_creator_tip_amount_quote($1,49)',[creator.user_id]);
    eq(below.available,false);eq(below.reason,'amount_below_provider_minimum');eq(below.minAmountMinor,50);eq(below.amountCents,49);
    eq('providerAccountId' in below,false);eq('eligibilityId' in below,false);
    const above=await asRole('authenticated','select public.get_creator_tip_amount_quote($1,100001)',[creator.user_id]);
    eq(above.available,false);eq(above.reason,'amount_above_provider_maximum');eq(above.maxAmountMinor,100000);
    await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
    const request='ef000000-0000-4000-8000-000000000002',tip='ef000000-0000-4000-8000-000000000003';
    const q={tipId:tip,creatorId:creator.user_id,amountCents:51,currency:'usd',providerAccountId:'acct_fixture',capabilityId:cap,body:{
      client_reference_id:tip,'metadata[chillywood_tip_id]':tip,'metadata[fan_user_id]':buyer.user_id,
      'metadata[creator_user_id]':creator.user_id,'line_items[0][price_data][currency]':'usd',
      'line_items[0][price_data][unit_amount]':51,'payment_intent_data[transfer_data][destination]':'acct_fixture',
      'payment_method_types[0]':'card',mode:'payment',expires_at:Math.floor(Date.now()/1000)+3600}};
    const reserve=(value=q)=>asRole('service_role','select public.reserve_creator_tip_checkout_attempt($1,$2,$3,$4)',[buyer.user_id,buyer.session_id,request,value]);
    await deny(()=>reserve({...q,capabilityId:null}));
    await deny(()=>reserve({...q,providerAccountId:'acct_wrong'}),/tip_checkout_capability_mismatch/);
    await deny(()=>reserve({...q,body:{...q.body,'payment_method_types[0]':'bank_transfer'}}),/tip_checkout_capability_mismatch/);
    const missingExpiry={...q.body};delete missingExpiry.expires_at;
    await deny(()=>reserve({...q,body:missingExpiry}),/tip_checkout_quote_invalid/);
    const short='ef000000-0000-4000-8000-000000000109';
    await db.query("insert into private.creator_external_payment_capabilities select (jsonb_populate_record(null::private.creator_external_payment_capabilities,to_jsonb(c)||jsonb_build_object('id',$1::text,'expires_at',now()+interval '20 minutes'))).* from private.creator_external_payment_capabilities c where id=$2",[short,cap]);
    await db.query("insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at) values($1,$2,$3,'synthetic short approval',now()-interval '1 minute',now()+interval '5 minutes')",[short,buyer.user_id,buyer.session_id]);
    await deny(()=>reserve({...q,capabilityId:short}),/tip_checkout_quote_invalid/);
    const first=await reserve();eq(first.amountCents,51);eq(first.externalCapability.capabilityId,cap);
    assert.ok(first.body.expires_at<=Math.floor(Date.parse(first.externalCapability.expiresAt)/1000),'provider link cannot outlive route approval');
    const dispatch=()=>asRole('service_role','select public.read_creator_tip_checkout_dispatch_authority($1,$2,$3)',[buyer.user_id,buyer.session_id,request]);
    eq((await dispatch()).allowed,true);
    for(const mutation of [
      "update public.creator_tip_settings set tips_enabled=false",
      "update public.creator_tip_settings set status='paused'",
      "update public.platform_money_kill_switches set state='off' where key='tips_enabled'",
      "update public.platform_money_kill_switches set state='off' where key='provider_webhooks_enabled'",
      `insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values('${creator.user_id}','${buyer.user_id}','${creator.user_id}')`,
    ]) { await db.exec('begin');await db.exec(mutation);eq((await dispatch()).allowed,false);await db.exec('rollback'); }
    await db.query("insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at) values($1,$2,$3,'synthetic automated refresh',now(),now()+interval '12 minutes')",[cap,buyer.user_id,buyer.session_id]);
    eq((await dispatch()).allowed,true); // renewed same-session evidence preserves immutable payment terms
    eq((await reserve({...q,body:{...q.body,mode:'changed'}})).body,first.body);
    await deny(()=>db.query('update private.creator_external_payment_capabilities set min_amount_minor=1 where id=$1',[cap]),/external_payment_evidence_immutable/);
    await deny(()=>db.query('update private.creator_external_payment_eligibility set buyer_id=$1 where buyer_id=$2',[other.user_id,buyer.user_id]),/external_payment_evidence_immutable/);
    await db.query('update private.creator_external_payment_capabilities set revoked_at=now() where id=$1',[cap]);
    await deny(()=>resolve());eq((await dispatch()).allowed,false);
    eq((await reserve()).body,first.body); // immutable historic quote remains readable after revocation
    await db.exec('set role authenticated');
    await deny(()=>db.query('select * from private.creator_external_payment_capabilities'),/permission denied/);
    await deny(()=>db.query('insert into private.creator_external_payment_eligibility default values'),/permission denied/);
    await deny(()=>resolve(),/permission denied/);
    await deny(()=>one('select public.read_creator_tip_checkout_dispatch_authority($1,$2,$3)',[buyer.user_id,buyer.session_id,request]),/permission denied/);
    await db.exec('reset role');
    eq(await one("select count(*)::integer from pg_class where relname in ('creator_external_payment_capabilities','creator_external_payment_eligibility') and relrowsecurity and relforcerowsecurity"),2);
    t.diagnostic(`${checks} real SQL assertions passed; synthetic evidence only`);
  } finally {await db.close();}
});

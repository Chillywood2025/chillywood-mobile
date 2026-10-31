import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('actual SQL fee feed and exact-session tip comparison stay unknown until qualified; revoke and stale evidence fail closed', {timeout:240000}, async()=>{
  const module={exports:{}};
  new Function('exports','module',ts.transpileModule(fs.readFileSync('_lib/creatorTipRouteCosts.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module.exports,module);
  const compare=module.exports.compareCreatorTipRouteCosts;
  const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  try {
    for(const path of ['event-reservation-authority.sql','creator-external-payment-capabilities.sql','creator-external-payment-authority.sql'])
      await db.exec(fs.readFileSync(`tests/fixtures/${path}`,'utf8'));
    const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
    const buyer=actors.find(a=>a.kind==='buyer1'),other=actors.find(a=>a.kind==='buyer2'),creator=actors.find(a=>a.kind==='creator');
    const claims=async(who=buyer,role='authenticated')=>{
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:who.user_id,session_id:who.session_id,role})]);
      await db.exec(`set role ${role}`);
    };
    const read=(amount=299)=>one("select public.get_creator_tip_route_costs($1,$2,'ios')",[creator.user_id,amount]);
    await claims();let quote=await read();
    const subject={buyerId:buyer.user_id,sessionId:buyer.session_id,creatorId:creator.user_id,amountMinor:299,currency:'usd',platform:'ios',environment:'test'};
    assert.equal(quote.completeCandidateSet,true);assert.equal(quote.unresolvedPayment,false);
    assert.ok(quote.routes.some(r=>r.provider==='stripe_connect'));assert.ok(quote.routes.some(r=>r.provider==='app_store'));
    assert.ok(quote.routes.every(r=>r.fees===null));
    assert.equal(compare(quote,subject).status,'incomplete');
    assert.equal(JSON.stringify(quote).includes('acct_fixture'),false);
    await assert.rejects(()=>one("select public.record_creator_tip_route_fee_evidence('{}')"),/permission denied/);
    await assert.rejects(()=>one('select count(*) from private.creator_tip_route_fee_evidence'),/permission denied/);
    const evidence=route=>({buyer_id:buyer.user_id,session_id:buyer.session_id,creator_id:creator.user_id,amount_minor:299,currency:'usd',
      platform:'ios',environment:'test',provider:route.provider,purchase_binding_id:route.purchaseBindingId,
      provider_account_id:route.provider==='stripe_connect'?'acct_fixture':'synthetic-apple-account',
      qualification_evidence:'synthetic exact account/product qualification; not live evidence',fee_evidence:'synthetic complete fee quote; not public rate',
      processor_minor:route.provider==='stripe_connect'?45:0,store_minor:route.provider==='app_store'?60:0,platform_minor:0,other_minor:0,
      buyer_total_minor:299,tax_minor:0,tax_treatment:'not_taxed',fee_base_minor:299,
      all_unavoidable_fees_included:true,verified_at:new Date().toISOString(),expires_at:new Date(Date.now()+240000).toISOString()});
    const ids=[];
    await claims(buyer,'service_role');
    for(const route of quote.routes) ids.push(await one('select public.record_creator_tip_route_fee_evidence($1)',[JSON.stringify(evidence(route))]));
    await claims();quote=await read();assert.ok(quote.routes.every(r=>r.fees?.authority==='account_qualified'));
    assert.equal(compare(quote,subject).status,'compared');
    assert.ok(compare(quote,subject).lowestCostRouteIds.every(id=>id.startsWith('stripe_connect:')));
    assert.ok(quote.routes.every(r=>r.fees.buyerId===buyer.user_id&&r.fees.amountMinor===299));
    for(const key of ['creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled']) {
      await db.exec('reset role;begin');
      await db.query("update public.platform_money_kill_switches set state='off' where key=$1",[key]);
      await claims();assert.equal((await read()).routes.some(r=>r.provider==='app_store'),false,`${key} must exclude disabled native rail`);
      await db.exec('reset role;rollback');
    }
    await claims(other);assert.ok((await read()).routes.every(r=>r.fees===null));
    await claims();assert.ok((await read(300)).routes.every(r=>r.fees===null));
    await claims(buyer,'service_role');
    // Revoking a newer quote must not resurrect the still-valid older evidence.
    const latest=await one('select public.record_creator_tip_route_fee_evidence($1)',[JSON.stringify(evidence(quote.routes[0]))]);
    await one('select public.revoke_creator_tip_route_fee_evidence($1)',[latest]);
    await claims();assert.equal((await read()).routes.filter(r=>r.fees===null).length,1);
    assert.equal(compare(await read(),subject).status,'incomplete');
    await db.exec('reset role');
    await assert.rejects(()=>db.query('update private.creator_tip_route_fee_evidence set processor_minor=0 where id=$1',[ids[1]]),/immutable/);
    const rls=await one("select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid='private.creator_tip_route_fee_evidence'::regclass");assert.equal(rls,true);
    for(const role of ['anon','authenticated','service_role']) assert.equal(await one(
      "select has_function_privilege($1,'private.read_creator_tip_route_costs_for_subject(uuid,uuid,uuid,integer,text)','execute')",[role]),false);
    // An expired latest record must not resurrect an older still-valid quote.
    const second=evidence(quote.routes[1]);second.verified_at=new Date(Date.now()-60000).toISOString();second.expires_at=new Date(Date.now()-1000).toISOString();
    await claims(buyer,'service_role');await assert.rejects(()=>one('select public.record_creator_tip_route_fee_evidence($1)',[JSON.stringify(second)]),/tip_fee_evidence_invalid/);
    await claims({...buyer,session_id:other.session_id});assert.equal((await read()).available,false);
    await db.exec('reset role');await db.exec('set role anon');await assert.rejects(()=>read(),/permission denied/);
  } finally {await db.close();}
});

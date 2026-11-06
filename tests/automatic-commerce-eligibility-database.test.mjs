import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedCommerceBuyer,seedCommerceCreator,assertBuyerHasNoPremium,withCommerceActor} from './helpers/automatic-commerce-fixture.mjs';

test('automatic commerce uses free buyers and exact finite mode-aware creator authority', {timeout:180000}, async()=>{
  const {db,replayReport}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
  try {
    assert.deepEqual(replayReport.files,[...replayReport.files].sort(),'no historical final function overlay');
    const buyer=await seedCommerceBuyer(db),sandbox=await seedCommerceCreator(db),production=await seedCommerceCreator(db,undefined,{environment:'production'});
    const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
    const allowed=(actor,environment='sandbox',creator=false)=>value(`select private.ordinary_commerce_${creator?'subject':'buyer'}_current($1::uuid,$2::uuid,$3::text) value`,[actor.id,actor.session,environment]);
    await assertBuyerHasNoPremium(db,buyer);
    for(const environment of ['sandbox','production']) {
      assert.equal(await allowed(buyer,environment),true,`free buyer ${environment}`);
      assert.equal(await allowed(buyer,environment,true),false,`free buyer cannot substitute for Premium creator ${environment}`);
      assert.equal(await allowed(production,environment,true),true,`production membership may operate in ${environment}`);
    }
    assert.equal(await allowed(sandbox,'sandbox',true),true);
    assert.equal(await allowed(sandbox,'production',true),false,'sandbox purchase is never live creator authority');
    assert.equal(await allowed({...buyer,session:sandbox.session}),false,'another account session cannot authorize buyer');
    assert.equal(await allowed({...sandbox,session:buyer.session},'sandbox',true),false);
    assert.equal(await allowed({...buyer,session:null}),false);
    assert.equal(await allowed(buyer,'unknown'),false);
    assert.equal(await value('select count(*)::int value from public.sandbox_monetization_testers where user_id in($1,$2,$3)',[buyer.id,sandbox.id,production.id]),0,'no tester membership supplies access');
    assert.equal(await value('select count(*)::int value from public.wave1_creator_eligibility where creator_user_id in($1::uuid,$2::uuid)',[sandbox.id,production.id]),0,'no synthetic operational eligibility supplies access');
    const email=`buyer-${buyer.id}@example.invalid`;
    await db.query('update auth.users set email=$2 where id=$1',[buyer.id,email]);
    await withCommerceActor(db,buyer,async()=>{
      assert.equal(await value('select public.resolve_sandbox_monetization_tester($1,$2) value',[buyer.id,email.toUpperCase()]),true);
      assert.equal(await value('select public.resolve_sandbox_monetization_tester($1,null) value',[sandbox.id]),false,'compatibility resolver cannot target another subject');
      assert.equal(await value('select public.resolve_sandbox_monetization_tester(null,$1) value',['other@example.invalid']),false,'email must match current authenticated subject');
    });

    const mutation=async(sql,args,check)=>{
      await db.exec('begin');
      try {await db.query(sql,args);await check();}finally{await db.exec('rollback');}
    };
    await mutation("update auth.sessions set not_after=clock_timestamp()+interval '100 milliseconds' where id=$1",[buyer.session],async()=>{
      assert.equal(await allowed(buyer),true,'session starts current in this transaction');
      await db.query('select pg_sleep(0.15)');
      assert.equal(await allowed(buyer),false,'clock expiry during the same transaction cannot use transaction-start now()');
    });
    assert.equal(await allowed(buyer),true,'expiry probe rollback restores session');
    for(const sql of [
      "insert into public.platform_role_memberships(user_id,role,status) values($1,'owner','active')",
      "insert into public.beta_access_memberships(user_id,access_status) values($1,'active')",
      "insert into public.sandbox_monetization_testers(user_id,status) values($1,'active')",
    ]) await mutation(sql,[buyer.id],async()=>{
      assert.equal(await allowed(buyer,'sandbox',true),false,'staff, beta and tester rows never replace current creator Premium');
      assert.equal(await allowed(buyer,'production',true),false);
      assert.equal(await allowed(buyer),true,'free buying remains ordinary account authority');
    });
    for(const actor of [buyer,sandbox]) {
      const creator=actor===sandbox;
      for(const [sql,args] of [
        ["update auth.users set banned_until=now()+interval '1 day' where id=$1",[actor.id]],
        ["update auth.users set deleted_at=now() where id=$1",[actor.id]],
        ["update auth.sessions set not_after=now()-interval '1 second' where id=$1",[actor.session]],
        ["update public.wave1_legal_acceptances set invalidated_at=now() where user_id=$1 and capability='account'",[actor.id]],
      ]) await mutation(sql,args,async()=>assert.equal(await allowed(actor,'sandbox',creator),false,sql));
      assert.equal(await allowed(actor,'sandbox',creator),true,'rollback recovers original authority');
    }
    for(const actor of [sandbox,production]) {
      const environment=actor===sandbox?'sandbox':'production';
      for(const [sql,args] of [
        ["update public.user_entitlements set expires_at=now()-interval '1 second' where user_id=$1 and entitlement_key='premium'",[actor.id]],
        ["update public.user_entitlements set revoked_at=now() where user_id=$1 and entitlement_key='premium'",[actor.id]],
        ["update public.access_grants set refunded_at=now() where user_id=$1::uuid and grant_type='premium'",[actor.id]],
        ["update public.access_grants set expires_at=now()-interval '1 second' where user_id=$1::uuid and grant_type='premium'",[actor.id]],
        [`insert into public.revenuecat_terminal_authority_quarantines(provider_scope,environment_scope,user_id,event_type,raw_payload_hash,reason)
          values('revenuecat_google_play',$2,$1::uuid,'REFUND',repeat('c',64),'synthetic_fixture_only')`,[actor.id,environment]],
      ]) await mutation(sql,args,async()=>{
        assert.equal(await allowed(actor,environment,true),false,sql);
        assert.equal(await allowed(buyer,environment),true,'creator mutation never requires buyer Premium');
      });
      assert.equal(await allowed(actor,environment,true),true,'rollback restores canonical finite authority');
    }
    for(const role of ['anon','authenticated']) for(const name of ['ordinary_commerce_buyer_current','ordinary_commerce_subject_current']) {
      assert.equal(await value(`select has_function_privilege($1,$2,'execute') value`,[role,`private.${name}(uuid,uuid,text)`]),false,`${role} cannot invoke private target authority`);
    }
    await assertBuyerHasNoPremium(db,buyer);
  } finally {await db.close();}
});

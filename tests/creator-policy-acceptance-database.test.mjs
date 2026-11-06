// Real helpers + chronological disposable SQL replay. Synthetic accounts and
// Premium events only; no provider/native-contention/deployment claim.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase } from './helpers/database-runtime-authority-fixture.mjs';
import { seedCommerceCreator, seedCommerceBuyer, withCommerceActor, assertBuyerHasNoPremium } from './helpers/automatic-commerce-fixture.mjs';
import { createPolicyHarness, loadPolicyModule, policyAuthority } from './helpers/creator-policy-runtime.mjs';

test('new account-only Premium creator completes actual declaration and explicit creator consent, then uses Sandbox without owner grants', {timeout:240000}, async()=>{
  const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
  try {
    const creator=await seedCommerceCreator(db),buyer=await seedCommerceBuyer(db);
    // Remove seed helper consent; drive signup acceptance through the production
    // account helper/RPC. No creator, money or payout consent is seeded.
    await db.query('delete from public.wave1_legal_acceptances where user_id=$1',[creator.id]);
    const a=policyAuthority(creator.session,creator.id);
    const rpc=async(name,args={})=>{
      try {
        const data=await withCommerceActor(db,creator,async()=>{
          let result;
          if(name==='wave1_legal_requirements_readback') result=await db.query('select public.wave1_legal_requirements_readback($1) value',[args.p_capability]);
          else if(name==='wave1_accept_legal_documents') result=await db.query('select public.wave1_accept_legal_documents($1::jsonb,$2,$3::uuid,$4::uuid,$5,$6) value',
            [JSON.stringify(args.p_acceptances),args.p_market,args.p_expected_user_id,args.p_expected_account_id,args.p_session_generation,args.p_capability]);
          else if(name==='declare_creator_money_eligibility') result=await db.query('select public.declare_creator_money_eligibility($1,$2,$3,$4) value',[args.p_declared_18_plus,args.p_country_code,args.p_region_code,args.p_declaration_version]);
          else if(name==='wave1_creator_eligibility_readback') result=await db.query('select public.wave1_creator_eligibility_readback() value');
          else throw Error(`Unexpected RPC ${name}`);
          return result.rows[0].value;
        });
        return {data,error:null};
      }catch(error){return {data:null,error:{message:error.message}};}
    };
    const h=createPolicyHarness({authority:a,invoke:(_subject,name,args)=>rpc(name,args)});
    const eligibility=loadPolicyModule('_lib/creatorEligibility.ts',{});
    const declaration=loadPolicyModule('_lib/creatorEligibilityDeclaration.ts',{'./accountBoundSupabaseMutation':h.mutation,'./accountSessionAuthority':h.authority,'./creatorEligibility':eligibility});
    const client={rpc};
    const account=await h.legal.recordAccountLegalAcceptance(client,creator.id,'account');assert.equal(account.ok,true);
    const count=async()=>(await db.query('select count(*)::int n from public.wave1_legal_acceptances where user_id=$1',[creator.id])).rows[0].n;
    assert.equal(await count(),3);
    const before=await declaration.saveCreatorEligibilityDeclaration(a,{declared18Plus:true,residesInUS:true,regionCode:'CA'});
    assert.equal(eligibility.canUseCreatorSandboxTools(before.eligibility),false);assert.ok(before.pending.includes('Current creator and money terms'));
    const displayed=await h.api.readCreatorPolicyRequirements(a);assert.equal(h.legal.legalRequirementsAreCurrent(displayed,a),false);
    assert.equal(displayed.requirements.filter(x=>!x.accepted).length,2);
    const consent={creatorTerms:true,moneyTerms:true};
    await assert.rejects(h.api.acceptCreatorPolicies(a,displayed,{...consent,moneyTerms:false}),/explicit_consent/);
    await assert.rejects(h.api.acceptCreatorPolicies(a,displayed,consent,()=>false),/retired/);
    const payload=h.legal.buildLegalAcceptancePayload(displayed);
    const args={p_acceptances:payload,p_market:'UNITED_STATES',p_expected_user_id:creator.id,p_expected_account_id:creator.id,p_session_generation:creator.session,p_capability:'creator_money'};
    for(const change of [{p_session_generation:buyer.session},{p_expected_account_id:buyer.id},{p_expected_user_id:buyer.id},
      {p_acceptances:{...payload,creator_terms:'stale-version'}}]) assert.ok((await rpc('wave1_accept_legal_documents',{...args,...change})).error);
    assert.equal(await count(),3,'negative attempts create no acceptance');
    const accepted=await h.api.acceptCreatorPolicies(a,displayed,consent);assert.equal(h.legal.legalRequirementsAreCurrent(accepted,a),true);
    assert.equal(await count(),5);
    await h.api.acceptCreatorPolicies(a,displayed,consent);assert.equal(await count(),5,'repeat is idempotent');
    const current=await declaration.readCreatorEligibilityDeclaration(a);
    assert.equal(eligibility.canUseCreatorSandboxTools(current.eligibility),true,'public readback recomputes initial legal denial');
    assert.equal(current.eligibility.state,'PENDING_VERIFICATION');assert.equal(current.eligibility.canCreateMoneyExposure,false);
    assert.equal(current.pending.includes('Current creator and money terms'),false);
    const sources=(await db.query('select distinct authority_source from public.wave1_legal_acceptances where user_id=$1',[creator.id])).rows.map(x=>x.authority_source);
    assert.deepEqual(sources,['authenticated_rpc']);
    assert.match(await declaration.readCreatorPayoutLegalStatus(a),/platform document configuration is incomplete/);
    await db.exec("update public.platform_money_kill_switches set state='sandbox_only' where key in ('creator_monetization_enabled','digital_sales_enabled','revenuecat_app_store_enabled')");
    const offer=await withCommerceActor(db,creator,async()=>(await db.query("select public.set_creator_channel_subscription_offer('New creator','Explicitly accepted','sandbox') value")).rows[0].value);
    assert.ok(offer.id,'actual authoring control works after consent');
    const purchase=await withCommerceActor(db,buyer,async()=>{
      await db.query("select set_config('request.headers',$1,true)",[JSON.stringify({'x-chillywood-platform':'ios'})]);
      return (await db.query('select public.create_creator_channel_subscription_purchase_intent($1) value',[offer.id])).rows[0].value;
    });
    assert.equal(purchase.environment,'sandbox');await assertBuyerHasNoPremium(db,buyer);
    assert.equal((await db.query('select count(*)::int n from public.sandbox_monetization_testers where user_id in ($1,$2)',[creator.id,buyer.id])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from public.creator_payout_accounts where creator_user_id=$1',[creator.id])).rows[0].n,0);
    assert.equal((await db.query('select public.wave1_creator_money_subject_authorized_internal($1) ok',[creator.id])).rows[0].ok,false);
    for(const [column,value] of [['tax_complete',false],['state','SUSPENDED'],['state','REVOKED']]) {
      const previous=(await db.query(`select ${column} value from public.wave1_creator_eligibility where creator_user_id=$1`,[creator.id])).rows[0].value;
      await db.query(`update public.wave1_creator_eligibility set ${column}=$2 where creator_user_id=$1`,[creator.id,value]);
      assert.equal(eligibility.canUseCreatorSandboxTools((await declaration.readCreatorEligibilityDeclaration(a)).eligibility),false,`${column} explicit denial preserved`);
      await db.query(`update public.wave1_creator_eligibility set ${column}=$2 where creator_user_id=$1`,[creator.id,previous]);
    }
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[creator.session]);
    await assert.rejects(h.api.acceptCreatorPolicies(a,displayed,consent));assert.equal(await count(),5,'expired session cannot add consent');
  }finally{await db.close();}
});

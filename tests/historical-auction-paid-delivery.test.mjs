import assert from 'node:assert/strict';
import test from 'node:test';
import {withQualifiedAuctionFixture} from './helpers/auction-checkout-fixture.mjs';

// Real test-mode auction checkout and receipt projections in disposable SQL.
// Creators use the declaration flow with unknown tax/sanctions, never a seeded
// VERIFIED eligibility row or tester allowlist. Provider route inputs are local
// synthetic observations, not external verification or an executed payment.
for(const lane of ['event','room']) test(`purchased ${lane} auction rights survive loss of new-sale seller authority`,{timeout:240000},async t=>{
  await withQualifiedAuctionFixture({mode:'test',lane,declaredCreator:true},async({db,actors,auction,evidence,receive})=>{
    const host=actors.creator,buyer=actors.buyer1;
    const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
    const admin=async()=>{await db.exec('reset role');await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);};
    const actor=async(subject,role='authenticated')=>{
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub:subject.user_id,session_id:subject.session_id})]);
      await db.exec(`set role ${role}`);
    };
    const isolate=async(fn)=>{await admin();await db.exec('begin');try{await fn();}finally{await db.exec('rollback');await admin();}};
    await admin();
    const source=await one(`select ${lane==='event'?'event_id':'party_id'} from private.${lane==='event'?'creator_event_auctions':'creator_room_seat_auctions'} where id=$1`,[auction.id]);
    const grant=await one(`select to_jsonb(g) from public.access_grants g where provider='stripe_${lane}_auction' and user_id=$1`,[buyer.user_id]);
    assert.equal(grant.status,'sandbox_only');assert.equal(grant.environment,'sandbox');
    const historicalIdentity=async()=>{
      await admin();
      // The public identity wrapper signals a missing event identity by
      // exception; its app-facing readers deliberately catch that condition.
      if(lane==='event') return one('select private.creator_event_auction_grant_identity($1,$2,$3)',[buyer.user_id,source,grant.id]);
      return one('select (private.creator_room_paid_seat_claim($1,$2)).id',[source,buyer.user_id]);
    };
    const delivery=async(expected,label)=>{
      assert.equal((await historicalIdentity())!==null,expected,`${label}: exact historical ${lane} receipt`);
      if(lane==='event'){
        await actor(buyer);
        assert.equal((await one('select public.resolve_paid_creator_event_pass_access($1)',[source])).allowed,expected,`${label}: buyer event pass resolution`);
      }else{
        await actor(buyer,'service_role');
        const authority=await one('select public.resolve_watch_party_livekit_viewer_authority($1,$2,$3)',[source,buyer.user_id,buyer.session_id]);
        assert.equal(authority.reason==='verified_reserved_room_seat',expected,`${label}: reserved seat authority`);
        assert.notEqual(authority.hostAuthority,true,'seat purchase never becomes host authority');
        assert.notEqual(authority.grantsPublish,true,'seat receipt alone never grants publishing');
      }
    };
    await delivery(true,'initial exact paid receipt');
    for(const [label,mutate] of [
      ['seller Premium expiration',async()=>{
        await db.query("update public.user_entitlements set expires_at=now()-interval '1 second' where user_id=$1 and entitlement_key='premium'",[host.user_id]);
      }],
      ['seller session expiration',async()=>{
        await db.query("update auth.sessions set not_after=now()-interval '1 second' where user_id=$1",[host.user_id]);
        await one('select private.refresh_ordinary_creator_eligibility($1)',[host.user_id]);
      }],
      ['seller logout',async()=>{
        await db.query('delete from auth.sessions where user_id=$1',[host.user_id]);
        assert.equal(await one('select count(*)::int from auth.sessions where user_id=$1',[host.user_id]),0);
        await one('select private.refresh_ordinary_creator_eligibility($1)',[host.user_id]);
        assert.equal(await one('select legal_accepted from public.wave1_creator_eligibility where creator_user_id=$1',[host.user_id]),false,'cached new-sale legal mirror is not retained acceptance');
      }],
      ['global live flip',async()=>{
        await db.exec("set local request.jwt.claim.role='service_role'");
        await db.exec("update public.platform_money_kill_switches set state='on' where key='live_money_enabled'");
        await db.exec("set local request.jwt.claim.role=''");
      }],
    ]) await isolate(async()=>{
      await mutate();
      assert.equal(await one("select private.ordinary_creator_subject_for_mode($1,'sandbox')",[host.user_id]),false,`${label}: no new sale authority`);
      await delivery(true,label);
    });
    await isolate(async()=>{
      await db.query("update public.creator_payout_accounts set last_provider_sync_at=now()-interval '16 minutes',provider_configuration_observed_at=now()-interval '16 minutes' where creator_user_id=$1",[host.user_id]);
      await db.query("update private.creator_provider_observation_jobs set observed_at=now()-interval '16 minutes' where creator_id=$1",[host.user_id]);
      assert.equal(await one("select private.ordinary_creator_provider_ready($1,'sandbox')",[host.user_id]),false);
      await delivery(true,'provider freshness expiration');
    });
    for(const [label,sql] of [
      ['account ban',"update auth.users set banned_until=now()+interval '1 day' where id=$1"],
      ['account deidentification',"update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{\"accountDeidentified\":true}'::jsonb where id=$1"],
      ['email confirmation removed',"update auth.users set email_confirmed_at=null where id=$1"],
      ['creator suspension',"update public.wave1_creator_eligibility set state='SUSPENDED' where creator_user_id=$1"],
      ['moderation restriction',"update public.wave1_creator_eligibility set moderation_state='SUSPENDED' where creator_user_id=$1"],
      ['age disqualification',"update public.wave1_creator_eligibility set age_18_plus=false where creator_user_id=$1"],
      ['excluded market',"update public.wave1_creator_eligibility set market='EXCLUDED_TERRITORY' where creator_user_id=$1"],
      ['sanctions failure',"update public.wave1_creator_eligibility set sanctions_clear=false where creator_user_id=$1"],
      ['explicit legal invalidation',"update public.wave1_legal_acceptances set invalidated_at=now() where user_id=$1 and capability='creator_money'"],
      ['fraud hold',"update public.creator_payout_eligibility_records set fraud_hold_active=true where creator_user_id=$1"],
    ]) await isolate(async()=>{
      await db.query(sql,[host.user_id]);
      await delivery(false,label);
    });
    await admin();
    const refund={...evidence,eventId:`evt_Historical${lane}Refund`,eventType:'charge.refunded',objectId:`ch_Historical${lane}`,
      checkoutSessionId:null,outcome:'refunded',refundedAmountMinor:237};
    assert.equal((await receive(refund)).status,'refunded','existing receipt/refund reconciliation is unchanged');
    await delivery(false,'exact terminal provider refund');
    await admin();
    const facts=await one('select to_jsonb(e) from public.wave1_creator_eligibility e where creator_user_id=$1',[host.user_id]);
    assert.equal(facts.state,'PENDING_VERIFICATION');assert.equal(facts.tax_complete,null);assert.equal(facts.sanctions_clear,null);
    assert.equal(await one("select count(*)::int from public.user_entitlements where user_id=$1 and entitlement_key='premium'",[buyer.user_id]),0);
    t.diagnostic(`${lane}: purchased receipt survives expired Premium, expired/deleted seller session, stale provider observation and global live flip; real restrictions and exact refund still deny.`);
  });
});

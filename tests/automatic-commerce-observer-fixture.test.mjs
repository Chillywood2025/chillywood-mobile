// Exact registered observer cohort and its nested lease setup. Sequential SQL
// only: this does not emulate SKIP LOCKED, independent backends or lock waits.
import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeSetupDatabase,nativeSource} from './helpers/native-runner-setup-preflight.mjs';
import {seedAutomaticCommerceObserverFixture,prepareAutomaticCommerceObserverSkipLockedFixture,runAutomaticCommerceObserverLeaseRaces} from '../scripts/lib/automatic-commerce-observer-races.mjs';
import {commerceSeedAdapter,seedQualifiedCommerceCreator} from './helpers/automatic-commerce-fixture.mjs';

test('registered commerce helper inventory includes nested observer setup and labels native-only boundaries',()=>{
 const runner=nativeSource('scripts/test-merch-return-cases-concurrency-postgres.mjs');
 const observer=nativeSource('scripts/lib/automatic-commerce-observer-races.mjs');
 const preflight=nativeSource('tests/native-commerce-runner-setups.test.mjs');
 const calls=[...new Set([...runner.matchAll(/await (run\w+Race(?:s)?)\(/gu)].map(match=>match[1]))].sort();
 const fullSequential=['runAutomaticCommerceAuthorityRaces','runAutomaticCommerceDeclarationRaces','runMerchCheckoutDispatchRaces','runMerchLiveCheckoutRaces',
  'runMerchPublicationRaces','runMerchTaxCategoryRaces','runOrdinaryNativeDispatchRaces'];
 const partial=['runAutomaticCommerceObserverRaces','runMerchAdmissionCutoverRace'];
 const separate=['runOrdinaryProfileMetadataRaces'];
 assert.deepEqual(calls,[...fullSequential,...partial,...separate].sort(),'new native helper requires an explicit executable setup coverage decision');
 for(const helper of fullSequential)assert.ok(preflight.includes('await '+helper+'('),helper);
 assert.match(observer,/const accounts=await seedAutomaticCommerceObserverFixture\(\{query,lit\}\)/u);
 assert.match(observer,/await runAutomaticCommerceObserverLeaseRaces\(\{query,race,lit,account:accounts\[0\]\}\)/u);
 assert.match(preflight,/await runAutomaticCommerceObserverLeaseRaces\(/u,'nested setup must run on actual UNKNOWN cohort, not stop at its parent');
 // Independent backend/wait semantics intentionally remain in native CI.
 for(const marker of ['OBSERVER_HOLDER_READY','idle in transaction','record.jobs.length,5','expired-lease maintenance'])assert.ok(observer.includes(marker),marker);
 const declaration=nativeSource('scripts/lib/automatic-commerce-declaration-races.mjs');
 assert.ok(declaration.includes('private.lock_ordinary_creator_subject'),'actual explicit stale-mode helper executes through the full sequential export');
 assert.match(declaration,/Genuine production\s+\/\/ Premium also permits Sandbox/u,'post-change retry follows actual mode policy without manufacturing legal consent');
 const profile=nativeSource('tests/ordinary-profile-native-fixture.test.mjs');
 assert.match(profile,/await runOrdinaryProfileMetadataSequential\(/u,'separate helper SQL/fixture proof is mandatory');
});

test('native UNKNOWN observer accounts support nested completion/failure setup without gaining provider readiness',{timeout:120000},async()=>{
 const db=nativeSetupDatabase();
 try{
  const query=db.query,lit=value=>"'"+String(value).replaceAll("'","''")+"'";
  const parse=text=>JSON.parse(text.split('\n').findLast(line=>line.startsWith('{')||line.startsWith('[')));
  let operations=0;
  const sequentialRace=async(label,first,second,{afterBlocked='',error}={})=>{
   assert.equal(error,undefined,label);operations++;
   return {first:parse(db.query('begin;'+first+afterBlocked+'commit;')),
    second:parse(db.query('begin;'+second+'commit;'))};
  };
   const accounts=await seedAutomaticCommerceObserverFixture({query,lit});
   const account=accounts[0];
   for(const expired of [false,true]){
    const token=await prepareAutomaticCommerceObserverSkipLockedFixture({query,lit,accounts,expired});
    assert.equal(query("select count(*) from private.creator_provider_observation_jobs where account_id in("+accounts.map(lit).join(',')+")"),'6');
    assert.equal(query("select "+(expired?"lease_token="+lit(token)+" and lease_until<clock_timestamp()":"lease_token is null")+" from private.creator_provider_observation_jobs where account_id="+lit(account)),'t');
   }
   const before=JSON.parse(query("select jsonb_build_object('status',provider_configuration_status,'raw',provider_fees_payer_raw,'payer',provider_fees_payer,'proof',provider_live_observation,'observed',provider_configuration_observed_at) from public.creator_payout_accounts where id="+lit(account)));
   assert.deepEqual(before,{status:'unknown',raw:'unknown',payer:'not_configured',proof:null,observed:null});
   // Original native setup, before the normalization repair, must still fail
   // the real constraint. No application function/trigger is replaced.
   assert.throws(()=>query('update public.creator_payout_accounts set provider_configuration_account_id=provider_account_id,provider_configuration_observed_at=statement_timestamp(),last_provider_sync_at=statement_timestamp() where id='+lit(account)),
    /creator_payout_accounts_configuration_observation_check/u);
   const grants=query("select md5(coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb)::text) from public.access_grants g");
   await runAutomaticCommerceObserverLeaseRaces({query,race:sequentialRace,lit,account});
   const observation=id=>JSON.parse(query("select jsonb_build_object('status',a.provider_configuration_status,'raw',a.provider_fees_payer_raw,'payer',a.provider_fees_payer,'proof',a.provider_live_observation,'payable',e.eligible_for_payouts,'providerReady',e.provider_ready) from public.creator_payout_accounts a join public.creator_payout_eligibility_records e on e.payout_account_id=a.id where a.id="+lit(id)));
   const after=observation(account);
   assert.deepEqual(after,{status:'unknown',raw:'unknown',payer:'unknown',proof:null,payable:false,providerReady:false});
   assert.equal(query("select md5(coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb)::text) from public.access_grants g"),grants);
   assert.equal(operations,2,'exact UNKNOWN nested completion and failure sequential controls');
   // Preserve the existing second caller: a fully qualified synthetic account
   // must keep its known raw payer/configuration, not be downgraded to UNKNOWN.
   const creator=await seedQualifiedCommerceCreator(commerceSeedAdapter(query),undefined,{environment:'production'});
   const qualified=query('select id from public.creator_payout_accounts where creator_user_id='+lit(creator.id));
   const qualifiedBefore=observation(qualified);
   assert.equal(qualifiedBefore.status,'match');assert.equal(qualifiedBefore.raw,'application');assert.equal(qualifiedBefore.payer,'platform');
   const qualifiedGrants=query("select md5(coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb)::text) from public.access_grants g");
   await runAutomaticCommerceObserverLeaseRaces({query,race:sequentialRace,lit,account:qualified});
   assert.deepEqual(observation(qualified),qualifiedBefore,'lease freshness never changes existing configuration facts/readiness');
   assert.equal(query("select md5(coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb)::text) from public.access_grants g"),qualifiedGrants);
   assert.equal(operations,4,'both UNKNOWN and qualified accounts execute both nested sequential controls');
 }finally{await db.close();}
});

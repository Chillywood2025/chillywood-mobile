import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Registration and evidence-contract checks only, not native execution proof.
test('required merch native runner includes automatic authority schedules',()=>{
 const runner=readFileSync('scripts/test-merch-return-cases-concurrency-postgres.mjs','utf8');
 for(const name of ['runAutomaticCommerceObserverRaces','runAutomaticCommerceDeclarationRaces','runMerchCheckoutDispatchRaces'])assert.ok(runner.includes(`await ${name}(`));
 const observer=readFileSync('scripts/lib/automatic-commerce-observer-races.mjs','utf8');
 for(const marker of ['workerPid','holderPid','assert.notEqual','idle in transaction','record.jobs.length,5','job.account_id!==accounts[0]','lease_token is null'])assert.ok(observer.includes(marker),marker);
 assert.ok(observer.indexOf('await worker.done')<observer.indexOf("holder.child.stdin.end('rollback;"),'peer completes before holder release');
 for(const marker of ['for(const expired of [false,true])','locked expired job without waiting','failure_count=0','skipped expired job keeps its token and backoff'])assert.ok(observer.includes(marker),marker);
 const declaration=readFileSync('scripts/lib/automatic-commerce-declaration-races.mjs','utf8');
 for(const marker of ['session:randomUUID()','seedCommerceBuyer(db,peer)','creator_declaration_rate_limited',"declaration('TX')","declaration('WA')"])assert.ok(declaration.includes(marker),marker);
 const dispatch=readFileSync('scripts/lib/merch-checkout-dispatch-races.mjs','utf8');
 for(const marker of ['creator Premium revocation','creator Premium grant refund','free buyer ban','free buyer session expiry','result.second.authorized,false','fixture.transition(\'abort\')'])assert.ok(dispatch.includes(marker),marker);
 assert.doesNotMatch(dispatch,/buyer Premium revocation|set.*premium.*true/iu);
 assert.doesNotMatch(runner,/sequentialReplay:true/u,'native never uses sequential denial adapter');
 for(const marker of ['valid pre-expiry completion control','provider completion lease expires while waiting on account','provider failure lease expires while waiting on job','completion.second.completed,false','failure.second.recorded,false','select pg_sleep(2.2)'])assert.ok(observer.includes(marker),marker);
 for(const marker of ['expiry while dispatch waits on product','finite expiry comes from the canonical Premium processor',"premiumRenewal('2 seconds')",'select pg_sleep(2.2)','sequentialReplay&&subject'])assert.ok(dispatch.includes(marker),marker);
 const live=readFileSync('scripts/lib/merch-live-checkout-races.mjs','utf8');
 assert.ok(runner.includes('await runMerchLiveCheckoutRaces('));
 for(const marker of ['unexpired exact live account remains authorized after tax wait','exact live account qualification expires during tax wait despite unrelated current account',
  'commerce-tax:physical_merch:',"current('acct_unrelatedrace')",'exact_qualification_expiry_barrier_was_late','select pg_sleep(2.2)',
  'if(!sequentialReplay)assert.equal(result.second.authorized,false)','global readiness alone would incorrectly allow this order'])assert.ok(live.includes(marker),marker);
 const livePreflight=readFileSync('tests/creator-money/merch-live-entrypoints-postgres.test.mjs','utf8');
 assert.ok(livePreflight.includes('sequentialReplay:true'));
 assert.ok(livePreflight.includes('nativeTx(a+afterBlocked)'),'sequential preflight executes the actual expiry SQL before postcommit RPC');
 for(const marker of ['assert.equal(checks,35)','assert.equal(checks,37)','assert.equal(checks,43)','forty-three PostgreSQL blocking-edge schedules'])assert.ok(runner.includes(marker),marker);
 assert.ok(runner.includes('await runOrdinaryNativeDispatchRaces({query,race,lit})'));
 assert.ok(runner.includes('assert.equal(checks,156)'));
 const native=readFileSync('scripts/lib/ordinary-native-dispatch-races.mjs','utf8');
 for(const marker of ['canonical seller Premium expiration','new buyer deletion request','buyer profile role change','new global legal requirement',
  'first restricted provider account','first creator hold','new seller quarantine','sole seller session',"expiresDuringWait?'expiry':'current control'",
  'native_passive_expiry_barrier_was_late','assertBuyerHasNoPremium','historical native attempt readback','actual ${operation} RPC cannot own source before dispatch authority'])assert.ok(native.includes(marker),marker);
});

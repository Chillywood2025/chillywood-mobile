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
 const declaration=readFileSync('scripts/lib/automatic-commerce-declaration-races.mjs','utf8');
 for(const marker of ['session:randomUUID()','seedCommerceBuyer(db,peer)','creator_declaration_rate_limited',"declaration('TX')","declaration('WA')"])assert.ok(declaration.includes(marker),marker);
 const dispatch=readFileSync('scripts/lib/merch-checkout-dispatch-races.mjs','utf8');
 for(const marker of ['creator Premium revocation','creator Premium grant refund','free buyer ban','free buyer session expiry','result.second.authorized,false','fixture.transition(\'abort\')'])assert.ok(dispatch.includes(marker),marker);
 assert.doesNotMatch(dispatch,/buyer Premium revocation|set.*premium.*true/iu);
 assert.doesNotMatch(runner,/sequentialReplay:true/u,'native never uses sequential denial adapter');
});

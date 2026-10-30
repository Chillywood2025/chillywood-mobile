import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const row={id:'auction',creatorEventId:'event',offerId:'offer',termsRevisionId:'revision',creatorId:'creator',startingAmountMinor:100,minIncrementMinor:25,highestAmountMinor:null,nextBidAmountMinor:100,myBidAmountMinor:null,awardAmountMinor:null,currency:'usd',environment:'test',state:'open',closesAt:'2099-01-01T11:00:00Z',paymentDeadline:'2099-01-01T12:00:00Z',serverNow:'2099-01-01T10:00:00Z',isHighestBidder:false,isWinner:false,terms:{title:'Virtual show',description:'Exact event',startsAt:'2099-01-02T00:00:00Z',endsAt:null,timeZone:'UTC',attendance:'virtual',replayPolicy:'none',replayAvailableAt:null,replayExpiresAt:null}};
row.latestCheckoutStartAt='2099-01-01T11:29:00Z';
function harness(result){let authority={userId:'buyer',sessionGeneration:'one'};const calls=[];const exports={};const imports={
 './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>a?.userId===b?.userId&&a?.sessionGeneration===b?.sessionGeneration},
 './accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async userId=>({authority:{...authority},accessToken:'bound',userId}),invokeAccountBoundSupabaseMutationRpc:async(subject,name,args)=>{calls.push({subject,name,args});return {error:null,data:await result(name,args)};}},
 };vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/creatorEventAuctions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>imports[n],Date,Intl,Set,Number,Promise});return {api:exports,calls,switch:()=>{authority={userId:'other',sessionGeneration:'two'};}};}
test('auction read validates exact event and fails unknown states/terms/currency closed',async()=>{
 const h=harness(()=>[row]);assert.equal((await h.api.listCreatorEventAuctions('event'))[0].id,'auction');assert.equal(h.calls[0].subject.accessToken,'bound');
 for(const changed of [{state:'new_unknown_state'},{currency:'eur'},{terms:null},{nextBidAmountMinor:NaN},{terms:{...row.terms,attendance:'physical'}},{terms:{...row.terms,timeZone:'invalid'}}])assert.throws(()=>h.api.parseCreatorEventAuction({...row,...changed}));
 await assert.rejects(h.api.listCreatorEventAuctions('different-event'));
});
test('bid passes exact cents and null server-resolved capability with account-bound transport',async()=>{
 const h=harness(()=>row);await h.api.placeCreatorEventAuctionBid('auction',125,'request',null);assert.deepEqual(h.calls.map(c=>c.name),['place_creator_event_auction_bid']);assert.equal(h.calls[0].args.p_amount_minor,125);assert.equal(h.calls[0].args.p_capability_id,null);
 await assert.rejects(h.api.placeCreatorEventAuctionBid('auction',1.25,'request',null));
});
test('late RPC response cannot become a new account auction and malformed eligibility is unavailable',async()=>{
 let resolve;const d=new Promise(r=>{resolve=r;});const h=harness(()=>d);const pending=h.api.listCreatorEventAuctions('event');await new Promise(r=>setImmediate(r));h.switch();resolve([row]);await assert.rejects(pending);
 for(const value of [null,{},true,{available:'true'},{available:false}])assert.equal(await harness(()=>value).api.readCreatorEventAuctionBidEligibility('auction',100),false);
});

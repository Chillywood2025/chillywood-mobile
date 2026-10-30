import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
const id='11111111-1111-4111-8111-111111111111';const quoteId='22222222-2222-4222-8222-222222222222';
const auction={id,isWinner:true,state:'awarded',awardAmountMinor:250,currency:'usd',environment:'test'};
function harness(options={}){
 let authority={userId:'buyer',sessionGeneration:options.session??'one',restoreOnly:false};const storage=options.storage??new Map(),calls=[];
 const exports={};const imports={
 '@react-native-async-storage/async-storage':{getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>storage.set(k,v)},
 'react-native':{Platform:{OS:options.platform??'ios'}},'react-native-get-random-values':{},
 './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>a?.userId===b?.userId&&a?.sessionGeneration===b?.sessionGeneration},
 './accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async()=>({authority:{...authority},accessToken:'test-token'}),invokeAccountBoundSupabaseMutationRpc:async(s,name,args)=>{calls.push(['quote',name,args]);if(options.quoteError)return {error:{message:'old_checkout_pending'},data:null};return {error:null,data:{id:quoteId,auctionId:id,amountMinor:250,currency:'usd',environment:'test',state:'awarded',checkoutStarted:false,expiresAt:'2099-01-01T00:00:00Z',...options.quote}};}},
 './supabase':{supabase:{functions:{invoke:async(name,input)=>{calls.push(['edge',name,input]);if(options.edge)return options.edge(input);return {error:null,data:{status:'checkout_ready',checkoutCreated:true,liveMoneyAction:false,routeKind:'external_browser_checkout',launchStrategy:'system_browser',platform:options.platform??'ios',storefrontCountry:'US',quoteId:input.body.quote_id,attemptId:input.body.attempt_id,buyerId:'buyer',auctionId:id,amountMinor:250,currency:'usd',environment:'test',checkoutUrl:'https://checkout.stripe.com/c/pay/test'}};}}}},
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/creatorEventAuctionCheckout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:n=>{assert.ok(n in imports,n);return imports[n];},URL,AbortController,setTimeout,clearTimeout,crypto:webcrypto,Uint8Array,Map,Set,Date,Promise});
 return {run:a=>exports.createCreatorEventAuctionCheckout(a??auction),calls,storage,switch:()=>{authority={...authority,userId:'other',sessionGeneration:'two'};}};
}
test('checkout freezes exact award, binds edge auth and only returns verified Stripe URL',async()=>{
 const h=harness();const launch=await h.run();assert.equal(launch.url,'https://checkout.stripe.com/c/pay/test');assert.equal(launch.launchStrategy,'system_browser');const edge=h.calls.find(c=>c[0]==='edge');assert.equal(edge[1],'stripe-event-auction-checkout');assert.equal(edge[2].headers.Authorization,'Bearer test-token');assert.equal(edge[2].body.quote_id,quoteId);assert.equal(h.storage.size,1);
});
test('unknown edge outcome preserves attempt across remount without creating another quote',async()=>{
 const storage=new Map();const h=harness({storage,edge:async()=>{throw Error('network');}});await assert.rejects(h.run());const original=h.calls.find(c=>c[0]==='edge')[2].body.attempt_id;
 const remount=harness({storage});await remount.run();assert.equal(remount.calls.filter(c=>c[0]==='quote').length,0);assert.equal(remount.calls.find(c=>c[0]==='edge')[2].body.attempt_id,original);
});
test('payment_pending winner can recover only the existing saved attempt without issuing another quote',async()=>{
 const storage=new Map(),first=harness({storage});await first.run();
 const original=first.calls.find(c=>c[0]==='edge')[2].body;
 const recovered=harness({storage});await recovered.run({...auction,state:'payment_pending'});
 assert.equal(recovered.calls.filter(c=>c[0]==='quote').length,0);
 assert.equal(recovered.calls.find(c=>c[0]==='edge')[2].body.quote_id,original.quote_id);
 assert.equal(recovered.calls.find(c=>c[0]==='edge')[2].body.attempt_id,original.attempt_id);
 const missing=harness();await assert.rejects(missing.run({...auction,state:'payment_pending'}),/not saved/);
 assert.equal(missing.calls.length,0);
 const unknown=harness({storage,edge:async()=>({error:null,data:{status:'pending',checkoutCreated:false}})});
 await assert.rejects(unknown.run({...auction,state:'payment_pending'}));
 assert.equal(unknown.calls.filter(c=>c[0]==='quote').length,0);assert.equal(storage.size,1);
});
test('wrong quote, live activation, pending and non-winner cannot start checkout',async()=>{
 const h=harness({quote:{amountMinor:251}});await assert.rejects(h.run());assert.equal(h.calls.filter(c=>c[0]==='edge').length,0);
 for(const change of [{environment:'live'},{isWinner:false},{state:'payment_pending'}]){const h=harness();await assert.rejects(h.run({...auction,...change}));assert.equal(h.calls.length,0);}
});
test('mismatched receipt or untrusted URL never escapes to browser caller',async()=>{
 for(const change of [{buyerId:'other'},{amountMinor:251},{status:'pending'},{routeKind:'unknown'},{launchStrategy:'in_app_browser'},{platform:'android'},{storefrontCountry:'FR'},{checkoutUrl:'https://checkout.stripe.com.evil.example/c/pay/test'},{checkoutUrl:'https://user@checkout.stripe.com/c/pay/test'}]){
 const h=harness({edge:async input=>({error:null,data:{status:'checkout_ready',checkoutCreated:true,liveMoneyAction:false,routeKind:'external_browser_checkout',launchStrategy:'system_browser',platform:'ios',storefrontCountry:'US',quoteId:input.body.quote_id,attemptId:input.body.attempt_id,buyerId:'buyer',auctionId:id,amountMinor:250,currency:'usd',environment:'test',checkoutUrl:'https://checkout.stripe.com/c/pay/test',...change}})});await assert.rejects(h.run());
 }
});
test('US web gets qualified system-browser strategy and Android has no browser fallback',async()=>{const web=harness({platform:'web'});assert.equal((await web.run()).platform,'web');const android=harness({platform:'android'});await assert.rejects(android.run());assert.equal(android.calls.length,0);const nonUs=harness({platform:'web',edge:async input=>({error:null,data:{status:'checkout_ready',checkoutCreated:true,liveMoneyAction:false,routeKind:'external_browser_checkout',launchStrategy:'system_browser',platform:'web',storefrontCountry:'FR',quoteId:input.body.quote_id,attemptId:input.body.attempt_id,buyerId:'buyer',auctionId:id,amountMinor:250,currency:'usd',environment:'test',checkoutUrl:'https://checkout.stripe.com/c/pay/test'}})});await assert.rejects(nonUs.run());});
test('late account change suppresses URL, concurrent checkout cannot duplicate edge call',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r;});const h=harness({edge:()=>pending});const first=h.run();await new Promise(r=>setImmediate(r));await assert.rejects(h.run());h.switch();resolve({error:null,data:{status:'pending'}});await assert.rejects(first);assert.equal(h.calls.filter(c=>c[0]==='edge').length,1);
});
test('same buyer new session requests server supersession and retains the unstarted old attempt',async()=>{
 const storage=new Map();const old=harness({storage,edge:async()=>({error:null,data:{status:'unavailable',checkoutCreated:false}})});await assert.rejects(old.run());const oldRecord=[...storage.entries()][0];
 const newQuote='33333333-3333-4333-8333-333333333333';const next=harness({storage,session:'two',quote:{id:newQuote}});await next.run();assert.equal(next.calls.filter(c=>c[0]==='quote').length,1);assert.equal(next.calls.find(c=>c[0]==='edge')[2].body.quote_id,newQuote);assert.equal(storage.get(oldRecord[0]),oldRecord[1]);assert.equal(storage.size,2);
});
test('same buyer new session cannot bypass server refusal for an old started or unknown checkout',async()=>{
 const storage=new Map();const old=harness({storage,edge:async()=>{throw Error('unknown provider outcome');}});await assert.rejects(old.run());const oldRecord=[...storage.entries()][0];
 const next=harness({storage,session:'two',quoteError:true});await assert.rejects(next.run());assert.equal(next.calls.filter(c=>c[0]==='quote').length,1);assert.equal(next.calls.filter(c=>c[0]==='edge').length,0);assert.equal(storage.get(oldRecord[0]),oldRecord[1]);assert.equal(storage.size,1);
});

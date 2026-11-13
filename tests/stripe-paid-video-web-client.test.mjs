import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const videoId='11111111-1111-4111-8111-111111111111',buyerId='22222222-2222-4222-8222-222222222222';
const offer={available:true,canAccess:false,checkoutAllowed:true,reason:'purchase_required',videoId,creatorId:buyerId,priceId:videoId,priceRevision:1,amountMinor:499,currency:'usd',environment:'sandbox',provider:'stripe'};
function load(file,require=()=>({}),extra={}) {
 const exports={}; const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports,require,URL,...extra},{filename:file}); return exports;
}
test('creator price accepts cents exactly, rejects rounding and malformed input',()=>{
 const {parseStripePaidVideoPrice:p}=load('_lib/stripePaidVideoPrice.ts');
 for(const [input,value] of [['4.99',499],['1',100],['0.50',50],[' 4.5 ',450]]) assert.equal(p(input),value);
 for(const input of ['4.999','-1','1e2','Infinity','0.49','1,000','01.00','']) assert.equal(p(input),null);
});
function harness({platform='web',response,change=false}={}) {
 let calls=0, opened=[],current=true,session="original"; const storage=new Map();
 const api=load('_lib/stripePaidVideoSandbox.ts',name=>{
  if(name==='react-native')return {Platform:{OS:platform},Linking:{openURL:async url=>opened.push(url)}};
  if(name==='./entitlementAuthority')return {withAuthorityReadDeadline:async p=>p};
  if(name==='./accountBoundSupabaseMutation')return {captureAccountBoundSupabaseMutationSubject:async()=>({authority:{userId:buyerId,sessionGeneration:session},accessToken:session}),assertAccountBoundSupabaseMutationSubjectCurrent:()=>{if(!current)throw Error('changed')}};
  if(name==='./supabase')return {supabase:{rpc:async()=>({data:offer}),functions:{invoke:async(name,args)=>{calls++;if(change)current=false;return response?.(args)??{error:true}}}}};
  throw Error(name);
 },{sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=>videoId}});
 return {api,opened,storage,calls:()=>calls,renewSession:()=>{session="renewed"}};
}
test('Stripe quote parser rejects live, malformed, contradictory and foreign-source responses',()=>{
 const {api}=harness(); assert.ok(api.parseStripeSandboxVideoAccess(offer,videoId));
 for(const patch of [{environment:'production'},{provider:'revenuecat_app_store'},{canAccess:true},{amountMinor:1.5},{videoId:buyerId},{priceRevision:0}]) assert.equal(api.parseStripeSandboxVideoAccess({...offer,...patch},videoId),null);
});
test('native never invokes web checkout',async()=>{
 const h=harness({platform:'ios'}); await assert.rejects(h.api.openStripeSandboxVideoCheckout(videoId),/website only/);assert.equal(h.calls(),0);
});
test('ambiguous attempts retain one id and never open a URL',async()=>{
 const h=harness();for(let i=0;i<2;i++)await assert.rejects(h.api.openStripeSandboxVideoCheckout(videoId),/could not be confirmed/);
 assert.equal(h.storage.size,1);assert.equal(h.opened.length,0);
});
const goodResponse=args=>({data:{...offer,buyerId,requestId:args.body.requestId,orderId:videoId,status:'checkout_ready',checkoutUrl:'https://checkout.stripe.com/c/pay/test_session'}});
test('qualified test response opens Stripe but never returns an access grant',async()=>{
 const h=harness({response:goodResponse});const message=await h.api.openStripeSandboxVideoCheckout(videoId);assert.equal(h.opened.length,1);assert.match(message,/only server-verified access/);
});
test('account change and substituted URL stop navigation',async()=>{
 const h=harness({response:goodResponse,change:true});await assert.rejects(h.api.openStripeSandboxVideoCheckout(videoId),/changed/);assert.equal(h.opened.length,0);
 const {api}=harness();for(const url of ['https://checkout.stripe.com.evil.test/c/pay/x','javascript:alert(1)','https://evil.test','https://u:p@checkout.stripe.com/c/pay/x'])assert.equal(api.validateStripeSandboxCheckoutUrl(url),null);
});
test('refresh reconciles retained order without trusting return query or granting access', async()=>{
 const h=harness({response:args=>args.body.action==='status'?{data:{orderId:videoId,buyerId,videoId,environment:'sandbox',provider:'stripe',requestId:videoId,canAccess:true}}:goodResponse(args)});
 await h.api.openStripeSandboxVideoCheckout(videoId);await h.api.refreshStripeSandboxVideoPayment(videoId);
 assert.equal(h.calls(),2);assert.equal(h.opened.length,1);
});
test('checkout response must match exact creator price revision',async()=>{
 const h=harness({response:args=>{const r=goodResponse(args);r.data.priceRevision=2;return r}});
 await assert.rejects(h.api.openStripeSandboxVideoCheckout(videoId),/could not be confirmed/);assert.equal(h.opened.length,0);
});

test('only a verified unpaid terminal response clears retry identity, never automatically creates another order',async()=>{
 const h=harness({response:args=>({...goodResponse(args),data:{...goodResponse(args).data,status:'failed',checkoutUrl:null,canAccess:false}})});
 assert.match(await h.api.openStripeSandboxVideoCheckout(videoId),/Select Unlock Video again/);
 assert.equal(h.storage.size,0);assert.equal(h.calls(),1);assert.equal(h.opened.length,0);
});

test('lost response recovers retained request on refreshed session without a second create or grant',async()=>{
 let creates=0,recoveries=0;
 const h=harness({response:args=>{
  if(args.body.action==='recover') {recoveries++;assert.equal(args.headers.Authorization,'Bearer renewed');assert.equal(args.body.requestId,videoId);assert.equal(args.body.videoId,videoId);return {data:{...offer,orderId:videoId,buyerId,requestId:videoId,status:'dispatched'}};}
  creates++;return {error:true};
 }});
 await assert.rejects(h.api.openStripeSandboxVideoCheckout(videoId),/could not be confirmed/);
 h.renewSession();assert.equal(await h.api.refreshStripeSandboxVideoPayment(videoId),null);
 assert.equal(creates,1);assert.equal(recoveries,1);assert.equal(h.opened.length,0);assert.equal(h.storage.size,2);
});
test('unmatched request recovery never discards ambiguous retry identity',async()=>{
 const h=harness({response:args=>args.body.action==='recover'?{data:{found:false,requestId:videoId,videoId,buyerId,environment:'sandbox',provider:'stripe'}}:{error:true}});
 await assert.rejects(h.api.openStripeSandboxVideoCheckout(videoId));await assert.rejects(h.api.refreshStripeSandboxVideoPayment(videoId));assert.equal(h.storage.size,1);assert.equal(h.opened.length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const buyer='e9000000-0000-4000-8000-000000000001',creator='e9000000-0000-4000-8000-000000000002',session='e9000000-0000-4000-8000-000000000003',binding='e9000000-0000-4000-8000-000000000004';
function fixture(){
 const store=new Map(),calls=[],retire=[];let authority={userId:buyer,sessionGeneration:session,restoreOnly:false};
 const controls={selectionError:false,resolve:{dispatched:false,abandoned:true,terminal:false},legacy:null,storageFailure:false};
 const storage={getItem:async k=>store.get(k)??null,setItem:async(k,v)=>{if(controls.storageFailure)throw Error('storage failed');store.set(k,v);}};
 const mod={exports:{}};
 const require=name=>({
 '@react-native-async-storage/async-storage':{default:storage},'react-native':{Platform:{OS:'ios'}},'react-native-get-random-values':{},
 './creatorTipCheckoutAttempt':{readSavedCreatorTipCheckoutAttempt:async()=>controls.legacy,retireAbandonedCreatorTipCheckoutAttempt:async(...a)=>retire.push(a),retireReconciledCreatorTipCheckoutAttempt:async(...a)=>retire.push(a)},
 './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>a===b},
 './accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async()=>({authority}),invokeAccountBoundSupabaseMutationRpc:async(subject,name,args)=>{
  calls.push({name,args,stored:[...store.values()]});
  if(name==='resolve_creator_tip_payment_action')return {data:{actionId:args.p_action_id,buyerId:buyer,...controls.resolve},error:null};
  if(controls.selectionError)return {data:null,error:{message:'unknown'}};
  return {data:{actionId:args.p_action_id,buyerId:buyer,sessionId:subject.authority.sessionGeneration,creatorId:creator,amountMinor:args.p_amount_minor,currency:'usd',dispatchAuthorized:false,provider:'app_store',purchaseBindingId:binding,routeId:`revenuecat_app_store:${binding}`},error:null};
 }}
 }[name]??(()=>{throw Error(name)})());
 new Function('require','exports','module',ts.transpileModule(fs.readFileSync('_lib/creatorTipPaymentAction.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:false}}).outputText)(require,mod.exports,mod);
 return {select:amount=>mod.exports.selectLowestCostCreatorTipAction({creatorId:creator,amountCents:amount}),store,calls,controls,retire,replaceSession:()=>{authority={...authority,sessionGeneration:'e9000000-0000-4000-8000-000000000005'};}};
}
test('action is durable before selection, exact server route is retained, and a later explicit action tombstones undispatched predecessor',async()=>{
 const f=fixture(),first=await f.select(299);assert.equal(f.calls[0].name,'select_creator_tip_payment_route');assert.ok(f.calls[0].stored[0].includes(first.actionId));
 const second=await f.select(299);assert.notEqual(first.actionId,second.actionId);assert.equal(f.calls[1].name,'resolve_creator_tip_payment_action');assert.equal(f.calls[1].args.p_action_id,first.actionId);
});
test('unknown selection remains durable; retry reconciles rather than switches rails silently',async()=>{
 const f=fixture();f.controls.selectionError=true;await assert.rejects(()=>f.select(299),/could not be confirmed/);const saved=JSON.parse([...f.store.values()][0]);
 f.controls.selectionError=false;await f.select(300);assert.equal(f.calls[1].args.p_action_id,saved.actionId);
});
test('unknown dispatched action blocks new identity and amount',async()=>{
 const f=fixture();await f.select(299);const before=[...f.store.values()][0];f.controls.resolve={dispatched:true,abandoned:false,terminal:false};
 await assert.rejects(()=>f.select(300),/unresolved/);assert.equal([...f.store.values()][0],before);assert.equal(f.calls.length,2);
});
test('verified terminal provider outcome allows a separate legitimate tip',async()=>{
 for(const paymentStatus of ['consumed','revoked']) {
  const f=fixture();const first=await f.select(299);f.replaceSession();
  for(const uncertain of ['pending','failed','expired']) {
   f.controls.resolve={dispatched:true,abandoned:false,terminal:false,paymentStatus:uncertain,provider:'revenuecat_app_store'};
   await assert.rejects(()=>f.select(299),/unresolved/);assert.equal(JSON.parse([...f.store.values()][0]).actionId,first.actionId);
  }
  f.controls.resolve={dispatched:true,abandoned:false,terminal:true,paymentStatus,provider:'revenuecat_app_store'};
  const second=await f.select(299);assert.notEqual(first.actionId,second.actionId);
 }
});
test('legacy external unresolved storage prevents new native auto selection',async()=>{
 const f=fixture();f.controls.legacy={requestId:binding};f.controls.resolve={dispatched:true,abandoned:false,terminal:false};
 await assert.rejects(()=>f.select(299),/previous external tip is unresolved/);assert.equal(f.store.size,0);assert.equal(f.calls.length,1);
});
test('failure to persist action prevents even selection transport',async()=>{
 const f=fixture();f.controls.storageFailure=true;await assert.rejects(()=>f.select(299),/storage failed/);assert.equal(f.calls.length,0);
});

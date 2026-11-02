import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const id='b0000000-0000-4000-8000-000000000001', request='b0000000-0000-4000-8000-000000000002';
const identity={environment:'test',currency:'usd',financialAuthority:false,executionKind:'prefunded_destination_tip'};
const source={...identity,tipId:id,status:'eligible_test_cashout',amountMinor:1237,availableMinor:1202,receiptId:id,qualificationId:id,operationId:id,bankMinor:1192,connectedFeeMinor:10,platformFeeDisposition:'platform_absorbed',expiresAt:new Date(Date.now()+60000).toISOString()};
const row={...identity,tipId:id,requestId:request,status:'ready',phase:'ready',grossMinor:1202,bankMinor:1192,connectedFeeMinor:10,platformFeeDisposition:'platform_absorbed',providerTestPaid:false,bankPaid:false,sourceHeld:false,canCancel:true,qualificationStatus:'current'};
function fixture(){
 let generation=1,sourceRows=[source],records=[row],mutation=row,edge=row,after=null;const calls=[];
 const current=s=>{if(s.generation!==generation)throw Error('account changed');};
 const bindings={Platform:{OS:'android'},SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'anon',captureAccountBoundSupabaseMutationSubject:async()=>({generation,accessToken:'frozen-token'}),assertAccountBoundSupabaseMutationSubjectCurrent:current,
  invokeAccountBoundSupabaseMutationRpc:async(s,name,args)=>{current(s);calls.push({name,args,s});const data=name==='list_my_sandbox_prefunded_tip_sources'?sourceRows:name==='list_my_sandbox_prefunded_tip_cashouts'?records:mutation;after?.();return {data};}};
 const context={exports:{},require:()=>bindings,Date,Number,Error,WeakSet,Promise,AbortSignal,fetch:async(url,args)=>{calls.push({url,args});after?.();return Response.json(edge);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/sandboxPrefundedTipCashout.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 return {api:context.exports,calls,sources:v=>sourceRows=v,rows:v=>records=v,mutation:v=>mutation=v,edge:v=>edge=v,switch:()=>generation++,after:v=>after=v};
}
test('prefunded custom cents and separate cost attribution survive exact quote confirmation',async()=>{
 const f=fixture(),state=await f.api.readSandboxPrefundedTipState();assert.equal(state.sources[0].amountMinor,1237);
 const quote=f.api.reviewSandboxPrefundedTip(state.sources[0]);const result=await f.api.submitSandboxPrefundedTip(quote);
 assert.equal(Object.isFrozen(quote),true);assert.equal(Object.isFrozen(state.sources[0]),true);assert.equal(Object.isFrozen(result),true);
 assert.equal(result.bankMinor,1192);assert.equal(f.calls.at(-1).name,'request_sandbox_prefunded_tip_cashout');assert.equal(f.calls.at(-1).args.p_expected_connected_fee_minor,10);
 assert.equal('p_amount_minor' in f.calls.at(-1).args,false);await assert.rejects(f.api.submitSandboxPrefundedTip({...quote}),/Review the exact/);
 f.switch();const before=f.calls.length;await assert.rejects(f.api.submitSandboxPrefundedTip(quote),/account changed/);assert.equal(f.calls.length,before);
});
test('prefunded client rejects live, simulated/ambiguous costs, wrong arithmetic, stale eligibility and forbidden phases',async()=>{
 for(const patch of [{environment:'live'},{financialAuthority:true},{executionKind:'fund_first'},{bankMinor:1193},{platformFeeDisposition:null},{expiresAt:'bad'},{connectedFeeMinor:null}]) {
  const f=fixture();f.sources([{...source,...patch}]);await assert.rejects(f.api.readSandboxPrefundedTipState(),/verified/);
 }
 for(const patch of [{status:'funded',phase:'funded'},{status:'payout_unknown',phase:'payout_unknown',canCancel:true},{bankPaid:true},{platformFeeDisposition:'unknown'},{phase:'paid'}]) {
  const f=fixture();f.rows([{...row,...patch}]);await assert.rejects(f.api.readSandboxPrefundedTipState(),/verified/);
 }
 const f=fixture();f.sources(null);await assert.rejects(f.api.readSandboxPrefundedTipState(),/unavailable/);
});
test('receipt verification sends only tip identity and payout sends only original request with captured session',async()=>{
 const f=fixture(),state=await f.api.readSandboxPrefundedTipState();f.edge({...source});await f.api.refreshSandboxPrefundedTip(state.sources[0]);
 let call=f.calls.at(-1);assert.equal(call.url,'https://fixture.supabase.co/functions/v1/sandbox-prefunded-tip-receipt');assert.equal(call.args.body,JSON.stringify({tip_id:id}));
 f.edge({...row,status:'payout_pending',phase:'payout_pending',canCancel:false});await f.api.advanceSandboxPrefundedTip(state.rows[0]);call=f.calls.at(-1);
 assert.equal(call.url,'https://fixture.supabase.co/functions/v1/sandbox-creator-cashout');assert.equal(call.args.body,JSON.stringify({request_id:request}));assert.equal(call.args.headers.Authorization,'Bearer frozen-token');
 f.edge({...row,requestId:id});await assert.rejects(f.api.advanceSandboxPrefundedTip(state.rows[0]),/verified/);
});
test('cancel only exact undispatched record; held ready cannot advance, unknown can only reconcile original',async()=>{
 const f=fixture(),state=await f.api.readSandboxPrefundedTipState();await assert.rejects(f.api.cancelSandboxPrefundedTip({...state.rows[0]}),/cannot be canceled/);
 f.mutation({...row,status:'canceled',phase:'canceled',canCancel:false});await f.api.cancelSandboxPrefundedTip(state.rows[0]);assert.equal(f.calls.at(-1).name,'cancel_sandbox_prefunded_tip_cashout');
 f.rows([{...row,sourceHeld:true}]);const held=await f.api.readSandboxPrefundedTipState();await assert.rejects(f.api.advanceSandboxPrefundedTip(held.rows[0]),/held/);
 f.rows([{...row,status:'payout_unknown',phase:'payout_unknown',canCancel:false,qualificationStatus:'expired_or_revoked'}]);const unknown=await f.api.readSandboxPrefundedTipState();await assert.rejects(f.api.cancelSandboxPrefundedTip(unknown.rows[0]),/cannot be canceled/);
 f.edge(unknown.rows[0]);await f.api.advanceSandboxPrefundedTip(unknown.rows[0]);assert.equal(f.calls.at(-1).args.body,JSON.stringify({request_id:request}));
});
test('session change after provider response discards late results',async()=>{
 const f=fixture(),state=await f.api.readSandboxPrefundedTipState();f.after(()=>f.switch());await assert.rejects(f.api.advanceSandboxPrefundedTip(state.rows[0]),/account changed/);
});

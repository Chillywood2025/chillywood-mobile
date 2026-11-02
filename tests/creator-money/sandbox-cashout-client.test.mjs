import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const id='a0000000-0000-4000-8000-000000000001';
const quote={ready:true,qualificationId:id,operationId:id,environment:'test',financialAuthority:false,currency:'usd',grossMinor:10000,appFeeMinor:0,expectedProviderFeeMinor:10,bankMinor:9990,payoutType:'scheduled',expiresAt:new Date(Date.now()+60000).toISOString(),providerFeeStatus:'contract_quote_not_actual'};
const row={requestId:id,environment:'test',financialAuthority:false,bankPaid:false,status:'prepared',grossMinor:10000,appFeeMinor:0,expectedProviderFeeMinor:10,bankMinor:9990,observedProviderFeeMinor:null,canCancel:true};
function fixture(){
 let generation=1,result=quote,fetchResult=row;const calls=[];
 const assertCurrent=s=>{if(s.authority!==generation)throw Error('account changed');};
 const bindings={Platform:{OS:'ios'},SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'anon',captureAccountBoundSupabaseMutationSubject:async()=>({authority:generation,accessToken:'frozen-user-token'}),
  assertAccountBoundSupabaseMutationSubjectCurrent:assertCurrent,invokeAccountBoundSupabaseMutationRpc:async(subject,name,args)=>{assertCurrent(subject);calls.push({subject,name,args});return {data:result};}};
 const context={exports:{},require:()=>bindings,Date,Number,Error,WeakSet,AbortSignal,fetch:async(url,args)=>{calls.push({url,args});return Response.json(fetchResult);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/sandboxCreatorCashout.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 return {api:context.exports,calls,result:v=>result=v,fetchResult:v=>fetchResult=v,switchAccount:()=>generation++};
}
test('test-only quote validation prevents live or malformed economics and forged quotes',async()=>{
 const f=fixture();
 for(const invalid of [{...quote,environment:'live'},{...quote,financialAuthority:true},{...quote,bankMinor:9991},{...quote,expiresAt:'invalid'}]){
  f.result(invalid);await assert.rejects(f.api.previewSandboxCreatorCashout(10000,'scheduled'));
 }
 await assert.rejects(f.api.submitSandboxCreatorCashout(quote),/Review a test payout/);
 f.result(quote);const q=await f.api.previewSandboxCreatorCashout(10000,'scheduled');f.result(row);
 const saved=await f.api.submitSandboxCreatorCashout(q);assert.equal(saved.bankPaid,false);assert.equal(f.calls.at(-1).name,'request_sandbox_creator_cashout');
 assert.equal(f.calls.at(-1).args.p_operation_id,id);
 f.switchAccount();const count=f.calls.length;await assert.rejects(f.api.submitSandboxCreatorCashout(q),/account changed/);assert.equal(f.calls.length,count);
});
test('history and advance retain initiating session and never route to live worker',async()=>{
 const f=fixture();f.result([row]);const [record]=await f.api.readSandboxCreatorCashoutHistory();
 const advanced=await f.api.advanceSandboxCreatorCashout(record);assert.equal(advanced.environment,'test');
 const call=f.calls.at(-1);assert.equal(call.url,'https://fixture.supabase.co/functions/v1/sandbox-creator-cashout');
 assert.equal(call.args.headers.Authorization,'Bearer frozen-user-token');assert.equal(call.args.body,JSON.stringify({request_id:id}));
 f.fetchResult({...row,bankPaid:true});await assert.rejects(f.api.advanceSandboxCreatorCashout(record),/verified/);
 f.switchAccount();const count=f.calls.length;await assert.rejects(f.api.advanceSandboxCreatorCashout(record),/account changed/);assert.equal(f.calls.length,count);
});
test('cancellation refuses copied or cross-mode records and binds exact request',async()=>{
 const f=fixture();f.result([row]);const [record]=await f.api.readSandboxCreatorCashoutHistory();
 await assert.rejects(f.api.cancelSandboxCreatorCashout({...record}),/cannot be canceled/);
 f.result({...row,status:'canceled',canCancel:false});assert.equal((await f.api.cancelSandboxCreatorCashout(record)).status,'canceled');
 assert.equal(f.calls.at(-1).name,'cancel_undispatched_sandbox_creator_cashout');
 assert.equal(f.calls.at(-1).args.p_request_id,id);
});
test('canonical tester history gate fails closed on false/null/malformed authority responses',async()=>{
 const f=fixture();
 for(const denied of [false,null,{},[{...row,environment:'live'}]]){
  f.result(denied);await assert.rejects(f.api.readSandboxCreatorCashoutHistory());
 }
 f.result([]);assert.equal((await f.api.readSandboxCreatorCashoutHistory()).length,0);
 assert.equal(f.calls.at(-1).name,'list_my_sandbox_creator_cashout_executions');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const id='a0000000-0000-4000-8000-000000000001';
function load(){let subject={user:'A',generation:1},result;const calls=[];
 const bindings={captureAccountBoundSupabaseMutationSubject:async()=>subject,
  assertAccountBoundSupabaseMutationSubjectCurrent:s=>{if(s!==subject)throw Error('account changed');},
  invokeAccountBoundSupabaseMutationRpc:async(s,name,args)=>{if(s!==subject)throw Error('account changed');calls.push({s,name,args});return {data:result,error:null};}};
 const context={exports:{},Date,JSON,Number,Error,require:()=>bindings};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/creatorCashoutExecution.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 return {api:context.exports,calls,setResult:value=>result=value,account:()=>subject={user:'B',generation:2}};
}
test('real client quote arithmetic, strict money parsing and original subject mutation binding',async()=>{
 const f=load();for(const amount of ['1.001','1e2','-1','NaN','0','999999999'])assert.throws(()=>f.api.cashoutDollarsToMinor(amount));
 assert.equal(f.api.cashoutDollarsToMinor('100.01'),10001);
 const quote={ready:true,qualificationId:id,operationId:id,grossMinor:10000,appFeeMinor:200,expectedProviderFeeMinor:0,bankMinor:9800,payoutType:'instant',expiresAt:new Date(Date.now()+60000).toISOString(),providerFeeStatus:'contract_quote_not_actual',currency:'usd',financialAuthority:false};
 f.setResult({...quote,bankMinor:9801});await assert.rejects(f.api.previewQualifiedCreatorCashout(10000,'instant'),/verified/);
 f.setResult(quote);const displayed=await f.api.previewQualifiedCreatorCashout(10000,'instant');
 f.setResult({requestId:id});await f.api.submitQualifiedCreatorCashout(displayed);
 const sent=f.calls.at(-1);assert.equal(sent.s,displayed.subject);assert.equal(sent.args.p_operation_id,id);assert.equal(sent.args.p_amount_minor,10000);
 const count=f.calls.length;f.account();await assert.rejects(f.api.submitQualifiedCreatorCashout(displayed),/account changed/);assert.equal(f.calls.length,count);
});
test('real cancellation retains displayed history subject and exact request identity',async()=>{
 const f=load();f.setResult([{requestId:id,status:'prepared',canCancel:true,grossMinor:10000,appFeeMinor:200,bankMinor:9800,expectedProviderFeeMinor:0,observedProviderFeeMinor:null}]);
 const [row]=await f.api.readCreatorCashoutHistory();f.setResult({requestId:id,status:'canceled',canCancel:false});
 await f.api.cancelQualifiedCreatorCashout(row);assert.equal(f.calls.at(-1).s,row.subject);assert.equal(f.calls.at(-1).args.p_request_id,id);
 f.account();const count=f.calls.length;await assert.rejects(f.api.cancelQualifiedCreatorCashout(row),/account changed/);assert.equal(f.calls.length,count);
});

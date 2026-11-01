import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context={exports:{},require:()=>({})};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/ownerFeeAccountingHealth.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
const parse=context.exports.parseOwnerFeeAccountingHealth;
test('Owner funding return status is bounded/read-only; absent or malformed status is not a clear queue',()=>{
 const base={pendingCount:0,retryCount:0,blockedCount:0,newScheduleCreated:false,jobs:[],fundingReturnHoldCount:1,
  fundingReturnHolds:[{request_id:'a1000000-0000-4000-8000-000000000001',phase:'funding_return_unknown',updated_at:new Date().toISOString(),required_action:'get_only_exact_return_reconciliation_no_redispatch'}]};
 assert.equal(parse(base).fundingReturnHoldCount,1);
 assert.equal(parse(base).fundingReturnHolds[0].required_action,'get_only_exact_return_reconciliation_no_redispatch');
 assert.throws(()=>parse({...base,fundingReturnHolds:undefined}),/unavailable/);
 assert.throws(()=>parse({...base,fundingReturnHoldCount:-1}),/unavailable/);
 assert.throws(()=>parse({...base,fundingReturnHolds:Array(51).fill(base.fundingReturnHolds[0])}),/unavailable/);
 assert.throws(()=>parse({...base,fundingReturnHolds:[{...base.fundingReturnHolds[0],required_action:'retry_payout'}]}),/unavailable/);
});

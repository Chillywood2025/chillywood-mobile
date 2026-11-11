import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const out={};new Function('exports',ts.transpileModule(fs.readFileSync('supabase/functions/_shared/native-production-launch-window.ts','utf8'),
 {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(out);
const id='e0000000-0000-4000-8000-000000000001';
const proof={preparationId:id,storedPreparationId:id,serverReceivedAt:'2026-11-11T01:00:00Z',elapsedToLaunchMs:'1000',
 elapsedLimitMs:5000,admissionExpiresMs:String(Date.parse('2026-11-11T01:00:05Z')),checkoutStartedAt:'2026-11-11T01:00:00.500Z'};
test('server acknowledged native monotonic interval preserves original launch window independently of settlement time',()=>{
 const result=out.nativeProductionLaunchWindow(proof);assert.equal(result.upperMs-result.lowerMs,1000);
 // Wall-clock metadata and later Store settlement are intentionally not inputs.
 assert.deepEqual(out.nativeProductionLaunchWindow({...proof,launchedAtMs:'0',completedAtMs:'9999999999999'}),result);
 for(const elapsedToLaunchMs of ['-1','NaN','Infinity','1.5','1e3','5000','300001','9007199254740993'])
  assert.throws(()=>out.nativeProductionLaunchWindow({...proof,elapsedToLaunchMs}));
 for(const patch of [{storedPreparationId:'other'},{serverReceivedAt:'bad'},{elapsedLimitMs:Infinity},
  {elapsedLimitMs:0},{elapsedLimitMs:300001},{checkoutStartedAt:'2026-11-11T01:00:02Z'},
  {admissionExpiresMs:String(result.upperMs)}])assert.throws(()=>out.nativeProductionLaunchWindow({...proof,...patch}));
});
